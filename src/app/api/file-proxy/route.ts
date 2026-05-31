import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { notion as notionClient } from "@/lib/notion";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Proxy de fichiers Notion — retourne le contenu binaire du fichier
 * (pas une redirection) afin que le Service Worker puisse le mettre
 * en cache à une URL stable pour la consultation hors-ligne.
 *
 * URL stable : /api/file-proxy?projectId=XXX&field=Documents+pour+Montage&index=0
 * → Notion URLs expirent (~1h), cette URL est permanente.
 */
export async function GET(request: NextRequest) {
  // Auth requise — seuls les collaborateurs connectés accèdent aux documents
  const token = request.cookies.get("auth-token")?.value;
  if (!token) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const user = await verifyToken(token);
  if (!user) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    const projectId = request.nextUrl.searchParams.get("projectId");
    const field     = request.nextUrl.searchParams.get("field");
    const index     = parseInt(request.nextUrl.searchParams.get("index") || "0", 10);

    if (!projectId || !field) {
      return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
    }

    // Récupère l'URL fraîche depuis Notion
    const page = await notionClient.pages.retrieve({ page_id: projectId }) as any;
    const prop = page.properties[field];

    if (!prop || prop.type !== "files" || !prop.files?.length) {
      return NextResponse.json({ error: "Fichier introuvable" }, { status: 404 });
    }

    const file = prop.files[index];
    if (!file) {
      return NextResponse.json({ error: "Index hors limites" }, { status: 404 });
    }

    const freshUrl = file.type === "external" ? file.external?.url : file.file?.url;
    if (!freshUrl) {
      return NextResponse.json({ error: "URL introuvable" }, { status: 404 });
    }

    const fileName = file.name || `document-${index}`;

    // Télécharge le contenu réel du fichier depuis Notion
    const fileResponse = await fetch(freshUrl);
    if (!fileResponse.ok) {
      return NextResponse.json({ error: "Impossible de récupérer le fichier" }, { status: 502 });
    }

    const contentType = fileResponse.headers.get("content-type") || "application/octet-stream";
    const body = await fileResponse.arrayBuffer();

    // Retourne les bytes avec une URL stable — le SW peut cacher cette réponse.
    // CDN Vercel ne cache pas (données personnelles), mais le SW le peut.
    return new NextResponse(body, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${encodeURIComponent(fileName)}"`,
        "Cache-Control": "public, max-age=0, must-revalidate",
        "Vercel-CDN-Cache-Control": "no-store",
        "CDN-Cache-Control": "no-store",
      },
    });
  } catch (error: any) {
    console.error("File proxy error:", error);
    return NextResponse.json({ error: error.message || "Erreur" }, { status: 500 });
  }
}
