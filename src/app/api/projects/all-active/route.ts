import { getAllActiveProjects } from "@/lib/notion";
import { cachedOrFetch } from "@/lib/server-cache";
import { errorResponse } from "@/lib/edge-cache";
import { reponseProjets } from "@/lib/perimetre-serveur";

export const revalidate = 30;

export async function GET(request: Request) {
  try {
    const fresh = new URL(request.url).searchParams.has("fresh");
    // Servie par Redis (compressé) ; politique longue gérée dans setCache.
    const projects = await cachedOrFetch("projects-all-active", getAllActiveProjects, fresh);
    return reponseProjets(projects, fresh ? { noStore: true } : { sMaxAge: 30, swr: 120 });
  } catch (error) {
    return errorResponse(error);
  }
}
