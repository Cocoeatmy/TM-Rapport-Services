// Cache rapide PARTAGÉ entre toutes les instances serverless (Upstash Redis /
// Vercel KV, via l'API REST HTTP — pas de connexion persistante, idéal serverless).
//
// Pourquoi : l'app n'avait aucun cache partagé rapide (son "KV" est adossé à
// Notion, lent). Résultat : une instance serverless FROIDE devait interroger
// Notion en direct (~10 s) → chiffres périmés à l'écran le temps de la requête.
// Redis sert désormais de cache partagé : lecture ~50-100 ms, tenu à jour par le
// trafic + le cron. Le travail Notion (~10 s) se fait en arrière-plan.
//
// GRACIEUX : si aucune variable d'env n'est configurée, tout est no-op et l'app
// se comporte exactement comme avant (aucun risque à déployer avant activation).
//
// Variables reconnues (l'intégration Vercel KV OU Upstash direct les fournit) :
//   KV_REST_API_URL / KV_REST_API_TOKEN       (intégration Vercel Marketplace)
//   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN  (Upstash direct)

import { gzipSync, gunzipSync } from "node:zlib";

const REST_URL =
  process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const REST_TOKEN =
  process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";

export const redisEnabled = !!(REST_URL && REST_TOKEN);

async function command(args: (string | number)[]): Promise<unknown> {
  if (!redisEnabled) return null;
  const res = await fetch(REST_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REST_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`redis ${res.status}`);
  const json = (await res.json()) as { result?: unknown; error?: string };
  if (json.error) throw new Error(json.error);
  return json.result ?? null;
}

// Compression : les grosses listes (all-active ~2-3 Mo) dépasseraient la limite
// de taille Redis. On gzip+base64 au-delà d'un seuil, avec un préfixe "gz:" pour
// détecter à la lecture. Réduit aussi la bande passante (gain ~5-10×).
const GZIP_THRESHOLD = 100_000; // ~100 Ko de JSON

/** Lit une valeur JSON (décompresse si nécessaire). Retourne null si absente/erreur. */
export async function redisGetJSON<T>(key: string): Promise<T | null> {
  if (!redisEnabled) return null;
  try {
    const v = await command(["GET", key]);
    if (v == null || typeof v !== "string") return null;
    const json = v.startsWith("gz:")
      ? gunzipSync(Buffer.from(v.slice(3), "base64")).toString("utf8")
      : v;
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

// ── HASH persistant (données durables : téléphones…) ─────────────────────────
// Un HASH stocke des paires champ→valeur. HSET écrit UN champ de façon ATOMIQUE
// (pas de lecture-modification-écriture → aucune collision) et SANS expiration
// (pas de TTL) → parfait pour des données qui ne doivent jamais disparaître.
// Ces fonctions PROPAGENT les erreurs (contrairement aux caches ci-dessus) pour
// que l'appelant sache si l'écriture a échoué.

/** Écrit un champ d'un hash (atomique, persistant). Throw si échec. */
export async function redisHSet(key: string, field: string, value: string): Promise<void> {
  if (!redisEnabled) throw new Error("Redis non configuré");
  await command(["HSET", key, field, value]);
}

/** Lit tout un hash → objet {champ: valeur}. Throw si échec. */
export async function redisHGetAll(key: string): Promise<Record<string, string>> {
  if (!redisEnabled) throw new Error("Redis non configuré");
  const r = await command(["HGETALL", key]);
  const out: Record<string, string> = {};
  if (Array.isArray(r)) {
    // Format REST Upstash : [champ1, val1, champ2, val2, …]
    for (let i = 0; i + 1 < r.length; i += 2) out[String(r[i])] = String(r[i + 1]);
  } else if (r && typeof r === "object") {
    for (const [k, v] of Object.entries(r as Record<string, unknown>)) out[k] = String(v);
  }
  return out;
}

/** Supprime un champ d'un hash. Throw si échec. */
export async function redisHDel(key: string, field: string): Promise<void> {
  if (!redisEnabled) throw new Error("Redis non configuré");
  await command(["HDEL", key, field]);
}

/** Écrit une valeur JSON avec TTL (défaut 1 h), compressée si volumineuse. */
export async function redisSetJSON(key: string, data: unknown, ttlSec = 3600): Promise<void> {
  if (!redisEnabled) return;
  try {
    const json = JSON.stringify(data);
    let payload = json;
    if (json.length > GZIP_THRESHOLD) {
      try { payload = "gz:" + gzipSync(Buffer.from(json, "utf8")).toString("base64"); } catch { /* garde le JSON brut */ }
    }
    await command(["SET", key, payload, "EX", ttlSec]);
  } catch {
    // Silencieux : valeur trop grande malgré compression, réseau, etc. → repli
    // sur le comportement sans Redis (requête directe).
  }
}
