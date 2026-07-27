import { getAllProjectsRaw } from "@/lib/notion";
import { cachedOrFetch } from "@/lib/server-cache";
import { cachedJson, errorResponse } from "@/lib/edge-cache";

export const revalidate = 30;

export async function GET() {
  try {
    // Liste TRÈS lourde (~1350 projets → "Projets en cours" / "Archives").
    // Servie par Redis (compressé) ; politique longue (10 min / 2 h) gérée dans
    // setCache pour limiter la charge Notion.
    const projects = await cachedOrFetch("projects-all-raw", getAllProjectsRaw);
    return cachedJson(projects, { sMaxAge: 30, swr: 120 });
  } catch (error) {
    return errorResponse(error);
  }
}
