import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getAllUsers } from "@/lib/auth";
import { getAllActiveProjects } from "@/lib/notion";
import { sendEmail } from "@/lib/email";
import { getUserPhones } from "@/lib/user-phones";
import { buildDailyReportEmailHtml, isMontageOnDay, collaboratorOnProject, isoDay } from "@/lib/daily-report";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Rapport quotidien par E-MAIL.
 *
 * Chaque collaborateur reçoit un e-mail avec UNIQUEMENT les montages du jour où
 * son nom apparaît (Collaborateurs montages). Ceux qui n'ont aucun montage ne
 * reçoivent rien.
 *
 * Modes :
 *   POST { test: true }      → envoie seulement à l'admin (toi), tes montages du
 *                              jour (ou aperçu de tous si aucun ne t'est attribué).
 *   POST { }  (ou cron)      → envoie à TOUS les collaborateurs concernés.
 *   POST { date: "YYYY-MM-DD" } pour cibler un autre jour.
 */
export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  const user = token ? await verifyToken(token) : null;

  const body = await request.json().catch(() => ({} as any));
  const isTest = !!body?.test;

  // Le mode "envoi à tous" est réservé à l'admin (ou au cron via secret).
  const cronSecret = request.nextUrl.searchParams.get("secret");
  const isCron = !!process.env.CRON_SECRET && cronSecret === process.env.CRON_SECRET;
  if (!isCron && (!user || user.role !== "admin")) {
    return NextResponse.json({ error: "Admin requis" }, { status: 403 });
  }

  try {
    const dayIso: string = body?.date || isoDay(new Date());
    const all = await getAllActiveProjects();
    const montagesDuJour = all.filter((p) => isMontageOnDay(p, dayIso));

    // ── Mode TEST : uniquement l'admin connecté ──
    if (isTest) {
      if (!user) return NextResponse.json({ error: "Connexion requise" }, { status: 401 });
      const mine = montagesDuJour.filter((p) => collaboratorOnProject(p, user.name));
      const previewAll = mine.length === 0 && montagesDuJour.length > 0;
      const projects = mine.length > 0 ? mine : montagesDuJour;
      let html = buildDailyReportEmailHtml(projects, { dayIso, greetName: user.name.split(" ")[0] });
      if (previewAll) {
        html = `<div style="max-width:640px;margin:0 auto;font-family:Arial,sans-serif;color:#92400e;background:#fff7ed;padding:12px;border-radius:8px">🧪 Aperçu test — aucun montage ne t'est attribué aujourd'hui, voici tous les montages du jour :</div>` + html;
      }
      const r = await sendEmail(user.email, `Rapport du jour — ${dayIso}`, html);
      if (!r.success) return NextResponse.json({ error: r.error || "Échec e-mail" }, { status: 502 });
      return NextResponse.json({ success: true, mode: "test", to: user.email, montagesDuJour: montagesDuJour.length, envoyes: projects.length, preview: previewAll });
    }

    // ── Mode RÉEL : chaque collaborateur reçoit SES montages ──
    const users = getAllUsers(); // {email, name, role}
    let phones: Record<string, string> = {};
    try { phones = await getUserPhones(); } catch { /* non requis pour l'e-mail */ }
    void phones;

    const results: { name: string; email: string; count: number; ok: boolean; error?: string }[] = [];
    for (const u of users) {
      if (!u.email) continue;
      const mine = montagesDuJour.filter((p) => collaboratorOnProject(p, u.name));
      if (mine.length === 0) continue; // pas de montage → pas d'e-mail
      const html = buildDailyReportEmailHtml(mine, { dayIso, greetName: u.name.split(" ")[0] });
      const r = await sendEmail(u.email, `Rapport du jour — ${mine.length} montage${mine.length > 1 ? "s" : ""}`, html);
      results.push({ name: u.name, email: u.email, count: mine.length, ok: r.success, error: r.error });
    }

    return NextResponse.json({
      success: true,
      mode: isCron ? "cron" : "all",
      day: dayIso,
      montagesDuJour: montagesDuJour.length,
      destinataires: results.length,
      results,
    });
  } catch (error: any) {
    console.error("[daily-report] error:", error?.message || error);
    return NextResponse.json({ error: error?.message || "Erreur" }, { status: 500 });
  }
}
