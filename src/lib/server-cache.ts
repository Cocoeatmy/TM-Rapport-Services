// Cache mémoire côté serveur avec TTL + stale-while-revalidate.
//
// Stratégie :
// - Données fraîches (< freshMs) : renvoyées immédiatement.
// - Données périmées mais encore en mémoire (entre freshMs et TTL) : renvoyées
//   immédiatement ET un re-fetch est déclenché en arrière-plan.
// - Expirées (> TTL) : purgées, retour null (force un fetch bloquant).
//
// Résultat pratique : un utilisateur ne paie presque jamais la latence Notion,
// tout en garantissant des données à jour dans les ~secondes qui suivent.

const cache = new Map<string, { data: unknown; expires: number; staleAt: number }>();
const TTL = 5 * 60 * 1000;          // 5 min — durée totale avant purge
const FRESH_MS = 30 * 1000;         // 30 s — fenêtre où la donnée est considérée fraîche
const inflightRevalidate = new Map<string, Promise<unknown>>();

export function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setCache(key: string, data: unknown) {
  const now = Date.now();
  cache.set(key, { data, expires: now + TTL, staleAt: now + FRESH_MS });
}

/**
 * Retourne une entrée du cache avec son état de fraîcheur.
 * Si la donnée existe mais est périmée, `stale` vaut true : l'appelant doit
 * lancer un revalidate en arrière-plan via {@link revalidateInBackground}.
 */
export function getCachedWithStale<T>(
  key: string,
): { data: T; stale: boolean } | null {
  const entry = cache.get(key);
  if (!entry) return null;
  const now = Date.now();
  if (now > entry.expires) {
    cache.delete(key);
    return null;
  }
  return { data: entry.data as T, stale: now > entry.staleAt };
}

/**
 * Lance un re-fetch si aucun n'est déjà en cours pour cette clé.
 * Les erreurs sont silencieuses — la prochaine requête retentera.
 */
export function revalidateInBackground<T>(
  key: string,
  fetcher: () => Promise<T>,
): void {
  if (inflightRevalidate.has(key)) return;
  const p = (async () => {
    try {
      const data = await fetcher();
      setCache(key, data);
    } catch (err) {
      // Silencieux : on garde la donnée périmée jusqu'à la prochaine tentative.
      console.error(`[server-cache] revalidate failed for ${key}:`, (err as Error).message);
    } finally {
      inflightRevalidate.delete(key);
    }
  })();
  inflightRevalidate.set(key, p);
}

/**
 * Helper qui implémente le pattern SWR complet : si la donnée cachée est
 * utilisable (fraîche ou périmée mais non expirée), elle est retournée et un
 * revalidate est potentiellement lancé. Sinon, un fetch bloquant est fait.
 */
export async function cachedOrFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
): Promise<T> {
  const entry = getCachedWithStale<T>(key);
  if (entry) {
    if (entry.stale) revalidateInBackground(key, fetcher);
    return entry.data;
  }
  const data = await fetcher();
  setCache(key, data);
  return data;
}

export function invalidateCache(key?: string) {
  if (key) {
    cache.delete(key);
  } else {
    cache.clear();
  }
}
