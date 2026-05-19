import { getProjectsMesuresAnnulees } from "@/lib/notion";
import { cachedOrFetch } from "@/lib/server-cache";
import { cachedJson, errorResponse } from "@/lib/edge-cache";

export const revalidate = 30;

export async function GET() {
  try {
    const projects = await cachedOrFetch(
      "projects-mesures-annulees",
      getProjectsMesuresAnnulees,
    );
    return cachedJson(projects);
  } catch (error) {
    return errorResponse(error);
  }
}
