#!/usr/bin/env node
/**
 * Rouvrir une archive chiffrée — sans l'application.
 *
 * C'est le filet du filet. Si TM Rapport Services n'existe plus, si Vercel
 * a fermé, si Notion a fermé, ce script et la phrase secrète suffisent à
 * récupérer les données. Il n'utilise QUE Node, aucune dépendance : copiez
 * le fichier et ce script sur n'importe quelle machine, et ça marche.
 *
 *   node dechiffrer-archive.mjs archive.tmenc "ma phrase secrete" sortie.json
 *
 * Sans le troisième argument, le contenu part sur la sortie standard.
 *
 * Tout ce dont il a besoin est écrit en clair dans l'en-tête du fichier :
 * ouvrez-le avec un éditeur de texte, les deux premières lignes sont
 * lisibles. Même sans ce script, un développeur les comprend.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { scryptSync, createDecipheriv, createHash } from "node:crypto";

const [fichier, passe, sortie] = process.argv.slice(2);
if (!fichier || !passe) {
  console.error("usage : node dechiffrer-archive.mjs <archive.tmenc> <phrase secrète> [sortie.json]");
  process.exit(2);
}

const brut = readFileSync(fichier);
if (brut.subarray(0, 6).toString() !== "TMENC1") {
  console.error("Ce fichier n'est pas une archive chiffrée TM (repère TMENC1 absent).");
  console.error("S'il commence par « { », c'est déjà du JSON en clair : rien à déchiffrer.");
  process.exit(1);
}

const fin = brut.indexOf(0x0a, 7);
const e = JSON.parse(brut.subarray(7, fin).toString("utf-8"));

const cle = scryptSync(passe, Buffer.from(e.sel, "base64"), 32, {
  N: e.N, r: e.r, p: e.p, maxmem: 128 * e.N * e.r * 2,
});
const d = createDecipheriv(e.alg, cle, Buffer.from(e.iv, "base64"));
d.setAuthTag(Buffer.from(e.tag, "base64"));

let clair;
try {
  clair = Buffer.concat([d.update(brut.subarray(fin + 1)), d.final()]);
} catch {
  console.error("Phrase secrète incorrecte, ou fichier abîmé.");
  process.exit(1);
}

const sha = createHash("sha256").update(clair).digest("hex");
if (e.clair?.sha256 && sha !== e.clair.sha256) {
  console.error("ATTENTION : le contenu ne correspond pas à son empreinte.");
  process.exit(1);
}

if (sortie) {
  writeFileSync(sortie, clair);
  const a = JSON.parse(clair.toString("utf-8"));
  console.error(`Archive du ${a.genereLe} écrite dans ${sortie} :`);
  for (const [k, v] of Object.entries(a.empreintes || {})) console.error(`   ${String(v.lignes).padStart(6)}  ${k}`);
} else {
  process.stdout.write(clair);
}
