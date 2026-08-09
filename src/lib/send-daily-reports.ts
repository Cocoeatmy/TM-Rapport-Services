// Envoi du rapport quotidien par e-mail à TOUS les collaborateurs concernés.
// Partagé par le cron matinal et l'endpoint admin (mode "all").

import { getAllActiveProjects } from "@/lib/notion";
import { getAllUsers } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { buildDailyReportEmailHtml, isMontageOnDay, collaboratorOnProject } from "@/lib/daily-report";

export interface DailyReportResult {
  name: string;
  email: string;
  count: number;
  ok: boolean;
  error?: string;
}

/**
 * Envoie à chaque collaborateur (ayant un e-mail) SES montages du jour.
 * « Team » → concerne tout le monde ; binôme « A & B » → les deux ;
 * sinon prénom présent dans « Collaborateurs montages ». Aucun montage → pas
 * d'e-mail.
 */
export async function sendDailyReportsToAll(
  dayIso: string,
): Promise<{ montages: number; results: DailyReportResult[] }> {
  const all = await getAllActiveProjects();
  const montages = all.filter((p) => isMontageOnDay(p, dayIso));

  const users = getAllUsers();
  const results: DailyReportResult[] = [];
  for (const u of users) {
    if (!u.email) continue;
    const mine = montages.filter((p) => collaboratorOnProject(p, u.name));
    if (mine.length === 0) continue; // rien à envoyer à ce collaborateur
    const html = buildDailyReportEmailHtml(mine, { dayIso, greetName: u.name.split(" ")[0] });
    const subject = `Rapport du jour — ${mine.length} montage${mine.length > 1 ? "s" : ""}`;
    const r = await sendEmail(u.email, subject, html);
    results.push({ name: u.name, email: u.email, count: mine.length, ok: r.success, error: r.error });
  }
  return { montages: montages.length, results };
}
