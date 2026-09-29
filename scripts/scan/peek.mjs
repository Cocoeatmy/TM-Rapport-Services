/**
 * Coup d'œil dans un PDF — outil de mise au point, LECTURE SEULE.
 *
 * Le chemin est résolu par parcours du dossier, et non écrit en dur : macOS
 * stocke les accents en forme décomposée (« à » = a + accent combinant), et
 * une chaîne tapée au clavier ne correspond alors à aucun fichier.
 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdf = require("pdf-parse");
import fs from "fs";
import path from "path";

const [dossier, motif, taille = "1800"] = process.argv.slice(2);
const norm = (s) => s.normalize("NFC").toLowerCase();

function trouver(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { const r = trouver(p); if (r) return r; }
    else if (e.name.endsWith(".pdf") && norm(e.name).includes(norm(motif))) return p;
  }
  return null;
}

const f = trouver(dossier);
if (!f) { console.log("Aucun PDF ne correspond à :", motif); process.exit(0); }
console.log("###", path.basename(f));
const d = await pdf(fs.readFileSync(f));
console.log("### pages:", d.numpages, "| caractères:", d.text.length);
console.log(d.text.replace(/\n{3,}/g, "\n\n").slice(0, Number(taille)));
