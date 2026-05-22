import { NextRequest, NextResponse } from "next/server";
import { notion, databaseId, mapPageToProject, type Project } from "@/lib/notion";
import { createNotification } from "@/app/api/notifications/route";
import { sendPushToUser } from "@/lib/send-push";
import { Resend } from "resend";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const resend = new Resend(process.env.RESEND_API_KEY);
const ADMIN_EMAIL = "ferreira.micael@gmail.com";

// ─── Telegram text message ────────────────────────────────────────────────────

async function sendTelegramText(html: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: html, parse_mode: "HTML" }),
    });
  } catch (e) {
    console.warn("Telegram send failed:", e);
  }
}

// ─── Hours computation ────────────────────────────────────────────────────────

interface DayEntry {
  date: string;
  collab: string;
  arrive: string;
  depart: string;
  hours: number;
}

function parseEntries(arrive: string, depart: string): DayEntry[] {
  if (!arrive || !depart) return [];

  const arrivals = arrive.split("|").map((s) => s.trim());
  const departures = depart.split("|").map((s) => s.trim());
  const entries: DayEntry[] = [];

  for (let i = 0; i < Math.min(arrivals.length, departures.length); i++) {
    const aRaw = arrivals[i];
    const dRaw = departures[i];
    // "2026-01-15 Micael 08:00" or just "08:00"
    const aMatch = aRaw.match(/(\d{1,2}):(\d{2})$/);
    const dMatch = dRaw.match(/(\d{1,2}):(\d{2})$/);
    if (!aMatch || !dMatch) continue;

    const diff =
      (parseInt(dMatch[1]) * 60 + parseInt(dMatch[2])) -
      (parseInt(aMatch[1]) * 60 + parseInt(aMatch[2]));

    const dateMatch = aRaw.match(/^(\d{4}-\d{2}-\d{2})/);
    const collabMatch = aRaw.match(/^(?:\d{4}-\d{2}-\d{2}\s+)?([A-Za-zÀ-ÿ\-]+)\s+\d/);

    entries.push({
      date: dateMatch ? formatSwissDateFromISO(dateMatch[1]) : "",
      collab: collabMatch ? collabMatch[1] : "",
      arrive: `${aMatch[1].padStart(2, "0")}:${aMatch[2]}`,
      depart: `${dMatch[1].padStart(2, "0")}:${dMatch[2]}`,
      hours: diff > 0 ? diff / 60 : 0,
    });
  }
  return entries;
}

function totalHours(entries: DayEntry[]): number {
  return entries.reduce((s, e) => s + e.hours, 0);
}

function formatH(h: number): string {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return mm > 0 ? `${hh}h${String(mm).padStart(2, "0")}` : `${hh}h`;
}

function formatSwissDateFromISO(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

// ─── Notion fetch ─────────────────────────────────────────────────────────────

async function fetchWeekMontages(): Promise<Project[]> {
  // Cover yesterday (cron runs at 07:00 — covers the previous calendar day)
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const iso = yesterday.toISOString().slice(0, 10); // "YYYY-MM-DD"

  const allResults: any[] = [];
  let cursor: string | undefined;

  do {
    const res: any = await notion.databases.query({
      database_id: databaseId,
      filter: {
        and: [
          { property: "Date Montage", date: { on_or_after: iso } },
          { property: "Date Montage", date: { on_or_before: iso } },
        ],
      },
      sorts: [{ property: "Date Montage", direction: "descending" }],
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    allResults.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);

  return allResults
    .map(mapPageToProject)
    .filter(
      (p) =>
        !p.projet.startsWith("[DATA]") &&
        (p.heureArrivee || p.photosMontage.length > 0)
    );
}

// ─── HTML Email ───────────────────────────────────────────────────────────────

function buildEmail(projects: Project[], dayLabel: string): string {
  const rows = projects
    .map((p) => {
      const entries = parseEntries(p.heureArrivee, p.heureDepart);
      const total = totalHours(entries);
      const isMulti = entries.length > 1;

      const hoursCell = isMulti
        ? entries
            .map(
              (e) =>
                `<span style="display:block;font-size:12px;color:#9ca3af;">
                  ${e.date ? e.date + " · " : ""}${e.collab ? e.collab + " · " : ""}${e.arrive}→${e.depart} <b>(${formatH(e.hours)})</b>
                </span>`
            )
            .join("") + `<span style="display:block;font-size:13px;font-weight:700;color:#a78bfa;margin-top:4px;">Total: ${formatH(total)}</span>`
        : entries.length === 1
        ? `<span style="font-size:14px;font-weight:600;color:#e9d5ff;">${entries[0].arrive} → ${entries[0].depart} &nbsp;<span style="color:#a78bfa;">(${formatH(total)})</span></span>`
        : `<span style="color:#6b7280;font-style:italic;">—</span>`;

      const soucisTag = p.soucisMontage
        ? `<span style="display:inline-block;background:#7f1d1d;color:#fca5a5;font-size:11px;padding:2px 8px;border-radius:99px;margin-left:6px;">⚠ Soucis</span>`
        : "";

      const cabinesTag = p.nbCabines
        ? `<span style="display:inline-block;background:rgba(139,92,246,0.18);color:#c4b5fd;font-size:11px;padding:2px 8px;border-radius:99px;margin-left:4px;">${p.nbCabines} cab.</span>`
        : "";

      const noteCell =
        p.commentairesMontages
          ? `<td style="padding:12px 16px;vertical-align:top;font-size:12px;color:#9ca3af;max-width:220px;">${p.commentairesMontages.slice(0, 200)}</td>`
          : `<td style="padding:12px 16px;color:#6b7280;">—</td>`;

      const dateStr = p.dateMontage
        ? formatSwissDateFromISO(p.dateMontage) +
          (p.dateMontageEnd && p.dateMontageEnd !== p.dateMontage
            ? ` → ${formatSwissDateFromISO(p.dateMontageEnd)}`
            : "")
        : "—";

      return `
        <tr style="border-bottom:1px solid rgba(255,255,255,0.07);">
          <td style="padding:14px 16px;vertical-align:top;">
            <div style="font-size:15px;font-weight:700;color:#e9d5ff;">${p.projet || "—"}</div>
            <div style="font-size:11px;color:#6b7280;margin-top:2px;">${p.ofrTM || ""}</div>
          </td>
          <td style="padding:14px 16px;vertical-align:top;">
            <span style="font-size:13px;color:#c4b5fd;font-weight:600;">${p.collaborateurs || "—"}</span>
            ${soucisTag}${cabinesTag}
          </td>
          <td style="padding:14px 16px;vertical-align:top;font-size:13px;color:#d1d5db;">${dateStr}</td>
          <td style="padding:14px 16px;vertical-align:top;">${hoursCell}</td>
          ${noteCell}
        </tr>`;
    })
    .join("");

  const stats = `
    <div style="display:flex;gap:24px;margin:24px 0;">
      <div style="flex:1;background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.3);border-radius:12px;padding:16px;text-align:center;">
        <div style="font-size:28px;font-weight:800;color:#a78bfa;">${projects.length}</div>
        <div style="font-size:12px;color:#9ca3af;margin-top:4px;">Montages exécutés</div>
      </div>
      <div style="flex:1;background:rgba(34,197,94,0.10);border:1px solid rgba(34,197,94,0.25);border-radius:12px;padding:16px;text-align:center;">
        <div style="font-size:28px;font-weight:800;color:#86efac;">${formatH(projects.reduce((s, p) => s + totalHours(parseEntries(p.heureArrivee, p.heureDepart)), 0))}</div>
        <div style="font-size:12px;color:#9ca3af;margin-top:4px;">Heures totales</div>
      </div>
      <div style="flex:1;background:rgba(251,191,36,0.10);border:1px solid rgba(251,191,36,0.25);border-radius:12px;padding:16px;text-align:center;">
        <div style="font-size:28px;font-weight:800;color:#fde68a;">${projects.reduce((s, p) => s + (p.nbCabines || 0), 0)}</div>
        <div style="font-size:12px;color:#9ca3af;margin-top:4px;">Cabines posées</div>
      </div>
      <div style="flex:1;background:rgba(239,68,68,0.10);border:1px solid rgba(239,68,68,0.25);border-radius:12px;padding:16px;text-align:center;">
        <div style="font-size:28px;font-weight:800;color:#fca5a5;">${projects.filter((p) => p.soucisMontage).length}</div>
        <div style="font-size:12px;color:#9ca3af;margin-top:4px;">Soucis signalés</div>
      </div>
    </div>`;

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rapport quotidien — TM Douche Montage</title></head>
<body style="margin:0;padding:0;background:#0a0118;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0118;min-height:100vh;">
    <tr><td align="center" style="padding:32px 16px;">
      <table width="680" cellpadding="0" cellspacing="0" style="max-width:680px;width:100%;">

        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#1a0533 0%,#2d0a5e 50%,#1a0533 100%);border-radius:16px 16px 0 0;padding:32px 32px 24px;">
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <div>
              <div style="font-size:22px;font-weight:800;color:#e9d5ff;letter-spacing:-0.5px;">📊 Rapport quotidien</div>
              <div style="font-size:14px;color:#a78bfa;margin-top:4px;">${dayLabel}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:13px;color:#6b7280;">TM Douche Montage Sàrl</div>
              <div style="font-size:11px;color:#4b5563;margin-top:2px;">Généré automatiquement</div>
            </div>
          </div>
        </td></tr>

        <!-- Stats -->
        <tr><td style="background:#100225;padding:0 32px;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            ${[
              { n: projects.length, label: "Montages", color: "#a78bfa", bg: "rgba(139,92,246,0.15)", border: "rgba(139,92,246,0.3)" },
              { n: formatH(projects.reduce((s, p) => s + totalHours(parseEntries(p.heureArrivee, p.heureDepart)), 0)), label: "Heures", color: "#86efac", bg: "rgba(34,197,94,0.10)", border: "rgba(34,197,94,0.25)" },
              { n: projects.reduce((s, p) => s + (p.nbCabines || 0), 0), label: "Cabines", color: "#fde68a", bg: "rgba(251,191,36,0.10)", border: "rgba(251,191,36,0.25)" },
              { n: projects.filter((p) => p.soucisMontage).length, label: "Soucis", color: "#fca5a5", bg: "rgba(239,68,68,0.10)", border: "rgba(239,68,68,0.25)" },
            ]
              .map(
                (s) =>
                  `<td style="padding:20px 8px 20px ${s === undefined ? "0" : "0"};"><div style="background:${s.bg};border:1px solid ${s.border};border-radius:10px;padding:14px 8px;text-align:center;"><div style="font-size:24px;font-weight:800;color:${s.color};">${s.n}</div><div style="font-size:11px;color:#9ca3af;margin-top:2px;">${s.label}</div></div></td>`
              )
              .join("")}
          </tr></table>
        </td></tr>

        <!-- Table -->
        <tr><td style="background:#100225;padding:0 32px 32px;">
          ${projects.length === 0
            ? `<div style="text-align:center;padding:40px;color:#6b7280;font-size:14px;">Aucun montage exécuté aujourd'hui.</div>`
            : `<table width="100%" cellpadding="0" cellspacing="0" style="border-radius:12px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">
                <thead>
                  <tr style="background:rgba(139,92,246,0.20);">
                    <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:#7c3aed;letter-spacing:.8px;text-transform:uppercase;">Projet</th>
                    <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:#7c3aed;letter-spacing:.8px;text-transform:uppercase;">Collaborateur</th>
                    <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:#7c3aed;letter-spacing:.8px;text-transform:uppercase;">Date</th>
                    <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:#7c3aed;letter-spacing:.8px;text-transform:uppercase;">Heures</th>
                    <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:#7c3aed;letter-spacing:.8px;text-transform:uppercase;">Notes</th>
                  </tr>
                </thead>
                <tbody style="background:#12022a;">
                  ${rows}
                </tbody>
              </table>`}
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#0a0118;border-top:1px solid rgba(255,255,255,0.06);border-radius:0 0 16px 16px;padding:20px 32px;text-align:center;">
          <div style="font-size:12px;color:#4b5563;">TM Douche Montage Sàrl · Rapport généré automatiquement chaque matin à 07h00</div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Telegram summary ─────────────────────────────────────────────────────────

function buildTelegramMessage(projects: Project[], dayLabel: string): string {
  const totalH = projects.reduce(
    (s, p) => s + totalHours(parseEntries(p.heureArrivee, p.heureDepart)),
    0
  );
  const totalCab = projects.reduce((s, p) => s + (p.nbCabines || 0), 0);
  const soucis = projects.filter((p) => p.soucisMontage).length;

  let msg = `📊 <b>Rapport quotidien</b> — ${dayLabel}\n\n`;
  msg += `<b>${projects.length}</b> montage${projects.length > 1 ? "s" : ""}   <b>${formatH(totalH)}</b> heures   <b>${totalCab}</b> cabines`;
  if (soucis > 0) msg += `   ⚠ <b>${soucis}</b> soucis`;
  msg += "\n\n";

  if (projects.length === 0) {
    msg += "Aucun montage exécuté aujourd'hui.";
    return msg;
  }

  for (const p of projects) {
    const entries = parseEntries(p.heureArrivee, p.heureDepart);
    const total = totalHours(entries);
    const dateStr = p.dateMontage ? formatSwissDateFromISO(p.dateMontage) : "—";
    const collab = p.collaborateurs || "—";
    const soucisFlag = p.soucisMontage ? " ⚠" : "";

    msg += `▪ <b>${p.projet || p.ofrTM}</b>${soucisFlag}\n`;
    msg += `  ${collab} · ${dateStr}`;
    if (total > 0) msg += ` · ${formatH(total)}`;
    if (p.nbCabines) msg += ` · ${p.nbCabines} cab.`;
    msg += "\n";
  }
  return msg;
}

// ─── Week label ───────────────────────────────────────────────────────────────

function dayLabel(): string {
  // Report runs at 07:00 — covers the previous calendar day
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const days = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
  const months = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
  return `${days[yesterday.getDay()]} ${yesterday.getDate()} ${months[yesterday.getMonth()]} ${yesterday.getFullYear()}`;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const projects = await fetchWeekMontages();
    const label = dayLabel();

    const results: Record<string, unknown> = { projects: projects.length, label };

    // 1. Email
    try {
      const html = buildEmail(projects, label);
      const emailRes = await resend.emails.send({
        from: "TM Rapport Services <onboarding@resend.dev>",
        to: [ADMIN_EMAIL],
        subject: `📊 Rapport du ${label} — ${projects.length} montage${projects.length !== 1 ? "s" : ""}`,
        html,
      });
      results.email = emailRes.data?.id ? "sent" : "error";
    } catch (e: any) {
      console.error("Email error:", e);
      results.email = `error: ${e.message}`;
    }

    // 2. Telegram
    try {
      const telegramMsg = buildTelegramMessage(projects, label);
      await sendTelegramText(telegramMsg);
      results.telegram = "sent";
    } catch (e: any) {
      console.error("Telegram error:", e);
      results.telegram = `error: ${e.message}`;
    }

    // 3. Push notification
    try {
      const summary =
        projects.length === 0
          ? "Aucun montage aujourd'hui."
          : `${projects.length} montage${projects.length > 1 ? "s" : ""} · ${formatH(
              projects.reduce(
                (s, p) => s + totalHours(parseEntries(p.heureArrivee, p.heureDepart)),
                0
              )
            )} · ${projects.reduce((s, p) => s + (p.nbCabines || 0), 0)} cab.`;

      await sendPushToUser(ADMIN_EMAIL, {
        title: `📊 Rapport du jour — ${projects.length} montage${projects.length !== 1 ? "s" : ""}`,
        message: summary,
        url: "/",
      });
      results.push = "sent";
    } catch (e: any) {
      console.error("Push error:", e);
      results.push = `error: ${e.message}`;
    }

    // 4. In-app notification
    try {
      await createNotification(
        ADMIN_EMAIL,
        "rdv",
        `Rapport du ${label}`,
        `${projects.length} montage${projects.length !== 1 ? "s" : ""} exécuté${projects.length !== 1 ? "s" : ""} hier.`
      );
      results.inApp = "created";
    } catch (e: any) {
      console.error("In-app notif error:", e);
      results.inApp = `error: ${e.message}`;
    }

    return NextResponse.json({ success: true, ...results });
  } catch (e: any) {
    console.error("Rapport hebdo error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
