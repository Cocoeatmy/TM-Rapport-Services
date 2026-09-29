/**
 * Rapprochement des offres extraites et des fiches Notion — LECTURE SEULE.
 *
 * Il n'écrit RIEN dans Notion : il produit un fichier de contrôle. Écrire
 * quinze cents montants à l'aveugle dans une base de production serait
 * imprudent ; on regarde d'abord ce qui sera posé, et où.
 *
 * Le rapprochement se fait sur le numéro d'offre, qui est la seule clé sûre.
 * Une fiche peut en porter plusieurs — un projet repris sous un second devis —
 * et un même numéro peut avoir plusieurs documents : une offre révisée, ou une
 * version acceptée après une première refusée. Deux règles tranchent :
 *
 *   • parmi les documents d'un même numéro, on retient l'offre ACCEPTÉE ; à
 *     défaut, la plus récente. Une offre refusée n'est pas un chiffre
 *     d'affaires, et une révision remplace ce qu'elle révise.
 *   • un montant n'est proposé que si la fiche n'en porte pas déjà un : ce
 *     script ne contredit jamais une saisie humaine.
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

function meilleureParNumero(devis) {
  const m = new Map();
  devis.forEach((d) => {
    const ref = canon(d.ref);
    if (!ref || d.ht === null) return;
    const cur = m.get(ref);
    if (!cur) { m.set(ref, d); return; }
    /* Une acceptée l'emporte sur tout le reste ; entre deux documents de même
       statut, le plus récent, et à date égale la révision la plus haute. */
    const rang = (x) => (x.issue === "acceptee" ? 2 : x.issue === "en cours" ? 1 : 0);
    const mieux = rang(d) > rang(cur)
      || (rang(d) === rang(cur) && (d.date || "") > (cur.date || ""))
      || (rang(d) === rang(cur) && (d.date || "") === (cur.date || "") && (d.revision || 0) > (cur.revision || 0));
    if (mieux) m.set(ref, d);
  });
  return m;
}

/* ── Exécution ──────────────────────────────────────────────────────────── */

const scan = JSON.parse(fs.readFileSync(SCAN, "utf8"));
const offres = meilleureParNumero(scan.devis);
console.log(`Offres chiffrées : ${offres.size} numéros distincts.`);

console.log("Lecture de Notion…");
const projets = await lireProjets();

const lignes = [];
const compte = { pose: 0, deja: 0, sansOffre: 0, sansNumero: 0 };
const utilises = new Set();

projets.forEach((p) => {
  const nums = numerosDe(p.ofr);
  if (nums.length === 0) { compte.sansNumero += 1; return; }
  /* Une fiche portant deux numéros a été devisée deux fois : le montant du
     projet est la somme des offres retenues, sans quoi on n'en compterait
     qu'une moitié. */
  const trouvees = nums.map((n) => offres.get(n)).filter(Boolean);
  if (trouvees.length === 0) { compte.sansOffre += 1; return; }
  trouvees.forEach((t) => utilises.add(canon(t.ref)));

  const total = Math.round(trouvees.reduce((s, x) => s + x.ht, 0) * 100) / 100;
  const action = p.montant !== null && p.montant !== undefined ? "déjà renseigné" : "à poser";
  if (action === "à poser") compte.pose += 1; else compte.deja += 1;

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
    .sort((a, b) => (a.action === b.action ? b.montantPropose - a.montantPropose : a.action === "à poser" ? -1 : 1))
    .map((l) => [l.action, l.id, l.ofr, l.projet, l.etat, l.montantActuel, l.montantPropose, l.issue, l.documents]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")),
].join("\n");

fs.mkdirSync(path.dirname(SORTIE), { recursive: true });
fs.writeFileSync(SORTIE, csv);
fs.writeFileSync(SORTIE.replace(/\.csv$/, ".json"), JSON.stringify({
  genere: new Date().toISOString(),
  aPoser: lignes.filter((l) => l.action === "à poser"),
  dejaRenseignes: lignes.filter((l) => l.action !== "à poser").length,
  offresOrphelines: orphelines.map(([ref, d]) => ({ ref, ht: d.ht, issue: d.issue, fichier: d.fichier })),
}, null, 2));

const somme = lignes.filter((l) => l.action === "à poser").reduce((s, l) => s + l.montantPropose, 0);
console.log(`
  ${compte.pose} fiches recevront un montant — ${Math.round(somme).toLocaleString("fr-CH")} CHF HT au total
  ${compte.deja} en portent déjà un : intactes
  ${compte.sansOffre} ont un n° d'offre sans document chiffré
  ${compte.sansNumero} n'ont aucun n° d'offre
  ${orphelines.length} offres chiffrées ne correspondent à aucune fiche

Contrôle écrit dans ${SORTIE}
Rien n'a été écrit dans Notion.`);
