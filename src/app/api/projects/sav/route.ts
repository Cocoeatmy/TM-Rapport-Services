import { getProjectsSAV } from "@/lib/notion";
import { cachedOrFetch } from "@/lib/server-cache";
import { errorResponse } from "@/lib/edge-cache";
import { reponseProjets } from "@/lib/perimetre-serveur";

export const revalidate = 30;

export async function GET(request: Request) {
  try {
    const fresh = new URL(request.url).searchParams.has("fresh");
    const projects = await cachedOrFetch("projects-sav", getProjectsSAV, fresh);
    return reponseProjets(projects, fresh ? { noStore: true } : undefined);
  } catch (error) {
    return errorResponse(error);
  }
}
