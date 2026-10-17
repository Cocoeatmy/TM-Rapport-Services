/**
 * L'essai à blanc de la chaîne de sauvegarde, de bout en bout.
 *
 * ── Le problème que cette route résout ───────────────────────────────────
 *
 * Pour vérifier qu'une archive chiffrée se rouvre, il faut la phrase
 * secrète. Or celle-ci vit dans Vercel, n'est lisible par personne, et
 * c'est très bien ainsi : une phrase qu'on se passe pour « faire un test »
 * n'est plus un secret.
 *
 * La vérification se fait donc LÀ OÙ LA PHRASE EST — dans l'application.
 * Cette route rejoue la chaîne entière avec la vraie clé de production,
 * puis rend un verdict. Elle ne révèle ni la phrase, ni un fragment, ni sa
 * longueur exacte au-delà de ce que le diagnostic de configuration dit
 * déjà.
 *
 * ── Ce qu'elle fait, dans l'ordre ───────────────────────────────────────
 *
 *   1. elle lit les listes, comme l'export réel ;
 *   2. elle construit l'archive et la valide ;
 *   3. elle la comprime si elle est volumineuse, exactement comme la tâche
 *      hebdomadaire ;
 *   4. elle la CHIFFRE avec la phrase de production ;
 *   5. elle la DÉCHIFFRE, et compare les octets un à un ;
 *   6. elle relit l'archive déchiffrée et compte chaque liste ;
 *   7. elle simule une restauration — en mémoire, sans rien écrire.
 *
 * ── Ce qu'elle ne fait PAS ──────────────────────────────────────────────
 *
 * Aucune écriture. Nulle part. Ni dans Notion, ni dans Redis, ni dans un
 * fichier, ni par courriel. C'est une lecture suivie de calculs.
 */
import { NextResponse } from "next/server";
import { gzipSync, gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { exigerDroit } from "@/lib/droits-serveur";
import { rassemblerLesListes, lireListeSauvegardable, CLES_SAUVEGARDEES } from "@/lib/sauvegarde";
import { construireArchive, validerArchive, comparerArchive } from "@/lib/archive";
import { chiffrer, dechiffrer, estChiffree } from "@/lib/archive-chiffree";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SEUIL_COMPRESSION = 8 * 1024 * 1024;

interface Etape { etape: string; ok: boolean; detail: string }

export async function GET() {
  const v = await exigerDroit("administration.droits");
  if ("refus" in v) return v.refus;

  const etapes: Etape[] = [];
  const noter = (etape: string, ok: boolean, detail: string) => {
    etapes.push({ etape, ok, detail });
    return ok;
  };

  const passe = process.env.BACKUP_PASSPHRASE || "";
  if (passe.length < 12) {
    noter("phrase secrète", false, "absente ou trop courte : l'essai ne peut pas avoir lieu");
    return NextResponse.json({ ok: false, etapes }, { status: 503 });
  }
  noter("phrase secrète", true, "lue depuis l'environnement, jamais affichée");

  /* ── 1. Lecture ──────────────────────────────────────────────────────── */
  const quand = new Date();
  const { listes, manquantes } = await rassemblerLesListes();
  const lues = Object.keys(listes).length;
  noter("lecture des listes", Object.keys(manquantes).length === 0,
    `${lues} / ${CLES_SAUVEGARDEES.length} listes lues`
    + (Object.keys(manquantes).length ? ` — non lues : ${Object.keys(manquantes).join(", ")}` : ""));

  /* ── 2. Construction et validation ───────────────────────────────────── */
  const archive = construireArchive(listes, manquantes, `essai à blanc (${v.user.email})`, quand);
  const verdict = validerArchive(archive);
  if (!noter("format de l'archive", verdict.valide,
             verdict.valide ? "conforme, empreintes cohérentes" : verdict.motif)) {
    return NextResponse.json({ ok: false, etapes }, { status: 500 });
  }

  const clair = Buffer.from(JSON.stringify(archive, null, 2), "utf-8");
  const empreinteClair = createHash("sha256").update(clair).digest("hex");
  noter("archive produite", true,
    `${Math.round(clair.byteLength / 1024)} Ko, ${Object.values(listes).reduce((n, d) => n + d.length, 0)} enregistrements`);

  /* ── 3. Compression, comme la tâche hebdomadaire ─────────────────────── */
  const comprimee = clair.byteLength > SEUIL_COMPRESSION;
  const charge = comprimee ? gzipSync(clair) : clair;
  noter("compression", true, comprimee
    ? `oui (au-delà de 8 Mo) — ${Math.round(charge.byteLength / 1024)} Ko`
    : "non nécessaire sous 8 Mo");

  /* ── 4. Chiffrement ──────────────────────────────────────────────────── */
  let enveloppe: Buffer;
  try {
    enveloppe = chiffrer(charge, passe, quand);
  } catch (e) {
    noter("chiffrement", false, e instanceof Error ? e.message : String(e));
    return NextResponse.json({ ok: false, etapes }, { status: 500 });
  }
  const fuite = enveloppe.toString("latin1").includes(passe);
  noter("chiffrement", estChiffree(enveloppe) && !fuite,
    `${Math.round(enveloppe.byteLength / 1024)} Ko, AES-256-GCM`
    + (fuite ? " — ALERTE : la phrase apparaît dans le fichier" : ", la phrase n'apparaît pas dans le fichier"));

  /* ── 5. Déchiffrement et comparaison octet par octet ─────────────────── */
  let relu: Buffer;
  try {
    relu = dechiffrer(enveloppe, passe);
  } catch (e) {
    noter("déchiffrement", false, e instanceof Error ? e.message : String(e));
    return NextResponse.json({ ok: false, etapes }, { status: 500 });
  }
  const defait = comprimee ? gunzipSync(relu) : relu;
  const identique = createHash("sha256").update(defait).digest("hex") === empreinteClair;
  if (!noter("déchiffrement", identique,
             identique ? "les octets rendus sont EXACTEMENT ceux de départ (SHA-256 identique)"
                       : "le contenu déchiffré diffère de l'original")) {
    return NextResponse.json({ ok: false, etapes }, { status: 500 });
  }

  /* ── 6. Une enveloppe abîmée doit être refusée ───────────────────────── */
  const abime = Buffer.from(enveloppe);
  abime[abime.length - 20] ^= 0x01;
  let refusee = false;
  try { dechiffrer(abime, passe); } catch { refusee = true; }
  noter("détection d'altération", refusee,
    refusee ? "un seul octet modifié suffit à faire refuser l'archive"
            : "une archive abîmée a été acceptée — à corriger d'urgence");

  /* ── 7. Relecture et comptage ────────────────────────────────────────── */
  const archiveRelue = JSON.parse(defait.toString("utf-8"));
  const vRelue = validerArchive(archiveRelue);
  noter("relecture de l'archive", vRelue.valide,
    vRelue.valide ? "lisible et cohérente après le voyage" : vRelue.motif);

  /* ── 8. Simulation de restauration, EN MÉMOIRE ───────────────────────── */
  const actuels: Record<string, number | null> = {};
  for (const cle of Object.keys(archive.listes)) {
    try { actuels[cle] = (await lireListeSauvegardable(cle)).length; } catch { actuels[cle] = null; }
  }
  const comparaison = vRelue.valide ? comparerArchive(vRelue.archive, actuels) : [];
  const ecarts = comparaison.filter((c) => c.delta !== 0);
  noter("simulation de restauration", ecarts.length === 0,
    ecarts.length === 0
      ? "chaque liste reviendrait à l'identique — aucun écart"
      : `écarts : ${ecarts.map((e) => `${e.cle} ${e.delta! > 0 ? "+" : ""}${e.delta}`).join(", ")}`);

  const ok = etapes.every((e) => e.ok);
  console.log(`[ARCHIVE] essai à blanc par ${v.user.email} — ${ok ? "réussi" : "ÉCHOUÉ"}`);

  return NextResponse.json({
    ok,
    aucuneEcriture: true,
    etapes,
    listes: comparaison.map((c) => ({ cle: c.cle, enLigne: c.actuel, dansLArchive: c.archive, ecart: c.delta })),
    archive: { octetsClair: clair.byteLength, octetsChiffre: enveloppe.byteLength, comprimee },
  }, { status: ok ? 200 : 500 });
}
