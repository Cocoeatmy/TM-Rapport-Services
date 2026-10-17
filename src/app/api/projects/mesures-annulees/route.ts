import { getProjectsMesuresAnnulees } from "@/lib/notion";
import { cachedOrFetch } from "@/lib/server-cache";
import { errorResponse } from "@/lib/edge-cache";
import { reponseProjets } from "@/lib/perimetre-serveur";

export const revalidate = 30;

export async function GET() {
  try {
    const projects = await cachedOrFetch(
      "projects-mesures-annulees",
      getProjectsMesuresAnnulees,
    );
    return reponseProjets(projects);
  } catch (error) {
    return errorResponse(error);
  }
}
