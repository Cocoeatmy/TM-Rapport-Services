import { NextRequest, NextResponse } from "next/server";
import { getProjects, getProjectsMesures, getProjectsServices, getProjectsSAV, getAllActiveProjects } from "@/lib/notion";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  // Verify cron secret if configured
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  const results: Record<string, { count: number; ms: number }> = {};

  try {
    // Pre-fetch all data sources to warm up the server cache
    const tasks = [
      { name: "cmd", fn: getProjects },
      { name: "mesures", fn: getProjectsMesures },
      { name: "services", fn: getProjectsServices },
      { name: "sav", fn: getProjectsSAV },
      { name: "all-active", fn: getAllActiveProjects },
    ];

    // Run all fetches in parallel
    await Promise.all(
      tasks.map(async (task) => {
        const t0 = Date.now();
        try {
          const data = await task.fn();
          results[task.name] = { count: data.length, ms: Date.now() - t0 };
        } catch (err: any) {
          results[task.name] = { count: -1, ms: Date.now() - t0 };
          console.error(`Sync error for ${task.name}:`, err.message);
        }
      })
    );

    const totalMs = Date.now() - startTime;
    console.log(`[CRON SYNC] Completed in ${totalMs}ms`, results);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      duration: `${totalMs}ms`,
      results,
    });
  } catch (error: any) {
    console.error("[CRON SYNC] Failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
