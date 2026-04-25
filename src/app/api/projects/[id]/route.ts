import { NextRequest, NextResponse } from "next/server";
import { getProject, updateProject } from "@/lib/notion";
import { cachedOrFetch, invalidateCache } from "@/lib/server-cache";
import { cachedJson } from "@/lib/edge-cache";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const project = await cachedOrFetch(`project-${id}`, () => getProject(id));
    // Edge cache court (15 s) car les pages projet sont éditées
    // souvent — mais swr 60 s permet de servir instantanément
    // pendant qu'on rafraîchit en arrière-plan.
    return cachedJson(project, { sMaxAge: 15, swr: 60 });
  } catch (error: any) {
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
    const status = error?.status === 429 ? 429 : error?.code === "notionhq_client_request_timeout" ? 504 : 500;
    console.error(`[PATCH /api/projects/${id}] ${status}:`, error?.message || error);
    return NextResponse.json(
      { error: error.message || "Erreur lors de la mise à jour" },
      { status }
    );
  }
}
