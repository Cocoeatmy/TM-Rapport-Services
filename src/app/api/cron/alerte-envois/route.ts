import { NextRequest, NextResponse } from "next/server";
import { CLE_NOMS, lireHash, listerAppareils } from "@/lib/appareils";
import { lignesAlerte, resumeLigne } from "@/lib/alerte-envois";
import { sendEmail } from "@/lib/email";
import { sendPushToUser } from "@/lib/send-push";
import { lireJeton } from "@/lib/bexio";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Chaque matin à 7 h (heure suisse) : les envois bloqués sur les appareils,
 * par e-mail et notification au propriétaire. Rien de bloqué : rien d'envoyé.
 */
function heureSuisse(): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Zurich", hour: "2-digit", hour12: false }).format(new Date()));
}

export async function GET(request: NextRequest) {
  const CRON = process.env.CRON_SECRET;
  const secret = request.nextUrl.searchParams.get("secret");
  if (CRON && request.headers.get("authorization") !== `Bearer ${CRON}` && secret !== CRON) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const force = !!CRON && secret === CRON && request.nextUrl.searchParams.get("force") === "1";
  // Deux déclenchements (été / hiver) : seul celui de 7 h suisse envoie.
  if (!force && heureSuisse() !== 7) return NextResponse.json({ skipped: true, reason: "hors fenêtre 7 h" });

  const maintenant = Date.now();
  const [appareils, noms] = await Promise.all([listerAppareils(maintenant), lireHash(CLE_NOMS)]);
  const lignes = lignesAlerte(appareils, noms);
  if (lignes.length === 0) return NextResponse.json({ ok: true, alertes: 0 });

  const destinataire = process.env.ALERTE_ENVOIS_EMAIL || (await lireJeton().catch(() => null))?.par || "ferreira.micael@gmail.com";
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://tm-rapport-services.vercel.app";
  const texte = lignes.map((l) => resumeLigne(l, maintenant));
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;color:#0f172a">
      <p><b>Des envois attendent sur ${lignes.length} appareil${lignes.length > 1 ? "s" : ""}.</b></p>
      <ul>${texte.map((t) => `<li style="margin:4px 0">${t.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string))}</li>`).join("")}</ul>
      <p>Ils partiront dès que l'appareil sera ouvert avec du réseau. Pour les relancer à distance :
      <a href="${base}/admin/appareils">page Appareils</a>.</p>
    </div>`;
  const mail = await sendEmail(destinataire, `TM Rapport — ${lignes.length} appareil${lignes.length > 1 ? "s" : ""} avec des envois bloqués`, html);
  try {
    await sendPushToUser(destinataire, {
      title: "Envois bloqués sur des appareils",
      message: texte.slice(0, 3).join(" · ") + (texte.length > 3 ? ` · +${texte.length - 3}` : ""),
      url: "/admin/appareils",
    });
  } catch { /* la notification est un plus ; l'e-mail suffit */ }
  return NextResponse.json({ ok: true, alertes: lignes.length, mail: mail.success });
}
