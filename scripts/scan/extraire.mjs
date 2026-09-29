/**
 * Extraction des montants depuis les dossiers comptables — LECTURE SEULE.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ Ce script n'écrit, ne crée et n'efface RIEN dans les dossiers lus.    │
 * │ Il les ouvre en lecture, et dépose son résultat ailleurs, dans le     │
 * │ projet. Aucune fonction d'écriture de `fs` n'est utilisée sur les     │
 * │ chemins sources — la seule sortie est le fichier passé en `--sortie`. │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Trois gisements, de fiabilité très inégale :
 *
 *   • DEVIS — nos offres, sorties de notre propre modèle. Le numéro est dans
 *     le nom du fichier, le montant dans le PDF, et le DOSSIER dit l'issue :
 *     accepté, refusé, ou encore en cours. Extraction sûre.
 *   • FACTURES ÉMISES — même modèle, même fiabilité. Elles portent en
 *     référence le numéro de commande du fournisseur, ce qui permet de les
 *     rattacher à un projet quand le numéro d'offre n'y figure pas.
 *   • FACTURES FOURNISSEURS et DÉPENSES — des documents de tiers, chacun son
 *     format, et la moitié en photo. On n'y devine rien : ce qui n'est pas
 *     lisible est compté comme illisible, jamais estimé.
 *
 * Usage :
 *   node scripts/scan/extraire.mjs --sortie data/scan.json [--limite 50]
 */

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdf = require("pdf-parse");
import fs from "fs";
import path from "path";

/* ── Chemins sources. Lus, jamais modifiés. ─────────────────────────────── */
const BUREAU = path.join(process.env.HOME || "", "Desktop");
const SOURCES = {
  devis: path.join(BUREAU, "TM Douche Montage Sàrl", "Devis"),
  factures: path.join(BUREAU, "TM - Administrations", "Factures"),
  depenses: path.join(BUREAU, "TM - Administrations", "Dépenses"),
};

const args = process.argv.slice(2);
const opt = (nom, defaut) => {
  const i = args.indexOf(`--${nom}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : defaut;
};
const SORTIE = opt("sortie", "data/scan.json");
const LIMITE = Number(opt("limite", "0")) || Infinity;

/* ── Outils ─────────────────────────────────────────────────────────────── */

/** Parcours récursif, en lecture seule. Les dossiers système sont ignorés. */
function* fichiers(dir) {
  let entrees;
  try { entrees = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entrees) {
    if (e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* fichiers(p);
    else yield p;
  }
}

/**
 * Un montant suisse en nombre.
 *
 * Les PDF écrivent « 1'234.56 », « 1 234.56 » ou « 1234,56 » selon l'outil qui
 * les a produits. On accepte les trois, et on refuse tout le reste plutôt que
 * de rendre un nombre approximatif.
 */
function montant(txt) {
  if (!txt) return null;
  const net = String(txt).replace(/[’'’\s ]/g, "").replace(",", ".");
  const v = Number(net);
  return Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null;
}

/**
 * Un montant, et rien d’autre.
 *
 * La première version acceptait n’importe quelle suite de chiffres suivie de
 * deux décimales : sur une facture, elle a pris un numéro de référence pour un
 * montant et rendu 29 millions de francs. On exige donc soit des milliers
 * correctement séparés, soit au plus six chiffres d’affilée — au-delà, ce
 * n’est plus une somme, c’est un identifiant.
 */
const NOMBRE = String.raw`(\d{1,3}(?:[\u2019\u0027\u00a0 ]\d{3})+[.,]\d{2}|\d{1,6}[.,]\d{2})`;

/** Au-delà, pour une facture unitaire, c’est une erreur de lecture. */
const PLAFOND_CHARGE = 200000;

/**
 * Les deux totaux d'un document sorti de notre modèle.
 *
 * Le hors-taxe est celui qui PRÉCÈDE « TVA en sus » : il y a d'autres « Total »
 * dans un PDF — l'en-tête des colonnes en contient un — et prendre le premier
 * venu donnerait le prix d'une ligne pour celui du document.
 */
function totauxTM(texte) {
  const t = texte.replace(/\s+/g, " ");
  const ht = montant(t.match(new RegExp(`Total\\s*${NOMBRE}\\s*TVA en sus`, "i"))?.[1]);
  const ttc = montant(
    t.match(new RegExp(`Montant de (?:l['’]offre|la facture)[^\\d]*${NOMBRE}`, "i"))?.[1],
  );
  return { ht, ttc };
}

/** Date jj.mm.aa(aa) trouvée dans un nom de fichier, au format ISO. */
function dateDuNom(nom) {
  const m = nom.match(/(\d{2})\.(\d{2})\.(\d{2,4})(?=\D*$)/);
  if (!m) return null;
  const an = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${an}-${m[2]}-${m[1]}`;
}

/** Texte d'un PDF, ou null s'il n'en contient pas — un scan, une photo. */
async function texteDe(chemin) {
  try {
    const d = await pdf(fs.readFileSync(chemin));
    return d.text && d.text.trim().length > 40 ? d.text : null;
  } catch {
    return null;
  }
}

/* ── Devis ──────────────────────────────────────────────────────────────── */

/** L'issue d'une offre se lit dans le chemin, pas dans le document. */
function issueDevis(rel) {
  const p = rel.normalize("NFC").toLowerCase();
  if (p.includes("accépté") || p.includes("accepté")) return "acceptee";
  if (p.includes("refusé") || p.includes("annuler") || p.includes("annulé")) return "refusee";
  return "en cours";
}

async function scannerDevis(compteur) {
  const racine = SOURCES.devis;
  const out = [];
  const sansTexte = [];
  for (const f of fichiers(racine)) {
    if (!f.toLowerCase().endsWith(".pdf")) continue;
    const nom = path.basename(f).normalize("NFC");
    /* Deux numérotations coexistent : l’ancienne à cinq chiffres (TM-00172) et
       l’actuelle à sept (TM-2600885). Une offre révisée porte un suffixe
       « .1 », « .2 » : il désigne la même affaire, on le garde à part pour
       que le rattachement au projet se fasse sur le numéro de base. */
    const m = nom.match(/^(TM-\d{4,})(?:\.(\d+))?\s/);
    if (!m) continue;                         // plans, photos, commandes : pas des offres
    const ref = m[1];
    const revision = m[2] ? Number(m[2]) : 0;
    if (out.length >= compteur) break;

    const texte = await texteDe(f);
    if (!texte) { sansTexte.push(nom); continue; }
    const { ht, ttc } = totauxTM(texte);
    out.push({
      ref,
      revision,
      ht, ttc,
      date: dateDuNom(nom),
      issue: issueDevis(path.relative(racine, f)),
      fichier: nom,
    });
  }
  return { lignes: out, sansTexte };
}

/* ── Factures émises ────────────────────────────────────────────────────── */

async function scannerFactures(compteur) {
  const racine = SOURCES.factures;
  const out = [];
  const sansTexte = [];
  for (const f of fichiers(racine)) {
    if (!f.toLowerCase().endsWith(".pdf")) continue;
    const rel = path.relative(racine, f).normalize("NFC");
    // « Factures fournisseurs » : ce sont nos CHARGES, traitées à part.
    if (rel.toLowerCase().startsWith("factures fournisseurs")) continue;
    const nom = path.basename(f).normalize("NFC");
    const num = nom.match(/Facture\s*n?°?\s*(\d{4,})/i)?.[1];
    if (!num) continue;
    if (out.length >= compteur) break;

    const texte = await texteDe(f);
    if (!texte) { sansTexte.push(nom); continue; }
    const { ht, ttc } = totauxTM(texte);
    /* La référence est le numéro de commande du fournisseur : c'est par elle
       qu'une facture se rattache à un projet quand le numéro d'offre manque. */
    const reference = texte.replace(/\s+/g, " ")
      .match(/R[ée]f[ée]rence\s*:?\s*([A-Z0-9][A-Z0-9 \/.\-]{3,30}?)(?=\s{2}|\s[A-Z][a-z]|$)/i)?.[1]?.trim() || null;
    out.push({
      num, ht, ttc,
      date: dateDuNom(nom),
      reference,
      /* Le sous-dossier « Facturé » marque les factures classées comme
         envoyées ; on relaie l'information sans l'interpréter davantage. */
      classee: /(^|\/)factur[ée]/i.test(rel),
      fichier: nom,
    });
  }
  return { lignes: out, sansTexte };
}

/* ── Charges : factures fournisseurs et dépenses ────────────────────────── */

/**
 * Un total sur un document de tiers.
 *
 * Chaque émetteur a sa mise en page. On cherche les formulations les plus
 * répandues, et l'on renonce dès qu'aucune ne sort — mieux vaut une charge
 * signalée illisible qu'un montant inventé qui fausserait une marge.
 */
function totalTiers(texte) {
  const t = texte.replace(/\s+/g, " ");
  const motifs = [
    new RegExp(`Total\\s*(?:TTC|g[ée]n[ée]ral|de la facture)?\\s*(?:CHF)?\\s*${NOMBRE}`, "i"),
    new RegExp(`Montant\\s*(?:total|d[ûu]|de la facture)[^\\d]{0,20}${NOMBRE}`, "i"),
    new RegExp(`(?:CHF|Fr\\.?)\\s*${NOMBRE}\\s*$`, "i"),
  ];
  for (const m of motifs) {
    const v = montant(t.match(m)?.[1]);
    /* Un plafond, faute de mieux : on ne sait pas reconnaître à coup sûr un
       montant d'un identifiant, mais on sait qu'aucune facture unitaire ne
       dépasse cette somme. Mieux vaut la déclarer illisible. */
    if (v !== null && v <= PLAFOND_CHARGE) return v;
  }
  return null;
}

async function scannerCharges(compteur) {
  const out = [];
  const illisibles = [];

  const traiter = async (racine, origine, fournisseurDe) => {
    for (const f of fichiers(racine)) {
      const ext = path.extname(f).toLowerCase();
      const nom = path.basename(f).normalize("NFC");
      const rel = path.relative(racine, f).normalize("NFC");
      if (out.length + illisibles.length >= compteur) break;

      if (ext !== ".pdf") {
        // Photo d'un ticket : illisible sans reconnaissance de caractères.
        illisibles.push({ origine, fichier: nom, raison: "image" });
        continue;
      }
      const texte = await texteDe(f);
      if (!texte) { illisibles.push({ origine, fichier: nom, raison: "pdf sans texte" }); continue; }
      const total = totalTiers(texte);
      if (total === null) { illisibles.push({ origine, fichier: nom, raison: "total introuvable" }); continue; }
      out.push({
        origine,
        fournisseur: fournisseurDe(rel, nom),
        total,
        date: dateDuNom(nom),
        fichier: nom,
      });
    }
  };

  await traiter(
    path.join(SOURCES.factures, "Factures fournisseurs"),
    "fournisseur",
    (rel) => rel.split(path.sep)[0] || "Non classé",
  );
  await traiter(
    SOURCES.depenses,
    "depense",
    // « Jumbo - Achat outillage - 14.01.26 » : l'émetteur est en tête du nom.
    (_rel, nom) => nom.split(" - ")[0].trim() || "Non classé",
  );

  return { lignes: out, illisibles };
}

/* ── Exécution ──────────────────────────────────────────────────────────── */

const t0 = Date.now();
console.log("Lecture seule — aucun fichier source n'est modifié.\n");

const devis = await scannerDevis(LIMITE);
console.log(`Devis      : ${devis.lignes.length} offres lues, ${devis.sansTexte.length} sans texte`);

const factures = await scannerFactures(LIMITE);
console.log(`Factures   : ${factures.lignes.length} lues, ${factures.sansTexte.length} sans texte`);

const charges = await scannerCharges(LIMITE);
console.log(`Charges    : ${charges.lignes.length} lues, ${charges.illisibles.length} illisibles`);

const resultat = {
  genere: new Date().toISOString(),
  devis: devis.lignes,
  factures: factures.lignes,
  charges: charges.lignes,
  ignores: {
    devisSansTexte: devis.sansTexte,
    facturesSansTexte: factures.sansTexte,
    chargesIllisibles: charges.illisibles,
  },
};

fs.mkdirSync(path.dirname(SORTIE), { recursive: true });
fs.writeFileSync(SORTIE, JSON.stringify(resultat, null, 2));
console.log(`\nÉcrit dans ${SORTIE} — ${Math.round((Date.now() - t0) / 1000)} s`);
