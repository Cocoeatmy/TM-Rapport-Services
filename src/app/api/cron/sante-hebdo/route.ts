import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { estProprietaire } from "@/lib/droits-serveur";
import { getAllProjectsRaw, type Project } from "@/lib/notion";
import { cachedOrFetch } from "@/lib/server-cache";
import { getData } from "@/lib/kv-store";
import { redisEnabled, redisLRange, redisHGetAll, redisGetJSON, redisSetJSONDurable, siRedis } from "@/lib/redis-cache";
import { sendEmail } from "@/lib/email";
import { sendTelegramText, DEFAULT_TELEGRAM_CHAT_ID } from "@/lib/telegram";
import { lireJeton } from "@/lib/bexio";
import { constatsSante, comparer, messageSante, CLE_RAPPORTS_ENVOYES } from "@/lib/sante-hebdo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Le contrôle de santé du lundi, 6 h (heure suisse) — lib/sante-hebdo.
 *
 * E-mail ET Telegram au propriétaire. Rien à signaler : rien d'envoyé.
 * Les clés de la semaine sont gardées (Redis) pour dire, le lundi suivant,
 * ce qui est nouveau, ce qui traîne et ce qui a été réglé.
 *
 * `?apercu=1` avec la session du propriétaire : le bilan en JSON, sans rien
 * envoyer ni enregistrer — pour vérifier sur les vraies données.
 */
const CLE_PRECEDENTS = "sante-hebdo:precedents";

function maintenantSuisse(): { heure: number; jour: string } {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Zurich", hour: "2-digit", hour12: false, weekday: "short" });
  const parts = Object.fromEntries(f.formatToParts(new Date()).map((p) => [p.type, p.value]));
  return { heure: Number(parts.hour), jour: parts.weekday };
}

/** Projets dont le rapport est parti chez le client : journal + trace serveur. */
async function rapportsEnvoyes(): Promise<Set<string>> {
  const ids = new Set<string>();
  const noter = (l: { action?: string; projectId?: string } | null) => {
    if (l && /rapport envoy/i.test(l.action || "") && l.projectId) ids.add(String(l.projectId).replace(/-/g, ""));
  };
  if (redisEnabled) {
    for (const s of await redisLRange("logs", 0, -1).catch(() => [] as string[])) {
      try { noter(JSON.parse(s)); } catch { /* ligne illisible */ }
    }
    const h = await siRedis(() => redisHGetAll(CLE_RAPPORTS_ENVOYES));
    for (const id of Object.keys(h?.valeur || {})) ids.add(id);
  }
  // Le reliquat du journal resté dans Notion (avant la migration Redis).
  for (const l of await getData<{ action?: string; projectId?: string }>("logs").catch(() => [])) noter(l);
  return ids;
}

export async function GET(request: NextRequest) {
  const CRON = process.env.CRON_SECRET;
  const secret = request.nextUrl.searchParams.get("secret");
  const apercu = request.nextUrl.searchParams.get("apercu") === "1";

  if (apercu) {
    const token = request.cookies.get("auth-token")?.value;
    const user = token ? await verifyToken(token).catch(() => null) : null;
    if (!user || user.role !== "admin" || !(await estProprietaire(user))) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }
  } else if (CRON && request.headers.get("authorization") !== `Bearer ${CRON}` && secret !== CRON) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const force = !!CRON && secret === CRON && request.nextUrl.searchParams.get("force") === "1";
  // Deux déclenchements (été / hiver) : seul celui du lundi 6 h suisse envoie.
  const { heure, jour } = maintenantSuisse();
  if (!apercu && !force && (heure !== 6 || jour !== "Mon")) {
    return NextResponse.json({ skipped: true, reason: "hors fenêtre lundi 6 h" });
  }

  const [projets, envoyes, precedents] = await Promise.all([
    cachedOrFetch<Project[]>("projects-all-raw", getAllProjectsRaw),
    rapportsEnvoyes(),
    redisGetJSON<string[]>(CLE_PRECEDENTS).catch(() => null),
  ]);
  const constats = constatsSante(projets, envoyes, new Date());
  const bilan = comparer(constats, precedents || []);
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://tm-rapport-services.vercel.app";
  const message = messageSante(bilan, base);

  if (apercu) {
    const parCategorie: Record<string, number> = {};
    for (const c of constats) parCategorie[c.categorie] = (parCategorie[c.categorie] || 0) + 1;
    return NextResponse.json({ parCategorie, nouveaux: bilan.nouveaux.length, toujours: bilan.toujours.length, regles: bilan.regles, constats, sujet: message.sujet, telegramLongueur: message.telegram.length });
  }

  // Les clés de cette semaine, pour la comparaison de lundi prochain.
  await redisSetJSONDurable(CLE_PRECEDENTS, constats.map((c) => c.cle)).catch(() => {});
  if (constats.length === 0) return NextResponse.json({ ok: true, constats: 0 });

  const destinataire = process.env.ALERTE_ENVOIS_EMAIL || (await lireJeton().catch(() => null))?.par || "ferreira.micael@gmail.com";
  const [mail, tg] = await Promise.all([
    sendEmail(destinataire, message.sujet, message.html),
    sendTelegramText(DEFAULT_TELEGRAM_CHAT_ID, message.telegram),
  ]);
  return NextResponse.json({ ok: true, constats: constats.length, nouveaux: bilan.nouveaux.length, mail: mail.success, telegram: tg.success });
}
