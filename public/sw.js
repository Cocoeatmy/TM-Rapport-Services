const CACHE_NAME = "tm-rapport-v3";
const STATIC_CACHE = "tm-static-v3";
const API_CACHE = "tm-api-v3";

const STATIC_ASSETS = [
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/logo-app.png",
];

// Install: pre-cache static assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
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

// Offline fallback
const OFFLINE_HTML = '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TM Rapport - Hors ligne</title><style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f1f5f9;color:#1e293b}.box{text-align:center;padding:2rem;max-width:400px}h1{font-size:1.5rem}p{color:#64748b;font-size:0.9rem}button{margin-top:1rem;padding:0.75rem 2rem;border:none;border-radius:0.75rem;background:#1e3a5f;color:white;font-weight:600;cursor:pointer}</style></head><body><div class="box"><h1>Hors ligne</h1><p>Pas de connexion. Les donnees seront synchronisees au retour du reseau.</p><button onclick="location.reload()">Reessayer</button></div></body></html>';

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET
  if (request.method !== "GET") return;

  // Skip external URLs
  if (url.origin !== self.location.origin) return;

  // API: network-first, cache fallback, empty JSON as last resort
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const cloned = response.clone();
            caches.open(API_CACHE).then((cache) => cache.put(request, cloned));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          return new Response(JSON.stringify([]), {
            headers: { "Content-Type": "application/json" },
            status: 200,
          });
        })
    );
    return;
  }

  // Static assets: cache-first
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

  // Pages & JS bundles: network-first, cache fallback, offline page
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
        const cached = await caches.match(request);
        if (cached) return cached;

        // Navigation: serve cached root or offline page
        if (request.mode === "navigate" || (request.headers.get("accept") || "").includes("text/html")) {
          const rootCached = await caches.match("/");
          if (rootCached) return rootCached;
          return new Response(OFFLINE_HTML, {
            headers: { "Content-Type": "text/html; charset=utf-8" },
            status: 200,
          });
        }

        // JS/CSS bundles: try to find any similar cached version
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

// Push notifications
self.addEventListener("push", function (event) {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || "TM Rapport", {
      body: data.message || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: data,
    })
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  event.waitUntil(clients.openWindow("/"));
});
