import { getAllActiveProjects } from "@/lib/notion";
import { cachedOrFetch } from "@/lib/server-cache";
import { cachedJson, errorResponse } from "@/lib/edge-cache";

export const revalidate = 30;

export async function GET(request: Request) {
  try {
    const fresh = new URL(request.url).searchParams.has("fresh");
    const projects = await cachedOrFetch("projects-all-active", getAllActiveProjects, fresh);
    return cachedJson(projects, fresh ? { noStore: true } : { sMaxAge: 30, swr: 120 });
  } catch (error) {
    return errorResponse(error);
  }
}
