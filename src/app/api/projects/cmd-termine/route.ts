import { NextResponse } from "next/server";
import { notion, databaseId, mapPageToProject } from "@/lib/notion";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const response = await notion.databases.query({
      database_id: databaseId,
      filter: {
        property: "État - CMD",
        status: { equals: "Terminé" },
      },
      sorts: [{ property: "Date Montage", direction: "descending" }],
      page_size: 100,
    });
    return NextResponse.json(response.results.map(mapPageToProject));
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Erreur" },
      { status: 500 }
    );
  }
}
