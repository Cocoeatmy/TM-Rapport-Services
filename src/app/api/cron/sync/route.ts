import { NextRequest, NextResponse } from "next/server";
import { getProjects, getProjectsMesures, getProjectsServices, getProjectsSAV, getAllActiveProjects } from "@/lib/notion";
import { setCache } from "@/lib/server-cache";
import { setData } from "@/lib/kv-store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  // Verify cron secret via header OR URL parameter
  const authHeader = request.headers.get("authorization");
  const urlSecret = new URL(request.url).searchParams.get("secret");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}` && urlSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  const results: Record<string, { count: number; ms: number }> = {};

  try {
    // Pré-fetch parallèle + injection directe dans le cache serveur (server-cache),
    // qui est la source de vérité des routes API depuis la bascule SWR.
    const tasks = [
      { name: "cmd", cacheKey: "projects", fn: getProjects },
      { name: "mesures", cacheKey: "projects-mesures", fn: getProjectsMesures },
      { name: "services", cacheKey: "projects-services", fn: getProjectsServices },
      { name: "sav", cacheKey: "projects-sav", fn: getProjectsSAV },
      { name: "all-active", cacheKey: "projects-all-active", fn: getAllActiveProjects },
    ];

    await Promise.all(
      tasks.map(async (task) => {
        const t0 = Date.now();
        try {
          const data = await task.fn();
          setCache(task.cacheKey, data);
          results[task.name] = { count: data.length, ms: Date.now() - t0 };
        } catch (err: any) {
          results[task.name] = { count: -1, ms: Date.now() - t0 };
          console.error(`Sync error for ${task.name}:`, err.message);
        }
      })
    );

    const totalMs = Date.now() - startTime;
    console.log(`[CRON SYNC] Completed in ${totalMs}ms`, results);

    // Save last sync timestamp for the sync button to read
    await setData("last-server-sync", [{ timestamp: new Date().toISOString(), duration: totalMs, results }] as any);

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
