/**
 * Écriture des montants d'offre dans Notion.
 *
 * Il ne touche QU'UNE propriété : « Montant OFR ». Une requête Notion ne
 * modifie que ce qu'elle nomme — aucune autre colonne, aucun contenu de page
 * ne peut être atteint, même en cas d'erreur de notre côté.
 *
 * Deux garde-fous.
 *
 *   • L'essai à blanc est le DÉFAUT. Il faut `--ecrire` pour que quoi que ce
 *     soit parte. Une erreur de chemin ou de fichier ne peut donc pas se
 *     traduire par mille cinq cents écritures.
 *   • Le débit est tenu à trois requêtes par seconde, la limite que Notion
 *     accepte sans broncher, et un 429 est retenté après une pause. Sans cela,
 *     la base renvoie des erreurs à mi-parcours et l'on ne sait plus ce qui
 *     est passé.
 *
 * Usage :
 *   node scripts/scan/ecrire.mjs                    # essai à blanc
 *   node scripts/scan/ecrire.mjs --ecrire           # pour de vrai
 *   node scripts/scan/ecrire.mjs --ecrire --limite 5
 */

import fs from "fs";
import path from "path";

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const SOURCE = opt("source", "data/rapprochement.json");
const JOURNAL = opt("journal", "data/ecriture.json");
const LIMITE = Number(opt("limite", "0")) || Infinity;
const POUR_DE_VRAI = args.includes("--ecrire");

const TOKEN = process.env.NOTION_TOKEN;
if (!TOKEN) { console.error("NOTION_TOKEN manquant."); process.exit(1); }

/** Trois requêtes par seconde : au-delà, Notion refuse. */
const ENTRE_REQUETES = 340;
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Pose le montant sur une fiche.
 *
 * Un 429 n'est pas un échec : c'est la base qui demande d'attendre. On respecte
 * le délai qu'elle indique, et l'on réessaie — abandonner laisserait la moitié
 * des fiches remplies sans qu'on sache lesquelles.
 */
async function poser(id, montant, essai = 1) {
  const r = await fetch(`https://api.notion.com/v1/pages/${id}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ properties: { "Montant OFR": { number: montant } } }),
  });
  if (r.status === 429 && essai <= 5) {
    const pause = Number(r.headers.get("retry-after") || 2) * 1000;
    await dormir(pause);
    return poser(id, montant, essai + 1);
  }
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    return { ok: false, erreur: d.message || `HTTP ${r.status}` };
  }
  return { ok: true };
}

/* ── Exécution ──────────────────────────────────────────────────────────── */

const donnees = JSON.parse(fs.readFileSync(SOURCE, "utf8"));
const aPoser = donnees.aPoser.filter((l) => Number.isFinite(l.montantPropose) && l.montantPropose > 0);
const lot = aPoser.slice(0, LIMITE === Infinity ? aPoser.length : LIMITE);

console.log(POUR_DE_VRAI
  ? `Écriture de ${lot.length} montants dans Notion.`
  : `ESSAI À BLANC — ${lot.length} montants seraient posés. Ajoutez --ecrire pour agir.`);
if (!POUR_DE_VRAI) {
  lot.slice(0, 5).forEach((l) => console.log(`  ${l.ofr.padEnd(24)} ${String(l.montantPropose).padStart(10)} CHF  ${l.projet.slice(0, 40)}`));
  process.exit(0);
}

const t0 = Date.now();
const poses = [];
const echecs = [];

for (let i = 0; i < lot.length; i++) {
  const l = lot[i];
  const r = await poser(l.id, l.montantPropose);
  if (r.ok) poses.push({ id: l.id, ofr: l.ofr, montant: l.montantPropose });
  else echecs.push({ id: l.id, ofr: l.ofr, montant: l.montantPropose, erreur: r.erreur });
  if ((i + 1) % 25 === 0 || i === lot.length - 1) {
    const s = Math.round((Date.now() - t0) / 1000);
    process.stdout.write(`\r  ${i + 1}/${lot.length} — ${poses.length} posés, ${echecs.length} échecs — ${s} s`);
  }
  await dormir(ENTRE_REQUETES);
}

process.stdout.write("\n");
fs.mkdirSync(path.dirname(JOURNAL), { recursive: true });
fs.writeFileSync(JOURNAL, JSON.stringify({
  quand: new Date().toISOString(),
  poses: poses.length,
  total: Math.round(poses.reduce((s, x) => s + x.montant, 0)),
  echecs,
}, null, 2));

console.log(`
  ${poses.length} montants posés — ${Math.round(poses.reduce((s, x) => s + x.montant, 0)).toLocaleString("fr-CH")} CHF HT
  ${echecs.length} échecs${echecs.length ? " (détail dans le journal)" : ""}
  Journal : ${JOURNAL}`);
if (echecs.length) echecs.slice(0, 5).forEach((e) => console.log(`    ${e.ofr} : ${e.erreur}`));
