// Service worker TM Rapport — v9
// Stratégies :
//   - Statique (_next/static, icons, logos, manifest) : cache-first (permanent).
//   - API GET : network-first avec timeout 400 ms → on privilégie toujours la
//     donnée fraîche, mais si le réseau tarde (> 400 ms) ou échoue, on sert le
//     cache pour ne pas bloquer l'UI. Le cache API est mis à jour en
//     silence à chaque fois que le réseau répond.
//   - Pages HTML : network-first avec fallback cache + page offline.
//     IMPORTANT v6 : le fallback ne sert PLUS le HTML de "/" pour d'autres
//     routes. Servir "/" pour "/projet/123" confondait le routeur Next.js
//     (payload RSC disant "route: /") qui naviguait vers le dashboard.
//   v9 : pré-téléchargement des projets du jour via offline-prefetch.ts
//        (côté client) + OFFLINE_HTML enrichi avec navigation de retour.
//
// Les noms de cache sont versionnés : un bump de version purge tout l'ancien.

const VERSION = "v9";
const CACHE_NAME = `tm-rapport-${VERSION}`;
const STATIC_CACHE = `tm-static-${VERSION}`;
const API_CACHE = `tm-api-${VERSION}`;

const STATIC_ASSETS = [
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/logo-app.png",
];
// On ne pré-cache plus "/" : servir le HTML du dashboard comme fallback
// pour d'autres routes (/projet/[id], /admin/…) causait une confusion
// du routeur Next.js qui naviguait vers "/" au lieu de la page demandée.

// Au-delà de ce délai, on considère que le réseau est trop lent et on sert
// le cache (s'il existe) pour ne pas faire attendre l'utilisateur.
const NETWORK_TIMEOUT_MS = 400;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      // `addAll` échoue si une seule URL 404 ; on fait donc des `add` individuels
      // tolérants aux échecs pour ne pas bloquer l'install.
      Promise.all(
        STATIC_ASSETS.map((url) =>
          cache.add(url).catch(() => {
            /* non bloquant */
          })
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== API_CACHE && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

const OFFLINE_HTML =
  '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TM Rapport - Hors ligne</title><style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f1f5f9;color:#1e293b}.box{text-align:center;padding:2rem;max-width:400px}h1{font-size:1.5rem;margin-bottom:0.5rem}p{color:#64748b;font-size:0.9rem;margin:0.5rem 0}svg{display:block;margin:0 auto 1.5rem;opacity:0.3}.btns{display:flex;flex-direction:column;gap:0.75rem;margin-top:1.5rem}button{padding:0.75rem 2rem;border:none;border-radius:0.75rem;font-weight:600;cursor:pointer;font-size:0.95rem}.primary{background:#1e3a5f;color:white}.secondary{background:#e2e8f0;color:#475569}</style></head><body><div class="box"><svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#1e3a5f" stroke-width="1.5"><path d="M1 6s4-2 11-2 11 2 11 2"/><path d="M5 10s3-1.5 7-1.5 7 1.5 7 1.5"/><line x1="2" y1="2" x2="22" y2="22"/><circle cx="12" cy="16" r="1"/></svg><h1>Pas de connexion</h1><p>Vos donnees en cache restent accessibles.</p><p>Les modifications seront synchronisees au retour du reseau.</p><div class="btns"><button class="primary" onclick="history.length>1?history.back():location.href=\'/\'">Retour</button><button class="secondary" onclick="location.href=\'/\'">Tableau de bord</button><button class="secondary" onclick="location.reload()">Reessayer</button></div></div></body></html>';

/**
 * Course entre le fetch réseau et un timeout. Si le réseau gagne, on met en
 * cache + retourne la réponse. Si le timeout expire en premier, on tente de
 * servir depuis le cache ; sinon on attend quand même le réseau.
 */
async function networkFirstWithTimeout(request, cache) {
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
    setTimeout(() => resolve("timeout"), NETWORK_TIMEOUT_MS),
  );

  const winner = await Promise.race([networkPromise, timeoutPromise]);
  if (winner !== "timeout") return winner;

  // Timeout atteint : on tente le cache pour débloquer l'UI.
  const cached = await cache.match(request);
  if (cached) {
    // On laisse le fetch réseau continuer en arrière-plan pour mettre à jour
    // le cache pour la prochaine requête.
    return cached;
  }
  // Pas de cache : on attend quand même le réseau (pas d'autre option).
  return networkPromise;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;

  // === API : network-first avec timeout 2s (fallback cache) ===
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      caches.open(API_CACHE).then(async (cache) => {
        try {
          return await networkFirstWithTimeout(request, cache);
        } catch {
          // Échec réseau total : on sert le cache, sinon JSON vide pour ne
          // pas crasher l'UI (les listes deviennent juste vides).
          const cached = await cache.match(request);
          if (cached) return cached;
          return new Response(JSON.stringify([]), {
            headers: { "Content-Type": "application/json" },
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

  // === Pages & chunks Next.js : network-first avec fallback offline ===
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok) {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
        }
        return response;
      })
      .catch(async () => {
        // 1. Si cette URL exacte est en cache, on la sert.
        const cached = await caches.match(request);
        if (cached) return cached;

        // 2. Pour les navigations HTML, on affiche la page offline dédiée.
        //    On ne retombe PLUS sur le HTML "/" — cela confondait le routeur
        //    Next.js (payload RSC "route: /") et renvoyait l'utilisateur sur
        //    le dashboard au lieu de rester sur la page demandée.
        if (request.mode === "navigate" || (request.headers.get("accept") || "").includes("text/html")) {
          return new Response(OFFLINE_HTML, {
            headers: { "Content-Type": "text/html; charset=utf-8" },
            status: 200,
          });
        }

        // 3. Chunk JS/CSS introuvable : on tente une recherche approximative
        //    dans tous les caches (utile après un déploiement où le hash a changé).
        if (url.pathname.startsWith("/_next/")) {
          const allCaches = await caches.keys();
          for (const cacheName of allCaches) {
            const cache = await caches.open(cacheName);
            const keys = await cache.keys();
            for (const key of keys) {
              if (new URL(key.url).pathname === url.pathname) {
                return cache.match(key);
              }
            }
          }
        }

        return new Response("", { status: 404 });
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
    // Garde la notif visible jusqu'au clic si urgente (retard)
    requireInteraction: !!data.urgent,
    // Regroupe les notifs du même projet (évite le spam)
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
      // Si l'app est déjà ouverte dans un onglet, on navigue dedans
      for (var i = 0; i < windowClients.length; i++) {
        var client = windowClients[i];
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client) client.navigate(url);
          return;
        }
      }
      // Sinon on ouvre une nouvelle fenêtre sur la bonne page
      return clients.openWindow(url);
    })
  );
});

// === Message handler : permet à l'app de forcer une purge du cache API ===
self.addEventListener("message", (event) => {
  if (event.data?.type === "INVALIDATE_API_CACHE") {
    event.waitUntil(
      caches.delete(API_CACHE).then(() => caches.open(API_CACHE))
    );
  }
});
