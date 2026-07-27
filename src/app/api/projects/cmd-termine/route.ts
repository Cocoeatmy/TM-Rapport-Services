import { getProjectsCmdTermine } from "@/lib/notion";
import { cachedOrFetchLong } from "@/lib/server-cache";
import { cachedJson, errorResponse } from "@/lib/edge-cache";

export const revalidate = 30;

export async function GET() {
  try {
    // Liste lourde (commandes terminées) qui change lentement → cache long.
    const projects = await cachedOrFetchLong("projects-cmd-termine", getProjectsCmdTermine);
    return cachedJson(projects);
  } catch (error) {
    return errorResponse(error);
  }
}
