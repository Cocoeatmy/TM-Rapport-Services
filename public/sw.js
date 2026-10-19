// Service worker TM Rapport — v17
// Stratégies :
//   - Statique (_next/static, icons, logos, manifest) : cache-first (permanent).
//   - API GET : network-first avec timeout 400 ms → si réseau lent/absent, sert le cache.
//   - Pages HTML : network-first avec timeout 6 s → si timeout ou échec, sert le cache,
//     sinon page offline.
//   v11 : pré-cache explicite des pages /client/ et /projet/ + leurs données API
//         via message PRECACHE_URLS — permet consultation hors-ligne garantie.

const VERSION = "v35";
const CACHE_NAME  = `tm-rapport-${VERSION}`;
const STATIC_CACHE = `tm-static-${VERSION}`;
const API_CACHE   = `tm-api-${VERSION}`;

// Injectés au build par scripts/gen-sw-precache.mjs (postbuild). Ne pas éditer
// les valeurs à la main : elles sont remplacées à chaque déploiement.
const PRECACHE_VERSION = "GLiaujr7n1g_DBf8Ajs5U"; // VERSION_INJECT
const PRECACHE_MANIFEST = ["/","/_next/static/GLiaujr7n1g_DBf8Ajs5U/_buildManifest.js","/_next/static/GLiaujr7n1g_DBf8Ajs5U/_clientMiddlewareManifest.js","/_next/static/GLiaujr7n1g_DBf8Ajs5U/_ssgManifest.js","/_next/static/chunks/0-0zfyrfr_pdn.js","/_next/static/chunks/08o_k-4cvafb7.js","/_next/static/chunks/09smm07pviqm9.js","/_next/static/chunks/0_j6dyk6vs-0j.js","/_next/static/chunks/0cz1d0mv5g_q7.js","/_next/static/chunks/0ep_jal-y-tru.js","/_next/static/chunks/0g-jl1-1azrle.js","/_next/static/chunks/0h2nyfd0yuefq.js","/_next/static/chunks/0hahnk2wdtko2.js","/_next/static/chunks/0kn5dpipstvvo.js","/_next/static/chunks/0n18gpyw7smad.js","/_next/static/chunks/0nym7nkmx9snz.js","/_next/static/chunks/0okcdurs7_do8.js","/_next/static/chunks/0om590q-tq0l9.js","/_next/static/chunks/0ri9y0mfhdrl7.js","/_next/static/chunks/0t76yi7g2jx_l.js","/_next/static/chunks/0umf92h1sb77c.js","/_next/static/chunks/0y5clzihzfsg1.js","/_next/static/chunks/0ymv_yyx3bf79.js","/_next/static/chunks/1-mr_a2dvuf3c.js","/_next/static/chunks/13ki_58ds9dbf.js","/_next/static/chunks/13qx_6id8mo4j.js","/_next/static/chunks/14uyx-363ktkq.js","/_next/static/chunks/1dzubst3cehz8.js","/_next/static/chunks/1evnjkvyg9oih.js","/_next/static/chunks/1fd__k5qkcw83.js","/_next/static/chunks/1hgbrd-8zdquk.js","/_next/static/chunks/1i2qkk7c5_2c7.js","/_next/static/chunks/1kti4r0_tsjy3.js","/_next/static/chunks/1l03p3zb3_g8t.js","/_next/static/chunks/1m60qf0o5q8p4.js","/_next/static/chunks/1njjx9j86luw9.js","/_next/static/chunks/1ynpfdqzhab7a.js","/_next/static/chunks/23lp_wm-5vf4g.js","/_next/static/chunks/25cwdcc36tol6.js","/_next/static/chunks/25hswwlys9dez.js","/_next/static/chunks/27rkd_5n5hq57.js","/_next/static/chunks/28-te-a3nudd9.js","/_next/static/chunks/28mfg7656u_22.js","/_next/static/chunks/28o18k_l7cw45.css","/_next/static/chunks/2e6amo207-rx7.js","/_next/static/chunks/2f3s43uyaejqt.js","/_next/static/chunks/2h9v2viucbg9w.js","/_next/static/chunks/2i991w__-ytp1.js","/_next/static/chunks/2ict6su_a4btv.js","/_next/static/chunks/2na42sfmutpxm.js","/_next/static/chunks/2pjuf9ug7ri16.js","/_next/static/chunks/2qoipx0wid03h.js","/_next/static/chunks/2x355shs_347n.js","/_next/static/chunks/3-6mv7-196g9a.js","/_next/static/chunks/3-surks-nyu1g.js","/_next/static/chunks/3c2z1ninpoub-.js","/_next/static/chunks/3dfzygeq5969i.js","/_next/static/chunks/3fff39sjn632e.js","/_next/static/chunks/3fw2ljz386tf1.js","/_next/static/chunks/3hfxv85nzs-pi.js","/_next/static/chunks/3i3ak-73o77s8.js","/_next/static/chunks/3ihghn11w62_7.js","/_next/static/chunks/3kgvd0tz2psxw.js","/_next/static/chunks/3m4bnhtvrcebt.js","/_next/static/chunks/3mkg7jp5g3jbs.js","/_next/static/chunks/3qvej259cg-5l.js","/_next/static/chunks/3rtt8r7-gcw8i.js","/_next/static/chunks/3s149onln6pe_.js","/_next/static/chunks/3wefjf9rz08jy.js","/_next/static/chunks/3yhsiyszaj2sa.css","/_next/static/chunks/40qi70unn7cw6.js","/_next/static/chunks/41e0zjh137xn4.js","/_next/static/chunks/420bj5io9aejl.js","/_next/static/chunks/42o1btbhbvl5f.js","/_next/static/chunks/turbopack-2c3mg3r-05n1w.js","/_next/static/media/4fa387ec64143e14-s.2tuy5pz7dlieh.woff2","/_next/static/media/53b9e256198e5412-s.390ncx5urfkfu.woff2","/_next/static/media/5ce348bf30bf5439-s.31988l_ccedte.woff2","/_next/static/media/6306c77e7c8268e4-s.2dbetqa9o8jxf.woff2","/_next/static/media/7178b3e590c64307-s.21jp631_3pja2.woff2","/_next/static/media/797e433ab948586e-s.p.0r6juujl39pe6.woff2","/_next/static/media/7d817b4c03b0c5f1-s.1uyisp29ctx0d.woff2","/_next/static/media/8a480f0b521d4e75-s.1qq4vpdcun5oj.woff2","/_next/static/media/bbc41e54d2fcbd21-s.1rgnod-3esatf.woff2","/_next/static/media/caa3a2e1cccd8315-s.p.0wgildi0cnwt9.woff2","/_next/static/media/favicon.2vob68tjqpejf.ico","/_next/static/media/fef07dbb0973bf53-s.3p2_lha1f2xer.woff2"]; // MANIFEST_INJECT
const PRECACHE_CACHE = `tm-precache-${PRECACHE_VERSION}`;

const STATIC_ASSETS = [
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/logo-app.png",
];

/** Délai avant fallback cache pour les requêtes API (réseau lent). */
const API_TIMEOUT_MS  = 400;
/** Délai avant fallback cache pour la navigation HTML (réseau très lent / hors-ligne). */
const HTML_TIMEOUT_MS = 6000;
/** Idem pour les API « toujours fraîches » : on préfère le réseau, mais pas à
 *  n'importe quel prix. Sans ce plafond, ouvrir un projet avec une barre de
 *  réseau attendait /api/pieces et /api/defauts jusqu'à l'abandon du navigateur
 *  — trente secondes d'écran figé, pour des données dont on a une copie. */
const FRESH_TIMEOUT_MS = 2500;
/** Requêtes de revalidation (?rv / ?fresh) : tâche de fond, jamais bloquante. */
const RV_TIMEOUT_MS = 8000;

/**
 * Les fragments de code chargés À LA DEMANDE, gardés eux aussi.
 *
 * Le pré-cache envoyé par la page ne liste que les fichiers déjà chargés. Un
 * écran ouvert pour la première fois sans réseau — l'étape « photos » de
 * l'assistant d'un lot, par exemple — réclamait un fragment jamais vu : page
 * en erreur (« ChunkLoadError »), constaté en production sur TEST 5 le
 * 19.10.2026. La liste injectée au build (PRECACHE_MANIFEST) ne sauve rien :
 * sur Vercel elle reste celle d'un ancien build, et ses adresses rendent 404.
 *
 * Ici, on lit le code et les pages déjà gardés et on suit les fragments
 * qu'ils citent (« static/immutable/chunks/xxx.js »), de proche en proche. Ces fichiers
 * portent leur empreinte dans leur nom : un fichier gardé ne change jamais.
 */
/* Un suffixe `?dpl=…` (protection contre les versions mêlées de Vercel, si
   elle est activée un jour) est toléré et ignoré : on garde l'adresse nue. */
const RE_FRAGMENT = /["'](?:\/_next\/)?(static\/(?:immutable\/)?(?:chunks|media|css)\/[A-Za-z0-9_.~\-\/]+\.(?:js|css|woff2))(?:\?[^"']*)?["']/g;
const FRAGMENTS_MAX = 400;

async function completerLesFragments(depart) {
  const origine = self.location.origin;
  const aSuivre = [];
  for (const u of depart || []) {
    try {
      const x = new URL(u, origine);
      if (x.origin === origine && x.pathname.startsWith("/_next/static/")) aSuivre.push(x.href);
    } catch { /* adresse illisible : ignorée */ }
  }
  const cache = await caches.open(CACHE_NAME);
  /* Les pages gardées (tableau de bord, fiches préparées pour la journée)
     citent dans leur HTML le code qui leur est propre : on le suit aussi. */
  const citer = (texte) => {
    for (const m of texte.matchAll(RE_FRAGMENT)) aSuivre.push(origine + "/_next/" + m[1]);
  };
  for (const req of await cache.keys()) {
    try {
      const x = new URL(req.url);
      if (x.origin !== origine || x.pathname.startsWith("/_next/") || x.pathname.startsWith("/api/")) continue;
      const rep = await cache.match(req);
      if (rep && (rep.headers.get("content-type") || "").includes("text/html")) citer(await rep.text());
    } catch { /* une page illisible n'arrête pas les autres */ }
  }
  const vus = new Set();
  while (aSuivre.length && vus.size < FRAGMENTS_MAX) {
    const url = aSuivre.shift();
    if (vus.has(url)) continue;
    vus.add(url);
    try {
      let rep = await caches.match(url);
      if (!rep) {
        const r = await fetch(url, { credentials: "same-origin" });
        if (!r || !r.ok) continue;
        ecrituresCache++;
        await cache.put(url, r.clone());
        rep = r;
      }
      if (!url.endsWith(".js")) continue;
      citer(await rep.text());
    } catch { /* hors ligne ou fichier absent : on continue avec les autres */ }
  }
}

/* ═══ Versions : préparer, retenir, nettoyer — sans jamais tout vider ═══
 *
 * Avant, une mise à jour VIDAIT la coquille et les fichiers du build, puis
 * rechargeait. Deux défauts : une coupure pendant le rechargement laissait
 * l'appareil sans coquille ; et les autres onglets, restés sur l'ancienne
 * version, perdaient les fichiers qu'ils allaient demander.
 *
 * Désormais :
 *  - PRÉPARER une version, c'est la télécharger en entier dans un cache à
 *    part (`tm-prep-…`), vérifier qu'il ne manque RIEN, puis seulement la
 *    recopier dans le cache principal — fragments d'abord, coquille en
 *    dernier. Le moindre échec : on jette le cache à part, rien d'autre n'a
 *    bougé.
 *  - Chaque page dit quelle version elle exécute (VERSION_EN_USAGE). Ce que
 *    citent les pages en cache et les versions signalées depuis moins de
 *    sept jours est CONSERVÉ ; le reste des fichiers du build peut partir,
 *    au plus une fois par jour. Au moindre doute, on ne supprime rien.
 */
const META_CACHE = "tm-versions-meta";
/* Chaque écriture de fichier dans les caches l'incrémente : un nettoyage qui
   voit ce compteur bouger pendant son calcul abandonne sans rien supprimer. */
let ecrituresCache = 0;
const META_VERSIONS = "/__tm-meta/versions";
const META_NETTOYAGE = "/__tm-meta/nettoyage";
const META_RECONSTRUCTION = "/__tm-meta/reconstruction";
const PREP_PREFIXE = "tm-prep-";
const PREPARATION_MAX = 1500;
const RETENTION_MS = 7 * 24 * 3600_000;
const NETTOYAGE_PERIODE_MS = 24 * 3600_000;

/* Une écriture des métadonnées à la fois : lire-modifier-écrire sans course. */
let fileMeta = Promise.resolve();
function avecMeta(f) {
  const suite = fileMeta.then(f, f);
  fileMeta = suite.catch(() => {});
  return suite;
}
/**
 * Lit une métadonnée. ABSENTE → `defaut` ; ILLISIBLE → exception. Les deux
 * ne se confondent jamais : réécrire par-dessus une lecture ratée effacerait
 * les versions qu'un autre onglet a signalées, et le nettoyage suivant
 * supprimerait ses fichiers.
 */
async function lireMeta(cle, defaut) {
  const rep = await (await caches.open(META_CACHE)).match(cle);
  if (!rep) return defaut;
  const valeur = await rep.json(); // lève si illisible
  if (!valeur || typeof valeur !== "object") throw new Error("métadonnée illisible");
  return valeur;
}
async function ecrireMeta(cle, valeur) {
  const c = await caches.open(META_CACHE);
  await c.put(cle, new Response(JSON.stringify(valeur), { headers: { "Content-Type": "application/json" } }));
}

/** La version inscrite dans un HTML (balise tm-version), ou null. */
function versionDuHtml(texte) {
  const m = /<meta[^>]+name="tm-version"[^>]+content="([^"]*)"/.exec(texte)
    || /<meta[^>]+content="([^"]*)"[^>]+name="tm-version"/.exec(texte);
  if (!m) return null;
  try {
    const brut = m[1].replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&");
    return JSON.parse(brut);
  } catch { return null; }
}

/** Les fragments cités par un texte (HTML ou JS), en adresses absolues. */
function citations(texte) {
  const out = [];
  for (const m of texte.matchAll(RE_FRAGMENT)) out.push(self.location.origin + "/_next/" + m[1]);
  return out;
}

/** Ce qu'une feuille de style cite par `url(...)` (polices, images), résolu depuis SON adresse. */
const RE_URL_CSS = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;
function citationsCss(texte, base) {
  const out = [];
  for (const m of texte.matchAll(RE_URL_CSS)) {
    try {
      const x = new URL(m[2], base);
      if (x.origin === self.location.origin && x.pathname.startsWith("/_next/static/")) out.push(x.origin + x.pathname);
    } catch { /* data:, adresse illisible : ignorée */ }
  }
  return out;
}

/** Tout ce qu'un fichier de code cite : JS par chaînes, CSS par url(). */
async function dependances(url, rep) {
  if (url.endsWith(".js")) return citations(await rep.text());
  if (url.endsWith(".css")) { const t = await rep.text(); return [...citations(t), ...citationsCss(t, url)]; }
  return [];
}

/* Les gros travaux sur les caches — préparer, nettoyer — un à la fois :
   un nettoyage ne doit jamais tourner pendant qu'une préparation recopie
   des fichiers que rien ne cite encore. */
let fileTravaux = Promise.resolve();
function enSerie(f) {
  const suite = fileTravaux.then(f, f);
  fileTravaux = suite.catch(() => {});
  return suite;
}

let preparationEnCours = null;
let preparationIdEnCours = null;

/**
 * Télécharge la coquille `/` de la version visée et TOUT ce qu'elle cite,
 * de proche en proche. Tout ou rien. Rend true si la version est prête.
 */
async function preparerVersion(id, champ) {
  const nomPrep = PREP_PREFIXE + id.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
  /* Les préparations interrompues (iOS arrête le worker en arrière-plan)
     laissent leur cache : une seule préparation tourne à la fois, on peut
     donc tous les jeter ici. */
  for (const nom of await caches.keys()) {
    if (nom.startsWith(PREP_PREFIXE)) await caches.delete(nom);
  }
  const prep = await caches.open(nomPrep);
  try {
    const coquille = await fetch("/", { credentials: "same-origin", cache: "no-store" });
    const finale = new URL(coquille.url || "/", self.location.origin);
    if (!coquille.ok || coquille.redirected || finale.pathname !== "/") throw new Error("coquille indisponible");
    const html = await coquille.clone().text();
    const v = versionDuHtml(html);
    if (!v || v[champ === "sha" ? "sha" : "deploiement"] !== id) throw new Error("coquille d'une autre version");
    await prep.put("/", coquille);

    const aSuivre = citations(html);
    const vus = new Set();
    while (aSuivre.length) {
      const url = aSuivre.shift();
      if (vus.has(url)) continue;
      if (vus.size >= PREPARATION_MAX) throw new Error("limite atteinte");
      vus.add(url);
      let rep = await caches.match(url);
      if (!rep || !rep.ok) {
        rep = await fetch(url, { credentials: "same-origin" });
        if (!rep || !rep.ok) throw new Error("fragment manquant " + url);
      }
      await prep.put(url, rep.clone());
      aSuivre.push(...await dependances(url, rep));
    }

    /* Tout est là : on publie. Ordre voulu :
       1. les fragments — AJOUTS seulement : leurs adresses portent leur
          empreinte, aucune entrée existante n'est remplacée ni retirée ;
       2. les métadonnées de rétention de la nouvelle version ;
       3. la coquille `/`, en DERNIER et en une seule écriture.
       Un échec avant 3 laisse l'ancienne coquille et tout l'existant intacts
       (les fragments ajoutés sont inertes, et nettoyables) ; après 3, il n'y
       a plus rien qui puisse échouer. */
    const principal = await caches.open(CACHE_NAME);
    for (const url of vus) {
      const rep = await prep.match(url);
      if (!rep) throw new Error("copie incomplète");
      await principal.put(url, rep);
    }
    await avecMeta(async () => {
      const versions = await lireVersionsOuReconstruire();
      versions[id] = { ...(versions[id] || {}), racines: [...vus].slice(0, 800), vuLe: Date.now() };
      await ecrireMeta(META_VERSIONS, versions);
    });
    const c = await prep.match("/");
    if (!c) throw new Error("copie incomplète");
    await principal.put("/", c);
    await caches.delete(nomPrep).catch(() => {});
    return true;
  } catch {
    await caches.delete(nomPrep).catch(() => {});
    return false;
  }
}

/**
 * Des métadonnées illisibles ne sont jamais réécrites à l'aveugle. Si elles
 * le restent, on repart d'une liste neuve — mais on NOTE la reconstruction :
 * le nettoyage s'abstient alors pendant toute la durée de rétention, le
 * temps que chaque onglet encore ouvert ait redit ce qu'il utilise.
 */
async function lireVersionsOuReconstruire() {
  try {
    return await lireMeta(META_VERSIONS, {});
  } catch {
    await ecrireMeta(META_RECONSTRUCTION, { quand: Date.now() });
    return {};
  }
}

/** Une page dit quelle version elle exécute, et ce qu'elle a chargé. */
async function noterUsage(id, racines) {
  const origine = self.location.origin;
  const propres = (racines || []).filter((u) => {
    try { const x = new URL(u); return x.origin === origine && x.pathname.startsWith("/_next/static/"); } catch { return false; }
  }).slice(0, 400);
  await avecMeta(async () => {
    const versions = await lireVersionsOuReconstruire();
    const avant = versions[id] || {};
    versions[id] = { racines: [...new Set([...(avant.racines || []), ...propres])].slice(0, 800), vuLe: Date.now() };
    /* Les versions muettes depuis plus de deux fois la rétention sont oubliées. */
    for (const [cle, v] of Object.entries(versions)) {
      if (!v || typeof v.vuLe !== "number" || Date.now() - v.vuLe > 2 * RETENTION_MS) delete versions[cle];
    }
    await ecrireMeta(META_VERSIONS, versions);
  });
}

/**
 * Supprime les fichiers du build que plus rien ne cite. Conservé : la
 * fermeture (calculée dans les caches seulement, sans réseau) de toutes les
 * pages en cache et des racines signalées depuis moins de sept jours. Une
 * erreur de lecture annule tout. Au plus une fois par jour.
 */
async function nettoyerSiPossible(maintenant = Date.now()) {
  if (self.navigator && self.navigator.onLine === false) return { fait: false, raison: "hors ligne" };
  const dernier = await lireMeta(META_NETTOYAGE, { quand: 0 });
  if (maintenant - (dernier.quand || 0) < NETTOYAGE_PERIODE_MS) return { fait: false, raison: "trop tôt" };
  const origine = self.location.origin;
  const reconstruction = await lireMeta(META_RECONSTRUCTION, { quand: 0 });
  if (maintenant - (reconstruction.quand || 0) < RETENTION_MS) return { fait: false, raison: "métadonnées reconstruites récemment" };
  const versions = await lireMeta(META_VERSIONS, null);
  if (!versions) return { fait: false, raison: "métadonnées absentes" };

  /* La liste de ce qui POURRAIT partir est relevée AVANT le calcul de ce
     qu'on garde : un fichier mis en cache pendant le calcul n'y figure pas,
     il ne peut donc pas être supprimé. Et si une écriture a eu lieu
     pendant le calcul, on abandonne tout. */
  const ecrituresAuDepart = ecrituresCache;
  const candidats = [];
  for (const nom of [CACHE_NAME, STATIC_CACHE]) {
    const c = await caches.open(nom);
    for (const req of await c.keys()) {
      const x = new URL(req.url);
      if (x.origin === origine && x.pathname.startsWith("/_next/static/")) candidats.push([nom, req]);
    }
  }

  const aSuivre = [];
  for (const v of Object.values(versions)) {
    if (v && typeof v.vuLe === "number" && maintenant - v.vuLe < RETENTION_MS) aSuivre.push(...(v.racines || []));
  }
  /* Les pages en cache citent leur propre code : on le garde. */
  for (const nom of [CACHE_NAME, PRECACHE_CACHE]) {
    const c = await caches.open(nom);
    for (const req of await c.keys()) {
      const x = new URL(req.url);
      if (x.origin !== origine || x.pathname.startsWith("/_next/") || x.pathname.startsWith("/api/")) continue;
      const rep = await c.match(req);
      if (!rep) throw new Error("lecture impossible");
      /* Pages HTML et réponses de navigation interne (RSC) : toutes deux citent du code. */
      const type = rep.headers.get("content-type") || "";
      if (type.includes("text/html") || type.includes("text/x-component")) aSuivre.push(...citations(await rep.text()));
    }
  }
  const garde = new Set();
  while (aSuivre.length) {
    const url = aSuivre.shift();
    if (garde.has(url)) continue;
    garde.add(url);
    if (!url.endsWith(".js") && !url.endsWith(".css")) continue;
    const rep = await caches.match(url);
    if (rep) aSuivre.push(...await dependances(url, rep));
  }
  if (ecrituresCache !== ecrituresAuDepart) return { fait: false, raison: "écritures pendant le calcul" };
  let supprimes = 0;
  for (const [nom, req] of candidats) {
    if (ecrituresCache !== ecrituresAuDepart) break; // une écriture arrive : on s'arrête là
    const cle = origine + new URL(req.url).pathname;
    if (garde.has(cle) || garde.has(req.url)) continue;
    if (await (await caches.open(nom)).delete(req)) supprimes++;
  }
  await ecrireMeta(META_NETTOYAGE, { quand: maintenant, supprimes, gardes: garde.size });
  return { fait: true, supprimes, gardes: garde.size };
}

/**
 * Un ancien pré-cache ne disparaît qu'après avoir confié ses fichiers au
 * cache principal : une page ouverte qui comptait sur l'un d'eux le
 * retrouve. Une recopie ratée : on le garde, pour la prochaine fois.
 */
async function migrerPreCache(nom) {
  try {
    const ancien = await caches.open(nom);
    const principal = await caches.open(CACHE_NAME);
    for (const req of await ancien.keys()) {
      if (await principal.match(req)) continue;
      const rep = await ancien.match(req);
      if (!rep) throw new Error("lecture impossible");
      await principal.put(req, rep);
    }
    await caches.delete(nom);
    return true;
  } catch {
    return false;
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE).then((cache) =>
        Promise.all(
          STATIC_ASSETS.map((url) =>
            cache.add(url).catch(() => { /* non bloquant */ })
          )
        )
      ),
      // Pré-cache la page d'accueil (app shell) → ouverture hors-ligne à froid
      // affiche le tableau de bord au lieu de la page "Pas de connexion".
      caches.open(CACHE_NAME).then((cache) =>
        cache.add("/").catch(() => { /* non bloquant (hors-ligne à l'install) */ })
      ),
      // Pré-cache TOUTE l'app (JS/CSS du build) → ouverture hors-ligne fiable,
      // même juste après un déploiement. Liste injectée au build.
      caches.open(PRECACHE_CACHE).then((cache) =>
        Promise.all(
          PRECACHE_MANIFEST.map((url) =>
            cache.add(url).catch(() => { /* un asset manquant ne bloque pas l'install */ })
          )
        )
      ),
    ])
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(async (keys) => {
      const actuels = new Set([STATIC_CACHE, API_CACHE, CACHE_NAME, PRECACHE_CACHE, META_CACHE]);
      for (const key of keys) {
        if (actuels.has(key)) continue;
        /* Un ancien pré-cache confie d'abord ses fichiers au cache principal. */
        if (key.startsWith("tm-precache-")) { await migrerPreCache(key); continue; }
        /* Une préparation interrompue (fermeture de l'app) : à jeter. */
        if (key.startsWith(PREP_PREFIXE)) { await caches.delete(key); continue; }
        /* Les caches d'une ANCIENNE valeur de VERSION. */
        await caches.delete(key);
      }

      /* On ne recharge plus les pages ouvertes : une fiche en cours de saisie
         repartait de zéro sous les doigts du monteur. Chaque page décide
         elle-même du bon moment (voir MajAuto) ; on la prévient seulement. */
      const fenetres = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const fenetre of fenetres) {
        try { fenetre.postMessage({ type: "SW_ACTIVE", version: VERSION }); } catch { /* onglet fermé */ }
      }
    }),
  );
  self.clients.claim();
});

const OFFLINE_HTML =
  '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TM Rapport - Hors ligne</title><style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f1f5f9;color:#1e293b}.box{text-align:center;padding:2rem;max-width:400px}h1{font-size:1.5rem;margin-bottom:0.5rem}p{color:#64748b;font-size:0.9rem;margin:0.5rem 0}svg{display:block;margin:0 auto 1.5rem;opacity:0.3}.btns{display:flex;flex-direction:column;gap:0.75rem;margin-top:1.5rem}button{padding:0.75rem 2rem;border:none;border-radius:0.75rem;font-weight:600;cursor:pointer;font-size:0.95rem}.primary{background:#1e3a5f;color:white}.secondary{background:#e2e8f0;color:#475569}</style></head><body><div class="box"><svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#1e3a5f" stroke-width="1.5"><path d="M1 6s4-2 11-2 11 2 11 2"/><path d="M5 10s3-1.5 7-1.5 7 1.5 7 1.5"/><line x1="2" y1="2" x2="22" y2="22"/><circle cx="12" cy="16" r="1"/></svg><h1>Pas de connexion</h1><p>Vos donnees en cache restent accessibles.</p><p>Les modifications seront synchronisees au retour du reseau.</p><div class="btns"><button class="primary" onclick="history.length>1?history.back():location.href=\'/\'">Retour</button><button class="secondary" onclick="location.href=\'/\'">Tableau de bord</button><button class="secondary" onclick="location.reload()">Reessayer</button></div></div></body></html>';

/**
 * Network-first avec timeout configurable.
 * - Si le réseau répond avant `timeoutMs` : met en cache + retourne la réponse.
 * - Si le timeout expire : sert le cache si disponible, sinon attend le réseau.
 * - Si le réseau échoue : lance une exception (le caller gère le fallback).
 */
async function networkFirstWithTimeout(request, cache, timeoutMs) {
  let networkResolved = false;

  const networkPromise = fetch(request).then(
    (response) => {
      networkResolved = true;
      if (response && response.ok) {
        ecrituresCache++;
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    },
    (err) => {
      networkResolved = true;
      throw err;
    },
  );

  const timeoutPromise = new Promise((resolve) =>
    setTimeout(() => resolve("timeout"), timeoutMs)
  );

  const winner = await Promise.race([networkPromise, timeoutPromise]);
  if (winner !== "timeout") return winner; // réseau plus rapide que le timeout

  // Timeout atteint : sert le cache pour débloquer l'UI immédiatement.
  const cached = await cache.match(request);
  if (cached) {
    // Le fetch réseau continue en arrière-plan pour rafraîchir le cache.
    return cached;
  }
  // Pas de cache : on attend quand même le réseau (seule option).
  return networkPromise;
}

/**
 * Network-first STRICT (sans service de cache anticipé).
 * Pour les données qui changent souvent et doivent toujours être fraîches
 * quand on est en ligne (défauts, pièces signalées). On attend le réseau ;
 * on ne sert le cache QUE si le réseau échoue (hors-ligne).
 * Évite le bug "le SW sert une version périmée → photos/défauts disparus".
 */
async function networkFirstFresh(request, cache) {
  /* On attend le réseau — mais pas indéfiniment. Passé le plafond, on sert la
     copie en cache s'il y en a une (le réseau continue derrière et la
     rafraîchira) ; sans copie, on continue d'attendre, c'est la seule option. */
  const networkPromise = fetch(request).then((response) => {
    if (response && response.ok) { ecrituresCache++; cache.put(request, response.clone()).catch(() => {}); }
    return response;
  });
  const timeout = new Promise((resolve) => setTimeout(() => resolve("timeout"), FRESH_TIMEOUT_MS));
  const gagnant = await Promise.race([networkPromise, timeout]);
  if (gagnant !== "timeout") return gagnant;
  const cached = await cache.match(request);
  if (cached) {
    networkPromise.catch(() => {}); // évite un rejet non capté
    return cached;
  }
  return networkPromise;
}

/** Juste après une écriture, une lecture API attend le réseau (plafonné à
 *  FRESH_TIMEOUT_MS) plutôt que de rendre la copie au bout de 400 ms : on ne
 *  relit pas l'état d'avant. Sans réseau, la copie reste servie. */
const FRAICHEUR_APRES_ECRITURE_MS = 60_000;
let lectureFraicheJusqua = 0;

/** fetch borné dans le temps : au-delà, on renonce (pas d'attente infinie). */
function fetchBorne(request, msMax) {
  return new Promise((resolve, reject) => {
    const minuteur = setTimeout(() => reject(new Error("timeout")), msMax);
    fetch(request).then(
      (r) => { clearTimeout(minuteur); resolve(r); },
      (e) => { clearTimeout(minuteur); reject(e); },
    );
  });
}

/** Endpoints API dont les données changent et doivent rester fraîches en ligne. */
function isAlwaysFreshApi(pathname) {
  return (
    pathname.startsWith("/api/defauts") ||
    pathname.startsWith("/api/pieces") ||
    pathname.startsWith("/api/preferences") ||
    // Signature de version des données : doit toujours refléter l'état réel
    // (sinon le client croirait "inchangé" à tort et sauterait un refetch).
    pathname.startsWith("/api/projects/version")
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;

  // === Proxy de fichiers (/api/file-proxy) ===
  // Renvoie une REDIRECTION 302 vers le CDN Notion/S3.
  //  • EN LIGNE : on NE touche à rien → le navigateur suit la redirection
  //    nativement et charge le PDF directement depuis S3 (quasi instantané).
  //    (Si le SW interceptait et renvoyait une réponse redirigée à une
  //    navigation, le navigateur casserait avec "redirect mode is not follow".)
  //  • HORS LIGNE : on sert les octets pré-cachés (pages client qui pré-cachent
  //    leurs documents), en reconstruisant une réponse propre (sans flag
  //    "redirected") pour rester compatible avec une navigation.
  if (url.pathname.startsWith("/api/file-proxy")) {
    if (!self.navigator.onLine) {
      event.respondWith(
        caches.match(request).then(async (cached) => {
          if (!cached) return fetch(request);
          const buf = await cached.arrayBuffer();
          return new Response(buf, {
            status: 200,
            headers: {
              "Content-Type": cached.headers.get("content-type") || "application/octet-stream",
              "Content-Disposition": cached.headers.get("content-disposition") || "inline",
            },
          });
        }),
      );
    }
    return;
  }

  // === PDF généré : JAMAIS de cache SW ===
  // La génération prend plusieurs secondes (> timeout réseau du SW). En
  // network-first-avec-timeout, le SW servait donc toujours l'ANCIEN PDF caché
  // → une modification (ex. défaut masqué) n'apparaissait qu'à la génération
  // suivante. On laisse le navigateur récupérer le PDF directement (réseau).
  if (url.pathname.startsWith("/api/pdf/")) return;

  // Idem pour la Fiche de travail (PDF + galerie docs) : jamais servie depuis le
  // cache SW, sinon le 1er téléchargement après un déploiement rendait l'ANCIENNE
  // version (le cache ne se rafraîchissait qu'à la requête suivante). Réseau direct.
  if (url.pathname.startsWith("/api/fiche/")) return;

  // Idem pour le Rapport SAV (PDF) : jamais depuis le cache SW.
  if (url.pathname.startsWith("/api/sav/")) return;

  // Et pour TOUS les autres PDF générés. Ils passaient par la branche API :
  // au-delà de 400 ms, le SW servait la copie gardée — un rapport de suivi,
  // d'arrivage ou de signalements, le planning ou le déstockage pouvait
  // s'afficher dans une version ANCIENNE (constaté en production le
  // 20.10.2026 : ces PDF « répondaient » tous en ~410 ms, depuis la copie).
  if (/^\/api\/(synthese|arrivage|rapport-signalements|planning-pdf|destockage\/pdf|rapport-journalier|rapport-mensuel|rapport-fournisseurs|rapport-stats)(\/|$)/.test(url.pathname)) return;

  // === Signature du build : JAMAIS de cache SW ===
  // C'est elle qui dit au client si son code est périmé. Servie depuis le cache,
  // elle mentirait, et le client se rechargerait en boucle ou pas du tout.
  if (url.pathname === "/api/build") return;

  // === API : network-first avec timeout 400 ms ===
  if (url.pathname.startsWith("/api/")) {
    // ?fresh (refresh manuel) ET ?rv (revalidation rapide) : réseau direct, sans
    // servir le cache SW périmé. Différence côté SERVEUR : `fresh` force la
    // requête Notion complète (~10 s), `rv` sert le cache serveur / repli
    // snapshot (rapide). Dans les deux cas le SW ne doit pas court-circuiter avec
    // sa propre copie périmée.
    if (url.searchParams.has("fresh") || url.searchParams.has("rv")) {
      event.respondWith(
        fetchBorne(request, RV_TIMEOUT_MS).catch(async () => {
          /* Réseau trop lent pour une revalidation : plutôt que de répondre
             « rien » — ce que le client interprète comme une liste vide — on
             rend la dernière copie connue si on en a une. */
          const cached = await caches.match(new Request(
            request.url.replace(/([?&])(rv|fresh)=[^&]*/g, "$1").replace(/[?&]$/, ""),
          ));
          if (cached) return cached;
          return new Response(JSON.stringify([]), {
            headers: { "Content-Type": "application/json", "X-SW-Offline": "1" },
            status: 200,
          });
        })
      );
      return;
    }
    event.respondWith(
      caches.open(API_CACHE).then(async (cache) => {
        try {
          return isAlwaysFreshApi(url.pathname) || Date.now() < lectureFraicheJusqua
            ? await networkFirstFresh(request, cache)
            : await networkFirstWithTimeout(request, cache, API_TIMEOUT_MS);
        } catch {
          // Échec réseau total : cache, sinon JSON vide (UI reste fonctionnelle).
          const cached = await cache.match(request);
          if (cached) return cached;
          // Fallback hors-ligne : retourne [] avec header pour que le client
          // sache qu'il ne doit PAS écraser son cache localStorage avec ces données vides.
          return new Response(JSON.stringify([]), {
            headers: { "Content-Type": "application/json", "X-SW-Offline": "1" },
            status: 200,
          });
        }
      }),
    );
    return;
  }

  // === Assets statiques : cache-first ===
  if (
    url.pathname.startsWith("/_next/static") ||
    url.pathname.startsWith("/icons") ||
    url.pathname.startsWith("/logos") ||
    url.pathname === "/manifest.json" ||
    url.pathname === "/favicon.ico"
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request)
          .then((response) => {
            if (response && response.ok) {
              const cloned = response.clone();
              ecrituresCache++;
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, cloned));
            }
            return response;
          })
          .catch(() => new Response("", { status: 404 }));
      })
    );
    return;
  }

  // === Pages & chunks Next.js : network-first avec timeout 6 s ===
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      try {
        return await networkFirstWithTimeout(request, cache, HTML_TIMEOUT_MS);
      } catch {
        // Réseau totalement indisponible : cherche en cache.
        const cached = await cache.match(request);
        if (cached) return cached;

        // Navigation HTML : on sert d'abord l'app shell pré-cachée (page
        // d'accueil) pour que l'app démarre et bascule sur ses données en
        // cache. En dernier recours seulement, la page "Pas de connexion".
        if (
          request.mode === "navigate" ||
          (request.headers.get("accept") || "").includes("text/html")
        ) {
          const shell = (await cache.match("/")) || (await caches.match("/"));
          if (shell) return shell;
          return new Response(OFFLINE_HTML, {
            headers: { "Content-Type": "text/html; charset=utf-8" },
            status: 200,
          });
        }

        // Chunk JS/CSS introuvable après déploiement : recherche approximative.
        if (url.pathname.startsWith("/_next/")) {
          const allCaches = await caches.keys();
          for (const cacheName of allCaches) {
            const c = await caches.open(cacheName);
            const keys = await c.keys();
            for (const key of keys) {
              if (new URL(key.url).pathname === url.pathname) {
                return c.match(key);
              }
            }
          }
        }

        return new Response("", { status: 404 });
      }
    })
  );
});

// === Push notifications ===
self.addEventListener("push", function (event) {
  const data = event.data ? event.data.json() : {};
  const options = {
    body: data.message || "",
    icon: data.icon || "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: data.url || "/" },
    requireInteraction: !!data.urgent,
    tag: data.url || "tm-notif",
    renotify: true,
  };
  event.waitUntil(
    self.registration.showNotification(data.title || "TM Rapport", options)
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (windowClients) {
      for (var i = 0; i < windowClients.length; i++) {
        var client = windowClients[i];
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client) client.navigate(url);
          return;
        }
      }
      return clients.openWindow(url);
    })
  );
});

// === Message handler ===
self.addEventListener("message", (event) => {
  // Ancien message (pages d'avant la refonte des mises à jour) : il VIDAIT la
  // coquille et les fichiers du build avant de recharger. On répond comme
  // avant, mais sans rien effacer : la page se recharge par le réseau, et
  // une coupure à ce moment ne la laisse plus sans coquille.
  if (event.data?.type === "PURGE_APP_SHELL") {
    event.source?.postMessage({ type: "APP_SHELL_PURGED" });
  }

  // Télécharger une nouvelle version, tout ou rien (voir preparerVersion).
  if (event.data?.type === "PREPARER_VERSION" && typeof event.data.deploiement === "string") {
    const id = event.data.deploiement.slice(0, 80);
    const champ = event.data.champ === "sha" ? "sha" : "deploiement";
    const source = event.source;
    let essai;
    if (!preparationEnCours) {
      preparationIdEnCours = id;
      preparationEnCours = enSerie(() => preparerVersion(id, champ)).finally(() => { preparationEnCours = null; preparationIdEnCours = null; });
      essai = preparationEnCours;
    } else if (preparationIdEnCours === id) {
      essai = preparationEnCours;
    } else {
      /* Une autre version est en cours de préparation : celle-ci réessaiera. */
      essai = Promise.resolve(false);
    }
    const travail = essai.then(async (ok) => {
      try { source?.postMessage({ type: ok ? "VERSION_PRETE" : "VERSION_NON_PREPAREE", deploiement: id }); } catch { /* onglet fermé */ }
      if (ok) await enSerie(() => nettoyerSiPossible()).catch(() => {});
    });
    event.waitUntil(travail);
  }

  // Une page signale la version qu'elle exécute (rétention des fichiers),
  // puis, au plus une fois par jour, le nettoyage passe.
  if (event.data?.type === "VERSION_EN_USAGE" && typeof event.data.deploiement === "string") {
    event.waitUntil(
      noterUsage(event.data.deploiement.slice(0, 80), Array.isArray(event.data.racines) ? event.data.racines : [])
        .then(() => enSerie(() => nettoyerSiPossible()))
        .catch(() => { /* lecture impossible : rien n'est écrit ni supprimé */ }),
    );
  }

  // Après une écriture (photo, saisie, synchro) : les lectures qui suivent
  // attendent le réseau au lieu de servir la copie — mais la copie RESTE.
  // L'ancien comportement effaçait tout le cache API : une seule photo prise
  // sans réseau rendait TOUS les chantiers préparés introuvables à la
  // réouverture (« Projet introuvable », constaté en production sur TEST 5 le
  // 19.10.2026).
  if (event.data?.type === "INVALIDATE_API_CACHE") {
    lectureFraicheJusqua = Date.now() + FRAICHEUR_APRES_ECRITURE_MS;
  }

  // Vidage DÉLIBÉRÉ, depuis le bouton « vider le cache » (qui refuse d'agir
  // tant qu'il reste du travail à envoyer) : là, on efface vraiment.
  if (event.data?.type === "VIDER_API_CACHE") {
    event.waitUntil(
      caches.delete(API_CACHE).then(() => caches.open(API_CACHE))
    );
  }

  // Pré-cache explicite d'une liste d'URLs pour consultation hors-ligne.
  // Appelé depuis le client quand la page est visitée en ligne :
  //   navigator.serviceWorker.controller.postMessage({ type: "PRECACHE_URLS", urls: [...] })
  if (event.data?.type === "PRECACHE_URLS") {
    const urls = event.data.urls || [];
    event.waitUntil(
      Promise.all(
        urls.map(async (url) => {
          try {
            const isApi = url.includes("/api/");
            const cacheName = isApi ? API_CACHE : CACHE_NAME;
            const cache = await caches.open(cacheName);
            // Vérifie si déjà en cache récent (moins de 2 min) — évite un fetch inutile.
            const existing = await cache.match(url);
            if (existing) {
              const dateHeader = existing.headers.get("date");
              if (dateHeader && Date.now() - new Date(dateHeader).getTime() < 120_000) return;
            }
            const response = await fetch(url, { credentials: "include" });
            if (response && response.ok) {
              // /api/file-proxy redirige (302) vers S3 ; `fetch` suit la
              // redirection → réponse `redirected`, que `cache.put` peut
              // refuser. On reconstruit une réponse propre (octets bruts) pour
              // pouvoir la resservir hors ligne. Les autres URLs sont mises en
              // cache telles quelles (headers préservés).
              if (url.includes("/api/file-proxy")) {
                const buf = await response.arrayBuffer();
                ecrituresCache++;
                await cache.put(url, new Response(buf, {
                  status: 200,
                  headers: {
                    "Content-Type": response.headers.get("content-type") || "application/octet-stream",
                    "Content-Disposition": "inline",
                  },
                }));
              } else {
                ecrituresCache++;
                await cache.put(url, response);
              }
            }
          } catch {
            // Silencieux : pas de réseau ou URL invalide
          }
        })
      )
        .then(() => completerLesFragments(urls))
        .then(() => {
          // Notifie le client que le pré-cache est terminé
          event.source?.postMessage({ type: "PRECACHE_DONE" });
        })
    );
  }
});
