import { getProjectsServices } from "@/lib/notion";
import { cachedOrFetch } from "@/lib/server-cache";
import { cachedJson, errorResponse } from "@/lib/edge-cache";

export const revalidate = 120;

export async function GET() {
  try {
    const projects = await cachedOrFetch("projects-services", getProjectsServices);
    return cachedJson(projects);
  } catch (error) {
    return errorResponse(error);
  }
}
