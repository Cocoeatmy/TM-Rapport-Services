import { NextResponse } from "next/server";
import { exigerDroit } from "@/lib/droits-serveur";
import { cachedOrFetchLong } from "@/lib/server-cache";
import { getStats } from "@/lib/stats-data";
import { aLeDroit } from "@/lib/droits-serveur";

export const dynamic = "force-dynamic";
// Lit le snapshot KV pré-calculé (cron nocturne) → rapide. Fallback live possible
// (pagination Notion ~12s) → marge au-dessus du défaut Vercel ~15s.
export const maxDuration = 60;

export async function GET(request: Request) {
  const v = await exigerDroit("stats.voir");
  if ("refus" in v) return v.refus;
  try {
    // ?fresh=1 → relit Notion en direct (contourne le snapshot nocturne), pour
    // que la journée en cours soit comptée. Sans le paramètre : inchangé.
    const fresh = new URL(request.url).searchParams.has("fresh");
    const rows = await cachedOrFetchLong("stats-services", () => getStats("services"), fresh);
    /* Le chiffre d'affaires : au propriétaire seul (22.10.2026). */
    if (await aLeDroit("argent.voir")) return NextResponse.json(rows);
    return NextResponse.json((rows as Record<string, unknown>[]).map((r) => ({ ...r, ca: null })));
  } catch (error: any) {
    console.error("Error fetching stats services:", error);
    return NextResponse.json({ error: error.message || "Erreur" }, { status: 500 });
  }
}
