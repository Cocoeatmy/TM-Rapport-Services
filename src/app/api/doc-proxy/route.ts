/**
 * /api/doc-proxy?u=<url Cloudinary>
 *
 * Sert un document (PDF/…) Cloudinary en le récupérant côté serveur puis en le
 * renvoyant avec les bons en-têtes (Content-Type + inline).
 *
 * Ce compte Cloudinary RESTREINT la diffusion des PDF/documents en URL non
 * signée (HTTP 401), en `image` comme en `raw`, et même une URL de diffusion
 * signée est refusée. On récupère donc le fichier via plusieurs voies, la plus
 * fiable étant l'API de TÉLÉCHARGEMENT AUTHENTIFIÉE (private_download_url), qui
 * fonctionne pour les ressources dont la diffusion est restreinte.
 *
 * Sécurité : réservé aux URLs res.cloudinary.com en entrée (pas de SSRF) et
 * protégé par le cookie d'auth (route non publique dans le middleware).
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

  // Parse : /{cloud}/{resource_type}/{type}/[transf/]v{version}/{public_id}.{ext}
  const parts = url.pathname.split("/").filter(Boolean);
  const resourceType = parts[1] || "image";
  const deliveryType = parts[2] || "upload";
  const vIdx = parts.findIndex((p) => /^v\d+$/.test(p));
  const version = vIdx >= 0 ? parts[vIdx].slice(1) : undefined;
  const publicWithExt = parts.slice(vIdx >= 0 ? vIdx + 1 : 3).join("/");
  const extMatch = publicWithExt.match(/\.([a-z0-9]+)$/i);
  const ext = extMatch ? extMatch[1] : "";
  const publicIdNoExt = ext ? publicWithExt.slice(0, -(ext.length + 1)) : publicWithExt;
  // `raw` : le public_id inclut l'extension ; image/vidéo : non.
  const publicIdForDelivery = resourceType === "raw" ? publicWithExt : publicIdNoExt;

  const candidates: { label: string; url: string }[] = [];
  // 1) Téléchargement authentifié (API) — marche même si la diffusion est restreinte.
  //    Pour `raw`, le public_id inclut l'extension et le format doit être vide ;
  //    pour image/vidéo, public_id sans extension + format séparé.
  const dlVariants = resourceType === "raw"
    ? [{ pid: publicWithExt, fmt: "" }, { pid: publicIdNoExt, fmt: ext }]
    : [{ pid: publicIdNoExt, fmt: ext }];
  for (const v of dlVariants) {
    try {
      const d = cloudinary.utils.private_download_url(v.pid, v.fmt, {
        resource_type: resourceType as any,
        type: deliveryType,
      } as any);
      if (d) candidates.push({ label: `download(${v.fmt || "noext"})`, url: d });
    } catch { /* ignore */ }
  }
  // 2) URL de diffusion signée.
  try {
    const s = cloudinary.utils.url(publicIdForDelivery, {
      resource_type: resourceType as any,
      type: deliveryType,
      version,
      format: resourceType === "raw" ? undefined : ext || undefined,
      sign_url: true,
      secure: true,
    });
    if (s) candidates.push({ label: "signed", url: s });
  } catch { /* ignore */ }
  // 3) URL brute (au cas où).
  candidates.push({ label: "raw", url: url.toString() });

  let upstream: Response | null = null;
  const diag: string[] = [];
  for (const c of candidates) {
    try {
      const r = await fetch(c.url, { cache: "no-store" });
      diag.push(`${c.label}:${r.status}`);
      if (r.ok && r.body) { upstream = r; break; }
    } catch (e: any) {
      diag.push(`${c.label}:ERR`);
    }
  }
  if (!upstream) {
    return NextResponse.json({ error: "récupération impossible", diag }, { status: 502 });
  }

  const contentType = CONTENT_TYPES[ext.toLowerCase()] || upstream.headers.get("content-type") || "application/octet-stream";
  const filename = decodeURIComponent(publicWithExt.split("/").pop() || "document");

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `${dl ? "attachment" : "inline"}; filename="${filename}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
