/**
 * /api/projects/search?q=TM-2600416
 *
 * Recherche côté Notion avec filtre OR sur les champs clés.
 * Retourne uniquement les projets correspondants → ~1 s au lieu
 * de 30+ s pour getAllProjectsRaw() qui charge tout.
 *
 * Cache court (10 s) pour éviter les appels redondants si l'utilisateur
 * tape rapidement, mais ne bloque pas les résultats frais.
 */

import { NextRequest, NextResponse } from "next/server";
import { notion, databaseId, mapPageToProject } from "@/lib/notion";
import { errorResponse } from "@/lib/edge-cache";

export const dynamic = "force-dynamic";

// Champs Notion à inclure dans le filtre OR
const SEARCH_FILTERS = (q: string) => ({
  or: [
    { property: "Projet", title: { contains: q } },
    { property: "OFR TM", rich_text: { contains: q } },
    { property: "OFR Grossiste", rich_text: { contains: q } },
    { property: "Nom chantier", rich_text: { contains: q } },
    { property: "Adresse chantier", rich_text: { contains: q } },
    { property: "CMD TM", rich_text: { contains: q } },
    { property: "CMD TM Usine", rich_text: { contains: q } },
    { property: "CMD Grossiste", rich_text: { contains: q } },
    { property: "CMD Fournisseurs", rich_text: { contains: q } },
    { property: "Bon de livraison", rich_text: { contains: q } },
    { property: "Collaborateurs", rich_text: { contains: q } },
    { property: "Contacts", rich_text: { contains: q } },
    { property: "Emplacement de cabine", select: { equals: q } },
  ],
});

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json([]);
  }

  try {
    const allResults: any[] = [];
    let cursor: string | undefined;

    do {
      const response: any = await notion.databases.query({
        database_id: databaseId,
        filter: SEARCH_FILTERS(q),
        sorts: [{ property: "Date Montage", direction: "descending" }],
        page_size: 50,
        start_cursor: cursor,
      });
      allResults.push(...response.results);
      cursor = response.has_more ? response.next_cursor : undefined;
      // Limite à 50 résultats max pour garder une réponse rapide
      if (allResults.length >= 50) break;
    } while (cursor);

    const projects = allResults
      .map(mapPageToProject)
      .filter((p) => !p.projet.startsWith("[DATA]"));

    return NextResponse.json(projects, {
      headers: { "Cache-Control": "private, max-age=10" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
