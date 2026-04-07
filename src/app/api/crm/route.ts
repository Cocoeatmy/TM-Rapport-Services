import { NextRequest, NextResponse } from "next/server";
import { notion } from "@/lib/notion";
import { getCached, setCache } from "@/lib/server-cache";

export const dynamic = "force-dynamic";

const CRM_DATABASES: Record<string, string> = {
  contacts: "28a1895b9179811e98efc8848571d8db",
  entreprises: "28a1895b9179811fb736eca6c8e2ffb3",
  fournisseurs: "2d11895b9179807b988df489cfdc469d",
  grossistes: "2d11895b917980a1a202fa866102e0e5",
};

export interface CRMEntry {
  id: string;
  name: string;
  properties: Record<string, any>;
}

function extractTitle(props: any): string {
  for (const key of Object.keys(props)) {
    const prop = props[key];
    if (prop?.type === "title") {
      return prop.title?.map((t: any) => t.plain_text).join("") || "";
    }
  }
  return "";
}

function extractAllProperties(props: any): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, prop] of Object.entries(props) as any[]) {
    switch (prop.type) {
      case "title":
        result[key] = prop.title?.map((t: any) => t.plain_text).join("") || "";
        break;
      case "rich_text":
        result[key] = prop.rich_text?.map((t: any) => t.plain_text).join("") || "";
        break;
      case "select":
        result[key] = prop.select?.name || "";
        break;
      case "multi_select":
        result[key] = prop.multi_select?.map((s: any) => s.name) || [];
        break;
      case "email":
        result[key] = prop.email || "";
        break;
      case "phone_number":
        result[key] = prop.phone_number || "";
        break;
      case "url":
        result[key] = prop.url || "";
        break;
      case "date":
        result[key] = prop.date?.start || null;
        break;
      case "number":
        result[key] = prop.number;
        break;
      case "checkbox":
        result[key] = prop.checkbox || false;
        break;
      case "relation":
        result[key] = prop.relation?.map((r: any) => r.id) || [];
        break;
      case "status":
        result[key] = prop.status?.name || "";
        break;
      default:
        result[key] = null;
    }
  }
  return result;
}

async function fetchDatabase(type: string): Promise<CRMEntry[]> {
  const cacheKey = `crm-${type}`;
  const cached = getCached<CRMEntry[]>(cacheKey);
  if (cached) return cached;

  const dbId = CRM_DATABASES[type];
  if (!dbId) return [];

  const allResults: any[] = [];
  let cursor: string | undefined = undefined;

  do {
    const response: any = await notion.databases.query({
      database_id: dbId,
      start_cursor: cursor,
      page_size: 100,
    });
    allResults.push(...response.results);
    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);

  const entries = allResults.map((page) => ({
    id: page.id,
    name: extractTitle(page.properties),
    properties: extractAllProperties(page.properties),
  })).filter((e) => e.name.trim() !== "").sort((a, b) => a.name.localeCompare(b.name));

  setCache(cacheKey, entries);
  return entries;
}

export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get("type") || "contacts";

  if (!CRM_DATABASES[type]) {
    return NextResponse.json({ error: `Type inconnu: ${type}` }, { status: 400 });
  }

  try {
    const entries = await fetchDatabase(type);
    return NextResponse.json(entries);
  } catch (error: any) {
    console.error(`Error fetching CRM ${type}:`, error);
    return NextResponse.json(
      { error: error.message || "Erreur lors de la récupération des données CRM" },
      { status: 500 }
    );
  }
}
