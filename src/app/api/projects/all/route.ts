import { NextResponse } from "next/server";
import { getAllProjectsRaw } from "@/lib/notion";
import { cachedOrFetch } from "@/lib/server-cache";
import { cachedJson } from "@/lib/edge-cache";

export const revalidate = 120;

/**
 * Renvoie TOUS les projets de la base Notion, sans filtre d'état
 * (terminés, annulés, en cours, etc.). Utilisé par la vue "Projets"
 * admin qui doit permettre de retrouver n'importe quel projet.
 * Soumis au cache SWR standard (fresh 30 s, stale 5 min).
 * Edge cache 30 s (vue moins fréquente que le dashboard).
 */
export async function GET() {
  try {
    const projects = await cachedOrFetch("projects-all-raw", getAllProjectsRaw);
    return cachedJson(projects, { sMaxAge: 30, swr: 120 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
