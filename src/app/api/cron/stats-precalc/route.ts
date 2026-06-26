import { NextRequest, NextResponse } from "next/server";
import { setCacheLong } from "@/lib/server-cache";
import { computeAndStoreStats, type StatsKind } from "@/lib/stats-data";

export const dynamic = "force-dynamic";
// Calcul séquentiel des 4 bases stats (pause anti rate-limit) → marge large.
export const maxDuration = 300;

/**
 * Cron nocturne : pré-calcule les 4 jeux de données stats et les écrit dans le
 * KV (clés stats-*-snapshot) + réchauffe le cache mémoire long (2h). Les routes
 * /api/stats/* lisent ensuite le snapshot → affichage quasi instantané.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const urlSecret = new URL(request.url).searchParams.get("secret");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}` &&
    urlSecret !== process.env.CRON_SECRET
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const kinds: { kind: StatsKind; cacheKey: string }[] = [
    { kind: "services", cacheKey: "stats-services" },
    { kind: "clients", cacheKey: "stats-clients" },
    { kind: "marques", cacheKey: "stats-marques" },
    { kind: "series", cacheKey: "stats-series" },
  ];

  const results: Record<string, { count: number; ms: number } | { error: string; ms: number }> = {};

  for (const { kind, cacheKey } of kinds) {
    const t0 = Date.now();
    try {
      const rows = await computeAndStoreStats(kind);
      setCacheLong(cacheKey, rows); // réchauffe aussi le cache mémoire de l'instance
      results[kind] = { count: rows.length, ms: Date.now() - t0 };
    } catch (err: any) {
      results[kind] = { error: err?.message || "erreur", ms: Date.now() - t0 };
      console.error(`[stats-precalc] ${kind} a échoué:`, err?.message);
    }
    // Pause entre bases pour ménager le rate-limit Notion (~3 req/s max).
    await new Promise((r) => setTimeout(r, 500));
  }

  return NextResponse.json({ ok: true, results });
}
