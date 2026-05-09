/**
 * /api/projects/snapshot
 * ──────────────────────
 * Retourne le snapshot KV pré-calculé par le cron nocturne.
 * Le client l'appelle au démarrage si le localStorage est vide ou trop vieux.
 *
 * Réponse : { timestamp, age_hours, data: { [modeKey]: Project[] } }
 * age_hours : ancienneté du snapshot en heures
 *
 * Si le snapshot est absent ou > 10h, retourne { stale: true } → le
 * client fait alors le fetch normal par endpoint.
 */

import { NextResponse } from "next/server";
import { getData } from "@/lib/kv-store";
import { setCacheLong } from "@/lib/server-cache";

export const dynamic = "force-dynamic";

const SNAPSHOT_KEY = "projects-full-snapshot";
const MAX_AGE_HOURS = 10; // Au-delà de 10h le snapshot est trop vieux

// Mapping cacheKey KV → clé utilisée dans projectsData côté client
const KEY_TO_MODE: Record<string, string[]> = {
  "projects":                       ["dashboard", "cmd"],
  "projects-mesures":               ["mesures"],
  "projects-mesures-sans-commande": ["mesures-sans-commande"],
  "projects-mesures-annulees":      ["mesures-annulees"],
  "projects-services":              ["services"],
  "projects-sav":                   ["sav"],
  "projects-all-active":            ["grossistes", "grossistes-bms", "grossistes-dubat",
                                     "grossistes-tema", "grossistes-matway", "grossistes-bringhen",
                                     "fournisseurs", "fournisseurs-duka", "fournisseurs-duscholux",
                                     "fournisseurs-ronal", "fournisseurs-nelo", "fournisseurs-novellini",
                                     "fournisseurs-samo", "stats", "sanitaires"],
  "projects-cmd-termine":           ["rapport", "archives", "cmd-termine"],
  "projects-all-raw":               ["projets-tous"],
};

export async function GET() {
  try {
    // 1. Lire la méta-entrée du snapshot
    const meta = await getData<{ timestamp: string; keys: Record<string, any>; duration: number }>(SNAPSHOT_KEY);
    if (!meta.length) {
      return NextResponse.json({ stale: true, reason: "no-snapshot" });
    }

    const { timestamp, keys } = meta[0];
    const ageMs = Date.now() - new Date(timestamp).getTime();
    const ageHours = ageMs / (1000 * 60 * 60);

    if (ageHours > MAX_AGE_HOURS) {
      return NextResponse.json({ stale: true, reason: "too-old", age_hours: ageHours.toFixed(1) });
    }

    // 2. Charger chaque dataset depuis KV en parallèle
    const cacheKeys = Object.keys(keys);
    const datasets: Record<string, any[]> = {};

    await Promise.all(
      cacheKeys.map(async (cacheKey) => {
        const kvKey = `snapshot-${cacheKey}`;
        try {
          const data = await getData<any>(kvKey);
          if (data.length > 0) {
            datasets[cacheKey] = data;
            // Réchauffe aussi le cache serveur pour les prochaines requêtes API
            setCacheLong(cacheKey, data);
          }
        } catch (err: any) {
          console.error(`[snapshot] KV read error for ${kvKey}:`, err.message);
        }
      })
    );

    // 3. Mapper vers les clés modes clients
    const clientData: Record<string, any[]> = {};
    for (const [cacheKey, modes] of Object.entries(KEY_TO_MODE)) {
      const data = datasets[cacheKey];
      if (!data) continue;
      for (const mode of modes) {
        clientData[mode] = data;
      }
    }

    return NextResponse.json({
      ok: true,
      timestamp,
      age_hours: ageHours.toFixed(1),
      data: clientData,
    }, {
      headers: { "Cache-Control": "private, max-age=300" }, // 5 min cache navigateur
    });

  } catch (err: any) {
    console.error("[snapshot] Error:", err.message);
    return NextResponse.json({ stale: true, reason: "error" });
  }
}
