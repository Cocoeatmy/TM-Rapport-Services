// Gestionnaire de cache offline et file d'attente.
//
// Stratégie globale :
//   - LECTURE : le service worker fait du network-first avec fallback
//     cache (cf. /public/sw.js). Donc tout GET déjà visité est lisible
//     hors ligne.
//   - ÉCRITURE : on enveloppe les mutations dans `offlineFetch` qui :
//       a) tente le fetch direct si on est en ligne
//       b) sinon (ou si le fetch échoue avec une erreur réseau), met
//          l'opération en file d'attente et renvoie une réponse
//          synthétique `{ queued: true }` pour ne pas casser les
//          appelants.
//   - SYNC : SyncButton écoute l'événement `online` et appelle
//     `processQueue()` automatiquement quand la connexion revient.
//     Un poll de 30 s sert de filet de sécurité.

const CACHE_KEY = "tm-rapport-cache";
const QUEUE_KEY = "tm-rapport-queue";
const MAX_RETRIES = 8;
const WARM_TS_KEY = "tm-cache-warm-ts";

// Endpoints à préchauffer pour que le collaborateur ait des données hors-ligne.
// Ce sont TOUTES les URLs utilisées par MODE_API dans page.tsx + monteur-dashboard.
const WARM_ENDPOINTS = [
  "/api/projects",
  "/api/projects/all-active",
  "/api/projects/all",
  "/api/projects/mesures",
  "/api/projects/mesures-termine",
  "/api/projects/mesures-sans-commande",
  "/api/projects/mesures-annulees",
  "/api/projects/cmd-termine",
  "/api/projects/services",
  "/api/projects/services-termine",
  "/api/projects/sav",
  "/api/projects/sav-termine",
  "/api/projects/snapshot",
];

// Préchauffage minimum entre deux warms automatiques (15 min)
const WARM_COOLDOWN_MS = 15 * 60 * 1000;

/**
 * Télécharge les endpoints clés en arrière-plan (priority low) pour que
 * le service worker les mette en cache. Silencieux, non bloquant.
 * Cooldown de 15 min pour ne pas spam Notion à chaque refresh de page.
 */
export async function warmOfflineCache(force = false): Promise<number> {
  if (typeof window === "undefined" || !isOnline()) return 0;
  const lastWarm = parseInt(localStorage.getItem(WARM_TS_KEY) || "0");
  if (!force && Date.now() - lastWarm < WARM_COOLDOWN_MS) return 0;

  let warmed = 0;

  // Double stratégie :
  //   1. Le SW intercepte chaque fetch et met la réponse en cache SW (Cache Storage).
  //   2. On parse aussi la réponse et on la sauvegarde en localStorage via saveToCache()
  //      pour avoir un fallback si le cache SW est purgé par l'OS (fréquent sur iOS).
  await Promise.allSettled(
    WARM_ENDPOINTS.map(async (url) => {
      try {
        const r = await fetch(url, { credentials: "include" });
        if (!r.ok) return;
        warmed++;
        // Sauvegarder en localStorage pour double couverture offline.
        const data = await r.clone().json().catch(() => null);
        if (data && Array.isArray(data) && data.length > 0) {
          // Clé calquée sur tm-projects-cache utilisé par page.tsx
          const cacheKey = url.replace(/^\/api\/projects\/?/, "") || "projects";
          saveToCache(`warm-${cacheKey}`, data);
        } else if (data && data.ok && data.data) {
          // Format snapshot ({ ok, data: {...} })
          saveToCache("warm-snapshot", data.data);
        }
      } catch {}
    })
  );

  localStorage.setItem(WARM_TS_KEY, String(Date.now()));
  window.dispatchEvent(new CustomEvent("tm-cache-warmed", { detail: { warmed } }));
  return warmed;
}

/** Retourne le timestamp du dernier préchauffage réussi (ms epoch, 0 si jamais fait). */
export function getLastCacheWarmTs(): number {
  if (typeof window === "undefined") return 0;
  return parseInt(localStorage.getItem(WARM_TS_KEY) || "0");
}

export interface CachedData {
  projects: any[];
  mesures: any[];
  timestamp: number;
}

export interface QueueItem {
  id: string;
  type: "update" | "upload" | "pdf";
  url: string;
  method: string;
  body?: any;
  files?: { name: string; data: string }[];
  timestamp: number;
  /** Nombre d'essais ratés. Sert au backoff. */
  retryCount?: number;
  /** Date du prochain retry à respecter (ms epoch). */
  nextAttemptAt?: number;
}

// Sauvegarder les données en cache
export function saveToCache(key: string, data: any) {
  try {
    const cache = getCache();
    cache[key] = data;
    cache._timestamp = Date.now();
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (e) {
    console.error("Cache save error:", e);
  }
}

export function getCache(): Record<string, any> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function getCacheTimestamp(): number {
  return getCache()._timestamp || 0;
}

// File d'attente pour les opérations offline
export function addToQueue(item: Omit<QueueItem, "id" | "timestamp">) {
  try {
    const queue = getQueue();
    queue.push({
      ...item,
      id: Math.random().toString(36).slice(2),
      timestamp: Date.now(),
    });
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch (e) {
    // localStorage plein ou indisponible — on log et on abandonne silencieusement
    // plutôt que de laisser propager l'exception jusqu'aux appelants (handleSaveCabineData, etc.)
    console.error("[offline] addToQueue failed:", e);
  }
}

export function getQueue(): QueueItem[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    // Garde contre les valeurs corrompues (null, objet, etc.)
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function removeFromQueue(id: string) {
  const queue = getQueue().filter((q) => q.id !== id);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function clearQueue() {
  localStorage.setItem(QUEUE_KEY, "[]");
}

/** Met à jour un item dans la queue (ex. après un retry raté). */
function updateQueueItem(updated: QueueItem) {
  const queue = getQueue().map((q) => (q.id === updated.id ? updated : q));
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

// Traiter la file d'attente quand le réseau revient.
// Backoff exponentiel : 1, 2, 4, 8, 16, 32 min. Au-delà de
// MAX_RETRIES essais, on log et on retire (sinon une opération
// fondamentalement cassée bloquerait toute la queue indéfiniment).
/** Âge maximum d'un item en file : au-delà, il est abandonné (garde-fou anti
 *  « synchro coincée à vie » — une mutation vieille de +24 h est de toute façon
 *  périmée, la donnée a changé depuis). */
const MAX_QUEUE_AGE_MS = 24 * 60 * 60 * 1000;

export async function processQueue(): Promise<{ success: number; failed: number; skipped: number }> {
  const queue = getQueue();
  let success = 0;
  let failed = 0;
  let skipped = 0;
  const now = Date.now();

  for (const item of queue) {
    // Garde-fou d'ÂGE : un item trop vieux (poison / projet supprimé) est
    // abandonné, quel que soit son compteur de retries.
    if (item.timestamp && now - item.timestamp > MAX_QUEUE_AGE_MS) {
      console.warn("[offline] Item abandonné (trop ancien)", item.url, item.method);
      removeFromQueue(item.id);
      failed++;
      continue;
    }
    if (item.nextAttemptAt && item.nextAttemptAt > now) {
      skipped++;
      continue;
    }
    try {
      const options: RequestInit = {
        method: item.method,
        headers: item.body !== undefined ? { "Content-Type": "application/json" } : undefined,
        body: item.body !== undefined ? JSON.stringify(item.body) : undefined,
      };

      const res = await fetch(item.url, options);
      if (res.ok) {
        removeFromQueue(item.id);
        success++;
      } else {
        // Erreur 4xx (sauf 408/429) = irrécupérable, on retire.
        if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
          console.warn("[offline] Item retiré (erreur permanente)", item.url, res.status);
          removeFromQueue(item.id);
        } else {
          const retries = (item.retryCount || 0) + 1;
          if (retries >= MAX_RETRIES) {
            console.error("[offline] Item retiré après MAX_RETRIES", item.url);
            removeFromQueue(item.id);
          } else {
            const delayMs = Math.min(60_000 * 2 ** (retries - 1), 30 * 60_000);
            updateQueueItem({ ...item, retryCount: retries, nextAttemptAt: now + delayMs });
          }
        }
        failed++;
      }
    } catch {
      // Erreur réseau : on garde l'item, on incrémente le retry
      // pour appliquer un backoff au prochain processQueue.
      const retries = (item.retryCount || 0) + 1;
      if (retries >= MAX_RETRIES) {
        console.error("[offline] Item retiré après MAX_RETRIES (réseau)", item.url);
        removeFromQueue(item.id);
      } else {
        const delayMs = Math.min(60_000 * 2 ** (retries - 1), 30 * 60_000);
        updateQueueItem({ ...item, retryCount: retries, nextAttemptAt: now + delayMs });
      }
      failed++;
    }
  }

  return { success, failed, skipped };
}

// Vérifier si on est online
export function isOnline(): boolean {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}

/**
 * Drop-in pour `fetch()` qui rend les mutations résilientes au réseau.
 *
 * Comportement :
 *   - GET / HEAD : appel direct (le service worker gère le fallback cache).
 *   - POST/PATCH/PUT/DELETE :
 *       * Si on est offline : push immédiat dans la queue, retour d'une
 *         réponse synthétique 200 `{ queued: true }`.
 *       * Si on est online : on tente le fetch ; en cas d'erreur réseau
 *         (TypeError) ou de 5xx, push dans la queue + même réponse synthétique.
 *   - Le body doit être JSON-string (objet sérialisé). Les FormData /
 *     uploads binaires ne sont PAS supportés par cette voie (ils
 *     resteraient en localStorage et exploseraient la taille).
 *
 * Les appelants peuvent traiter `{ queued: true }` comme un succès :
 * la mutation sera rejouée automatiquement dès que le réseau revient.
 */
export async function offlineFetch(url: string, init?: RequestInit): Promise<Response> {
  const method = (init?.method || "GET").toUpperCase();
  const isMutation = method !== "GET" && method !== "HEAD";

  if (!isMutation) {
    return fetch(url, init);
  }

  // FormData / Blob : pas dans la queue (taille). On laisse remonter
  // l'erreur, l'appelant est censé gérer son propre retry pour les uploads.
  const body = init?.body;
  const isJsonBody = body === undefined || typeof body === "string";
  if (!isJsonBody) {
    return fetch(url, init);
  }

  const queueIt = (reason: "offline" | "network-error") => {
    let parsed: any = undefined;
    if (typeof body === "string") {
      try { parsed = JSON.parse(body); } catch { parsed = body; }
    }
    addToQueue({
      type: "update",
      url,
      method,
      body: parsed,
    });
    if (typeof window !== "undefined") {
      // Notifie le bouton sync qu'un nouvel item est en queue (poll
      // de 30 s sinon, mais c'est mieux de mettre à jour le badge tout de suite).
      window.dispatchEvent(new CustomEvent("tm-offline-queued", { detail: { reason, url } }));
    }
    return new Response(JSON.stringify({ queued: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  if (!isOnline()) {
    return queueIt("offline");
  }

  try {
    const res = await fetch(url, init);
    // 5xx ou 429 (rate-limit Notion) : on met en queue pour retry.
    // Autres 4xx : erreur permanente, on retourne tel quel.
    if (res.status >= 500 || res.status === 429) {
      return queueIt("network-error");
    }
    return res;
  } catch {
    // Erreur réseau (offline détecté pendant le fetch, DNS, etc.)
    return queueIt("network-error");
  }
}
