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
import { getData } from "@/lib/kv-store";
import { etatLot, type SourceEtatLot } from "@/lib/etat-lot";
import { cabinesPosees } from "@/lib/cabines-posees";

/** Les mots de la pastille, comme sur la charge de la semaine. */
function titreEtat(etat: string, p: SourceEtatLot): string {
  const total = p.nbCabines || 0, posees = cabinesPosees(p);
  const s = (n: number) => (n > 1 ? "s" : "");
  switch (etat) {
    case "pose": return `${total} cabine${s(total)} posée${s(total)}`;
    case "encours": return `${posees} cabine${s(posees)} posée${s(posees)} sur ${total}`;
    case "souci": return "Soucis de montage";
    case "souci-regle": return "Soucis de montage réglé";
    case "signale": return "Pièce manquante ou défaut signalé";
    default: return "Pièce ou défaut signalé — réglé";
  }
}

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

  /* La pastille d'état : mêmes listes de signalements que le tableau de
     bord (ouverts / tous réglés), même règle (src/lib/etat-lot.ts). */
  if (rdv.some((r) => r.type === "montage" || r.type === "services")) {
    const [pieces, defauts] = await Promise.all([
      getData<{ projectId?: string; status?: string; resolved?: boolean }>("pieces").catch(() => []),
      getData<{ projectId?: string; status?: string; resolved?: boolean }>("defauts").catch(() => []),
    ]);
    const ouverts = new Set<string>(), tousSignales = new Set<string>();
    for (const x of pieces) {
      if (!x.projectId) continue;
      tousSignales.add(String(x.projectId));
      if (!(x.status === "recu" || x.resolved === true)) ouverts.add(String(x.projectId));
    }
    for (const x of defauts) {
      if (!x.projectId) continue;
      tousSignales.add(String(x.projectId));
      if (!(x.status === "resolu" || x.resolved === true)) ouverts.add(String(x.projectId));
    }
    rdv = rdv.map((r) => {
      if (r.type !== "montage" && r.type !== "services") return r;
      const p = parId.get(r.projetId) as (SourceEtatLot & ProjetPlanning) | undefined;
      if (!p) return r;
      const etat = etatLot(p, ouverts.has(r.projetId), tousSignales.has(r.projetId) && !ouverts.has(r.projetId));
      return etat ? { ...r, etat, etatTitre: titreEtat(etat, p) } : r;
    });
  }

  return NextResponse.json(
    { du, au, voitTout, collab: collab || null, collaborateurs: voitTout ? [...COLLABORATEURS_LIST] : [], rdv },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
