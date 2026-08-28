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

// Champs Notion à inclure dans le filtre OR.
// IMPORTANT : les noms doivent correspondre EXACTEMENT aux propriétés Notion
// (un seul nom faux → 400 sur TOUTE la requête → recherche serveur muette).
// Vérifiés contre mapPageToProject (src/lib/notion.ts).
const SEARCH_FILTERS = (q: string) => ({
  or: [
    { property: "Projet", title: { contains: q } },
    { property: "N° OFR TM", rich_text: { contains: q } },
    { property: "N° OFR Grossiste", rich_text: { contains: q } },
    { property: "Nom chantier", rich_text: { contains: q } },
    { property: "N° CMD TM", rich_text: { contains: q } },
    { property: "N° CMD TM - Usine", rich_text: { contains: q } },
    { property: "N° CMD Grossiste", rich_text: { contains: q } },
    { property: "n° CMD Fournisseurs", rich_text: { contains: q } },
    { property: "Contacts projet", rich_text: { contains: q } },
  ],
});

// Filtre minimal GARANTI (repli) : uniquement le titre + le n° TM. Sert si le
// filtre complet échoue (propriété renommée côté Notion) → la recherche par
// n° de projet et par nom continue TOUJOURS de fonctionner.
const SAFE_FILTERS = (q: string) => ({
  or: [
    { property: "Projet", title: { contains: q } },
    { property: "N° OFR TM", rich_text: { contains: q } },
  ],
});

async function queryWithFallback(q: string) {
  try {
    return await runQuery(SEARCH_FILTERS(q));
  } catch (e) {
    console.warn("[search] filtre complet KO, repli minimal:", (e as any)?.message);
    return await runQuery(SAFE_FILTERS(q));
  }
}

async function runQuery(filter: any) {
  const allResults: any[] = [];
  let cursor: string | undefined;
  do {
    const response: any = await notion.databases.query({
      database_id: databaseId,
      filter,
      sorts: [{ property: "Date Montage", direction: "descending" }],
      page_size: 50,
      start_cursor: cursor,
    });
    allResults.push(...response.results);
    cursor = response.has_more ? response.next_cursor : undefined;
    if (allResults.length >= 50) break;
  } while (cursor);
  return allResults;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json([]);
  }

  try {
    const allResults = await queryWithFallback(q);

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
