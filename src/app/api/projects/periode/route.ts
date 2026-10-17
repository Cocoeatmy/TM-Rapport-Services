/**
 * Les interventions d'une fenêtre de dates — la source de la charge de la
 * semaine.
 *
 * Les autres listes sont des instantanés : utiles, rapides, et en retard d'un
 * rafraîchissement. Celle-ci interroge Notion sur la période demandée, sans
 * trier par état, et ne dépend donc d'aucun instantané. C'est ce qui permet de
 * voir un chantier LE JOUR OÙ il est clôturé, au lieu de le voir disparaître
 * jusqu'au prochain cycle de cache.
 *
 * Le coût reste celui d'une semaine : une requête datée, une quinzaine de
 * fiches. La réponse est gardée vingt secondes par fenêtre demandée.
 */
import { NextRequest } from "next/server";
import { getProjectsPeriode } from "@/lib/notion";
import { cachedOrFetch } from "@/lib/server-cache";
import { errorResponse } from "@/lib/edge-cache";
import { reponseProjets } from "@/lib/perimetre-serveur";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const JOUR = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest) {
  const du = request.nextUrl.searchParams.get("du") || "";
  const au = request.nextUrl.searchParams.get("au") || "";
  if (!JOUR.test(du) || !JOUR.test(au) || au < du) {
    return Response.json(
      { error: "du et au (AAAA-MM-JJ) requis, du ≤ au" },
      { status: 400 },
    );
  }
  /* Une fenêtre plus large qu'un trimestre n'est plus une requête datée : ce
     serait la base entière, par une adresse qui ne l'annonce pas. */
  if (Date.parse(`${au}T12:00:00Z`) - Date.parse(`${du}T12:00:00Z`) > 100 * 86400000) {
    return Response.json({ error: "Période trop large (100 jours au plus)" }, { status: 400 });
  }

  try {
    const projets = await cachedOrFetch(`periode-${du}-${au}`, () => getProjectsPeriode(du, au));
    return reponseProjets(projets, { sMaxAge: 20, swr: 60 });
  } catch (error) {
    return errorResponse(error);
  }
}
