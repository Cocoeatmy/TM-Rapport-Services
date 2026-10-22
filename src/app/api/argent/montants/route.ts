import { NextResponse } from "next/server";
import { exigerDroit } from "@/lib/droits-serveur";
import { cachedOrFetch } from "@/lib/server-cache";
import { getAllProjectsRaw } from "@/lib/notion";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Les montants des projets — pour le PROPRIÉTAIRE seul (22.10.2026).
 *
 * Les listes de projets ne portent plus aucun argent (voir argent-projets) :
 * elles sont partagées et mises en cache. Les écrans du propriétaire (stats,
 * aperçu, à facturer…) récupèrent ici, à part, { id: { montantOFR,
 * facturations } } et les recollent. `argent.voir` n'est accordé qu'au
 * propriétaire (droits-serveur).
 */
export async function GET() {
  const v = await exigerDroit("argent.voir");
  if ("refus" in v) return v.refus;
  const projets = await cachedOrFetch<Record<string, unknown>[]>(
    "projects-all-raw", getAllProjectsRaw as unknown as () => Promise<Record<string, unknown>[]>,
  );
  const out: Record<string, { montantOFR: number | null; facturations: string }> = {};
  for (const p of projets) {
    const id = String(p.id || "");
    const montant = typeof p.montantOFR === "number" ? p.montantOFR : null;
    const fact = String(p.facturations || "");
    if (id && (montant !== null || fact)) out[id] = { montantOFR: montant, facturations: fact };
  }
  return NextResponse.json(out, { headers: { "Cache-Control": "private, no-store" } });
}
