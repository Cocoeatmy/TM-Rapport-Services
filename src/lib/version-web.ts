/**
 * La version Web : ce qu'elle est, comment la nommer, comment la comparer.
 *
 * ── Pourquoi pas un numéro qui s'incrémente ─────────────────────────────
 *
 * Un compteur « 1, 2, 3… » par mise en production exigerait un registre
 * durable et transactionnel : Vercel compile sur un clone partiel (dix
 * commits — impossible de compter l'historique), et la base Notion n'offre
 * pas d'écriture conditionnelle (deux compilations simultanées auraient pu
 * prendre le même numéro, ou une lecture ratée tout renuméroter).
 *
 * Le libellé lisible est donc FIXÉ À LA COMPILATION : la date et l'heure de
 * compilation, en UTC. Aucun registre, aucune écriture, connu hors ligne
 * puisqu'il est dans la page elle-même. Un retour arrière sur un ancien
 * déploiement affiche son libellé à lui — celui réellement servi.
 *
 * ── Identité et libellé ne sont pas la même chose ───────────────────────
 *
 * L'IDENTITÉ d'une version est l'identifiant du déploiement Vercel
 * (`dpl_…`), unique ; à défaut (poste local), le commit. C'est elle qu'on
 * compare, toujours PAR ÉGALITÉ. Le libellé dit QUAND le code a été compilé :
 * deux compilations dans la même seconde auraient le même, et l'ordre des
 * compilations n'est pas celui des mises en production. On l'affiche
 * toujours avec le commit abrégé, et l'on ne trie jamais dessus.
 */

export interface VersionWeb {
  /** Libellé lisible `AAAA.MM.JJ-HHMMSS` (UTC de compilation), ou null. */
  numero: string | null;
  sha: string | null;
  deploiement: string | null;
  /** production | preview | development | local */
  env: string;
  /** Instant de compilation, ISO. */
  compile: string | null;
  /** Date du commit, ISO. */
  dateCommit: string | null;
}

const texte = (v: unknown, max = 80): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

/* Chaque champ à son format : rien de libre n'est recopié (un battement est
   une donnée venue d'un navigateur). Hors format → null. */
const conforme = (v: string | null, re: RegExp): string | null => (v && re.test(v) ? v : null);
const RE_SHA = /^[0-9a-f]{7,40}$/i;
const RE_DEPLOIEMENT = /^dpl_[A-Za-z0-9_]{1,60}$/;
const ENVS = new Set(["production", "preview", "development", "local"]);
const dateIso = (v: string | null): string | null => (v && /^\d{4}-\d{2}-\d{2}T/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null);

/** `2026-10-19T17:45:52.123Z` → `2026.10.19-174552`. Rien d'inventé : null si illisible. */
export function numeroDepuisCompilation(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(iso);
  if (!m || Number.isNaN(Date.parse(iso))) return null;
  return `${m[1]}.${m[2]}.${m[3]}-${m[4]}${m[5]}${m[6]}`;
}

/**
 * Normalise une version venue d'ailleurs (variable de compilation, balise,
 * réponse serveur, battement) : chaque champ au bon type, ou null.
 */
export function normaliserVersion(brut: unknown): VersionWeb | null {
  if (!brut || typeof brut !== "object") return null;
  const o = brut as Record<string, unknown>;
  const compile = dateIso(texte(o.compile, 40));
  const env = texte(o.env, 16);
  const v: VersionWeb = {
    numero: texte(o.numero, 24) ?? numeroDepuisCompilation(compile),
    sha: conforme(texte(o.sha, 40), RE_SHA),
    deploiement: conforme(texte(o.deploiement, 64), RE_DEPLOIEMENT),
    env: env && ENVS.has(env) ? env : "local",
    compile,
    dateCommit: dateIso(texte(o.dateCommit, 40)),
  };
  if (v.numero && !/^\d{4}\.\d{2}\.\d{2}-\d{6}$/.test(v.numero)) v.numero = numeroDepuisCompilation(compile);
  return v.sha || v.deploiement || v.numero ? v : null;
}

/**
 * La version compilée dans CE déploiement (côté serveur comme côté page :
 * `TM_VERSION_COMPILATION` est figée dans le code par next.config.ts).
 */
export function versionCompilee(): VersionWeb | null {
  let brut: unknown = null;
  try { brut = JSON.parse(process.env.TM_VERSION_COMPILATION || "null"); } catch { brut = null; }
  return normaliserVersion(brut);
}

/** L'identité, pour comparer : déploiement, sinon commit. */
export function identite(v: VersionWeb | null | undefined): string | null {
  return v?.deploiement || v?.sha || null;
}

/**
 * Deux versions sont-elles la même ? Par égalité d'identité, jamais par
 * ordre de libellé. `null` = impossible à dire (une identité manque).
 */
export function memeVersion(a: VersionWeb | null | undefined, b: VersionWeb | null | undefined): boolean | null {
  const x = identite(a), y = identite(b);
  if (!x || !y) return null;
  if (a?.deploiement && b?.deploiement) return a.deploiement === b.deploiement;
  if (a?.sha && b?.sha) return a.sha === b.sha;
  return x === y;
}

export const sha7 = (sha: string | null | undefined) => (sha ? sha.slice(0, 7) : null);

/**
 * Le libellé à montrer : « Version Web 2026.10.19-1745 · a1b2c3d »,
 * « Aperçu · a1b2c3d », « Développement ». null si rien n'est connu.
 */
export function libelleVersion(v: VersionWeb | null | undefined): string | null {
  if (!v) return null;
  const court = sha7(v.sha);
  if (v.env === "preview") return court ? `Aperçu · ${court}` : "Aperçu";
  if (v.env !== "production") return court ? `Développement · ${court}` : "Développement";
  if (!v.numero) return court ? `Version Web · ${court}` : null;
  const lisible = v.numero.slice(0, 15); // AAAA.MM.JJ-HHMM
  return court ? `Version Web ${lisible} · ${court}` : `Version Web ${lisible}`;
}

/** Ce qu'on inscrit dans la page (`<meta name="tm-version">`). */
export function balisePourPage(v: VersionWeb | null): string {
  return v ? JSON.stringify(v) : "";
}

/** La version que CE document exécute, lue dans sa propre balise. */
export function versionDuDocument(doc: Document | null = typeof document !== "undefined" ? document : null): VersionWeb | null {
  const contenu = doc?.querySelector('meta[name="tm-version"]')?.getAttribute("content");
  if (contenu) {
    try { return normaliserVersion(JSON.parse(contenu)); } catch { /* balise illisible */ }
  }
  /* Page antérieure à la balise : on n'a que le commit. */
  const build = doc?.querySelector('meta[name="tm-build"]')?.getAttribute("content");
  return build && build !== "dev" ? { numero: null, sha: build, deploiement: null, env: "production", compile: null, dateCommit: null } : null;
}

/** Compare deux numéros « 1.2.3 » (versions de l'app native). */
export function versionNativePlusAncienne(installee: string | null | undefined, minimum: string | null | undefined): boolean | null {
  if (!installee || !minimum) return null;
  const a = installee.split(".").map((n) => parseInt(n, 10) || 0);
  const b = minimum.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] || 0, y = b[i] || 0;
    if (x !== y) return x < y;
  }
  return false;
}

/** La version de l'app Apple, lue dans l'identifiant du navigateur (`TMRapportApp/1.0 (iOS)`). */
export function versionAppDepuisAgent(ua: string | null | undefined): string | null {
  const m = /TMRapportApp\/([0-9][0-9.]*)/.exec(ua || "");
  return m ? m[1] : null;
}
