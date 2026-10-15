/**
 * /m/<token>  → documents de prise de mesures du projet.
 *
 * Lien COURT pour les notes des RDV « Mesures » du calendrier. `token` =
 * base64url de l'id Notion du projet (même jeton que /client/<token>). Lit le
 * champ Notion « Documents pour prise de mesures » (FRAIS → URLs valides) :
 * - 0 doc  → 404 texte,
 * - 1 doc  → redirection (302) vers le fichier,
 * - N docs → page HTML listant les liens de téléchargement.
 * Route publique (voir middleware.ts).
 */
import { NextRequest, NextResponse } from "next/server";
import { getProject } from "@/lib/notion";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function escapeHtml(s: string): string {
  return String(s || "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string
  ));
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let id = "";
  try { id = Buffer.from(token, "base64url").toString("utf8"); } catch {}
  if (!id) return new NextResponse("not found", { status: 404 });

  let docs: { name: string; url: string }[] = [];
  let projet = "";
  try {
    const p = await getProject(id);
    docs = (p.documentsMesures || []).filter((d) => d && d.url);
    projet = p.projet || "";
  } catch {
    return new NextResponse("Projet introuvable.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  if (docs.length === 0) {
    return new NextResponse("Aucun document de prise de mesures pour ce projet.", {
      status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  if (docs.length === 1) {
    return NextResponse.redirect(docs[0].url, { status: 302, headers: { "Cache-Control": "no-store" } });
  }
  const items = docs.map((d, i) =>
    `<li><a href="${escapeHtml(d.url)}" target="_blank" rel="noopener">${escapeHtml(d.name || `Document ${i + 1}`)}</a></li>`
  ).join("");
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8">`
    + `<meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<title>Documents de mesures</title></head>`
    + `<body style="font-family:system-ui,-apple-system,sans-serif;padding:24px;max-width:680px;margin:0 auto;color:#1a1a1a">`
    + `<h2 style="color:#1e3a5f">Documents pour prise de mesures</h2>`
    + (projet ? `<p style="color:#555">${escapeHtml(projet)}</p>` : "")
    + `<ul style="line-height:2.2;font-size:17px">${items}</ul>`
    + `</body></html>`;
  return new NextResponse(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
