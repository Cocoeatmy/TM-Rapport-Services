import { NextResponse } from "next/server";
import { notion } from "@/lib/notion";

export const revalidate = 300;

const DB_ID = "17e1895b9179812093cfca36bba18aba";

function num(prop: any): number {
  if (!prop || prop.type !== "number") return 0;
  return prop.number ?? 0;
}

function formulaNum(prop: any): number {
  if (!prop) return 0;
  if (prop.type === "number") return prop.number ?? 0;
  if (prop.type === "formula") {
    if (prop.formula?.type === "number") return prop.formula.number ?? 0;
  }
  return 0;
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

const MOIS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

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
      const monthly: Record<string, number> = {};
      MOIS.forEach((m) => {
        monthly[m] = num(p[m]);
      });
      return {
        id: page.id,
        client: txt(p["Client"]),
        annee: anneeRaw ? new Date(anneeRaw).getFullYear() : null,
        typeClient: sel(p["Type client"]),
        monthly,
        total: formulaNum(p["Total"]),
      };
    });

    return NextResponse.json(rows);
  } catch (error: any) {
    console.error("Error fetching stats clients:", error);
    return NextResponse.json({ error: error.message || "Erreur" }, { status: 500 });
  }
}
