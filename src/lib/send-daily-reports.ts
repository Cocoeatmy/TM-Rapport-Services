// Envoi du rapport quotidien par e-mail à TOUS les collaborateurs concernés.
// Partagé par le cron matinal et l'endpoint admin (mode "all").

import { getAllActiveProjects } from "@/lib/notion";
import { getAllUsers } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { emailEnabled } from "@/lib/email-prefs";
import { buildDailyReportEmailHtml, isMontageOnDay, collaboratorOnProject } from "@/lib/daily-report";
import { getAllProjectsRaw } from "@/lib/notion";
import { cachedOrFetch } from "@/lib/server-cache";
import { appliquer, compterFiches, REGLES_ANOMALIES, REGLES_RELANCES } from "@/lib/regles";

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

  /* Compteurs de contrôle, calculés UNE fois et seulement si un administrateur
     doit recevoir le rapport : ils demandent la liste complète des projets,
     terminés compris, ce qui n'a pas à peser sur un envoi de monteurs. */
  let alertes: { anomalies: number; relances: number } | undefined;
  const auMoinsUnAdmin = users.some((u) => u.email && u.role === "admin");
  if (auMoinsUnAdmin) {
    try {
      const tous = await cachedOrFetch("projects-all-raw", getAllProjectsRaw);
      alertes = {
        anomalies: compterFiches(
          appliquer(REGLES_ANOMALIES, tous).filter((g) => g.regle.gravite === "bloquant")),
        relances: compterFiches(appliquer(REGLES_RELANCES, tous)),
      };
    } catch {
      // Le rapport du matin ne doit jamais échouer pour un bandeau d'appoint.
      alertes = undefined;
    }
  }
  for (const u of users) {
    if (!u.email) continue;
    // Garde e-mail : l'admin est OFF par défaut (il choisit dans Préférences
    // e-mails) ; les collaborateurs restent ON par défaut.
    if (!(await emailEnabled(u.email, "rapport_quotidien", u.role !== "admin"))) continue;
    const mine = montages.filter((p) => collaboratorOnProject(p, u.name));
    if (mine.length === 0) continue; // rien à envoyer à ce collaborateur
    const html = buildDailyReportEmailHtml(mine, {
      dayIso,
      greetName: u.name.split(" ")[0],
      alertes: u.role === "admin" ? alertes : undefined,
    });
    const subject = `Rapport du jour — ${mine.length} montage${mine.length > 1 ? "s" : ""}`;
    const r = await sendEmail(u.email, subject, html);
    results.push({ name: u.name, email: u.email, count: mine.length, ok: r.success, error: r.error });
  }
  return { montages: montages.length, results };
}
