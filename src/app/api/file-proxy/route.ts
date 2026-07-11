import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { notion as notionClient } from "@/lib/notion";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Proxy de fichiers Notion — REDIRIGE (302) vers l'URL fraîche Notion/S3.
 *
 * URL stable : /api/file-proxy?projectId=XXX&field=Documents+pour+Montage&index=0
 * → Notion URLs expirent (~1h), cette URL-ci est permanente et re-signe à
 *   chaque appel.
 *
 * Pourquoi une redirection et non plus le contenu binaire :
 * avant, on téléchargeait TOUT le PDF depuis Notion vers Vercel
 * (`arrayBuffer()`) PUIS on le renvoyait au navigateur → double transfert de
 * plusieurs Mo + latence, très lent sur mobile. Avec la redirection, le
 * navigateur charge le PDF DIRECTEMENT depuis le CDN S3 de Notion (rendu
 * progressif, quasi instantané). On perd la mise en cache hors-ligne des
 * octets par le SW, mais la vitesse de consultation prime.
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

    // Redirection 302 vers l'URL fraîche : le navigateur télécharge le fichier
    // directement depuis le CDN S3 de Notion (rapide, rendu progressif du PDF).
    // 302 non mis en cache → chaque ouverture re-signe une URL valide.
    return NextResponse.redirect(freshUrl, {
      status: 302,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: any) {
    console.error("File proxy error:", error);
    return NextResponse.json({ error: error.message || "Erreur" }, { status: 500 });
  }
}
