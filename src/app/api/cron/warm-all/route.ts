/**
 * /api/cron/warm-all
 * ─────────────────
 * Cron nocturne (3h00 + 6h00) : charge TOUS les projets en parallèle,
 * les stocke dans le cache serveur longue durée (2h) ET dans le KV Notion
 * (persistant) sous forme de snapshot daté.
 *
 * Pourquoi KV ?
 * Le cache serveur est en mémoire par instance Vercel → il s'efface quand
 * l'instance s'endort. Le KV Notion survit aux redémarrages : au réveil,
 * le client charge le snapshot via /api/projects/snapshot en 1-2 s au
 * lieu d'attendre 30+ s depuis Notion.
 *
 * Schedule vercel.json :
 *   "0 3 * * *"   →  03h00 UTC
 *   "0 6 * * *"   →  06h00 UTC  (juste avant l'arrivée des employés)
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getProjects,
  getProjectsMesures,
  getProjectsMesuresSansCommande,
  getProjectsMesuresAnnulees,
  getProjectsServices,
  getProjectsSAV,
  getAllActiveProjects,
  getProjectsCmdTermine,
  getAllProjectsRaw,
  flushRelationCacheToKV,
} from "@/lib/notion";
import { setCacheLong } from "@/lib/server-cache";
import { setData } from "@/lib/kv-store";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min — Vercel Pro

const SNAPSHOT_KEY = "projects-full-snapshot";

export async function GET(request: NextRequest) {
  // Auth : header Bearer ou ?secret=
  const authHeader = request.headers.get("authorization");
  const urlSecret = new URL(request.url).searchParams.get("secret");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}` &&
    urlSecret !== process.env.CRON_SECRET
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const t0 = Date.now();
  const results: Record<string, { count: number; ms: number }> = {};

  const tasks: { name: string; cacheKey: string; fn: () => Promise<any[]> }[] = [
    { name: "cmd",                   cacheKey: "projects",                      fn: getProjects },
    { name: "mesures",               cacheKey: "projects-mesures",              fn: getProjectsMesures },
    { name: "mesures-sans-commande", cacheKey: "projects-mesures-sans-commande",fn: getProjectsMesuresSansCommande },
    { name: "mesures-annulees",      cacheKey: "projects-mesures-annulees",     fn: getProjectsMesuresAnnulees },
    { name: "services",              cacheKey: "projects-services",             fn: getProjectsServices },
    { name: "sav",                   cacheKey: "projects-sav",                  fn: getProjectsSAV },
    { name: "all-active",            cacheKey: "projects-all-active",           fn: getAllActiveProjects },
    { name: "cmd-termine",           cacheKey: "projects-cmd-termine",          fn: getProjectsCmdTermine },
    { name: "all-raw",               cacheKey: "projects-all-raw",              fn: getAllProjectsRaw },
  ];

  // Snapshot : accumuler tous les datasets pour les persister dans KV
  const snapshot: Record<string, any[]> = {};

  // Fetch en parallèle (par lots de 3 pour éviter le rate-limit Notion)
  const BATCH = 3;
  for (let i = 0; i < tasks.length; i += BATCH) {
    const batch = tasks.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (task) => {
        const t = Date.now();
        try {
          const data = await task.fn();
          setCacheLong(task.cacheKey, data);   // Cache serveur 2h
          snapshot[task.cacheKey] = data;
          results[task.name] = { count: data.length, ms: Date.now() - t };
        } catch (err: any) {
          results[task.name] = { count: -1, ms: Date.now() - t };
          console.error(`[warm-all] Error fetching ${task.name}:`, err.message);
        }
      })
    );
  }

  // Flush le cache des noms de relations dans KV
  try {
    await flushRelationCacheToKV();
  } catch (err: any) {
    console.warn("[warm-all] flushRelationCacheToKV failed:", err.message);
  }

  // Persister le snapshot complet dans KV Notion
  // Chaque dataset est stocké séparément pour éviter les blocs trop grands.
  const snapshotMeta: Record<string, { count: number; key: string }> = {};
  const kvWrites = Object.entries(snapshot).map(async ([cacheKey, data]) => {
    const kvKey = `snapshot-${cacheKey}`;
    try {
      await setData(kvKey, data);
      snapshotMeta[cacheKey] = { count: data.length, key: kvKey };
    } catch (err: any) {
      console.error(`[warm-all] KV write failed for ${kvKey}:`, err.message);
    }
  });
  await Promise.all(kvWrites);

  // Méta-entrée avec l'horodatage — le client vérifie ça en premier
  const timestamp = new Date().toISOString();
  await setData(SNAPSHOT_KEY, [{
    timestamp,
    keys: snapshotMeta,
    duration: Date.now() - t0,
  }]);

  const totalMs = Date.now() - t0;
  console.log(`[warm-all] Done in ${totalMs}ms`, results);

  return NextResponse.json({
    ok: true,
    timestamp,
    duration: `${totalMs}ms`,
    results,
    snapshot: snapshotMeta,
  });
}
