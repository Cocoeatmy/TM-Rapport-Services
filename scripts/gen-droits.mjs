/**
 * Inventaire des droits d'accès — généré à partir du code, pas tenu à la main.
 *
 * Une liste écrite à la main se périme au premier ajout de route et ment
 * ensuite en silence, ce qui est pire que pas de liste du tout. Ce script lit
 * le middleware et chaque fichier de route, et en déduit la protection
 * réellement en place. Il tourne AVANT `next build`, et son résultat est
 * embarqué dans la page « Droits d'accès ».
 *
 * La déduction reste une lecture de code : elle voit les contrôles écrits de
 * façon habituelle dans ce dépôt. La page le dit, et chaque entrée renvoie à
 * son fichier pour vérification.
 */
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from "node:fs";
import { join, relative } from "node:path";

const RACINE = process.cwd();
const APP = join(RACINE, "src", "app");
const SORTIE = join(RACINE, "src", "lib", "droits-generes.json");

function fichiers(dossier, resultat = []) {
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) fichiers(chemin, resultat);
    else if (/^(route|page)\.tsx?$/.test(nom)) resultat.push(chemin);
  }
  return resultat;
}

/** Préfixes déclarés publics dans le middleware. */
function prefixesPublics() {
  const src = readFileSync(join(RACINE, "src", "middleware.ts"), "utf8");
  const bloc = src.slice(0, src.indexOf("const token"));
  const prefixes = [...bloc.matchAll(/startsWith\("([^"]+)"\)/g)].map((m) => m[1]);
  const exacts = [...bloc.matchAll(/pathname === "([^"]+)"/g)].map((m) => m[1]);
  return { prefixes, exacts };
}

const { prefixes, exacts } = prefixesPublics();
const estPublicMiddleware = (url) =>
  exacts.includes(url) || prefixes.some((p) => url.startsWith(p));

/** Classe une route d'après les contrôles écrits dans son fichier. */
function niveauDe(source, url) {
  const a = (re) => re.test(source);
  if (url.startsWith("/api/cron/") || a(/CRON_SECRET/)) return "cron";
  /* Les deux écritures du même verrou : « si admin, je continue » et « si pas
     admin, je refuse ». La seconde manquait, et les routes qui l'emploient
     étaient inventoriées comme simplement connectées — l'inventaire annonçait
     alors une protection plus faible que celle réellement en place. */
  if (a(/role\s*===\s*["']admin["']/)) return "admin";
  if (a(/role\s*!==\s*["']admin["'][\s\S]{0,200}?(40[13]|Admin requis)/)) return "admin";
  const signe = a(/sign(Fiche|Sav|Synthese|Pdf|PdfClient|Signalements|Arrivage|Chantier|Doc|Mesure|PhotosZip)/);
  const cookie = a(/verifyToken|auth-token/);
  if (signe && cookie) return "signe-ou-connecte";
  if (signe) return "signe";
  if (a(/SHARE_LINK_KEY/)) return "cle-secrete";
  if (cookie) return "connecte";
  return estPublicMiddleware(url) ? "ouvert" : "connecte-middleware";
}

const entrees = fichiers(APP)
  .map((chemin) => {
    const rel = relative(RACINE, chemin).replace(/\\/g, "/");
    const source = readFileSync(chemin, "utf8");
    const url = "/" + rel
      .replace(/^src\/app\//, "")
      .replace(/\/(route|page)\.tsx?$/, "")
      .replace(/^page\.tsx?$/, "");
    const type = /\/route\.tsx?$/.test(rel) ? "api" : "page";
    // Une page qui renvoie un non-admin à l'accueil : protection d'écran, que
    // l'on distingue d'un contrôle serveur — un écran masqué n'est pas un
    // accès refusé, seules les API que la page appelle le décident.
    const gardePage = type === "page" && /role\s*!==\s*["']admin["']/.test(source);
    return {
      url: url === "/" ? "/" : url,
      type,
      fichier: rel,
      niveau: gardePage ? "admin-ecran" : niveauDe(source, url),
      gardePage,
      methodes: type === "api"
        ? [...source.matchAll(/export async function (GET|POST|PATCH|PUT|DELETE)/g)].map((m) => m[1])
        : [],
    };
  })
  .sort((a, b) => a.url.localeCompare(b.url));

mkdirSync(join(RACINE, "src", "lib"), { recursive: true });
writeFileSync(SORTIE, JSON.stringify({
  genereLe: new Date().toISOString(),
  publicMiddleware: { prefixes, exacts },
  entrees,
}, null, 2) + "\n", "utf8");

console.log(`[droits] ${entrees.length} routes inventoriées → ${relative(RACINE, SORTIE)}`);
