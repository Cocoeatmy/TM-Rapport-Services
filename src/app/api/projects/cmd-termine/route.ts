import { getProjectsCmdTermine } from "@/lib/notion";
import { cachedOrFetch } from "@/lib/server-cache";
import { cachedJson, errorResponse } from "@/lib/edge-cache";

export const revalidate = 30;
/* Reconstruire cette liste depuis Notion demande une trentaine de
   secondes. Sans durée déclarée, la requête est coupée bien avant, et
   l'écran reste vide sur un serveur qui vient de démarrer. */
export const maxDuration = 60;

export async function GET() {
  try {
    // Servie par Redis (compressé) ; politique longue gérée dans setCache.
    const projects = await cachedOrFetch("projects-cmd-termine", getProjectsCmdTermine);
    return cachedJson(projects);
  } catch (error) {
    return errorResponse(error);
  }
}
