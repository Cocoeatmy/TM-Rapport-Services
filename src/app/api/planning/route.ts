/**
 * Le planning d'une semaine (ou de quelques-unes) : les rendez-vous fixés.
 *
 * Le filtre par personne est appliqué ICI, sur le serveur :
 *  - un compte qui a « Suivre l'activité de l'équipe » (administrateur,
 *    responsable) reçoit tous les rendez-vous, et peut demander ceux d'un
 *    collaborateur (`?collab=Prénom`) ;
 *  - tout autre compte ne reçoit QUE les siens (prénom, binôme, Team) —
 *    le paramètre `collab` est alors ignoré.
 *
 * Sources : la requête datée de la période (montages, mesures — fraîche) et
 * la liste complète en cache (SAV par lot, que Notion ne sait pas filtrer
 * par date). La fiche la plus fraîche l'emporte.
 */
import { NextRequest, NextResponse } from "next/server";
import { exigerDroit } from "@/lib/droits-serveur";
import { peut } from "@/lib/droits";
import { getAllProjectsRaw, getProjectsPeriode } from "@/lib/notion";
import { cachedOrFetch } from "@/lib/server-cache";
import { filtrerListe } from "@/lib/perimetre-serveur";
import { construireRendezVous, rendezVousDe, type ProjetPlanning } from "@/lib/planning";
import { COLLABORATEURS_LIST } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const JOUR = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest) {
  const v = await exigerDroit("tableau.calendrier", "lecture");
  if ("refus" in v) return v.refus;

  const du = request.nextUrl.searchParams.get("du") || "";
  const au = request.nextUrl.searchParams.get("au") || "";
  if (!JOUR.test(du) || !JOUR.test(au) || au < du
      || Date.parse(`${au}T12:00:00Z`) - Date.parse(`${du}T12:00:00Z`) > 62 * 86400000) {
    return NextResponse.json({ error: "du et au (AAAA-MM-JJ) requis, 62 jours au plus" }, { status: 400 });
  }

  const voitTout = peut(v.droits, "tableau.activite");
  const collab = voitTout ? (request.nextUrl.searchParams.get("collab") || "").trim().slice(0, 40) : "";

  const [periode, tous] = await Promise.all([
    cachedOrFetch(`periode-${du}-${au}`, () => getProjectsPeriode(du, au)),
    cachedOrFetch("projects-all-raw", getAllProjectsRaw),
  ]);
  const parId = new Map<string, ProjetPlanning>();
  for (const p of tous as ProjetPlanning[]) parId.set(p.id, p);
  for (const p of periode as ProjetPlanning[]) parId.set(p.id, p); // la plus fraîche l'emporte

  /* Le périmètre de la session (« uniquement les siens »…) s'applique aussi. */
  const { projets } = await filtrerListe([...parId.values()] as (ProjetPlanning & { collaborateurs?: string | null })[]);
  let rdv = construireRendezVous(projets, du, au);
  if (!voitTout) rdv = rendezVousDe(rdv, v.user.name);
  else if (collab) rdv = rendezVousDe(rdv, collab);

  return NextResponse.json(
    { du, au, voitTout, collab: collab || null, collaborateurs: voitTout ? [...COLLABORATEURS_LIST] : [], rdv },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
