import { getProjectsMesuresSansCommande } from "@/lib/notion";
import { cachedOrFetchLong } from "@/lib/server-cache";
import { cachedJson, errorResponse } from "@/lib/edge-cache";

export const revalidate = 30;

export async function GET() {
  try {
    // Liste lourde qui change lentement → cache long (10 min frais / 2 h) pour
    // limiter la charge Notion (évite le rate-limit qui vidait la tuile).
    const projects = await cachedOrFetchLong(
      "projects-mesures-sans-commande",
      getProjectsMesuresSansCommande,
    );
    return cachedJson(projects);
  } catch (error) {
    return errorResponse(error);
  }
}
