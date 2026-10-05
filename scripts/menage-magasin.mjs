/**
 * Ménage du magasin de données — pages techniques vides en double.
 *
 * ⚠️ Ce script ne touche JAMAIS la base des chantiers. Il ne regarde que les
 * pages enfants de la page « magasin » (STORAGE_PAGE_ID), qui sont des pages
 * techniques nommées « [DATA] <clé> ». Aucun projet n'y figure.
 *
 * Quatre verrous, dans cet ordre :
 *   1. la page est un enfant direct du magasin ;
 *   2. son titre commence par « [DATA] » ;
 *   3. son titre est en DOUBLE (une clé unique n'est jamais touchée) ;
 *   4. elle est VIDE — vérifié par un appel juste avant d'archiver, pas
 *      déduit d'un horodatage.
 * Et on garde toujours au moins une page par clé, plus celle qui a du contenu.
 *
 * Archiver dans Notion = mettre à la corbeille : réversible 30 jours.
 *
 * Usage : node --env-file=.env.local scripts/menage-magasin.mjs [--pour-de-vrai] [--max=N]
 */
import { Client } from "@notionhq/client";

const STORAGE_PAGE_ID = "3431895b9179804eb9bfc51868936cf2";
const POUR_DE_VRAI = process.argv.includes("--pour-de-vrai");
const MAX = Number((process.argv.find((a) => a.startsWith("--max=")) || "").split("=")[1] || Infinity);

/* On se limite volontairement à 2 requêtes/s : Notion en tolère environ 3, et
   l'app en service doit garder de quoi respirer. */
const ENTRE_APPELS_MS = 500;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const notion = new Client({ auth: process.env.NOTION_TOKEN });

async function appel(fn) {
  for (let essai = 0; ; essai++) {
    try { const r = await fn(); await pause(ENTRE_APPELS_MS); return r; }
    catch (e) {
      if (essai >= 4) throw e;
      await pause(2000 * (essai + 1));
    }
  }
}

console.log(POUR_DE_VRAI ? "MODE RÉEL — les pages vides en double seront archivées\n"
                         : "ESSAI À BLANC — rien ne sera modifié\n");

// 1. Inventaire complet du magasin
const pages = [];
let curseur;
do {
  const r = await appel(() => notion.blocks.children.list({ block_id: STORAGE_PAGE_ID, page_size: 100, start_cursor: curseur }));
  for (const b of r.results) {
    if (b.type !== "child_page") continue;
    pages.push({ id: b.id, titre: b.child_page.title, cree: b.created_time, modifie: b.last_edited_time });
  }
  curseur = r.has_more ? r.next_cursor : undefined;
  process.stdout.write(`\r  inventaire : ${pages.length} pages`);
} while (curseur);
console.log(`\n  ${pages.length} pages techniques dans le magasin\n`);

// 2. Regroupement par clé
const parTitre = new Map();
for (const p of pages) {
  if (!p.titre.startsWith("[DATA] ")) continue;      // verrou 2
  if (!parTitre.has(p.titre)) parTitre.set(p.titre, []);
  parTitre.get(p.titre).push(p);
}

// 3. Candidates : titres en double, pages jamais écrites, jamais la dernière
const candidates = [];
for (const [titre, liste] of parTitre) {
  if (liste.length < 2) continue;                     // verrou 3
  const jamaisEcrites = liste.filter((p) => Date.parse(p.modifie) - Date.parse(p.cree) <= 2000);
  const ecrites = liste.filter((p) => Date.parse(p.modifie) - Date.parse(p.cree) > 2000);
  // On garde au moins une page pour la clé : s'il n'y a QUE des pages jamais
  // écrites, la plus récente reste en place.
  let aArchiver = jamaisEcrites;
  if (ecrites.length === 0) {
    aArchiver = jamaisEcrites.sort((a, b) => b.cree.localeCompare(a.cree)).slice(1);
  }
  for (const p of aArchiver) candidates.push({ ...p, titre });
}
candidates.sort((a, b) => a.titre.localeCompare(b.titre));

const parCle = {};
for (const c of candidates) parCle[c.titre] = (parCle[c.titre] || 0) + 1;
console.log(`Candidates : ${candidates.length} pages, sur ${Object.keys(parCle).length} clés`);
for (const [t, n] of Object.entries(parCle).sort((a, b) => b[1] - a[1]).slice(0, 12)) {
  console.log(`   ${String(n).padStart(5)} × ${t}  (la clé en garde ${parTitre.get(t).length - n})`);
}
console.log(`\nIntactes : ${pages.length - candidates.length} pages, dont toutes celles qui portent des données.`);

if (!POUR_DE_VRAI) {
  console.log("\nEssai à blanc terminé — relancer avec --pour-de-vrai pour archiver.");
  process.exit(0);
}

// 4. Archivage, avec vérification du vide juste avant (verrou 4)
let archivees = 0, gardees = 0, erreurs = 0;
for (const [i, p] of candidates.entries()) {
  if (archivees >= MAX) break;
  try {
    const contenu = await appel(() => notion.blocks.children.list({ block_id: p.id, page_size: 1 }));
    if (contenu.results.length > 0) { gardees++; continue; }   // pas vide → on ne touche pas
    await appel(() => notion.pages.update({ page_id: p.id, archived: true }));
    archivees++;
  } catch { erreurs++; }
  if (i % 25 === 0) process.stdout.write(`\r  ${i + 1}/${candidates.length} — archivées ${archivees}, gardées ${gardees}, erreurs ${erreurs}`);
}
console.log(`\n\nTerminé : ${archivees} archivées, ${gardees} gardées (non vides), ${erreurs} erreurs.`);
