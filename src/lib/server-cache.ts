// Cache mémoire côté serveur avec TTL de 60 secondes
const cache = new Map<string, { data: any; expires: number }>();
const TTL = 60 * 1000; // 60 secondes

export function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setCache(key: string, data: any) {
  cache.set(key, { data, expires: Date.now() + TTL });
}

export function invalidateCache(key?: string) {
  if (key) {
    cache.delete(key);
  } else {
    cache.clear();
  }
}
