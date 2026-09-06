/**
 * /api/doc-proxy?u=<url Cloudinary>
 *
 * Sert un document (PDF/…) hébergé sur Cloudinary en le récupérant côté serveur
 * puis en le renvoyant avec les bons en-têtes (Content-Type + inline).
 *
 * Pourquoi : ce compte Cloudinary RESTREINT la diffusion des PDF/documents en
 * URL non signée (HTTP 401), en resource_type `image` COMME `raw`. Le proxy
 * régénère donc une URL SIGNÉE côté serveur (secret API) — les URL signées
 * contournent la restriction — puis récupère le fichier et le renvoie.
 *
 * Sécurité : réservé aux URLs res.cloudinary.com (pas de proxy ouvert / SSRF)
 * et protégé par le cookie d'auth (route non publique dans le middleware).
 */
import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const CONTENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  mp4: "video/mp4",
  mov: "video/quicktime",
};

/** Reconstruit une URL de diffusion SIGNÉE à partir d'une URL Cloudinary. */
function signedFromUrl(url: URL): string | null {
  // /{cloud}/{resource_type}/{type}/[transf/]v{version}/{public_id}.{ext}
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 4) return null;
  const resourceType = parts[1];              // raw | image | video
  const deliveryType = parts[2];              // upload
  const vIdx = parts.findIndex((p) => /^v\d+$/.test(p));
  const publicParts = parts.slice(vIdx >= 0 ? vIdx + 1 : 3);
  let publicId = publicParts.join("/");
  const version = vIdx >= 0 ? parts[vIdx].slice(1) : undefined;
  let format: string | undefined;
  // Pour `raw`, l'extension fait partie du public_id ; pour image/video, non.
  if (resourceType !== "raw") {
    const m = publicId.match(/\.([a-z0-9]+)$/i);
    if (m) { format = m[1]; publicId = publicId.slice(0, -(m[1].length + 1)); }
  }
  return cloudinary.utils.url(publicId, {
    resource_type: resourceType,
    type: deliveryType,
    version,
    format,
    sign_url: true,
    secure: true,
  });
}

export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get("u") || "";
  const dl = req.nextUrl.searchParams.get("dl") === "1";
  let url: URL;
  try {
    url = new URL(u);
  } catch {
    return NextResponse.json({ error: "url invalide" }, { status: 400 });
  }
  if (url.hostname !== "res.cloudinary.com") {
    return NextResponse.json({ error: "hôte non autorisé" }, { status: 403 });
  }

  // On tente d'abord l'URL signée (contourne la restriction), puis l'URL brute.
  const signed = signedFromUrl(url);
  const candidates = [signed, url.toString()].filter(Boolean) as string[];
  let upstream: Response | null = null;
  const diag: string[] = [];
  for (const target of candidates) {
    try {
      const r = await fetch(target, { cache: "no-store" });
      diag.push(`${r.status} ${target.replace(/s--[^/]+--/, "s--…--")}`);
      if (r.ok && r.body) { upstream = r; break; }
    } catch (e: any) {
      diag.push(`ERR ${String(e?.message || e)}`);
    }
  }
  if (!upstream) {
    return NextResponse.json({ error: "récupération impossible", diag }, { status: 502 });
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
