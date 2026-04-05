// Cache mémoire côté serveur avec TTL de 5 minutes
const cache = new Map<string, { data: any; expires: number }>();
const TTL = 5 * 60 * 1000; // 5 minutes

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
