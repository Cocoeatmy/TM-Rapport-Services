/**
 * /api/crm/entry?id=<pageId>
 *
 * Retourne les propriétés « lisibles » d'UNE fiche CRM (contact ou entreprise),
 * pour l'aperçu au clic depuis un projet — sans quitter le projet.
 * Les relations « Entreprise » sont résolues en nom.
 */
import { NextRequest, NextResponse } from "next/server";
import { notion } from "@/lib/notion";
import { verifyToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

function extractTitle(props: any): string {
  for (const key of Object.keys(props || {})) {
    const p = props[key];
    if (p?.type === "title") return (p.title || []).map((t: any) => t.plain_text).join("").trim();
  }
  return "";
}

function extractValue(prop: any): any {
  switch (prop?.type) {
    case "title": return (prop.title || []).map((t: any) => t.plain_text).join("");
    case "rich_text": return (prop.rich_text || []).map((t: any) => t.plain_text).join("");
    case "select": return prop.select?.name || "";
    case "status": return prop.status?.name || "";
    case "multi_select": return (prop.multi_select || []).map((s: any) => s.name);
    case "email": return prop.email || "";
    case "phone_number": return prop.phone_number || "";
    case "url": return prop.url || "";
    case "number": return prop.number ?? null;
    case "date": return prop.date?.start || null;
    case "relation": return (prop.relation || []).map((r: any) => r.id);
    default: return null;
  }
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  if (!token || !(await verifyToken(token))) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const id = req.nextUrl.searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });

  let page: any;
  try {
    page = await notion.pages.retrieve({ page_id: id });
  } catch {
    return NextResponse.json({ error: "introuvable" }, { status: 404 });
  }

  const props = page.properties || {};
  const result: Record<string, any> = {};
  for (const [key, prop] of Object.entries(props) as any[]) {
    result[key] = extractValue(prop);
  }

  // Résout la relation « Entreprise » en nom.
  const entrepriseIds: string[] = Array.isArray(result["Entreprise"]) ? result["Entreprise"] : [];
  if (entrepriseIds.length > 0) {
    const names = await Promise.all(entrepriseIds.map(async (rid) => {
      try { const pg: any = await notion.pages.retrieve({ page_id: rid }); return extractTitle(pg.properties); } catch { return ""; }
    }));
    result["Entreprise"] = names.filter(Boolean).join(", ");
  }

  return NextResponse.json({ id: page.id, name: extractTitle(props), properties: result });
}
