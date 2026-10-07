import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { redisEnabled, redisGetJSON, redisSetJSON, redisHGetAll } from "@/lib/redis-cache";
import { getData } from "@/lib/kv-store";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * État de santé de l'installation — réservé à un administrateur.
 *
 * Plusieurs pannes de ces derniers mois étaient invisibles : le cache partagé
 * configuré mais muet, la photo nocturne figée depuis des semaines, le secret
 * des tâches planifiées absent. Rien, dans l'app, ne permettait de s'en
 * apercevoir ; il a fallu fouiller le code pour les trouver. Cette page
 * répond à la question « est-ce que tout tourne ? » en une requête.
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  const user = token ? await verifyToken(token) : null;
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  // ── Cache partagé : configuré ne veut pas dire qui répond ────────────────
  let redis: Record<string, unknown> = { configure: redisEnabled };
  if (redisEnabled) {
    const t0 = Date.now();
    try {
      const temoin = `sante:${Date.now()}`;
      await redisSetJSON(temoin, { ok: true }, 60);
      const relu = await redisGetJSON<{ ok: boolean }>(temoin);
      const index = await redisHGetAll("kvpages");
      redis = {
        configure: true,
        repond: relu?.ok === true,
        ms: Date.now() - t0,
        clesIndexees: Object.keys(index || {}).length,
      };
    } catch (err: unknown) {
      redis = { configure: true, repond: false, erreur: String((err as Error)?.message || err).slice(0, 200) };
    }
  }

  // ── Photo nocturne : à quand remonte-t-elle ? ─────────────────────────────
  let snapshot: Record<string, unknown> = {};
  try {
    const meta = await getData<{ timestamp: string }>("projects-full-snapshot");
    const ts = meta[0]?.timestamp;
    snapshot = ts
      ? { date: ts, ageHeures: Number(((Date.now() - Date.parse(ts)) / 3_600_000).toFixed(1)) }
      : { date: null };
  } catch (err: unknown) {
    snapshot = { erreur: String((err as Error)?.message || err).slice(0, 200) };
  }

  /* Dernier message reçu de Notion : la seule façon simple de savoir si le
     webhook fonctionne vraiment, les journaux ne gardant que quelques minutes. */
  let webhook: Record<string, unknown> = { secret: !!process.env.NOTION_WEBHOOK_SECRET };
  if (redisEnabled) {
    try {
      const dernier = await redisGetJSON<{ type: string; retenu: boolean; le: string }>("webhook:dernier");
      if (dernier?.le) {
        webhook = {
          ...webhook,
          dernierEvenement: dernier.type,
          retenu: dernier.retenu,
          le: dernier.le,
          ilYAMinutes: Number(((Date.now() - Date.parse(dernier.le)) / 60000).toFixed(1)),
        };
      } else {
        webhook = { ...webhook, dernierEvenement: null };
      }
    } catch { /* sans conséquence */ }
  }

  return NextResponse.json({
    redis,
    webhook,
    snapshot,
    secrets: {
      jwt: !!process.env.JWT_SECRET,
      cron: !!process.env.CRON_SECRET,
      partageLiens: !!process.env.SHARE_LINK_KEY,
      gmail: !!process.env.GMAIL_APP_PASSWORD,
    },
    version: process.env.VERCEL_GIT_COMMIT_SHA || "dev",
  }, { headers: { "Cache-Control": "no-store" } });
}
