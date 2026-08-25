/**
 * /api/fiche/[id]/docs?s=<sig>  → page HTML listant TOUS les documents
 * « Documents pour Montage » (mesures). Ouverte depuis la flèche du PDF Fiche.
 *
 * Publique (middleware /api/fiche) mais protégée : signature HMAC (signFiche)
 * OU cookie admin. Chaque document ouvre le proxy /api/doc (URL Notion fraîche).
 */
import { NextRequest, NextResponse } from "next/server";
import { getProject } from "@/lib/notion";
import { verifyToken } from "@/lib/auth";
import { signFiche, docLink } from "@/lib/doc-link";
import { timingSafeEqual } from "crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function esc(s: string): string {
  return (s || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string),
  );
}

async function isAuthed(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get("auth-token")?.value;
  if (!token) return false;
  try { return !!(await verifyToken(token)); } catch { return false; }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const s = req.nextUrl.searchParams.get("s") || "";
  const secret = process.env.SHARE_LINK_KEY || "";

  const sigValid = (() => {
    if (!secret || !s) return false;
    const a = Buffer.from(s);
    const b = Buffer.from(signFiche(id));
    return a.length === b.length && timingSafeEqual(a, b);
  })();
  if (!sigValid && !(await isAuthed(req))) {
    return new NextResponse("Accès refusé", { status: 403 });
  }

  let project: Awaited<ReturnType<typeof getProject>>;
  try {
    project = await getProject(id);
  } catch {
    return new NextResponse("Projet introuvable", { status: 404 });
  }

  const origin = req.nextUrl.origin;
  const docs = project.documentsMontagee || [];
  const tm = esc(project.ofrTM || "");
  const nom = esc(project.projet || "");

  const cards = docs
    .map((f, i) => {
      const name = esc(f.name || `Document ${i + 1}`);
      const proxy = esc(docLink(id, "montage", i, origin)); // URL fraîche au clic
      const isImg = /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(f.name || f.url || "");
      const thumb = isImg
        ? `<img src="${esc(f.url)}" loading="lazy" alt="${name}" />`
        : `<div class="file">📄</div>`;
      return `<a class="card" href="${proxy}" target="_blank" rel="noopener">${thumb}<span>${name}</span></a>`;
    })
    .join("");

  const body = docs.length
    ? `<div class="grid">${cards}</div>`
    : `<p class="empty">Aucun document dans « Documents pour Montage ».</p>`;

  const html = `<!doctype html>
<html lang="fr"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Mesures — ${tm}</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin:0; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; background:#f4f6fa; color:#1a1a1a; }
  header { background:#1e3a5f; color:#fff; padding:16px 20px; }
  header h1 { margin:0; font-size:18px; }
  header p { margin:4px 0 0; font-size:13px; opacity:.85; }
  main { padding:16px; max-width:1200px; margin:0 auto; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:12px; }
  .card { display:flex; flex-direction:column; text-decoration:none; color:inherit; background:#fff; border:1px solid #e3e8f0; border-radius:12px; overflow:hidden; transition:box-shadow .15s, transform .15s; }
  .card:hover { box-shadow:0 6px 18px rgba(0,0,0,.12); transform:translateY(-2px); }
  .card img { width:100%; height:150px; object-fit:cover; display:block; background:#eef1f6; }
  .card .file { height:150px; display:flex; align-items:center; justify-content:center; font-size:44px; background:#eef1f6; }
  .card span { padding:8px 10px; font-size:12px; font-weight:600; word-break:break-word; }
  .empty { text-align:center; color:#888; padding:40px; }
  @media (prefers-color-scheme: dark){ body{background:#0f172a;color:#e2e8f0} .card{background:#1e293b;border-color:#334155} .card img,.card .file{background:#0f172a} }
</style>
</head><body>
<header><h1>Mesures — ${tm}</h1><p>${nom}</p></header>
<main>${body}</main>
</body></html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
