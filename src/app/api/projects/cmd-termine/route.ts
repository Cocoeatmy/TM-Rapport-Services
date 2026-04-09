import { NextResponse } from "next/server";
import { notion, databaseId, mapPageToProject } from "@/lib/notion";

export const revalidate = 120;

export async function GET() {
  try {
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

    return NextResponse.json(
      allResults.map(mapPageToProject).filter((p) => !p.projet.startsWith("[DATA]"))
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Erreur" },
      { status: 500 }
    );
  }
}
