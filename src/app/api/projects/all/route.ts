import { getAllProjectsRaw } from "@/lib/notion";
import { cachedOrFetch } from "@/lib/server-cache";
import { cachedJson, errorResponse } from "@/lib/edge-cache";

export const revalidate = 30;

export async function GET() {
  try {
    const projects = await cachedOrFetch("projects-all-raw", getAllProjectsRaw);
    return cachedJson(projects, { sMaxAge: 30, swr: 120 });
  } catch (error) {
    return errorResponse(error);
  }
}
