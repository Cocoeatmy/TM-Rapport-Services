/**
 * /api/doc-proxy?u=<url Cloudinary>
 *
 * Sert un document (PDF/document) hébergé sur Cloudinary en le récupérant côté
 * serveur puis en le renvoyant avec les bons en-têtes (Content-Type + inline).
 *
 * Pourquoi : les PDF uploadés en resource_type `raw` se diffusent bien (200)
 * mais le lecteur PDF intégré de Chrome échoue à les streamer directement
 * (« Échec de chargement du document PDF »). Ajouter `fl_attachment` renverrait
 * un 401 quand le compte Cloudinary a les transformations strictes activées.
 * En passant par ce proxy (même origine, réponse complète, en-têtes corrects),
 * le PDF s'ouvre normalement.
 *
 * Sécurité : réservé aux URLs res.cloudinary.com (pas de proxy ouvert / SSRF)
 * et protégé par le cookie d'auth (route non publique dans le middleware).
 */
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CONTENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  mp4: "video/mp4",
  mov: "video/quicktime",
};

export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get("u") || "";
  const dl = req.nextUrl.searchParams.get("dl") === "1"; // forcer le téléchargement
  let url: URL;
  try {
    url = new URL(u);
  } catch {
    return NextResponse.json({ error: "url invalide" }, { status: 400 });
  }
  if (url.hostname !== "res.cloudinary.com") {
    return NextResponse.json({ error: "hôte non autorisé" }, { status: 403 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(url.toString(), { cache: "no-store" });
  } catch {
    return NextResponse.json({ error: "récupération impossible" }, { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: `amont ${upstream.status}` }, { status: 502 });
  }

  const ext = (url.pathname.split(".").pop() || "").toLowerCase();
  const contentType = CONTENT_TYPES[ext] || upstream.headers.get("content-type") || "application/octet-stream";
  const filename = decodeURIComponent(url.pathname.split("/").pop() || "document");

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `${dl ? "attachment" : "inline"}; filename="${filename}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
