import { getProjectsMesuresSansCommande } from "@/lib/notion";
import { cachedOrFetch } from "@/lib/server-cache";
import { cachedJson, errorResponse } from "@/lib/edge-cache";
import { reponseProjets } from "@/lib/perimetre-serveur";

export const revalidate = 30;

export async function GET() {
  try {
    // Servie par Redis (compressé) ; politique longue gérée dans setCache.
    const projects = await cachedOrFetch(
      "projects-mesures-sans-commande",
      getProjectsMesuresSansCommande,
    );
    return reponseProjets(projects);
  } catch (error) {
    return errorResponse(error);
  }
}
