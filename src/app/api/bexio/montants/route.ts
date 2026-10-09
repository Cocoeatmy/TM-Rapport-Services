import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { peutVoirBexio } from "@/lib/bexio";
import { lireCopieBexio } from "@/lib/bexio-donnees";
import { indexerFacturation, rapprocher } from "@/lib/bexio-rapprochement";
import { getAllProjectsRaw } from "@/lib/notion";
import { cachedOrFetch } from "@/lib/server-cache";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Montant de chaque offre, par numéro TM — pour l'afficher à côté des
 * chantiers dans le tableau de bord.
 *
 * Une seule requête pour toute la table : l'alternative, interroger bexio
 * chantier par chantier, ferait une centaine d'appels pour afficher une
 * semaine. Trente kilo-octets suffisent à couvrir mille huit cents offres.
 *
 * Refusée à tout compte autre que le propriétaire des accès : c'est ce
 * refus qui fait que les montants n'apparaissent chez personne d'autre.
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  const user = token ? await verifyToken(token) : null;
  if (!user || user.role !== "admin" || !(await peutVoirBexio(user))) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }
  try {
    const [copie, projets] = await Promise.all([
      lireCopieBexio(),
      cachedOrFetch<Record<string, unknown>[]>(
        "projects-all-raw",
        getAllProjectsRaw as unknown as () => Promise<Record<string, unknown>[]>,
      ),
    ]);
    const montants: Record<string, number> = {};
    for (const o of copie.offres) {
      const nr = (o.nr || "").trim().toUpperCase();
      if (!nr.startsWith("TM-")) continue;
      montants[nr] = Math.round((o.total || 0) * 100) / 100;
    }

    /* Ce qui a RÉELLEMENT été facturé pour chaque chantier, hors taxes :
       la seule recette qui ne soit pas une moyenne. Les coûts se comptent
       hors taxes, la recette doit l'être aussi. */
    const idx = indexerFacturation(copie.offres, copie.factures);
    const recettes: Record<string, { ht: number; ttc: number; reste: number; estime: boolean }> = {};
    for (const p of projets as Array<Record<string, any>>) {
      const r = rapprocher(p.ofrTM, idx);
      if (!r.offre) continue;
      const nr = r.offre.nr.toUpperCase();
      if (recettes[nr]) continue;
      if (r.factures.length > 0) {
        recettes[nr] = {
          ht: Math.round(r.factures.reduce((s2, f) => s2 + (f.ht ?? f.total), 0) * 100) / 100,
          ttc: Math.round(r.facture * 100) / 100,
          reste: Math.round(r.restant * 100) / 100,
          estime: false,
        };
      } else {
        /* Pas encore facturé : l'offre est la meilleure estimation connue,
           et elle est annoncée comme telle. */
        recettes[nr] = {
          ht: Math.round((r.offre.ht ?? r.offre.total) * 100) / 100,
          ttc: Math.round(r.offre.total * 100) / 100,
          reste: 0,
          estime: true,
        };
      }
    }
    return NextResponse.json({ le: copie.le, montants, recettes });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
