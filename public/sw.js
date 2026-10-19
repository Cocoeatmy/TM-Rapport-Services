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
const RE_FRAGMENT = /["'](?:\/_next\/)?(static\/(?:immutable\/)?(?:chunks|media|css)\/[A-Za-z0-9_.~\-\/]+\.(?:js|css|woff2))["']/g;
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
        await cache.put(url, r.clone());
        rep = r;
      }
      if (!url.endsWith(".js")) continue;
      citer(await rep.text());
    } catch { /* hors ligne ou fichier absent : on continue avec les autres */ }
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
      const perimes = keys.filter(
        (key) => key !== STATIC_CACHE && key !== API_CACHE && key !== CACHE_NAME && key !== PRECACHE_CACHE,
      );
      await Promise.all(perimes.map((key) => caches.delete(key)));

      // MISE À JOUR (et non première installation) : les pages ouvertes
      // exécutent encore l'ANCIEN bundle, chargé depuis les caches qu'on vient
      // d'effacer. Elles ne le savent pas et peuvent le garder des jours — c'est
      // ce qui faisait afficher à l'iPhone d'autres chiffres qu'au Mac. On les
      // renavigue une fois, pour qu'elles repartent sur le code à jour.
      if (perimes.length === 0) return;
      const fenetres = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const fenetre of fenetres) {
        if ("navigate" in fenetre) {
          try { await fenetre.navigate(fenetre.url); } catch { /* onglet occupé : il repartira au prochain lancement */ }
        }
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
    if (response && response.ok) cache.put(request, response.clone()).catch(() => {});
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
  // Purge de la coquille HTML et des fichiers du build, sur demande du client
  // (voir `MajAuto`) : l'app tourne sur un ancien bundle et va se recharger.
  // Le cache des données (API_CACHE) est conservé — il reste consultable hors
  // ligne, et il n'est pas en cause.
  if (event.data?.type === "PURGE_APP_SHELL") {
    event.waitUntil(
      Promise.all([
        caches.delete(CACHE_NAME),
        caches.delete(STATIC_CACHE),
        caches.delete(PRECACHE_CACHE),
      ]).then(() => {
        event.source?.postMessage({ type: "APP_SHELL_PURGED" });
      }),
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
                await cache.put(url, new Response(buf, {
                  status: 200,
                  headers: {
                    "Content-Type": response.headers.get("content-type") || "application/octet-stream",
                    "Content-Disposition": "inline",
                  },
                }));
              } else {
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
