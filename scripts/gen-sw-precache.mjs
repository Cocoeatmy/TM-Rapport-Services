// Postbuild : génère la liste de précache du service worker.
// Scanne .next/static (tous les JS/CSS/fonts hashés du build) et injecte la
// liste + la version (BUILD_ID) dans public/sw.js. Comme le contenu de sw.js
// change à chaque build, le navigateur détecte la mise à jour du SW et
// re-précache toute l'app → ouverture hors-ligne fiable même après un déploiement.

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const STATIC_DIR = join(ROOT, ".next", "static");
const SW_PATH = join(ROOT, "public", "sw.js");

function walk(dir, base = "") {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = base ? `${base}/${name}` : name;
    if (statSync(full).isDirectory()) out.push(...walk(full, rel));
    else out.push(rel);
  }
  return out;
}

if (!existsSync(STATIC_DIR)) {
  console.warn("[sw-precache] .next/static introuvable — étape ignorée.");
  process.exit(0);
}
if (!existsSync(SW_PATH)) {
  console.warn("[sw-precache] public/sw.js introuvable — étape ignorée.");
  process.exit(0);
}

const files = walk(STATIC_DIR).filter((f) => !f.endsWith(".map"));
const urls = files.map((f) => `/_next/static/${f}`);

const buildId = existsSync(join(ROOT, ".next", "BUILD_ID"))
  ? readFileSync(join(ROOT, ".next", "BUILD_ID"), "utf8").trim()
  : String(files.length);

// "/" = app shell (page d'accueil). Le reste = code de l'app.
const manifest = ["/", ...urls];

let sw = readFileSync(SW_PATH, "utf8");
const before = sw;

sw = sw.replace(
  /const PRECACHE_VERSION = ".*?"; \/\/ VERSION_INJECT/,
  `const PRECACHE_VERSION = "${buildId}"; // VERSION_INJECT`,
);
sw = sw.replace(
  /const PRECACHE_MANIFEST = .*?; \/\/ MANIFEST_INJECT/,
  `const PRECACHE_MANIFEST = ${JSON.stringify(manifest)}; // MANIFEST_INJECT`,
);

if (sw === before) {
  console.warn("[sw-precache] marqueurs VERSION_INJECT/MANIFEST_INJECT introuvables dans sw.js — rien injecté.");
  process.exit(0);
}

writeFileSync(SW_PATH, sw);

// Marqueur de diagnostic : prouve que ce script s'est exécuté au build et que
// les fichiers écrits ensuite dans public/ sont bien déployés. (public/icons
// est public — non protégé par la middleware.)
try {
  writeFileSync(join(ROOT, "public", "icons", "precache-version.txt"), buildId);
} catch { /* non bloquant */ }

console.log(`[sw-precache] ${manifest.length} fichiers précachés, version ${buildId}`);
