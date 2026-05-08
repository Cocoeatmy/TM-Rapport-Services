import { getProjectsMesuresSansCommande } from "@/lib/notion";
import { cachedOrFetch } from "@/lib/server-cache";
import { cachedJson, errorResponse } from "@/lib/edge-cache";

export const revalidate = 30;

export async function GET() {
  try {
    const projects = await cachedOrFetch(
      "projects-mesures-sans-commande",
      getProjectsMesuresSansCommande,
    );
    return cachedJson(projects, { sMaxAge: 60, swr: 300 });
  } catch (error) {
    return errorResponse(error);
  }
}
