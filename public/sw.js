// Service worker TM Rapport — v17
// Stratégies :
//   - Statique (_next/static, icons, logos, manifest) : cache-first (permanent).
//   - API GET : network-first avec timeout 400 ms → si réseau lent/absent, sert le cache.
//   - Pages HTML : network-first avec timeout 6 s → si timeout ou échec, sert le cache,
//     sinon page offline.
//   v11 : pré-cache explicite des pages /client/ et /projet/ + leurs données API
//         via message PRECACHE_URLS — permet consultation hors-ligne garantie.

const VERSION = "v31";
const CACHE_NAME  = `tm-rapport-${VERSION}`;
const STATIC_CACHE = `tm-static-${VERSION}`;
const API_CACHE   = `tm-api-${VERSION}`;

// Injectés au build par scripts/gen-sw-precache.mjs (postbuild). Ne pas éditer
// les valeurs à la main : elles sont remplacées à chaque déploiement.
const PRECACHE_VERSION = "dev"; // VERSION_INJECT
const PRECACHE_MANIFEST = []; // MANIFEST_INJECT
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
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== API_CACHE && key !== CACHE_NAME && key !== PRECACHE_CACHE)
          .map((key) => caches.delete(key))
      )
    )
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
  const response = await fetch(request); // throw si hors-ligne → géré par le caller
  if (response && response.ok) {
    cache.put(request, response.clone()).catch(() => {});
  }
  return response;
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

  // === API : network-first avec timeout 400 ms ===
  if (url.pathname.startsWith("/api/")) {
    // ?fresh (refresh manuel) ET ?rv (revalidation rapide) : réseau direct, sans
    // servir le cache SW périmé. Différence côté SERVEUR : `fresh` force la
    // requête Notion complète (~10 s), `rv` sert le cache serveur / repli
    // snapshot (rapide). Dans les deux cas le SW ne doit pas court-circuiter avec
    // sa propre copie périmée.
    if (url.searchParams.has("fresh") || url.searchParams.has("rv")) {
      event.respondWith(
        fetch(request).catch(() =>
          new Response(JSON.stringify([]), {
            headers: { "Content-Type": "application/json", "X-SW-Offline": "1" },
            status: 200,
          })
        )
      );
      return;
    }
    event.respondWith(
      caches.open(API_CACHE).then(async (cache) => {
        try {
          return isAlwaysFreshApi(url.pathname)
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
  // Purge du cache API sur demande (ex: sync manuelle)
  if (event.data?.type === "INVALIDATE_API_CACHE") {
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
      ).then(() => {
        // Notifie le client que le pré-cache est terminé
        event.source?.postMessage({ type: "PRECACHE_DONE" });
      })
    );
  }
});
