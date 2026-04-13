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

function yearVal(prop: any): number | null {
  if (!prop) return null;
  if (prop.type === "date" && prop.date?.start) return new Date(prop.date.start).getFullYear();
  if (prop.type === "number" && prop.number != null) return prop.number;
  if (prop.type === "select" && prop.select?.name) return parseInt(prop.select.name, 10) || null;
  if (prop.type === "rich_text") return parseInt(prop.rich_text?.map((x: any) => x.plain_text).join("") || "", 10) || null;
  if (prop.type === "title") return parseInt(prop.title?.map((x: any) => x.plain_text).join("") || "", 10) || null;
  return null;
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

    // Log property names from first result for debugging
    if (allResults.length > 0) {
      const propNames = Object.keys(allResults[0].properties);
      console.log("[stats/series] Property names:", propNames);
    }

    const rows = allResults.map((page: any) => {
      const p = page.properties;
      const countProp = p["Nb. de cabine installée"] || p["Nb. de cabines installées"] || p["Nb. de cabines installée"];
      let count = num(countProp);
      if (count === 0 && countProp?.type === "formula") count = countProp.formula?.number ?? 0;
      if (count === 0 && countProp?.type === "rollup") count = countProp.rollup?.number ?? 0;
      return {
        id: page.id,
        serie: txt(p["Série"]),
        annee: yearVal(p["Année"]),
        fournisseur: sel(p["Fournisseur"]),
        count,
      };
    });

    return NextResponse.json(rows);
  } catch (error: any) {
    console.error("Error fetching stats series:", error);
    return NextResponse.json({ error: error.message || "Erreur" }, { status: 500 });
  }
}
