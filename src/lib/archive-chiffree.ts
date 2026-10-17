/**
 * L'archive sous enveloppe.
 *
 * ── Pourquoi le chiffrement n'est pas facultatif ─────────────────────────
 *
 * Le contenu d'une archive a été mesuré sur les données réelles du
 * 17 octobre 2026 : une centaine d'adresses électroniques, plusieurs
 * centaines de numéros de téléphone, 252 noms de chantiers, les noms des
 * dix collaborateurs, un journal d'activité qui dit qui a fait quoi et à
 * quelle heure — et 233 adresses de photographies Cloudinary qui, vérifié,
 * **s'ouvrent sans aucune authentification**. L'archive en clair est donc
 * un trousseau : quiconque la lit voit les chantiers et peut ouvrir les
 * photos.
 *
 * Un tel fichier n'a rien à faire en clair dans une boîte aux lettres.
 *
 * ── Le format, et pourquoi il est écrit en toutes lettres ───────────────
 *
 * Une sauvegarde qu'on ne sait plus ouvrir ne vaut rien. L'enveloppe porte
 * donc son mode d'emploi : une ligne de repère, puis un en-tête JSON
 * lisible qui nomme l'algorithme et tous ses paramètres. Avec ça et la
 * phrase secrète, n'importe qui rouvre le fichier avec Node seul —
 * `scripts/dechiffrer-archive.mjs` le fait en trente lignes, sans rien
 * installer, même si cette application a disparu.
 *
 *   TMENC1\n
 *   {"alg":"aes-256-gcm","kdf":"scrypt",…}\n
 *   <octets chiffrés>
 *
 * AES-256-GCM : il chiffre ET authentifie. Un fichier abîmé d'un seul octet
 * est refusé au déchiffrement au lieu de rendre une bouillie plausible.
 * La clé vient d'une phrase secrète par scrypt, assez coûteux pour qu'une
 * phrase ordinaire ne se devine pas par force brute.
 */
import { randomBytes, scryptSync, createCipheriv, createDecipheriv, createHash } from "node:crypto";

export const REPERE = "TMENC1";

/** Paramètres scrypt. Coûteux à dessein : ~0,1 s par essai. */
const N = 32768, R = 8, P = 1;
/** scrypt a besoin de 128·N·r octets ; la limite par défaut de Node est trop basse. */
const MAXMEM = 128 * N * R * 2;

interface EnTete {
  alg: "aes-256-gcm";
  kdf: "scrypt";
  N: number; r: number; p: number;
  sel: string; iv: string; tag: string;
  /** De quoi vérifier le déchiffrement sans faire confiance à personne. */
  clair: { octets: number; sha256: string };
  genereLe: string;
  aide: string;
}

export function chiffrer(clair: Buffer, passe: string, quand: Date = new Date()): Buffer {
  if (!passe || passe.length < 12) {
    throw new Error("La phrase secrète doit faire au moins 12 caractères.");
  }
  const sel = randomBytes(16);
  const iv = randomBytes(12);
  const cle = scryptSync(passe, sel, 32, { N, r: R, p: P, maxmem: MAXMEM });
  const c = createCipheriv("aes-256-gcm", cle, iv);
  const chiffre = Buffer.concat([c.update(clair), c.final()]);

  const entete: EnTete = {
    alg: "aes-256-gcm", kdf: "scrypt", N, r: R, p: P,
    sel: sel.toString("base64"),
    iv: iv.toString("base64"),
    tag: c.getAuthTag().toString("base64"),
    clair: { octets: clair.length, sha256: createHash("sha256").update(clair).digest("hex") },
    genereLe: quand.toISOString(),
    aide: "node scripts/dechiffrer-archive.mjs <fichier> <phrase-secrete> — ou voir l'en-tête ci-dessus : scrypt(phrase, sel, 32) puis aes-256-gcm(iv, tag).",
  };

  return Buffer.concat([
    Buffer.from(`${REPERE}\n${JSON.stringify(entete)}\n`, "utf-8"),
    chiffre,
  ]);
}

/** Est-ce une enveloppe chiffrée ? Se répond sans la phrase secrète. */
export function estChiffree(b: Buffer): boolean {
  return b.subarray(0, REPERE.length).toString("utf-8") === REPERE;
}

export class PhraseIncorrecte extends Error {}

export function dechiffrer(fichier: Buffer, passe: string): Buffer {
  if (!estChiffree(fichier)) throw new Error("Ce fichier n'est pas une archive chiffrée.");

  const finEntete = fichier.indexOf(0x0a, REPERE.length + 1);
  if (finEntete < 0) throw new Error("Enveloppe illisible : en-tête tronqué.");

  let e: EnTete;
  try {
    e = JSON.parse(fichier.subarray(REPERE.length + 1, finEntete).toString("utf-8"));
  } catch {
    throw new Error("Enveloppe illisible : en-tête invalide.");
  }
  if (e.alg !== "aes-256-gcm" || e.kdf !== "scrypt") {
    throw new Error(`Enveloppe inconnue : ${e.alg} / ${e.kdf}.`);
  }

  const sel = Buffer.from(e.sel, "base64");
  const cle = scryptSync(passe, sel, 32, {
    N: e.N, r: e.r, p: e.p, maxmem: 128 * e.N * e.r * 2,
  });
  const d = createDecipheriv("aes-256-gcm", cle, Buffer.from(e.iv, "base64"));
  d.setAuthTag(Buffer.from(e.tag, "base64"));

  let clair: Buffer;
  try {
    clair = Buffer.concat([d.update(fichier.subarray(finEntete + 1)), d.final()]);
  } catch {
    /* GCM ne distingue pas « mauvaise phrase » de « fichier abîmé » : dans
       les deux cas l'authentification échoue. On le dit tel quel plutôt que
       d'affirmer l'un des deux. */
    throw new PhraseIncorrecte("Phrase secrète incorrecte, ou fichier abîmé.");
  }

  /* Double contrôle : l'empreinte annoncée dans l'en-tête. */
  const sha = createHash("sha256").update(clair).digest("hex");
  if (e.clair?.sha256 && sha !== e.clair.sha256) {
    throw new Error("Le contenu déchiffré ne correspond pas à son empreinte.");
  }
  return clair;
}
