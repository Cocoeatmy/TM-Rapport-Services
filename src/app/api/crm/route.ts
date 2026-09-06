import { NextRequest, NextResponse } from "next/server";
import { notion } from "@/lib/notion";
import { getCached, setCache, invalidateCache } from "@/lib/server-cache";
import { verifyToken } from "@/lib/auth";

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
  icon: string;
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
      case "files":
        result[key] = prop.files?.map((f: any) => f.file?.url || f.external?.url || "").filter(Boolean) || [];
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

  const entries = allResults.map((page) => {
    // 1. Icône de page Notion (emoji, fichier externe ou fichier interne)
    let icon = "";
    if (page.icon) {
      if (page.icon.type === "external") icon = page.icon.external?.url || "";
      else if (page.icon.type === "file") icon = page.icon.file?.url || "";
      else if (page.icon.type === "emoji") icon = page.icon.emoji || "";
    }

    const properties = extractAllProperties(page.properties);

    // 2. Fallback cover Notion (bannière de page)
    if (!icon && page.cover) {
      if (page.cover.type === "external") icon = page.cover.external?.url || "";
      else if (page.cover.type === "file") icon = page.cover.file?.url || "";
    }

    // 3. Fallback propriétés : chercher logo/image dans les propriétés nommées
    if (!icon) {
      for (const [key, val] of Object.entries(properties)) {
        const isLogoKey = /logo|image|photo|cover|fichier/i.test(key);
        if (!isLogoKey) continue;
        // Propriété files (tableau d'URLs)
        if (Array.isArray(val) && val.length > 0 && typeof val[0] === "string" && val[0].startsWith("http")) {
          icon = val[0]; break;
        }
        // Propriété url (string directe)
        if (typeof val === "string" && val.startsWith("http")) {
          icon = val; break;
        }
      }
    }

    // 4. Dernier recours : première propriété files avec une URL http
    if (!icon) {
      for (const val of Object.values(properties)) {
        if (Array.isArray(val) && val.length > 0 && typeof val[0] === "string" && val[0].startsWith("http")) {
          icon = val[0]; break;
        }
      }
    }

    return {
      id: page.id,
      name: extractTitle(page.properties),
      icon,
      properties,
    };
  }).filter((e) => e.name.trim() !== "").sort((a, b) => a.name.localeCompare(b.name));

  // Résout la relation « Entreprise » (IDs → nom de l'entreprise) pour
  // l'affichage dans les fiches contact du CRM.
  const entrepriseIds = [...new Set(
    entries.flatMap((e) => (Array.isArray(e.properties["Entreprise"]) ? e.properties["Entreprise"] : [])),
  )].filter((x): x is string => typeof x === "string");
  if (entrepriseIds.length > 0) {
    const nameById: Record<string, string> = {};
    await Promise.all(entrepriseIds.map(async (id) => {
      try {
        const pg: any = await notion.pages.retrieve({ page_id: id });
        let title = "";
        for (const v of Object.values(pg.properties || {})) {
          const pv: any = v;
          if (pv?.type === "title") { title = (pv.title || []).map((t: any) => t.plain_text).join("").trim(); break; }
        }
        nameById[id] = title;
      } catch { nameById[id] = ""; }
    }));
    entries.forEach((e) => {
      const ids = e.properties["Entreprise"];
      if (Array.isArray(ids)) {
        e.properties["Entreprise"] = ids.map((id: any) => nameById[id]).filter(Boolean).join(", ");
      }
    });
  }

  setCache(cacheKey, entries);
  return entries;
}

// Get full schema with select/multi_select options
async function getDbSchemaFull(type: string): Promise<Record<string, { type: string; options?: string[] }>> {
  const dbId = CRM_DATABASES[type];
  if (!dbId) return {};
  try {
    const db = await notion.databases.retrieve({ database_id: dbId });
    const schema: Record<string, { type: string; options?: string[] }> = {};
    for (const [key, prop] of Object.entries((db as any).properties)) {
      const p = prop as any;
      const entry: { type: string; options?: string[] } = { type: p.type };
      if (p.type === "select" && p.select?.options) {
        entry.options = p.select.options.map((o: any) => o.name);
      }
      if (p.type === "multi_select" && p.multi_select?.options) {
        entry.options = p.multi_select.options.map((o: any) => o.name);
      }
      schema[key] = entry;
    }
    return schema;
  } catch {
    return {};
  }
}

export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get("type") || "contacts";
  const refresh = request.nextUrl.searchParams.get("refresh");
  const schema = request.nextUrl.searchParams.get("schema");

  if (!CRM_DATABASES[type]) {
    return NextResponse.json({ error: `Type inconnu: ${type}` }, { status: 400 });
  }

  // Force cache invalidation
  if (refresh) {
    invalidateCache(`crm-${type}`);
    delete dbSchemaCache[type];
  }

  // Return schema with options
  if (schema) {
    try {
      const fullSchema = await getDbSchemaFull(type);
      return NextResponse.json(fullSchema);
    } catch (error: any) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
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

// Cache property types per database (auto-detected from Notion schema)
const dbSchemaCache: Record<string, Record<string, string>> = {};

async function getDbSchema(type: string): Promise<Record<string, string>> {
  if (dbSchemaCache[type]) return dbSchemaCache[type];
  const dbId = CRM_DATABASES[type];
  if (!dbId) return {};
  try {
    const db = await notion.databases.retrieve({ database_id: dbId });
    const schema: Record<string, string> = {};
    for (const [key, prop] of Object.entries((db as any).properties)) {
      schema[key] = (prop as any).type;
    }
    dbSchemaCache[type] = schema;
    return schema;
  } catch {
    return {};
  }
}

function buildNotionProperties(
  schema: Record<string, string>,
  properties: Record<string, any>
): Record<string, any> {
  const result: Record<string, any> = {};

  for (const [key, value] of Object.entries(properties)) {
    if (value === undefined || value === null || value === "") continue;

    const propType = schema[key] || "rich_text";

    switch (propType) {
      case "title":
        result[key] = { title: [{ text: { content: String(value) } }] };
        break;
      case "email":
        result[key] = { email: String(value) };
        break;
      case "phone_number":
        result[key] = { phone_number: String(value) };
        break;
      case "select":
        result[key] = { select: { name: String(value) } };
        break;
      case "multi_select": {
        const items = Array.isArray(value) ? value : String(value).split(",").map((s: string) => s.trim()).filter(Boolean);
        result[key] = { multi_select: items.map((v: string) => ({ name: v })) };
        break;
      }
      case "date":
        result[key] = { date: { start: String(value) } };
        break;
      case "number":
        result[key] = { number: parseFloat(String(value)) || 0 };
        break;
      case "url":
        result[key] = { url: String(value) };
        break;
      case "checkbox":
        result[key] = { checkbox: value === true || value === "true" };
        break;
      case "rich_text":
        result[key] = { rich_text: [{ text: { content: String(value) } }] };
        break;
      // Skip relation, formula, rollup, etc.
      default:
        break;
    }
  }

  return result;
}

async function authenticateRequest(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function POST(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { type, properties } = body;

    if (!type || !CRM_DATABASES[type]) {
      return NextResponse.json({ error: `Type inconnu: ${type}` }, { status: 400 });
    }
    if (!properties || Object.keys(properties).length === 0) {
      return NextResponse.json({ error: "Propriétés requises" }, { status: 400 });
    }

    const schema = await getDbSchema(type);
    const notionProps = buildNotionProperties(schema, properties);

    const createPayload: any = {
      parent: { database_id: CRM_DATABASES[type] },
      properties: notionProps,
    };
    if (body.icon) {
      if (body.icon.startsWith("http")) {
        createPayload.icon = { type: "external", external: { url: body.icon } };
      } else {
        createPayload.icon = { type: "emoji", emoji: body.icon };
      }
    }

    const page = await notion.pages.create(createPayload);

    invalidateCache(`crm-${type}`);

    return NextResponse.json({ success: true, id: page.id });
  } catch (error: any) {
    console.error("Error creating CRM entry:", error);
    return NextResponse.json(
      { error: error.message || "Erreur lors de la création" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, type, properties } = body;

    if (!id) {
      return NextResponse.json({ error: "ID requis" }, { status: 400 });
    }
    if (!properties || Object.keys(properties).length === 0) {
      return NextResponse.json({ error: "Propriétés requises" }, { status: 400 });
    }

    const dbType = type || "contacts";
    const schema = await getDbSchema(dbType);
    const notionProps = buildNotionProperties(schema, properties);

    // Handle icon/logo update
    const updatePayload: any = { page_id: id, properties: notionProps };
    if (body.icon) {
      if (body.icon.startsWith("http")) {
        updatePayload.icon = { type: "external", external: { url: body.icon } };
      } else {
        updatePayload.icon = { type: "emoji", emoji: body.icon };
      }
    } else if (body.icon === null) {
      updatePayload.icon = null;
    }

    await notion.pages.update(updatePayload);

    // Invalidate all CRM caches since we may not know the type
    if (type && CRM_DATABASES[type]) {
      invalidateCache(`crm-${type}`);
    } else {
      for (const t of Object.keys(CRM_DATABASES)) {
        invalidateCache(`crm-${t}`);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error updating CRM entry:", error);
    return NextResponse.json(
      { error: error.message || "Erreur lors de la mise à jour" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Admin uniquement" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { id, type } = body;

    if (!id) {
      return NextResponse.json({ error: "ID requis" }, { status: 400 });
    }

    await notion.pages.update({
      page_id: id,
      archived: true,
    });

    // Invalidate cache
    if (type && CRM_DATABASES[type]) {
      invalidateCache(`crm-${type}`);
    } else {
      for (const t of Object.keys(CRM_DATABASES)) {
        invalidateCache(`crm-${t}`);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting CRM entry:", error);
    return NextResponse.json(
      { error: error.message || "Erreur lors de la suppression" },
      { status: 500 }
    );
  }
}
