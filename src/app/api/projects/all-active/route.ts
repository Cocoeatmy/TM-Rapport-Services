import { getAllActiveProjects } from "@/lib/notion";
import { cachedOrFetch } from "@/lib/server-cache";
import { cachedJson, errorResponse } from "@/lib/edge-cache";

export const revalidate = 120;

export async function GET() {
  try {
    const projects = await cachedOrFetch("projects-all-active", getAllActiveProjects);
    return cachedJson(projects, { sMaxAge: 30, swr: 120 });
  } catch (error) {
    return errorResponse(error);
  }
}
