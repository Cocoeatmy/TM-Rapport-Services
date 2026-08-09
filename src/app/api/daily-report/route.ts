import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getAllActiveProjects } from "@/lib/notion";
import { sendTelegramText, DEFAULT_TELEGRAM_CHAT_ID, telegramConfigured } from "@/lib/telegram";
import { buildDailyReport, isMontageOnDay, collaboratorOnProject, isoDay } from "@/lib/daily-report";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Rapport quotidien Telegram.
 *
 * Phase de TEST : POST { test: true } (admin) → envoie le rapport du jour au
 * chat Telegram configuré (TELEGRAM_CHAT_ID = profil de l'admin/Micael), filtré
 * sur les montages qui LUI sont attribués. Si aucun ne lui est attribué
 * aujourd'hui, on envoie tous les montages du jour en aperçu (pour valider le
 * format). Le num. de téléphone n'est pas utilisé (Telegram = chat_id).
 */
export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Admin requis" }, { status: 403 });

  if (!telegramConfigured || !DEFAULT_TELEGRAM_CHAT_ID) {
    return NextResponse.json({ error: "Telegram non configuré (bot/chat manquant)" }, { status: 500 });
  }

  try {
    const body = await request.json().catch(() => ({} as any));
    const dayIso: string = body?.date || isoDay(new Date());

    const all = await getAllActiveProjects();
    const montagesDuJour = all.filter((p) => isMontageOnDay(p, dayIso));

    // TEST : montages attribués à l'admin ; sinon aperçu de tous les montages du jour.
    const mine = montagesDuJour.filter((p) => collaboratorOnProject(p, user.name));
    const isPreviewAll = mine.length === 0 && montagesDuJour.length > 0;
    const projects = mine.length > 0 ? mine : montagesDuJour;

    let message = buildDailyReport(projects, { dayIso, greetName: user.name.split(" ")[0] });
    if (isPreviewAll) {
      message = "🧪 <i>Aperçu test — aucun montage ne t'est attribué aujourd'hui, voici tous les montages du jour :</i>\n\n" + message;
    }

    const res = await sendTelegramText(DEFAULT_TELEGRAM_CHAT_ID, message);
    if (!res.success) {
      return NextResponse.json({ error: res.error || "Échec envoi Telegram" }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      day: dayIso,
      montagesDuJour: montagesDuJour.length,
      envoyes: projects.length,
      preview: isPreviewAll,
    });
  } catch (error: any) {
    console.error("[daily-report] error:", error?.message || error);
    return NextResponse.json({ error: error?.message || "Erreur" }, { status: 500 });
  }
}
