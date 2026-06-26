import { NextResponse } from "next/server";
import { cachedOrFetchLong } from "@/lib/server-cache";
import { getStats } from "@/lib/stats-data";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    const rows = await cachedOrFetchLong("stats-series", () => getStats("series"));
    return NextResponse.json(rows);
  } catch (error: any) {
    console.error("Error fetching stats series:", error);
    return NextResponse.json({ error: error.message || "Erreur" }, { status: 500 });
  }
}
