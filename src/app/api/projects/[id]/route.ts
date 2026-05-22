import { NextRequest, NextResponse } from "next/server";
import { getProject, updateProject } from "@/lib/notion";
import { cachedOrFetch, invalidateCache } from "@/lib/server-cache";
import { cachedJson } from "@/lib/edge-cache";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const project = await cachedOrFetch(`project-${id}`, () => getProject(id));
    // CDN : 60 s frais → 300 s stale-while-revalidate.
    // Réduit drastiquement les appels Notion lors des pics de trafic.
    return cachedJson(project, { sMaxAge: 60, swr: 300 });
  } catch (error: any) {
    const isRateLimit = error?.status === 429 || error?.code === "rate_limited";
    if (isRateLimit) {
      console.warn("[GET /api/projects/[id]] Notion rate limit, retrying later");
      return NextResponse.json(
        { error: "Service temporairement surchargé. Réessayez dans quelques secondes." },
        { status: 503, headers: { "Retry-After": "15", "Cache-Control": "no-store" } }
      );
    }
    console.error("Error fetching project:", error);
    return NextResponse.json(
      { error: error.message || "Projet introuvable" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let id = "unknown";
  try {
    id = (await params).id;
    const body = await request.json();
    await updateProject(id, body);
    // Invalider le cache après mise à jour
    invalidateCache(`project-${id}`);
    invalidateCache("projects");
    invalidateCache("projects-mesures");
    return NextResponse.json({ success: true });
  } catch (error: any) {
    const isRateLimit = error?.status === 429 || error?.code === "rate_limited";
    const isTimeout = error?.code === "notionhq_client_request_timeout";
    const status = isRateLimit ? 429 : isTimeout ? 504 : 500;
    const message = isRateLimit
      ? "Notion est momentanément surchargé. Réessayez dans quelques secondes."
      : isTimeout
      ? "La requête a expiré. Réessayez."
      : error.message || "Erreur lors de la mise à jour";
    console.error(`[PATCH /api/projects/${id}] ${status}:`, error?.message || error);
    return NextResponse.json({ error: message }, { status });
  }
}
