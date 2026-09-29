/**
 * Dépose les factures émises dans l'application — LECTURE SEULE côté dossiers.
 *
 * Vercel ne peut pas lire le Bureau de ce Mac. L'agent dépouille donc les PDF
 * sur place, et pousse ici le strict nécessaire : numéro, client, date,
 * montant hors taxes. Rien de ce qui touche aux fichiers n'est modifié.
 *
 * L'authentification se fait par la clé partagée, celle qui sert déjà à
 * l'agent de calendrier : ce script n'a pas de session utilisateur.
 *
 * Usage :
 *   SHARE_LINK_KEY=… node scripts/scan/pousser.mjs [--scan data/scan.json]
 */
import fs from "fs";

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const SCAN = opt("scan", "data/scan.json");
const BASE = opt("url", process.env.TM_BASE_URL || "https://tm-rapport-services.vercel.app");
const CLE = process.env.SHARE_LINK_KEY;

if (!CLE) { console.error("SHARE_LINK_KEY manquante."); process.exit(1); }

const scan = JSON.parse(fs.readFileSync(SCAN, "utf8"));
const factures = (scan.factures || [])
  .filter((f) => f && f.num && Number(f.ht) > 0)
  .map((f) => ({ num: f.num, client: f.client || "Non renseigné", date: f.date, ht: f.ht }));

if (factures.length === 0) {
  console.error("Aucune facture à pousser — envoi annulé plutôt que d'effacer l'existant.");
  process.exit(1);
}

const r = await fetch(`${BASE}/api/stats/ca/factures`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-cle": CLE },
  body: JSON.stringify({ factures }),
});
const d = await r.json().catch(() => ({}));
if (!r.ok) { console.error("Échec :", d.error || r.status); process.exit(1); }
const total = factures.reduce((s, f) => s + f.ht, 0);
console.log(`${d.recues} factures déposées — ${Math.round(total).toLocaleString("fr-CH")} CHF HT`);
