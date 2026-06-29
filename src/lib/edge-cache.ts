import { NextResponse } from "next/server";

/**
 * Retourne une réponse d'erreur appropriée selon le type d'erreur Notion.
 * - 429 / rate_limited → 503 + Retry-After (au lieu d'une 500 générique)
 * - Autres             → 500
 */
export function errorResponse(error: unknown): NextResponse {
  const err = error as any;
  const isRateLimit = err?.status === 429 || err?.code === "rate_limited";
  if (isRateLimit) {
    console.warn("[api] Notion rate limit reached, returning 503");
    return NextResponse.json(
      { error: "Service temporairement surchargé. Veuillez réessayer dans quelques secondes." },
      {
        status: 503,
        headers: {
          "Retry-After": "10",
          "Cache-Control": "no-store",
        },
      },
    );
  }
  return NextResponse.json(
    { error: err?.message || "Erreur serveur" },
    { status: 500 },
  );
}

/**
 * Helper de réponse JSON avec en-têtes de cache CDN agressifs.
 *
 * Stratégie :
 *   - `public` : autorise le CDN Vercel à mettre en cache la réponse
 *     (par défaut les routes /api/* ne sont PAS cachées par le CDN).
 *   - `s-maxage=N` : durée pendant laquelle le CDN sert la réponse
 *     sans contacter notre serveur. Premier visiteur déclenche le
 *     compute, suivants servis en ~10 ms depuis le edge.
 *   - `stale-while-revalidate=M` : pendant M secondes après l'expiration
 *     de s-maxage, le CDN continue à servir la version stale tout en
 *     déclenchant un re-fetch en arrière-plan. → réponses jamais
 *     bloquantes pour l'utilisateur.
 *   - `max-age=0, must-revalidate` côté navigateur : on ne veut pas
 *     que le navigateur cache (le service worker fait ça mieux), juste
 *     le CDN partagé.
 *
 * Valeurs par défaut :
 *   - sMaxAge = 30 s   : réduit les ISR Writes Vercel tout en gardant
 *                        une fraîcheur acceptable pour les listes.
 *   - swr      = 120 s : fenêtre stale-while-revalidate généreuse pour
 *                        éviter les blocages sur réseau dégradé.
 */
export interface EdgeCacheOptions {
  /** Durée de cache CDN avant revalidation (secondes). Défaut 30. */
  sMaxAge?: number;
  /** Fenêtre stale-while-revalidate (secondes). Défaut 120. */
  swr?: number;
  /** Rafraîchissement forcé : aucune mise en cache CDN (toujours frais). */
  noStore?: boolean;
}

export function cachedJson<T>(data: T, options: EdgeCacheOptions = {}): NextResponse {
  if (options.noStore) {
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  }
  const sMaxAge = options.sMaxAge ?? 30;  // 30 s — limite les ISR Writes CDN
  const swr = options.swr ?? 120;         // 120 s stale-while-revalidate
  return NextResponse.json(data, {
    headers: {
      "Cache-Control": `public, max-age=0, must-revalidate, s-maxage=${sMaxAge}, stale-while-revalidate=${swr}`,
      // Vercel-specific : oblige le CDN à respecter même si Next.js
      // pousse un Cache-Control par défaut (rare mais s'est vu).
      "CDN-Cache-Control": `public, s-maxage=${sMaxAge}, stale-while-revalidate=${swr}`,
      "Vercel-CDN-Cache-Control": `public, s-maxage=${sMaxAge}, stale-while-revalidate=${swr}`,
    },
  });
}
