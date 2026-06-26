import { NextResponse } from "next/server";
import { cachedOrFetchLong } from "@/lib/server-cache";
import { getStats } from "@/lib/stats-data";

export const dynamic = "force-dynamic";
// Lit le snapshot KV pré-calculé (cron nocturne) → rapide. Fallback live possible
// (pagination Notion ~12s) → marge au-dessus du défaut Vercel ~15s.
export const maxDuration = 60;

export async function GET() {
  try {
    const rows = await cachedOrFetchLong("stats-services", () => getStats("services"));
    return NextResponse.json(rows);
  } catch (error: any) {
    console.error("Error fetching stats services:", error);
    return NextResponse.json({ error: error.message || "Erreur" }, { status: 500 });
  }
}
