import { getProjectsCmdTermine } from "@/lib/notion";
import { cachedOrFetch } from "@/lib/server-cache";
import { cachedJson, errorResponse } from "@/lib/edge-cache";

export const revalidate = 30;

export async function GET() {
  try {
    const projects = await cachedOrFetch("projects-cmd-termine", getProjectsCmdTermine);
    return cachedJson(projects, { sMaxAge: 60, swr: 300 });
  } catch (error) {
    return errorResponse(error);
  }
}
