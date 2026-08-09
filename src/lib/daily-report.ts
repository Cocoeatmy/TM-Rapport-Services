// Rapport quotidien : pour un jour donné, liste les montages et formate un
// message Telegram (HTML) par collaborateur, avec toutes les infos du chantier.

import type { Project } from "@/lib/notion";
import { escapeHtml } from "@/lib/telegram";

/** ISO local (YYYY-MM-DD) d'une date. */
export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Un projet est-il un montage prévu le jour `dayIso` ? */
export function isMontageOnDay(p: Project, dayIso: string): boolean {
  if (!p.dateMontage) return false;
  return p.dateMontage.slice(0, 10) === dayIso;
}

/** Le collaborateur (par prénom, insensible à la casse) est-il sur ce projet ? */
export function collaboratorOnProject(p: Project, collaboratorName: string): boolean {
  const first = collaboratorName.split(" ")[0].toLowerCase().trim();
  if (!first) return false;
  return (p.collaborateurs || "").toLowerCase().includes(first);
}

/** Bloc HTML d'un projet pour le rapport Telegram. */
function projectBlock(p: Project): string {
  const L: string[] = [];
  const line = (emoji: string, label: string, value?: string | null) => {
    const v = (value || "").trim();
    if (v) L.push(`${emoji} <b>${escapeHtml(label)}</b> ${escapeHtml(v)}`);
  };

  // En-tête : N° OFR + titre (nom chantier)
  const titre = p.nomChantier || p.projet || "—";
  L.push(`━━━━━━━━━━━━━━`);
  L.push(`🔧 <b>${escapeHtml(p.ofrTM || "—")}</b> — ${escapeHtml(titre)}`);

  line("📍", "Adresse :", p.adresseChantier);
  line("📞", "Contacts RDV :", p.contactsRDV);
  line("🛠", "Services :", (p.typeServices || []).join(", "));
  const cab = p.nbCabines != null ? `${p.nbCabines}` : "";
  if (cab) L.push(`🚿 <b>Cabines :</b> ${escapeHtml(cab)}`);
  line("📌", "Emplacement :", p.emplacementCabine);
  line("👷", "Collaborateur :", p.collaborateurs);

  // Documents pour Montage : liens cliquables
  const docs = p.documentsMontagee || [];
  if (docs.length > 0) {
    const links = docs
      .slice(0, 8)
      .map((d, i) => `<a href="${escapeHtml(d.url)}">${escapeHtml(d.name || `Document ${i + 1}`)}</a>`)
      .join(" · ");
    L.push(`📄 <b>Documents :</b> ${links}`);
  }

  line("📝", "Commentaires :", p.commentairesMontages);
  line("🗒", "Contacts projet :", p.contacts);

  return L.join("\n");
}

/**
 * Construit le message complet du rapport quotidien.
 * @param projects  Projets du jour à inclure (déjà filtrés).
 * @param opts.dayIso  jour concerné (pour l'en-tête).
 * @param opts.greetName  prénom pour la salutation (optionnel).
 */
export function buildDailyReport(
  projects: Project[],
  opts: { dayIso: string; greetName?: string },
): string {
  const dateLabel = new Date(opts.dayIso + "T12:00:00").toLocaleDateString("fr-CH", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
  });
  const head: string[] = [`📅 <b>Rapport du jour</b> — ${escapeHtml(dateLabel)}`];
  if (opts.greetName) head.push(`Bonjour ${escapeHtml(opts.greetName)} 👋`);

  if (projects.length === 0) {
    head.push("", "Aucun montage prévu aujourd'hui. Bonne journée !");
    return head.join("\n");
  }

  head.push(`${projects.length} montage${projects.length > 1 ? "s" : ""} prévu${projects.length > 1 ? "s" : ""} :`, "");
  return [...head, ...projects.map(projectBlock)].join("\n");
}
