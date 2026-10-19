/**
 * Le planning : les rendez-vous FIXÉS, par jour et par métier.
 *
 * Aucun système de rendez-vous en plus : tout se lit dans les fiches.
 *  - Montage / Services / Garantie : « Date Montage » (une plage de dates
 *    donne un rendez-vous par jour ouvré), équipe dans « Collaborateurs ».
 *  - Relevé de mesures : « Mesures traitée le », par « Mesures traitée par ».
 *  - SAV : par lot (« Dates RDV SAV cabines », « Collaborateurs SAV
 *    cabines ») — un lot clôturé n'a plus de rendez-vous ; à défaut de détail
 *    par lot, l'ancienne colonne « Date - RDV SAV » d'un SAV « RDV fixé ».
 *
 * Qui voit quoi se décide avec `champNomme` — la règle de la préparation
 * hors ligne : prénom contre prénom, binômes et « Team » compris.
 */
import { champNomme } from "./perimetre-projets";
import { parseCabMap } from "./sav-cabines";
import { getWorkingDays } from "./time-utils";

export type TypeRdv = "montage" | "mesures" | "services" | "garantie" | "sav";

export interface RendezVous {
  /** Unique : projet, type, jour (et lot pour un SAV). */
  cle: string;
  projetId: string;
  type: TypeRdv;
  /** AAAA-MM-JJ */
  jour: string;
  /** « 08:30 » si la fiche porte une heure, sinon null. */
  heure: string | null;
  projet: string;
  ofr: string;
  adresse: string;
  collaborateurs: string;
  cabines: number;
  /** Le mode de la fiche à ouvrir (?mode=…). */
  mode: string;
  /** Jour n sur m d'un montage étalé, sinon null. */
  etape: string | null;
}

export interface ProjetPlanning {
  id: string;
  projet?: string | null;
  ofrTM?: string | null;
  adresseChantier?: string | null;
  nbCabines?: number | null;
  collaborateurs?: string | null;
  mesuresTraiteePar?: string | null;
  collaborateursSAV?: string | null;
  dateMontage?: string | null;
  dateMontageEnd?: string | null;
  dateMesures?: string | null;
  dateRDVSAV?: string | null;
  etatSAV?: string | null;
  etatCMD?: string | null;
  typeServices?: string[] | null;
  datesRdvSavCabines?: string | null;
  collaborateursSavCabines?: string | null;
  datesSavClotureCabines?: string | null;
}

const jourDe = (d?: string | null) => (d || "").slice(0, 10);
const valide = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);

/** L'heure locale (Suisse) d'une date Notion qui en porte une. */
export function heureDe(d?: string | null): string | null {
  if (!d || !d.includes("T")) return null;
  const t = new Date(d);
  if (Number.isNaN(t.getTime())) return null;
  return t.toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Zurich" });
}

export function construireRendezVous(projets: ProjetPlanning[], du: string, au: string): RendezVous[] {
  const out: RendezVous[] = [];
  const dans = (j: string) => valide(j) && j >= du && j <= au;
  const base = (p: ProjetPlanning) => ({
    projetId: p.id, projet: p.projet || "", ofr: p.ofrTM || "", adresse: p.adresseChantier || "",
  });

  for (const p of projets) {
    const types = p.typeServices || [];
    const estService = types.some((t) => t.includes("Services"));
    const estGarantie = types.some((t) => t.toLowerCase().includes("garantie"));

    /* Montage / Services / Garantie : chaque jour ouvré de la plage. */
    const debut = jourDe(p.dateMontage);
    if (valide(debut) && p.etatCMD !== "Annulé") {
      const fin = jourDe(p.dateMontageEnd);
      const jours = fin && valide(fin) && fin > debut ? getWorkingDays(debut, fin) : [debut];
      const type: TypeRdv = estGarantie ? "garantie" : estService ? "services" : "montage";
      jours.forEach((j, i) => {
        if (!dans(j)) return;
        out.push({
          cle: `${p.id}:${type}:${j}`, ...base(p), type, jour: j,
          heure: i === 0 ? heureDe(p.dateMontage) : null,
          collaborateurs: p.collaborateurs || "", cabines: p.nbCabines || 0,
          mode: type === "services" ? "services" : "cmd",
          etape: jours.length > 1 ? `jour ${i + 1}/${jours.length}` : null,
        });
      });
    }

    /* Relevé de mesures. */
    const mesure = jourDe(p.dateMesures);
    if (dans(mesure)) {
      out.push({
        cle: `${p.id}:mesures:${mesure}`, ...base(p), type: "mesures", jour: mesure,
        heure: heureDe(p.dateMesures), collaborateurs: p.mesuresTraiteePar || "",
        cabines: p.nbCabines || 0, mode: "mesures", etape: null,
      });
    }

    /* SAV : par lot ; un lot clôturé n'est plus un rendez-vous. */
    const rdvLots = parseCabMap(p.datesRdvSavCabines);
    const equipesLots = parseCabMap(p.collaborateursSavCabines);
    const clotures = parseCabMap(p.datesSavClotureCabines);
    const parJour = new Map<string, { lots: number[]; equipe: string; heure: string | null }>();
    for (const [n, brut] of Object.entries(rdvLots)) {
      const lot = Number(n);
      if ((clotures[lot] || "").trim()) continue;
      const j = jourDe(brut);
      if (!dans(j)) continue;
      const e = parJour.get(j) || { lots: [], equipe: "", heure: heureDe(brut) };
      e.lots.push(lot);
      const equipe = equipesLots[lot] || p.collaborateursSAV || p.collaborateurs || "";
      if (equipe && !e.equipe.split(/\s*&\s*/).includes(equipe)) e.equipe = e.equipe ? `${e.equipe} & ${equipe}` : equipe;
      parJour.set(j, e);
    }
    for (const [j, e] of parJour) {
      out.push({
        cle: `${p.id}:sav:${j}`, ...base(p), type: "sav", jour: j, heure: e.heure,
        collaborateurs: e.equipe, cabines: e.lots.length, mode: "sav",
        etape: e.lots.length ? `lot${e.lots.length > 1 ? "s" : ""} ${e.lots.sort((a, b) => a - b).join(", ")}` : null,
      });
    }
    /* Ancienne base : SAV suivi au niveau du projet, sans détail par lot. */
    const ancien = jourDe(p.dateRDVSAV);
    if (Object.keys(rdvLots).length === 0 && p.etatSAV === "RDV fixé" && dans(ancien)) {
      out.push({
        cle: `${p.id}:sav:${ancien}`, ...base(p), type: "sav", jour: ancien, heure: heureDe(p.dateRDVSAV),
        collaborateurs: p.collaborateursSAV || p.collaborateurs || "", cabines: p.nbCabines || 0, mode: "sav", etape: null,
      });
    }
  }

  return out.sort((a, b) => a.jour.localeCompare(b.jour) || (a.heure || "99").localeCompare(b.heure || "99") || a.projet.localeCompare(b.projet));
}

/** Les rendez-vous confiés à cette personne (prénom, binôme, Team). */
export function rendezVousDe(rdv: RendezVous[], nom: string): RendezVous[] {
  return rdv.filter((r) => champNomme(r.collaborateurs, nom));
}
