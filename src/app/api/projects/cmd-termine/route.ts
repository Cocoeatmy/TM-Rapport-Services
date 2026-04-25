import { NextResponse } from "next/server";
import { notion, databaseId, mapPageToProject } from "@/lib/notion";
import { cachedOrFetch } from "@/lib/server-cache";
import { cachedJson } from "@/lib/edge-cache";

export const revalidate = 120;

async function fetchCmdTermine() {
  const allResults: any[] = [];
  let cursor: string | undefined = undefined;
  do {
    const response: any = await notion.databases.query({
      database_id: databaseId,
      filter: {
        property: "État - CMD",
        status: { equals: "Terminé" },
      },
      sorts: [{ property: "Date Montage", direction: "descending" }],
      page_size: 100,
      start_cursor: cursor,
    });
    allResults.push(...response.results);
    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);
  return allResults.map(mapPageToProject).filter((p) => !p.projet.startsWith("[DATA]"));
}

export async function GET() {
  try {
    // Ajout du SWR serveur en plus du edge cache. Avant cette route
    // refaisait la query Notion à chaque hit (pas de cachedOrFetch).
    const projects = await cachedOrFetch("projects-cmd-termine", fetchCmdTermine);
    // Les terminés bougent peu : on cache plus longtemps au edge.
    return cachedJson(projects, { sMaxAge: 60, swr: 300 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Erreur" },
      { status: 500 }
    );
  }
}
