/**
 * Le prix plancher d'un chantier (24.10.2026) — visible du propriétaire seul.
 *
 * Avant d'envoyer une offre : en dessous de quel prix ce chantier coûte-t-il
 * plus qu'il ne rapporte, marge cible comprise ? Le calcul ne devine rien
 * qu'il ne puisse montrer ; il s'appuie sur les chantiers DÉJÀ posés :
 *
 *   1. Heures sur place. Parmi les chantiers comparables (même série, sinon
 *      même fournisseur, sinon tous), les heures-hommes réellement pointées
 *      donnent une partie fixe par chantier et un temps par cabine (droite
 *      ajustée ; à défaut, la médiane par cabine).
 *   2. Route. Dépôt d'Yverdon → chantier → dépôt, autant de fois qu'il faut
 *      habituellement de passages, avec l'équipe habituelle : du temps payé,
 *      plus le véhicule (au kilomètre si un coût est saisi, sinon le coût
 *      forfaitaire d'un déplacement).
 *   3. Achats. Cabine (prix du fournisseur s'il est saisi, sinon la moyenne),
 *      accessoires et consommables, par cabine.
 *   4. Plancher = coût ÷ (1 − marge cible).
 *
 * À côté : le prix HABITUEL (ce que bexio a réellement facturé pour des
 * chantiers comparables, ramené au nombre de cabines) et la fiabilité (sur
 * combien de chantiers le calcul repose).
 */

import { minutesParPersonne, type SourceHeuresHommes } from "@/lib/heures-hommes";
import { minutesDuChantier } from "@/lib/heures-chantier";
import { coutHoraireDe } from "@/lib/cout-horaire";

export interface ChantierHistorique extends SourceHeuresHommes {
  ofrTM?: string | null;
  nbCabines?: number | null;
  seriesCabines?: string[] | null;
  fournisseurs?: string[] | null;
}

export interface Demande {
  serie?: string;
  fournisseur?: string;
  cabines: number;
  /** Trajet simple dépôt → chantier, s'il est connu. */
  trajet?: { minutes: number; km: number } | null;
}

export type Base = "serie" | "fournisseur" | "tous";

export interface PrixPlancher {
  plancher: number;
  cout: number;
  margeCible: number | null;
  detail: {
    heuresPose: number;
    coutPose: number;
    passages: number;
    personnes: number;
    heuresRoute: number;
    coutRoute: number;
    coutVehicule: number;
    achats: number;
  };
  /** Ce qui a été facturé (HT) pour des chantiers comparables, à ce nombre de cabines. */
  habituel: { median: number; bas: number; haut: number; n: number } | null;
  fiabilite: { base: Base; chantiers: number };
  /** Ce qui manque pour un calcul complet — dit, jamais deviné. */
  manques: string[];
}

const nombre = (v: unknown): number | null => {
  const x = typeof v === "string" ? parseFloat(v.replace(",", ".")) : Number(v);
  return Number.isFinite(x) && x > 0 ? x : null;
};
const arrondi = (x: number, pas = 1) => Math.round(x / pas) * pas;

export function mediane(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function quantile(xs: number[], q: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))];
}

/** Jours de passage distincts : chaque jour est un aller-retour. */
export function passagesDe(p: ChantierHistorique): number {
  const texte = `${p.heureArrivee || ""} ${p.interventionsMontageCabines || ""}`;
  const jours = new Set(texte.match(/\d{4}-\d{2}-\d{2}/g) || []);
  return Math.max(1, jours.size);
}

interface Mesure {
  ofr: string;
  cabines: number;
  minutesHommes: number;
  passages: number;
  personnes: number;
  coutHoraire: number | null;
}

function mesurer(p: ChantierHistorique, valeurs: Record<string, unknown>): Mesure | null {
  const cabines = Math.max(1, Number(p.nbCabines) || 0);
  const hh = minutesParPersonne(p);
  const minutesHommes = Object.values(hh.parPersonne).reduce((a, b) => a + b, 0) + hh.sansNom;
  if (minutesHommes < 20) return null; // pas d'heures pointées : rien à apprendre
  const presence = minutesDuChantier(p.heureArrivee, p.heureDepart) || minutesHommes;
  const personnes = Math.max(1, Math.min(4, minutesHommes / Math.max(presence, 1)));
  const taux = Object.keys(hh.parPersonne).map((n) => coutHoraireDe(n, valeurs)).filter((t): t is number => t !== null);
  return {
    ofr: String(p.ofrTM || "").trim().toUpperCase(),
    cabines, minutesHommes, passages: passagesDe(p), personnes,
    coutHoraire: taux.length ? taux.reduce((a, b) => a + b, 0) / taux.length : null,
  };
}

/** Heures-hommes ≈ fixe + parCabine × cabines (moindres carrés, bornés à ≥ 0). */
export function ajuster(points: { cabines: number; minutes: number }[]): { fixe: number; parCabine: number } {
  const parCab = mediane(points.map((p) => p.minutes / p.cabines));
  if (points.length < 4) return { fixe: 0, parCabine: parCab };
  const n = points.length;
  const mx = points.reduce((s, p) => s + p.cabines, 0) / n;
  const my = points.reduce((s, p) => s + p.minutes, 0) / n;
  const sxx = points.reduce((s, p) => s + (p.cabines - mx) ** 2, 0);
  if (sxx < 1e-6) return { fixe: 0, parCabine: parCab };
  const b = points.reduce((s, p) => s + (p.cabines - mx) * (p.minutes - my), 0) / sxx;
  const a = my - b * mx;
  if (b <= 0 || a < 0) return { fixe: 0, parCabine: parCab };
  return { fixe: a, parCabine: b };
}

const contient = (liste: string[] | null | undefined, v?: string) =>
  !!v && (liste || []).some((x) => x.trim().toLowerCase() === v.trim().toLowerCase());

export function calculerPrixPlancher(
  demande: Demande,
  historique: ChantierHistorique[],
  valeurs: Record<string, unknown>,
  /** Recette HT réellement facturée, par n° d'offre TM. */
  recettes: Record<string, { ht: number; estime: boolean }> = {},
): PrixPlancher {
  const manques: string[] = [];
  const cabines = Math.max(1, Math.round(demande.cabines || 1));

  /* Les comparables, du plus précis au plus large. */
  const parSerie = historique.filter((p) => contient(p.seriesCabines, demande.serie));
  const parFournisseur = historique.filter((p) => contient(p.fournisseurs, demande.fournisseur));
  const mesures = (liste: ChantierHistorique[]) => liste.map((p) => mesurer(p, valeurs)).filter((m): m is Mesure => !!m);
  let base: Base = "serie";
  let comp = mesures(parSerie);
  if (comp.length < 3) { base = "fournisseur"; comp = mesures(parFournisseur); }
  if (comp.length < 3) { base = "tous"; comp = mesures(historique); }

  /* 1. Pose. */
  const droite = ajuster(comp.map((m) => ({ cabines: m.cabines, minutes: m.minutesHommes })));
  const minutesPose = droite.fixe + droite.parCabine * cabines;
  const tauxDefaut = nombre(valeurs.tauxHoraire);
  const tauxComp = comp.map((m) => m.coutHoraire).filter((t): t is number => t !== null);
  const taux = tauxComp.length ? mediane(tauxComp) : tauxDefaut;
  if (taux === null) manques.push("aucun coût horaire saisi (Finances → Rentabilité / salaires)");
  const t = taux ?? 0;
  const coutPose = (minutesPose / 60) * t;

  /* 2. Route. */
  const passages = comp.length ? Math.max(1, Math.round(mediane(comp.map((m) => m.passages)))) : 1;
  const personnes = comp.length ? Math.max(1, Math.round(mediane(comp.map((m) => m.personnes)))) : 2;
  let heuresRoute = 0, coutVehicule = 0;
  const coutKm = nombre(valeurs.coutKm);
  const forfait = nombre(valeurs.coutDeplacement);
  if (demande.trajet) {
    heuresRoute = (passages * 2 * demande.trajet.minutes * personnes) / 60;
    const km = demande.trajet.km || Math.round((demande.trajet.minutes * 62) / 60);
    coutVehicule = coutKm !== null ? passages * 2 * km * coutKm : (forfait ?? 0) * passages;
    if (coutKm === null && forfait === null) manques.push("ni coût au kilomètre ni coût d'un déplacement saisis");
  } else {
    manques.push("adresse non localisée : route comptée au coût forfaitaire d'un déplacement");
    coutVehicule = (forfait ?? 0) * passages;
  }
  const coutRoute = heuresRoute * t;

  /* 3. Achats. */
  const achatFournisseur = demande.fournisseur ? nombre(valeurs[`achat_${demande.fournisseur}`]) : null;
  const achatMoyen = nombre(valeurs.achatCabine);
  if (achatFournisseur === null && achatMoyen === null) manques.push("aucun prix d'achat de cabine saisi (normal si le client fournit la cabine et que vous ne facturez que la pose)");
  const parCabine = (achatFournisseur ?? achatMoyen ?? 0) + (nombre(valeurs.accessoires) ?? 0) + (nombre(valeurs.consommables) ?? 0);
  const achats = cabines * parCabine;

  /* 4. Plancher. */
  const cout = coutPose + coutRoute + coutVehicule + achats;
  const marge = nombre(valeurs.margeCible);
  const margeCible = marge !== null && marge < 95 ? marge : null;
  if (margeCible === null) manques.push("pas de marge cible : le plancher est le prix de revient");
  const plancher = margeCible !== null ? cout / (1 - margeCible / 100) : cout;

  /* Le prix habituel : facturé (HT) par cabine sur les comparables, × cabines. */
  const parCab = comp
    .map((m) => ({ m, r: recettes[m.ofr] }))
    .filter((x) => x.r && !x.r.estime && x.r.ht > 0)
    .map((x) => x.r.ht / x.m.cabines);
  const habituel = parCab.length >= 2 ? {
    median: arrondi(mediane(parCab) * cabines, 10),
    bas: arrondi(quantile(parCab, 0.25) * cabines, 10),
    haut: arrondi(quantile(parCab, 0.75) * cabines, 10),
    n: parCab.length,
  } : null;

  return {
    plancher: arrondi(plancher, 10),
    cout: arrondi(cout),
    margeCible,
    detail: {
      heuresPose: Math.round((minutesPose / 60) * 10) / 10,
      coutPose: arrondi(coutPose),
      passages, personnes,
      heuresRoute: Math.round(heuresRoute * 10) / 10,
      coutRoute: arrondi(coutRoute),
      coutVehicule: arrondi(coutVehicule),
      achats: arrondi(achats),
    },
    habituel,
    fiabilite: { base, chantiers: comp.length },
    manques,
  };
}

export type Verdict = "ok" | "sous-habituel" | "sous-plancher" | "atypique";

/**
 * Une offre face à son plancher.
 *
 * « atypique » : l'offre vaut moins de 40 % du prix habituel d'une pose
 * comparable. Vérifié sur les vraies offres (24.10.2026) : ce sont des
 * offres de 60 à 120 CHF — une mesure, un supplément — pas des poses. Les
 * dire « sous le plancher » serait faux ; elles sont signalées à part.
 */
export function verdictOffre(offreHT: number, p: PrixPlancher): Verdict {
  if (p.habituel && offreHT < 0.4 * p.habituel.median) return "atypique";
  if (offreHT < p.plancher) return "sous-plancher";
  if (p.habituel && offreHT < p.habituel.bas) return "sous-habituel";
  return "ok";
}
