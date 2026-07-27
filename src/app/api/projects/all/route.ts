import { getAllProjectsRaw } from "@/lib/notion";
import { cachedOrFetchLong } from "@/lib/server-cache";
import { cachedJson, errorResponse } from "@/lib/edge-cache";

export const revalidate = 30;

export async function GET() {
  try {
    // Liste TRÈS lourde (~1350 projets) qui change lentement → cache long
    // (10 min / 2 h) pour limiter la charge Notion (évite le rate-limit qui
    // vidait "Projets en cours" / "Archives").
    const projects = await cachedOrFetchLong("projects-all-raw", getAllProjectsRaw);
    return cachedJson(projects, { sMaxAge: 30, swr: 120 });
  } catch (error) {
    return errorResponse(error);
  }
}
