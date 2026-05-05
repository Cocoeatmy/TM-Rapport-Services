import { NextRequest, NextResponse } from "next/server";
import { notion, databaseId, mapPageToProject, type Project } from "@/lib/notion";
import { createNotification } from "@/app/api/notifications/route";
import { getData, setData } from "@/lib/kv-store";
import { sendPushToUser } from "@/lib/send-push";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Mapping prénom (tel qu'enregistré dans la colonne Notion
// "Collaborateurs montages") → email du compte applicatif. Sert à
// adresser la notif au bon utilisateur.
const COLLABORATOR_EMAILS: Record<string, string> = {
  Claudio: "tm.douche.montage.1@gmail.com",
  "Jean-Marc": "tm.douche.montage.2@gmail.com",
  Jacobo: "tm.douche.montage.3@gmail.com",
  Miguel: "tm.douche.montage.4@gmail.com",
  Loïc: "tm.douche.montage.5@gmail.com",
  Micael: "ferreira.micael@gmail.com",
};

interface ReminderSent {
  key: string; // `${dateISO}|${projectId}|${kind}`
  timestamp: number;
}

const SENT_KEY = "rdv-reminders-sent";

/** Date du jour en Suisse au format YYYY-MM-DD. */
function todayInSwiss(now: Date): string {
  const fmt = new Intl.DateTimeFormat("fr-CH", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(now);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${d}`;
}

/** Heure du jour en minutes depuis minuit, en Suisse. */
function nowMinutesInSwiss(now: Date): number {
  const fmt = new Intl.DateTimeFormat("fr-CH", {
    timeZone: "Europe/Zurich",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = fmt.formatToParts(now);
  const h = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
  const m = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);
  return h * 60 + m;
}

/** Extrait la première heure HH:MM trouvée dans une chaîne (gère les
 *  formats "08:00", "Cab1:08:00 | Cab2:09:30", "2026-04-25 Claudio 08:00 | ..."). */
function firstTimeMinutes(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = /\b(\d{1,2}):(\d{2})\b/.exec(raw);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (isNaN(h) || isNaN(min) || h > 23 || min > 59) return null;
  return h * 60 + min;
}

function extractDateOnly(iso: string | null): string | null {
  if (!iso) return null;
  return iso.split("T")[0];
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const urlSecret = new URL(request.url).searchParams.get("secret");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}` &&
    urlSecret !== process.env.CRON_SECRET
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const todayStr = todayInSwiss(now);
  const nowMin = nowMinutesInSwiss(now);

  try {
    const response = await notion.databases.query({
      database_id: databaseId,
      filter: {
        property: "Date Montage",
        date: { equals: todayStr },
      },
    });
    const projects: Project[] = response.results.map(mapPageToProject);

    if (projects.length === 0) {
      return NextResponse.json({ ok: true, reminders30: 0, lateAlerts: 0, projects: 0 });
    }

    // Index des projets par monteur (email) pour pouvoir trouver
    // le prochain RDV en cas de retard.
    const projectsByEmail = new Map<string, { project: Project; startMin: number }[]>();
    for (const p of projects) {
      const startMin = firstTimeMinutes(p.heureArrivee);
      if (startMin === null) continue;
      // Filtre : on ne traite que les projets dont la date du
      // dateMontage tombe sur aujourd'hui (la requête Notion le fait
      // déjà mais double-sécurité contre les fuseaux).
      if (extractDateOnly(p.dateMontage) !== todayStr) continue;
      const collabNames = (p.collaborateurs || "")
        .split(/[&,]/)
        .map((s) => s.trim())
        .filter(Boolean);
      for (const name of collabNames) {
        const email = COLLABORATOR_EMAILS[name];
        if (!email) continue;
        const list = projectsByEmail.get(email) || [];
        list.push({ project: p, startMin });
        projectsByEmail.set(email, list);
      }
    }
    // Tri par heure de début pour chaque monteur
    for (const list of projectsByEmail.values()) {
      list.sort((a, b) => a.startMin - b.startMin);
    }

    const sent = await getData<ReminderSent>(SENT_KEY);
    const sentKeys = new Set(sent.map((s) => s.key));
    const newSent: ReminderSent[] = [...sent];

    let reminders30 = 0;
    let lateAlerts = 0;

    for (const [email, list] of projectsByEmail.entries()) {
      for (let i = 0; i < list.length; i++) {
        const { project, startMin } = list[i];
        const minutesUntil = startMin - nowMin;

        // 1. Rappel 30 min avant : fenêtre 25..35 min pour absorber la
        //    granularité du cron (toutes les 5 min). Dédup via KV.
        if (minutesUntil >= 25 && minutesUntil <= 35) {
          const key = `${todayStr}|${project.id}|reminder30`;
          if (!sentKeys.has(key)) {
            const startTime = `${String(Math.floor(startMin / 60)).padStart(2, "0")}:${String(startMin % 60).padStart(2, "0")}`;
            const addr = project.adresseChantier ? ` — ${project.adresseChantier}` : "";
            const title = `⏰ RDV dans 30 min · ${startTime}`;
            const message = `${project.projet}${addr}`;

            // Notif in-app (cloche)
            await createNotification(email, "rdv", title, message, project.id);

            // Push native (même app fermée)
            await sendPushToUser(email, {
              title,
              message,
              url: `/projet/${project.id}`,
              urgent: false,
            }).catch(() => {});

            newSent.push({ key, timestamp: Date.now() });
            sentKeys.add(key);
            reminders30++;
          }
        }

        // 2. Détection de retard : si l'heure d'arrivée est dépassée
        //    de plus de 15 min, et qu'il y a un RDV suivant dans
        //    moins de 2 h, on envoie une alerte avec le contact du
        //    prochain RDV pour qu'on puisse appeler le client suivant
        //    et le prévenir.
        const minutesLate = nowMin - startMin;
        if (minutesLate >= 15 && minutesLate <= 60) {
          const next = list[i + 1];
          if (next) {
            const gapToNext = next.startMin - nowMin;
            if (gapToNext > 0 && gapToNext <= 120) {
              const key = `${todayStr}|${project.id}|late-call-next`;
              if (!sentKeys.has(key)) {
                const nextStart = `${String(Math.floor(next.startMin / 60)).padStart(2, "0")}:${String(next.startMin % 60).padStart(2, "0")}`;
                const nextContact = next.project.contactsRDV || next.project.contacts || "";
                const tail = nextContact ? ` · ${nextContact}` : "";
                const lateTitle = `⚠️ Retard — Prévenez le client suivant`;
                const lateMsg = `RDV à ${nextStart} : ${next.project.projet}${tail}`;

                // Notif in-app
                await createNotification(
                  email, "rdv", lateTitle, lateMsg, next.project.id,
                );

                // Push native urgente
                await sendPushToUser(email, {
                  title: lateTitle,
                  message: lateMsg,
                  url: `/projet/${next.project.id}`,
                  urgent: true,
                }).catch(() => {});

                newSent.push({ key, timestamp: Date.now() });
                sentKeys.add(key);
                lateAlerts++;
              }
            }
          }
        }
      }
    }

    // Purge : on garde les notifs du jour + de la veille (élimine la
    // dérive sans risque de re-notifier).
    const cutoff = Date.now() - 36 * 3600 * 1000;
    const trimmed = newSent.filter((s) => s.timestamp >= cutoff);
    await setData(SENT_KEY, trimmed);

    return NextResponse.json({
      ok: true,
      reminders30,
      lateAlerts,
      projects: projects.length,
      todayStr,
    });
  } catch (error: any) {
    console.error("[CRON RDV-REMINDERS] Failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
