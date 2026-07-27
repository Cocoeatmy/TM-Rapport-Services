import { getAllActiveProjects } from "@/lib/notion";
import { cachedOrFetch, cachedOrFetchLong } from "@/lib/server-cache";
import { cachedJson, errorResponse } from "@/lib/edge-cache";

export const revalidate = 30;

export async function GET(request: Request) {
  try {
    const fresh = new URL(request.url).searchParams.has("fresh");
    // Liste lourde qui change lentement → cache long (10 min / 2 h) hors refresh
    // manuel, pour limiter la charge Notion (évite le rate-limit).
    const projects = fresh
      ? await cachedOrFetch("projects-all-active", getAllActiveProjects, true)
      : await cachedOrFetchLong("projects-all-active", getAllActiveProjects);
    return cachedJson(projects, fresh ? { noStore: true } : { sMaxAge: 30, swr: 120 });
  } catch (error) {
    return errorResponse(error);
  }
}
