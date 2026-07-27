import { getProjectsCmdTermine } from "@/lib/notion";
import { cachedOrFetch } from "@/lib/server-cache";
import { cachedJson, errorResponse } from "@/lib/edge-cache";

export const revalidate = 30;

export async function GET() {
  try {
    // Servie par Redis (compressé) ; politique longue gérée dans setCache.
    const projects = await cachedOrFetch("projects-cmd-termine", getProjectsCmdTermine);
    return cachedJson(projects);
  } catch (error) {
    return errorResponse(error);
  }
}
