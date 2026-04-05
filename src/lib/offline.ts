// Gestionnaire de cache offline et file d'attente

const CACHE_KEY = "tm-rapport-cache";
const QUEUE_KEY = "tm-rapport-queue";

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
  const queue = getQueue();
  queue.push({
    ...item,
    id: Math.random().toString(36).slice(2),
    timestamp: Date.now(),
  });
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function getQueue(): QueueItem[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
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

// Traiter la file d'attente quand le réseau revient
export async function processQueue(): Promise<{ success: number; failed: number }> {
  const queue = getQueue();
  let success = 0;
  let failed = 0;

  for (const item of queue) {
    try {
      const options: RequestInit = {
        method: item.method,
        headers: item.body ? { "Content-Type": "application/json" } : undefined,
        body: item.body ? JSON.stringify(item.body) : undefined,
      };

      const res = await fetch(item.url, options);
      if (res.ok) {
        removeFromQueue(item.id);
        success++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  return { success, failed };
}

// Vérifier si on est online
export function isOnline(): boolean {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}
