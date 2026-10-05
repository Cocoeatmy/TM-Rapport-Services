import { getProjectsServicesTermine } from "@/lib/notion";
import { cachedOrFetch } from "@/lib/server-cache";
import { cachedJson, errorResponse } from "@/lib/edge-cache";

export const revalidate = 30;
export const maxDuration = 60;

export async function GET() {
  try {
    const projects = await cachedOrFetch("projects-services-termine", getProjectsServicesTermine);
    return cachedJson(projects);
  } catch (error) {
    return errorResponse(error);
  }
}
