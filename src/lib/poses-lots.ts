/**
 * Les cabines posées d'un chantier terminé, lot par lot, avec la date de
 * pose et l'équipe telles que l'APP les a enregistrées (22.10.2026).
 *
 * Le champ Notion « Date montage » ne porte qu'UNE date : sur un gros
 * chantier posé en plusieurs jours, voire plusieurs mois, toutes les cabines
 * tombaient ce jour-là. L'app, elle, sait pour chaque lot quand on est venu
 * et qui était là. Ordre des sources, pour chaque lot :
 *   1. ses passages (« Cab3:2026-10-09~Jean-Marc~10:14~11:09;… ») — la date
 *      retenue est celle du DERNIER passage : c'est là que le lot est fini ;
 *   2. sinon ses heures (« Cab3:2026-10-09:10:14 », départ puis arrivée) ;
 *   3. sinon la « Date montage » Notion du chantier.
 * L'équipe d'un lot : celle de ses passages, sinon le monteur responsable du
 * lot, sinon les collaborateurs du chantier.
 *
 * Seuls les chantiers TERMINÉS comptent : toutes leurs cabines sont posées.
 */

import { parseInterventions } from "@/lib/sav-interventions";

/** « Javier, Miguel », « A & B », « A + B », « A et B » → noms, sans doublon. */
function listeDeNoms(brut?: string | null): string[] {
  const vus = new Map<string, string>();
  for (const n of String(brut || "").split(/\s*(?:,|&|\+|\bet\b)\s*/)) {
    const nom = n.trim();
    if (nom && !vus.has(nom.toLowerCase())) vus.set(nom.toLowerCase(), nom);
  }
  return [...vus.values()];
}

export interface SourcePoseLots {
  etatCMD?: string | null;
  nbCabines?: number | string | null;
  dateMontage?: string | null;
  interventionsMontageCabines?: string | null;
  heureArrivee?: string | null;
  heureDepart?: string | null;
  attributionCabines?: string | null;
  collaborateurs?: string | null;
}

export interface LotPose {
  lot: number;
  /** AAAA-MM-JJ — fin de la pose de ce lot. */
  date: string;
  /** Premier jour où l'on est venu sur ce lot. */
  debut: string;
  equipe: string[];
}

const ISO = /\d{4}-\d{2}-\d{2}/;

/** « Cab3:… | Cab4:… » → { 3: "…", 4: "…" } */
function parLot(brut?: string | null): Map<number, string> {
  const m = new Map<number, string>();
  const re = /Cab(\d+)\s*:([^|]*)/g;
  let x: RegExpExecArray | null;
  while ((x = re.exec(String(brut || "")))) m.set(parseInt(x[1], 10), x[2].trim());
  return m;
}

export function estTermine(p: SourcePoseLots): boolean {
  return p.etatCMD === "Terminé";
}

export function posesDuChantier(p: SourcePoseLots): LotPose[] {
  if (!estTermine(p)) return [];
  const n = Number(p.nbCabines) || 0;
  if (n <= 0) return [];
  const passages = parLot(p.interventionsMontageCabines);
  const arrivees = parLot(p.heureArrivee);
  const departs = parLot(p.heureDepart);
  const monteurs = parLot(p.attributionCabines);
  const notion = String(p.dateMontage || "").slice(0, 10);
  const equipeChantier = listeDeNoms(p.collaborateurs);

  const out: LotPose[] = [];
  for (let lot = 1; lot <= n; lot++) {
    const liste = parseInterventions(passages.get(lot)).filter((x) => ISO.test(x.date));
    const dates = liste.map((x) => x.date).sort();
    const heure = (departs.get(lot) || "").match(ISO)?.[0] || (arrivees.get(lot) || "").match(ISO)?.[0] || "";
    const date = dates[dates.length - 1] || heure || notion;
    if (!date) continue; // aucune date connue : impossible de le placer dans le temps
    const debut = dates[0] || (arrivees.get(lot) || "").match(ISO)?.[0] || date;
    const desPassages = [...new Set(liste.flatMap((x) => listeDeNoms(x.collaborateurs)))];
    const equipe = desPassages.length ? desPassages
      : monteurs.get(lot) ? listeDeNoms(monteurs.get(lot))
      : equipeChantier;
    out.push({ lot, date, debut, equipe });
  }
  return out;
}
