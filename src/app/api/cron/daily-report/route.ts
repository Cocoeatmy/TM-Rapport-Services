import { NextRequest, NextResponse } from "next/server";
import { sendDailyReportsToAll } from "@/lib/send-daily-reports";
import { isoDay } from "@/lib/daily-report";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Cron matinal : envoie le rapport quotidien à ~6h45 (heure suisse), du lundi au
 * vendredi.
 *
 * Les crons Vercel sont en UTC. Pour tomber sur 6h45 SUISSE toute l'année malgré
 * l'heure d'été/hiver, on planifie DEUX déclenchements (04:45 et 05:45 UTC) et
 * on ne s'exécute QUE si l'heure locale de Zurich est bien 6h (fenêtre 6h40-6h55).
 *   • Été  (CEST, UTC+2) : 04:45 UTC = 06:45 → OK ; 05:45 UTC = 07:45 → ignoré
 *   • Hiver (CET, UTC+1) : 04:45 UTC = 05:45 → ignoré ; 05:45 UTC = 06:45 → OK
 * Résultat : exactement un envoi par jour ouvré à 6h45 suisse.
 */
function zurichParts(): { hour: number; minute: number; weekday: string; day: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Zurich",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  return {
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    weekday: get("weekday"),
    day: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

export async function GET(request: NextRequest) {
  // Auth cron : Vercel envoie Authorization: Bearer <CRON_SECRET>. On accepte
  // aussi ?secret= pour les tests manuels.
  const auth = request.headers.get("authorization");
  const secret = request.nextUrl.searchParams.get("secret");
  const CRON = process.env.CRON_SECRET;
  if (CRON && auth !== `Bearer ${CRON}` && secret !== CRON) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { hour, minute, weekday, day } = zurichParts();
  const force = secret === CRON && request.nextUrl.searchParams.get("force") === "1";

  // Week-end : pas d'envoi.
  if (!force && (weekday === "Sat" || weekday === "Sun")) {
    return NextResponse.json({ skipped: true, reason: "week-end", weekday });
  }
  // Fenêtre 6h45 suisse (tolérance) — évite le double envoi été/hiver.
  if (!force && !(hour === 6 && minute >= 40 && minute <= 55)) {
    return NextResponse.json({ skipped: true, reason: "hors fenêtre 6h45", heureSuisse: `${hour}:${minute}` });
  }

  try {
    const { montages, results } = await sendDailyReportsToAll(day || isoDay(new Date()));
    return NextResponse.json({ success: true, day, montages, destinataires: results.length, results });
  } catch (e: any) {
    console.error("[cron/daily-report] error:", e?.message || e);
    return NextResponse.json({ error: e?.message || "Erreur" }, { status: 500 });
  }
}
