import { NextResponse } from "next/server";
import { notion } from "@/lib/notion";

export const revalidate = 300;

const DB_ID = "2e21895b917980428d1ecc45b0c29c78";

function num(prop: any): number {
  if (!prop || prop.type !== "number") return 0;
  return prop.number ?? 0;
}

function txt(prop: any): string {
  if (!prop) return "";
  if (prop.type === "title") return prop.title?.map((t: any) => t.plain_text).join("") || "";
  if (prop.type === "rich_text") return prop.rich_text?.map((t: any) => t.plain_text).join("") || "";
  return "";
}

function sel(prop: any): string {
  if (!prop || prop.type !== "select") return "";
  return prop.select?.name || "";
}

function dateVal(prop: any): string | null {
  if (!prop || prop.type !== "date" || !prop.date) return null;
  return prop.date.start || null;
}

export async function GET() {
  try {
    const allResults: any[] = [];
    let cursor: string | undefined = undefined;
    do {
      const response: any = await notion.databases.query({
        database_id: DB_ID,
        page_size: 100,
        start_cursor: cursor,
      });
      allResults.push(...response.results);
      cursor = response.has_more ? response.next_cursor : undefined;
    } while (cursor);

    const rows = allResults.map((page: any) => {
      const p = page.properties;
      const anneeRaw = dateVal(p["Année"]);
      return {
        id: page.id,
        serie: txt(p["Série"]),
        annee: anneeRaw ? new Date(anneeRaw).getFullYear() : null,
        fournisseur: sel(p["Fournisseur"]),
        count: num(p["Nb. de ..."]),
      };
    });

    return NextResponse.json(rows);
  } catch (error: any) {
    console.error("Error fetching stats series:", error);
    return NextResponse.json({ error: error.message || "Erreur" }, { status: 500 });
  }
}
