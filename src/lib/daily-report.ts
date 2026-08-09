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

/** Projet « Team » : collaborateur = équipe entière → concerne TOUT le monde. */
export function isTeamProject(p: Project): boolean {
  return (p.collaborateurs || "").toLowerCase().includes("team");
}

/**
 * Le collaborateur est-il concerné par ce projet ?
 *  • Projet « Team »        → OUI pour tout le monde.
 *  • Binôme « A & B »       → la chaîne contient les deux prénoms → chacun matche.
 *  • Sinon                  → son prénom apparaît dans « Collaborateurs montages ».
 */
export function collaboratorOnProject(p: Project, collaboratorName: string): boolean {
  if (isTeamProject(p)) return true;
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

  // Heure du RDV : présente uniquement si « Date Montage » comporte une heure
  // (ISO « …T08:30… »). On affiche l'heure telle que saisie dans Notion.
  const rdvTime = (p.dateMontage || "").match(/T(\d{2}:\d{2})/)?.[1];
  if (rdvTime) L.push(`🕐 <b>Heure RDV :</b> ${escapeHtml(rdvTime)}`);

  line("📍", "Adresse :", p.adresseChantier);
  line("📞", "Contacts RDV :", p.contactsRDV);
  line("🛠", "Services :", (p.typeServices || []).join(", "));
  const cab = p.nbCabines != null ? `${p.nbCabines}` : "";
  if (cab) L.push(`🚿 <b>Cabines :</b> ${escapeHtml(cab)}`);
  line("📌", "Emplacement cabine :", p.emplacementCabine);
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

// ── Version E-MAIL (HTML stylé) ──────────────────────────────────────────────

function projectCardHtml(p: Project): string {
  const rows: string[] = [];
  const row = (label: string, value?: string | null) => {
    const v = (value || "").trim();
    if (v) rows.push(
      `<tr><td style="padding:6px 0;color:#64748b;font-size:13px;white-space:nowrap;vertical-align:top">${escapeHtml(label)}</td>` +
      `<td style="padding:6px 0 6px 12px;color:#1e293b;font-size:13px;font-weight:600">${escapeHtml(v)}</td></tr>`,
    );
  };

  const rdvTime = (p.dateMontage || "").match(/T(\d{2}:\d{2})/)?.[1];
  row("Heure RDV", rdvTime);
  row("Adresse", p.adresseChantier);
  row("Contacts RDV", p.contactsRDV);
  row("Services", (p.typeServices || []).join(", "));
  row("Cabines", p.nbCabines != null ? String(p.nbCabines) : "");
  row("Emplacement cabine", p.emplacementCabine);
  row("Collaborateur", p.collaborateurs);

  const docs = p.documentsMontagee || [];
  if (docs.length > 0) {
    const links = docs.slice(0, 12)
      .map((d, i) => `<a href="${escapeHtml(d.url)}" style="color:#1e3a5f">${escapeHtml(d.name || `Document ${i + 1}`)}</a>`)
      .join(" · ");
    rows.push(`<tr><td style="padding:6px 0;color:#64748b;font-size:13px;vertical-align:top">Documents</td><td style="padding:6px 0 6px 12px;font-size:13px">${links}</td></tr>`);
  }
  row("Commentaires", p.commentairesMontages);
  row("Contacts projet", p.contacts);

  const titre = p.nomChantier || p.projet || "—";
  return `
    <div style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:16px">
      <div style="background:#1e3a5f;padding:12px 16px">
        <div style="color:#fff;font-weight:700;font-size:15px">🔧 ${escapeHtml(p.ofrTM || "—")}</div>
        <div style="color:rgba(255,255,255,.8);font-size:13px;margin-top:2px">${escapeHtml(titre)}</div>
      </div>
      <div style="padding:12px 16px;background:#fff">
        <table style="width:100%;border-collapse:collapse">${rows.join("")}</table>
      </div>
    </div>`;
}

/** Corps HTML de l'e-mail du rapport quotidien. */
export function buildDailyReportEmailHtml(
  projects: Project[],
  opts: { dayIso: string; greetName?: string },
): string {
  const dateLabel = new Date(opts.dayIso + "T12:00:00").toLocaleDateString("fr-CH", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
  });
  const intro = projects.length === 0
    ? `<p style="color:#475569;font-size:14px">Aucun montage prévu aujourd'hui. Bonne journée !</p>`
    : `<p style="color:#475569;font-size:14px">${projects.length} montage${projects.length > 1 ? "s" : ""} prévu${projects.length > 1 ? "s" : ""} aujourd'hui :</p>`;

  return `
  <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;background:#f8fafc;padding:20px">
    <div style="background:#1e3a5f;padding:20px 24px;border-radius:12px 12px 0 0">
      <h1 style="color:#fff;margin:0;font-size:20px">📅 Rapport du jour</h1>
      <p style="color:rgba(255,255,255,.8);margin:4px 0 0;font-size:13px;text-transform:capitalize">${escapeHtml(dateLabel)}</p>
    </div>
    <div style="background:#fff;border:1px solid #e2e8f0;border-top:none;padding:20px 24px">
      ${opts.greetName ? `<p style="color:#1e293b;font-size:15px;margin:0 0 8px">Bonjour ${escapeHtml(opts.greetName)} 👋</p>` : ""}
      ${intro}
      ${projects.map(projectCardHtml).join("")}
    </div>
    <div style="padding:16px 24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;background:#fff">
      <p style="color:#94a3b8;font-size:11px;margin:0;text-align:center">
        TM Douche Montage | Champs-Lovat 13 Box n°16, 1400 Yverdon<br/>+41 79 555 24 74 | www.douche-montage.ch
      </p>
    </div>
  </div>`;
}
