/**
 * Rapprochement des offres extraites et des fiches Notion — LECTURE SEULE.
 *
 * Il n'écrit RIEN dans Notion : il produit un fichier de contrôle. Écrire
 * quinze cents montants à l'aveugle dans une base de production serait
 * imprudent ; on regarde d'abord ce qui sera posé, et où.
 *
 * Le rapprochement part du numéro d'offre — mais le numéro NE SUFFIT PAS.
 * L'ancienne numérotation a été réutilisée : TM-00114 désigne Caiani Catherine
 * en 2024 et Thiébaud Alain en 2025, pour 1 837 et 12 333 francs. Deux cent
 * cinquante-deux numéros sont dans ce cas, dont vingt-cinq dans la
 * numérotation actuelle. S'y fier seul revenait à poser le montant d'une
 * affaire sur une autre.
 *
 * Trois règles tranchent :
 *
 *   • parmi les documents d'un même numéro, la RÉVISION LA PLUS HAUTE l'emporte.
 *     C'est la convention de la maison : une offre corrigée reprend le nom de
 *     la première avec un suffixe « .1 », « .2 »… et remplace ce qu'elle
 *     corrige. Le classement du dossier — acceptée, refusée — ne dit pas
 *     quelle VERSION fait foi : une première version rangée dans
 *     « Accépté » a déjà fait poser 422 francs là où la révision 2 en
 *     annonçait 32 781.
 *   • quand un numéro couvre PLUSIEURS affaires, le texte tranche : on compare
 *     le nom du fichier au nom et à l'adresse de la fiche. Si aucune ne se
 *     détache nettement, on n'écrit RIEN et le cas part dans la liste des
 *     douteux. Un montant absent se voit ; un montant faux, non.
 *   • un montant n'est proposé que si la fiche n'en porte pas déjà un : ce
 *     script ne contredit jamais une saisie humaine. `--corriger` lève cette
 *     réserve pour réparer une erreur de notre côté, et ne se lance qu'à la
 *     main — jamais depuis l'agent quotidien.
 *
 * Usage :
 *   node scripts/scan/rapprocher.mjs [--scan data/scan.json] [--sortie data/rapprochement.csv]
 */

import fs from "fs";
import path from "path";
import "dotenv/config";

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const SCAN = opt("scan", "data/scan.json");
const SORTIE = opt("sortie", "data/rapprochement.csv");
/* Par défaut on ne remplit que le vide : une correction faite à la main doit
   tenir, et le passage du lendemain ne doit pas la défaire. `--corriger`
   lève cette réserve, pour réparer une erreur de notre côté — il se lance
   alors à la main, jamais depuis l'agent quotidien. */
const CORRIGER = args.includes("--corriger");

const TOKEN = process.env.NOTION_TOKEN;
const BASE = process.env.NOTION_DATABASE_ID;
if (!TOKEN || !BASE) { console.error("NOTION_TOKEN ou NOTION_DATABASE_ID manquant."); process.exit(1); }

/** Numéro d'offre ramené à sa forme canonique : TM-2600885, TM-00172. */
function canon(s) {
  const m = String(s || "").toUpperCase().match(/TM-?\s*(\d{4,})/);
  return m ? `TM-${m[1]}` : null;
}

/** Tous les numéros d'offre que porte une fiche — elle peut en cumuler. */
function numerosDe(texte) {
  return [...new Set([...String(texte || "").toUpperCase().matchAll(/TM-?\s*(\d{4,})/g)]
    .map((m) => `TM-${m[1]}`))];
}

/* ── Lecture de Notion, page par page ───────────────────────────────────── */

async function lireProjets() {
  const out = [];
  let cursor;
  do {
    const r = await fetch(`https://api.notion.com/v1/databases/${BASE}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ page_size: 100, start_cursor: cursor }),
    });
    const d = await r.json();
    if (d.object === "error") throw new Error(d.message);
    d.results.forEach((page) => {
      const props = page.properties || {};
      const texte = (p) => (p?.rich_text || p?.title || []).map((x) => x.plain_text).join("");
      out.push({
        id: page.id,
        ofr: texte(props["N° OFR TM"]),
        projet: texte(props["Projet"]) || texte(props["Name"]) || "",
        chantier: texte(props["Nom chantier"]),
        adresse: props["Adresse chantier"]?.rich_text?.map((x) => x.plain_text).join("")
          || props["Adresse chantier"]?.formula?.string
          || texte(props["Adresse chantier texte"]) || "",
        montant: props["Montant OFR"]?.number ?? null,
        etat: props["État - CMD"]?.status?.name || "",
      });
    });
    cursor = d.has_more ? d.next_cursor : undefined;
    process.stdout.write(`\r  ${out.length} fiches lues…`);
  } while (cursor);
  process.stdout.write("\n");
  return out;
}

/* ── Une offre par numéro ───────────────────────────────────────────────── */

/** Mots significatifs d'un libellé : accents ôtés, bruit écarté. */
function mots(s) {
  return new Set(String(s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w.length >= 3 && !MOTS_VIDES.has(w)));
}
const MOTS_VIDES = new Set([
  "sarl", "sa", "the", "des", "les", "rue", "che", "chemin", "route", "rte",
  "avenue", "place", "lot", "app", "villa", "suisse", "pdf",
]);

/** Ce qui suit le numéro dans un nom de fichier : le client et l'adresse. */
function sujetDe(fichier) {
  return fichier
    .replace(/^TM-\d+(?:\.\d+)?\s*-\s*/, "")
    .replace(/\s*-\s*\d{2}\.\d{2}\.\d{2,4}\.pdf$/i, "");
}

/** Part des mots de l'offre que la fiche reprend. 0 = étrangers, 1 = identiques. */
function proximite(a, b) {
  const A = mots(a), B = mots(b);
  if (A.size === 0 || B.size === 0) return 0;
  let communs = 0;
  A.forEach((w) => { if (B.has(w)) communs += 1; });
  return communs / Math.min(A.size, B.size);
}

/**
 * Les affaires d'un numéro, chacune réduite à sa version en vigueur.
 *
 * Un numéro peut couvrir plusieurs affaires — la numérotation a été réutilisée.
 * On regroupe donc d'abord par SUJET, puis on ne garde, dans chaque groupe, que
 * la révision la plus haute : c'est la dernière version de cette offre-là.
 */
function affairesParNumero(devis) {
  const m = new Map();
  devis.forEach((d) => {
    const ref = canon(d.ref);
    if (!ref || d.ht === null) return;
    const groupes = m.get(ref) || [];
    const sujet = sujetDe(d.fichier);
    /* Deux sujets très proches sont la même affaire écrite autrement — un
       intermédiaire nommé d'un côté, pas de l'autre. On les fusionne. */
    const g = groupes.find((x) => proximite(x.sujet, sujet) >= 0.6);
    if (!g) { groupes.push({ sujet, doc: d }); m.set(ref, groupes); return; }
    const mieux = (d.revision || 0) > (g.doc.revision || 0)
      || ((d.revision || 0) === (g.doc.revision || 0) && (d.date || "") > (g.doc.date || ""));
    if (mieux) { g.doc = d; g.sujet = sujet; }
    m.set(ref, groupes);
  });
  return m;
}

/** Score minimal pour accepter un rapprochement quand le doute existe. */
const SEUIL = 0.34;
/** Écart minimal entre le meilleur candidat et le suivant. */
const MARGE = 0.12;

/**
 * L'affaire d'un numéro qui correspond à cette fiche.
 *
 * Renvoie `null` plutôt qu'un choix hasardeux : entre ne rien poser et poser
 * le montant du voisin, le premier se corrige, le second se propage.
 */
function choisir(groupes, fiche) {
  if (!groupes || groupes.length === 0) return null;
  if (groupes.length === 1) return { doc: groupes[0].doc, sur: 1 };
  const texte = `${fiche.projet} ${fiche.chantier} ${fiche.adresse}`;
  const notes = groupes
    .map((g) => ({ g, note: proximite(g.sujet, texte) }))
    .sort((a, b) => b.note - a.note);
  if (notes[0].note < SEUIL) return null;
  if (notes[0].note - notes[1].note < MARGE) return null;
  return { doc: notes[0].g.doc, sur: Math.round(notes[0].note * 100) / 100 };
}

/* ── Exécution ──────────────────────────────────────────────────────────── */

const scan = JSON.parse(fs.readFileSync(SCAN, "utf8"));
const offres = affairesParNumero(scan.devis);
const multiples = [...offres.values()].filter((g) => g.length > 1).length;
console.log(`Offres chiffrées : ${offres.size} numéros, dont ${multiples} couvrant plusieurs affaires.`);

console.log("Lecture de Notion…");
const projets = await lireProjets();

const lignes = [];
const compte = { pose: 0, deja: 0, sansOffre: 0, sansNumero: 0, douteux: 0 };
const douteux = [];
const utilises = new Set();

projets.forEach((p) => {
  const nums = numerosDe(p.ofr);
  if (nums.length === 0) { compte.sansNumero += 1; return; }
  /* Une fiche portant deux numéros a été devisée deux fois : le montant du
     projet est la somme des offres retenues, sans quoi on n'en compterait
     qu'une moitié. */
  const choix = nums.map((n) => ({ n, c: choisir(offres.get(n), p) }));
  if (choix.some((x) => offres.get(x.n) && !x.c)) {
    /* Au moins un numéro de cette fiche couvre plusieurs affaires sans qu'on
       puisse trancher : on s'abstient entièrement. */
    compte.douteux += 1;
    douteux.push({
      id: p.id, ofr: nums.join(" + "), projet: p.projet, adresse: p.adresse,
      candidats: nums.flatMap((n) => (offres.get(n) || []).map((g) => ({
        sujet: g.sujet, ht: g.doc.ht, fichier: g.doc.fichier,
      }))),
    });
    return;
  }
  const trouvees = choix.map((x) => x.c?.doc).filter(Boolean);
  if (trouvees.length === 0) { compte.sansOffre += 1; return; }
  trouvees.forEach((t) => utilises.add(canon(t.ref)));

  const total = Math.round(trouvees.reduce((s, x) => s + x.ht, 0) * 100) / 100;
  const ecart = p.montant !== null && p.montant !== undefined
    && Math.abs(p.montant - total) > 0.01;
  const action = p.montant === null || p.montant === undefined
    ? "à poser"
    : (CORRIGER && ecart ? "à corriger" : "déjà renseigné");
  if (action === "déjà renseigné") compte.deja += 1; else compte.pose += 1;

  lignes.push({
    action,
    id: p.id,
    ofr: nums.join(" + "),
    projet: p.projet,
    etat: p.etat,
    montantActuel: p.montant ?? "",
    montantPropose: total,
    issue: trouvees.map((x) => x.issue).join(" + "),
    documents: trouvees.map((x) => x.fichier).join(" | "),
  });
});

const orphelines = [...offres.entries()].filter(([ref]) => !utilises.has(ref));

const csv = [
  ["action", "id_notion", "n_offre", "projet", "etat_cmd", "montant_actuel", "montant_propose_HT", "issue", "documents"].join(";"),
  ...lignes
    .sort((a, b) => (a.action === b.action ? b.montantPropose - a.montantPropose : a.action === "déjà renseigné" ? 1 : -1))
    .map((l) => [l.action, l.id, l.ofr, l.projet, l.etat, l.montantActuel, l.montantPropose, l.issue, l.documents]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")),
].join("\n");

fs.mkdirSync(path.dirname(SORTIE), { recursive: true });
fs.writeFileSync(SORTIE, csv);
fs.writeFileSync(SORTIE.replace(/\.csv$/, ".json"), JSON.stringify({
  genere: new Date().toISOString(),
  aPoser: lignes.filter((l) => l.action !== "déjà renseigné"),
  dejaRenseignes: lignes.filter((l) => l.action === "déjà renseigné").length,
  douteux,
  offresOrphelines: orphelines.flatMap(([ref, groupes]) => groupes.map((g) => ({
    ref, ht: g.doc.ht, issue: g.doc.issue, fichier: g.doc.fichier,
  }))),
}, null, 2));

const somme = lignes.filter((l) => l.action !== "déjà renseigné").reduce((s, l) => s + l.montantPropose, 0);
console.log(`
  ${compte.pose} fiches ${CORRIGER ? "à poser ou corriger" : "recevront un montant"} — ${Math.round(somme).toLocaleString("fr-CH")} CHF HT au total
  ${compte.deja} en portent déjà un : intactes
  ${compte.sansOffre} ont un n° d'offre sans document chiffré
  ${compte.douteux} portent un numéro couvrant plusieurs affaires : NON écrites
  ${compte.sansNumero} n'ont aucun n° d'offre
  ${orphelines.length} offres chiffrées ne correspondent à aucune fiche

Contrôle écrit dans ${SORTIE}
Rien n'a été écrit dans Notion.`);
