/**
 * /api/notion-colors
 * Renvoie les couleurs des options select/multi-select/status de la base Notion :
 *   { "État - CMD": { "Cabines en CMD": "brown", ... }, "Type de services": {...}, ... }
 * Mis en cache (2h) → l'app reflète automatiquement un changement de couleur
 * fait dans Notion, sans intervention.
 */

import { NextResponse } from "next/server";
import { notion, databaseId } from "@/lib/notion";
import { cachedOrFetchLong } from "@/lib/server-cache";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function fetchColors(): Promise<Record<string, Record<string, string>>> {
  const db: any = await notion.databases.retrieve({ database_id: databaseId });
  const out: Record<string, Record<string, string>> = {};
  for (const [name, prop] of Object.entries<any>(db.properties || {})) {
    const opts =
      prop?.type === "select" ? prop.select?.options :
      prop?.type === "multi_select" ? prop.multi_select?.options :
      prop?.type === "status" ? prop.status?.options : null;
    if (Array.isArray(opts) && opts.length) {
      const map: Record<string, string> = {};
      for (const o of opts) if (o?.name) map[o.name] = o.color || "default";
      out[name] = map;
    }
  }
  return out;
}

export async function GET() {
  try {
    const colors = await cachedOrFetchLong("notion-colors", fetchColors);
    return NextResponse.json(colors, {
      headers: { "Cache-Control": "private, max-age=300" },
    });
  } catch (error) {
    // En cas d'erreur, on renvoie un objet vide → l'app garde ses couleurs de repli.
    console.error("Error fetching notion colors:", error);
    return NextResponse.json({}, { status: 200 });
  }
}
