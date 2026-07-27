// Cache mémoire côté serveur avec TTL + stale-while-revalidate.
//
// Stratégie :
// - Données fraîches (< freshMs) : renvoyées immédiatement.
// - Données périmées mais encore en mémoire (entre freshMs et TTL) : renvoyées
//   immédiatement ET un re-fetch est déclenché en arrière-plan.
// - Expirées (> TTL) : purgées, retour null (force un fetch bloquant).
//
// Protection thundering-herd :
// - Quand le cache est vide et plusieurs requêtes arrivent simultanément,
//   un seul appel Notion est lancé ; les autres attendent sa résolution.
//
// Fallback stale :
// - En cas d'erreur Notion (ex. rate-limit 429), on retourne les dernières
//   données connues plutôt que de propager une 500 côté client.

import { getData } from "./kv-store";

const cache = new Map<string, { data: unknown; expires: number; staleAt: number }>();
const TTL = 5 * 60 * 1000;          // 5 min — durée totale avant purge
const FRESH_MS = 5 * 1000;          // 5 s — fenêtre où la donnée est considérée fraîche

// Clés dont un "snapshot" partagé (KV Notion) est maintenu à jour par le cron
// (sync/warm-all). Sur une instance serverless FROIDE (cache mémoire vide), on
// sert ce snapshot (~1-2 s) au lieu d'attaquer Notion en direct (~10 s), puis on
// revalide en arrière-plan. C'est le seul cache "partagé entre instances" dont on
// dispose (l'app n'a pas de store rapide type Redis).
const SNAPSHOT_KEYS = new Set([
  "projects", "projects-mesures", "projects-services", "projects-sav",
  "projects-all-active", "projects-cmd-termine", "projects-all-raw",
]);

// Cache de secours : conserve les données jusqu'à 30 min même après expiration
// du cache principal. Utilisé uniquement quand Notion est indisponible / rate-limité.
const fallbackCache = new Map<string, { data: unknown; storedAt: number }>();
const FALLBACK_TTL = 30 * 60 * 1000; // 30 min

// Déduplication des fetches bloquants : si deux requêtes arrivent simultanément
// et que le cache est vide, une seule requête Notion est lancée.
const inflightFetch = new Map<string, Promise<unknown>>();

// Déduplication des rafraîchissements FORCÉS (manuel "Rafraîchir").
const inflightForce = new Map<string, Promise<unknown>>();

// Déduplication des revalidations en arrière-plan.
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
  // Les clés "project-<id>" ont une fraîcheur de 30 s.
  // Le polling client est à 15 s → les deux premiers polls servent le cache,
  // le Notion fetch n'est déclenché qu'une fois toutes les 30 s par instance.
  // Évite le rate-limit Notion (3 req/s) quand plusieurs collaborateurs ont
  // des projets ouverts simultanément.
  // Les clés de listes ("projects", "projects-mesures", …) gardent 5 s.
  const freshMs = key.startsWith("project-") ? 30_000 : FRESH_MS;
  cache.set(key, { data, expires: now + TTL, staleAt: now + freshMs });
  // Met à jour également le fallback (durée de vie plus longue).
  fallbackCache.set(key, { data, storedAt: now });
}

/**
 * Variante longue durée pour le cron nocturne.
 * TTL = 2h (données valides pour toute la matinée).
 * Utilisé par warm-all pour que les données survivent au-delà des 5 min habituelles.
 */
const LONG_TTL = 2 * 60 * 60 * 1000;       // 2 heures
const LONG_FRESH_MS = 10 * 60 * 1000;      // 10 min de fraîcheur

export function setCacheLong(key: string, data: unknown) {
  const now = Date.now();
  cache.set(key, { data, expires: now + LONG_TTL, staleAt: now + LONG_FRESH_MS });
  fallbackCache.set(key, { data, storedAt: now });
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
 * Retourne les dernières données connues pour une clé, même expirées,
 * tant qu'elles ont moins de FALLBACK_TTL (30 min). Utilisé comme
 * dernier recours quand Notion renvoie une erreur.
 */
function getFallback<T>(key: string): T | null {
  const entry = fallbackCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.storedAt > FALLBACK_TTL) {
    fallbackCache.delete(key);
    return null;
  }
  return entry.data as T;
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
 * Helper qui implémente le pattern SWR complet avec protection thundering-herd
 * et fallback stale en cas d'erreur Notion.
 *
 * - Cache frais    → retourné immédiatement.
 * - Cache périmé   → retourné + revalidation en arrière-plan.
 * - Cache vide     → un seul fetch bloquant (les autres attendent via in-flight).
 * - Erreur fetch   → données de fallback (≤ 30 min) si disponibles, sinon re-throw.
 */
export async function cachedOrFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  force = false,
): Promise<T> {
  // `force` (rafraîchissement manuel) : on ignore le cache et on attend
  // les données FRAÎCHES de Notion, puis on met le cache à jour.
  if (force) {
    const existingForce = inflightForce.get(key);
    if (existingForce) return existingForce as Promise<T>;
    const fp = (async () => {
      try {
        const data = await fetcher();
        setCache(key, data);
        return data;
      } catch (err: any) {
        const fallback = getFallback<T>(key);
        if (fallback !== null) return fallback;
        throw err;
      } finally {
        inflightForce.delete(key);
      }
    })();
    inflightForce.set(key, fp);
    return fp;
  }

  const entry = getCachedWithStale<T>(key);
  if (entry) {
    if (entry.stale) revalidateInBackground(key, fetcher);
    return entry.data;
  }

  // Thundering-herd protection : si un fetch est déjà en vol, on attend le même.
  const existing = inflightFetch.get(key);
  if (existing) return existing as Promise<T>;

  const p = (async () => {
    try {
      // Instance FROIDE : avant d'attaquer Notion (~10 s), on tente le snapshot
      // partagé (KV, ~1-2 s) tenu à jour par le cron. On le sert immédiatement
      // et on revalide en arrière-plan → l'utilisateur ne subit jamais l'attente
      // Notion complète sur un chargement normal.
      // Pas pendant le build Next (prerender) : la lecture snapshot ferait
      // déborder le timeout de 60 s des routes lourdes.
      if (SNAPSHOT_KEYS.has(key) && process.env.NEXT_PHASE !== "phase-production-build") {
        try {
          const snap = await getData(`snapshot-${key}`);
          if (Array.isArray(snap) && snap.length > 0) {
            setCache(key, snap as unknown as T);
            revalidateInBackground(key, fetcher);
            return snap as unknown as T;
          }
        } catch { /* snapshot indisponible → on continue vers Notion */ }
      }
      const data = await fetcher();
      setCache(key, data);
      return data;
    } catch (err: any) {
      // Fallback : retourner les dernières données connues pour éviter une 500.
      const fallback = getFallback<T>(key);
      if (fallback !== null) {
        console.warn(
          `[server-cache] Notion error (${err?.status ?? err?.message}), ` +
          `serving stale fallback for "${key}"`,
        );
        return fallback;
      }
      throw err;
    } finally {
      inflightFetch.delete(key);
    }
  })();

  inflightFetch.set(key, p);
  return p;
}

/**
 * Variante longue durée de cachedOrFetch.
 * Utilisée pour les données peu volatiles (stats Notion) :
 * TTL 2h, fraîcheur 10 min, thundering-herd + fallback stale inclus.
 */
export async function cachedOrFetchLong<T>(
  key: string,
  fetcher: () => Promise<T>,
): Promise<T> {
  const entry = getCachedWithStale<T>(key);
  if (entry) {
    if (entry.stale) revalidateInBackground(key, fetcher);
    return entry.data;
  }

  const existing = inflightFetch.get(key);
  if (existing) return existing as Promise<T>;

  const p = (async () => {
    try {
      const data = await fetcher();
      setCacheLong(key, data);   // TTL 2h au lieu de 5 min
      return data;
    } catch (err: any) {
      const fallback = getFallback<T>(key);
      if (fallback !== null) {
        console.warn(`[server-cache] Notion error, serving stale fallback for "${key}"`);
        return fallback;
      }
      throw err;
    } finally {
      inflightFetch.delete(key);
    }
  })();

  inflightFetch.set(key, p);
  return p;
}

export function invalidateCache(key?: string) {
  if (key) {
    cache.delete(key);
    fallbackCache.delete(key);
  } else {
    cache.clear();
    fallbackCache.clear();
  }
}
