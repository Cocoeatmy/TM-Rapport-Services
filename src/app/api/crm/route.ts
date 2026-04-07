import { NextResponse } from "next/server";
import { notion } from "@/lib/notion";
import { getCached, setCache } from "@/lib/server-cache";

export const dynamic = "force-dynamic";

const CRM_DATABASE_ID = "28a1895b917981caa612e1a0f00feba3";

export interface CRMContact {
  id: string;
  name: string;
  poste: string;
  etiquettes: string[];
  entreprise: string[];
  grossistes: string[];
  fournisseurs: string[];
  email: string;
  portable: string;
  telephone: string;
  dernierContact: string | null;
}

function extractTitle(prop: any): string {
  if (!prop || prop.type !== "title") return "";
  return prop.title?.map((t: any) => t.plain_text).join("") || "";
}

function extractSelect(prop: any): string {
  if (!prop || prop.type !== "select") return "";
  return prop.select?.name || "";
}

function extractMultiSelect(prop: any): string[] {
  if (!prop || prop.type !== "multi_select") return [];
  return prop.multi_select?.map((s: any) => s.name) || [];
}

function extractRelationIds(prop: any): string[] {
  if (!prop || prop.type !== "relation") return [];
  return prop.relation?.map((r: any) => r.id) || [];
}

function extractEmail(prop: any): string {
  if (!prop || prop.type !== "email") return "";
  return prop.email || "";
}

function extractPhone(prop: any): string {
  if (!prop || prop.type !== "phone_number") return "";
  return prop.phone_number || "";
}

function extractDate(prop: any): string | null {
  if (!prop || prop.type !== "date" || !prop.date) return null;
  return prop.date.start || null;
}

function mapPageToContact(page: any): CRMContact {
  const p = page.properties;
  return {
    id: page.id,
    name: extractTitle(p["Prénom et nom"]),
    poste: extractSelect(p["Poste"]),
    etiquettes: extractMultiSelect(p["Étiquettes"]),
    entreprise: extractRelationIds(p["Entreprise"]),
    grossistes: extractRelationIds(p["Grossistes"]),
    fournisseurs: extractRelationIds(p["Fournisseurs"]),
    email: extractEmail(p["Email"]),
    portable: extractPhone(p["Portable"]),
    telephone: extractPhone(p["Téléphone"]),
    dernierContact: extractDate(p["Dernier contact"]),
  };
}

async function fetchAllCRMContacts(): Promise<CRMContact[]> {
  const cached = getCached<CRMContact[]>("crm-contacts");
  if (cached) return cached;

  const allResults: any[] = [];
  let cursor: string | undefined = undefined;

  do {
    const response: any = await notion.databases.query({
      database_id: CRM_DATABASE_ID,
      start_cursor: cursor,
      page_size: 100,
      sorts: [{ property: "Prénom et nom", direction: "ascending" }],
    });
    allResults.push(...response.results);
    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);

  const contacts = allResults.map(mapPageToContact).filter((c) => c.name.trim() !== "");
  setCache("crm-contacts", contacts);
  return contacts;
}

export async function GET() {
  try {
    const contacts = await fetchAllCRMContacts();
    return NextResponse.json(contacts);
  } catch (error: any) {
    console.error("Error fetching CRM contacts:", error);
    return NextResponse.json(
      { error: error.message || "Erreur lors de la récupération des contacts CRM" },
      { status: 500 }
    );
  }
}
