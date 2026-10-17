import { getProjectsSavTermine } from "@/lib/notion";
import { cachedOrFetch } from "@/lib/server-cache";
import { cachedJson, errorResponse } from "@/lib/edge-cache";
import { reponseProjets } from "@/lib/perimetre-serveur";

export const revalidate = 30;
export const maxDuration = 60;

export async function GET() {
  try {
    const projects = await cachedOrFetch("projects-sav-termine", getProjectsSavTermine);
    return reponseProjets(projects);
  } catch (error) {
    return errorResponse(error);
  }
}
