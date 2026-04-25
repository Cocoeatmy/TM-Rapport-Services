import { NextResponse } from "next/server";

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
 * Valeurs par défaut conservatrices :
 *   - sMaxAge = 10 s   : aligne avec le polling client (15 s) et le
 *                        cache serveur SWR (30 s frais), donc une
 *                        modification mise en cache serveur sera visible
 *                        au CDN au pire 10 s après.
 *   - swr      = 60 s  : sur réseau dégradé, on évite que l'utilisateur
 *                        attende un re-compute si le edge a expiré.
 */
export interface EdgeCacheOptions {
  /** Durée de cache CDN avant revalidation (secondes). Défaut 10. */
  sMaxAge?: number;
  /** Fenêtre stale-while-revalidate (secondes). Défaut 60. */
  swr?: number;
}

export function cachedJson<T>(data: T, options: EdgeCacheOptions = {}): NextResponse {
  const sMaxAge = options.sMaxAge ?? 10;
  const swr = options.swr ?? 60;
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
