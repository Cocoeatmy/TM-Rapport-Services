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

import { createHash } from "node:crypto";
import { redisEnabled, redisGetJSON, redisSetTexte, redisSetTexteJSON, redisMGet, redisDel } from "./redis-cache";

/* ── Empreintes : ne pas déplacer ce qui n'a pas changé ────────────────────
 *
 * Chaque revalidation d'une liste réécrivait le snapshot complet dans Redis
 * — « projets » pèse 1,8 Mo, « tous les projets » 6,6 Mo — toutes les vingt
 * secondes, par instance, MÊME quand Notion n'avait rien renvoyé de nouveau.
 * Et chaque instance froide le retéléchargeait entier pour découvrir qu'elle
 * avait déjà la même chose. C'est ce va-et-vient qui a mangé les 10 Go de
 * bande passante du mois, et il ralentissait l'app pour rien.
 *
 * On écrit donc à côté du snapshot une EMPREINTE (quelques octets). Avant de
 * téléverser : si l'empreinte est identique, on ne téléverse pas. Avant de
 * télécharger : on lit l'empreinte, et si elle correspond à la copie qu'on a
 * déjà, on la réutilise. Le gros transfert n'a plus lieu que lorsque les
 * données ont RÉELLEMENT changé.
 */
const bloc = (key: string) => `sc:${key}`;
const empreinteCle = (key: string) => `scm:${key}`;
const salisseurCle = (key: string) => `scd:${key}`;
const SALISSEUR_TTL = 10 * 60; // s — au-delà, la revalidation normale a eu lieu

/** Empreinte de la dernière valeur que CETTE instance a publiée. */
const empreintes = new Map<string, string>();
/** Clés que cette instance a marquées « à revalider » (pour lever le marqueur). */
const salies = new Set<string>();

function empreinte(json: string): string {
  return createHash("sha1").update(json).digest("base64").slice(0, 22);
}

/**
 * Écrit une liste dans le cache Redis partagé (fire-and-forget).
 *
 * Exporté sous le nom `publierSnapshot` : TOUTE écriture du snapshot doit
 * passer par ici, sinon l'empreinte publiée ne correspond plus au contenu et
 * les autres instances croient à tort avoir déjà la bonne copie.
 */
function persistShared(key: string, data: unknown): void {
  if (!redisEnabled || !REDIS_KEYS.has(key)) return;
  try {
    const json = JSON.stringify(data);
    const h = empreinte(json);
    const identique = empreintes.get(key) === h;
    if (!identique) {
      empreintes.set(key, h);
      redisSetTexteJSON(bloc(key), json).catch(() => {});
      redisSetTexte(empreinteCle(key), h).catch(() => {});
    }
    /* On vient de vérifier auprès de Notion : le snapshot publié est à jour,
       le marqueur « à revalider » n'a plus lieu d'être. Même quand rien n'a
       bougé — sinon le marqueur ferait revalider tout le monde pour rien. */
    if (!identique || salies.has(key)) {
      salies.delete(key);
      redisDel(salisseurCle(key)).catch(() => {});
    }
  } catch { /* sérialisation impossible : on laisse le snapshot précédent */ }
}

/**
 * Marque le snapshot partagé comme À REVALIDER, sans le supprimer.
 *
 * Il était effacé : l'instance froide suivante n'avait alors plus rien à
 * servir et repartait interroger Notion — dix à trente secondes d'attente
 * pour l'utilisateur, juste après qu'on ait enregistré quelque chose. Le
 * garder permet d'afficher tout de suite, pendant que la vérité est
 * rechargée en arrière-plan.
 */
function clearShared(key?: string): void {
  if (!redisEnabled) return;
  const cles = key ? (REDIS_KEYS.has(key) ? [key] : []) : [...REDIS_KEYS];
  for (const k of cles) {
    salies.add(k);
    redisSetTexte(salisseurCle(k), String(Date.now()), SALISSEUR_TTL).catch(() => {});
  }
}

/**
 * Instance FROIDE : sert la liste depuis le cache partagé (rapide) au lieu
 * d'attendre Notion (~10-35 s).
 *
 * ⚠️ La donnée ainsi servie peut dater : c'est une copie, pas la source. La
 * durée pendant laquelle on la considère comme fraîche décide donc du retard
 * maximum entre Notion et l'app.
 *
 * Elle était de DIX MINUTES pour toutes les clés. Un chantier annulé dans
 * Notion restait donc affiché jusqu'à dix minutes — et chaque serveur qui
 * démarrait repartait pour dix minutes avec la même copie. Les listes du
 * tableau de bord gardent désormais leur propre règle (vingt secondes) : la
 * copie partagée débloque l'affichage tout de suite, puis la première requête
 * suivante va rechercher la vérité auprès de Notion, en arrière-plan.
 *
 * Les listes lourdes et peu changeantes — tous les projets, les terminés, les
 * statistiques — gardent la règle longue : les rafraîchir sans cesse saturait
 * Notion (voir l'incident de rate-limit du 23 juin).
 */
async function serveFromRedis<T>(key: string): Promise<{ data: T; perime: boolean } | null> {
  if (!redisEnabled || !REDIS_KEYS.has(key)) return null;
  if (process.env.NEXT_PHASE === "phase-production-build") return null;
  try {
    // Un aller-retour de quelques octets : l'empreinte publiée, et le marqueur
    // « à revalider » posé par la dernière écriture.
    const [hDistante, salie] = await redisMGet(empreinteCle(key), salisseurCle(key));
    const perime = !!salie;

    /* La copie qu'on avait en mémoire (gardée 30 min par fallbackCache) est
       encore la bonne : on la reprend sans retélécharger un seul octet. */
    const locale = getFallback<T>(key);
    if (locale && hDistante && empreintes.get(key) === hDistante) {
      if (VOLATILE_KEYS.has(key)) setCache(key, locale);
      else setCacheLong(key, locale);
      return { data: locale, perime };
    }

    const r = await redisGetJSON<T>(bloc(key));
    if (Array.isArray(r) && (r as unknown[]).length > 0) {
      if (hDistante) empreintes.set(key, hDistante);
      if (VOLATILE_KEYS.has(key)) setCache(key, r);
      else setCacheLong(key, r);
      return { data: r, perime };
    }
  } catch { /* Redis indisponible → on continue vers Notion */ }
  return null;
}

const cache = new Map<string, { data: unknown; expires: number; staleAt: number }>();
const TTL = 5 * 60 * 1000;          // 5 min — durée totale avant purge
const FRESH_MS = 5 * 1000;          // 5 s — fenêtre où la donnée est considérée fraîche

// Clés dont un "snapshot" partagé (KV Notion) est maintenu à jour par le cron
// (sync/warm-all). Sur une instance serverless FROIDE (cache mémoire vide), on
// sert ce snapshot (~1-2 s) au lieu d'attaquer Notion en direct (~10 s), puis on
// revalide en arrière-plan. C'est le seul cache "partagé entre instances" dont on
// dispose (l'app n'a pas de store rapide type Redis).
// TOUTES les listes sont servies par Redis (cache partagé rapide). La compression
// gzip (voir redis-cache) permet d'y inclure les grosses listes (all-active,
// all-raw ~1350 projets → ~300-500 Ko compressés).
const SNAPSHOT_KEYS = new Set([
  "projects", "projects-mesures", "projects-services", "projects-sav",
  "projects-all-active", "projects-cmd-termine", "projects-mesures-sans-commande",
  "projects-all-raw",
]);

// Clés des statistiques (pré-calculées la nuit par le cron stats-precalc). Elles
// sont peu volatiles → parfaites pour Redis. Sans ça, un lambda FROID lisait le
// snapshot dans le KV Notion (lent) ou paginait Notion en direct (~12 s × 4).
const STATS_KEYS = new Set([
  "stats-services", "stats-clients", "stats-marques", "stats-series",
]);

// Toutes les clés servies/persistées via Redis (cache partagé rapide entre
// instances) : listes de projets + statistiques.
const REDIS_KEYS = new Set([...SNAPSHOT_KEYS, ...STATS_KEYS]);

// Listes VOLATILES affichées sur le DASHBOARD (panneaux "à fixer", compteurs,
// planning du jour). L'utilisateur attend une synchro Notion en ~10-30 s. On leur
// applique une fenêtre de fraîcheur COURTE (revalidation fréquente) tout en
// gardant le TTL long (Redis chaud + repli). Les autres listes (all-raw, termine…)
// restent en fraîcheur longue.
const VOLATILE_FRESH_MS = 20 * 1000;   // 20 s de fraîcheur → revalidation ~toutes les 20 s
// TTL COURT (au lieu de 2 h) : passé ce délai, une instance PURGE l'entrée et refait
// un fetch Notion FRAIS (bloquant, dédupliqué) au lieu de servir une copie périmée.
// Borne la divergence entre instances serverless (pas de Redis partagé actif) → on
// ne voit plus un montage déjà clôturé "revenir" depuis une instance en retard.
// Le repli hors-ligne reste couvert par fallbackCache (30 min), indépendant.
const VOLATILE_TTL = 45 * 1000;        // 45 s
const VOLATILE_KEYS = new Set([
  "projects", "projects-mesures", "projects-services", "projects-sav",
  "projects-all-active",
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
  // Politique de fraîcheur par type de clé :
  // - "project-<id>" : 30 s (polling client 15 s).
  // - Listes en cache Redis (SNAPSHOT_KEYS) : politique LONGUE (10 min frais /
  //   2 h TTL) → la revalidation Notion est throttlée à ~10 min (au lieu de 5 s),
  //   ce qui évite de saturer Notion (rate-limit) tout en gardant Redis chaud.
  // - Autres : 5 s.
  let freshMs = FRESH_MS;
  let ttl = TTL;
  if (key.startsWith("project-")) {
    freshMs = 30_000;
  } else if (VOLATILE_KEYS.has(key)) {
    // Listes du DASHBOARD (montage/mesures/services/sav/all-active) : fraîcheur
    // COURTE (20 s) → revalidation en arrière-plan dès qu'un client redemande après
    // 20 s, et TTL court (45 s) → une instance en retard purge et refait un fetch
    // FRAIS au lieu de servir du périmé (évite qu'un montage clôturé "revienne").
    // Repli hors-ligne couvert par fallbackCache (30 min). Revalidation dédupliquée
    // par clé → même à plusieurs, Notion n'est interrogé qu'une fois par fenêtre.
    freshMs = VOLATILE_FRESH_MS;
    ttl = VOLATILE_TTL;
  } else if (REDIS_KEYS.has(key)) {
    freshMs = LONG_FRESH_MS;
    ttl = LONG_TTL;
  }
  cache.set(key, { data, expires: now + ttl, staleAt: now + freshMs });
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
  // Persiste dans Redis (partagé entre instances) pour les clés éligibles :
  // le cron stats-precalc appelle setCacheLong → le snapshot devient lisible
  // instantanément par n'importe quel lambda froid.
  persistShared(key, data);
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
      persistShared(key, data);
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
        persistShared(key, data);
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
      // Instance FROIDE : on tente le cache Redis PARTAGÉ (rapide, ~50-100 ms,
      // compressé) avant d'attaquer Notion (~10-35 s). Servi immédiatement +
      // revalidation en arrière-plan. (Pas pendant le build Next.)
      const fromRedis = await serveFromRedis<T>(key);
      if (fromRedis) {
        // Snapshot marqué « à revalider » (quelqu'un vient d'enregistrer) : on
        // affiche tout de suite et on va chercher la vérité derrière.
        if (fromRedis.perime) revalidateInBackground(key, fetcher);
        return fromRedis.data;
      }

      const data = await fetcher();
      setCache(key, data);
      persistShared(key, data);
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
  force = false,
): Promise<T> {
  // `force` : rafraîchissement explicite demandé par l'utilisateur. Les stats
  // passent par un snapshot nocturne ; sans ça, la journée en cours n'apparaît
  // qu'au prochain cron. Paramètre OPTIONNEL : les appels existants (donc tous
  // les autres écrans) gardent exactement le comportement précédent.
  if (force) {
    const data = await fetcher();
    setCacheLong(key, data);
    return data;
  }
  const entry = getCachedWithStale<T>(key);
  if (entry) {
    if (entry.stale) revalidateInBackground(key, fetcher);
    return entry.data;
  }

  const existing = inflightFetch.get(key);
  if (existing) return existing as Promise<T>;

  const p = (async () => {
    try {
      // Instance FROIDE : on tente d'abord le cache Redis PARTAGÉ (~50-100 ms,
      // compressé) avant d'attaquer Notion/KV (lent). setCacheLong (déclenché
      // par le cron ou une lecture live précédente) y a écrit le snapshot.
      const fromRedis = await serveFromRedis<T>(key);
      if (fromRedis) {
        if (fromRedis.perime) revalidateInBackground(key, fetcher);
        return fromRedis.data;
      }

      const data = await fetcher();
      setCacheLong(key, data);   // TTL 2h + persistance Redis
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
  // Vide AUSSI le snapshot Redis partagé, sinon un lambda froid re-sert la
  // donnée périmée (et la recharge en mémoire) → invalidation sans effet réel.
  clearShared(key);
}

/** Publie une liste dans le cache partagé (empreinte comprise). */
export { persistShared as publierSnapshot };
