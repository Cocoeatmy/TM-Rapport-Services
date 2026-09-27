/**
 * Carnet de commandes — combien de travail reste devant nous.
 *
 * Toute l'information existe depuis toujours : des cabines sont commandées ou
 * livrées, elles ne sont pas encore posées, et l'on sait combien de temps une
 * cabine prend chez tel fournisseur puisqu'on pointe les heures. Personne ne
 * multipliait les deux.
 *
 * Le carnet répond à trois questions qu'on tranche autrement au doigt mouillé :
 * peut-on accepter ce chantier, faut-il renforcer l'équipe, et quand promettre
 * la pose à ce client.
 *
 * Deux mesures, volontairement distinctes :
 *   • le TRAVAIL restant, en jours-homme, qui ne dépend que des cabines ;
 *   • le DÉLAI d'absorption, déduit du rythme réellement tenu ces dernières
 *     semaines — pas d'un effectif théorique, que l'application ne connaît pas.
 */

import type { Project } from "@/lib/notion";
import { baremeDurees, JOURNEE_MINUTES } from "@/lib/tournee";
import { regionLabel } from "@/lib/swiss-cantons";

export interface LigneCarnet {
  cle: string;
  cabines: number;
  minutes: number;
  projets: number;
}

export interface Carnet {
  /** Cabines vendues et pas encore posées. */
  cabines: number;
  projets: number;
  minutes: number;
  /** Travail restant, en journées de 8 h 30. */
  jours: number;
  parEtape: LigneCarnet[];
  parFournisseur: LigneCarnet[];
  parRegion: LigneCarnet[];
  /** Cabines dont la pose est déjà planifiée, incluses dans le total. */
  planifiees: number;
  rythme: {
    /** Cabines posées par semaine, moyenne des semaines de référence. */
    cabinesParSemaine: number;
    semainesObservees: number;
    /** Semaines nécessaires pour absorber le carnet à ce rythme. */
    semaines: number | null;
    /** Date d'absorption estimée (ISO court), null si le rythme est inconnu. */
    dateAbsorption: string | null;
  };
  /** Cabines livrées depuis longtemps sans rendez-vous : le carnet qui dort. */
  dormantes: { cabines: number; projets: number; seuilJours: number };
  saison: LigneSaison[];
  semainesAVenir: LigneSemaine[];
}

export interface LigneSemaine {
  /** Lundi de la semaine, ISO court. */
  lundi: string;
  numero: number;
  /** Cabines dont la pose est déjà fixée cette semaine-là. */
  planifiees: number;
  /** Capacité estimée, d'après le rythme observé. */
  capacite: number;
  /** Cabines au-delà de la capacité ; 0 si la semaine tient. */
  surcharge: number;
}

export interface LigneSaison {
  /** 1 = janvier. */
  mois: number;
  cabines: number;
  /** Écart à la moyenne mensuelle, en pourcentage. */
  indice: number;
  /** Années observées pour ce mois — au-dessous de deux, l'indice est fragile. */
  annees: number;
}

const MORTS = new Set(["Annulé"]);
/** Semaines de référence pour le rythme : assez pour lisser, assez récent. */
const SEMAINES_REFERENCE = 8;
/** Au-delà, une cabine livrée sans rendez-vous n'avance plus toute seule. */
const SEUIL_DORMANT = 30;

function vide(v: unknown): boolean {
  return !String(v ?? "").trim();
}

function jourDe(v: string | null | undefined): number | null {
  if (!v) return null;
  const t = Date.parse(String(v).length <= 10 ? `${v}T12:00:00` : String(v));
  return Number.isNaN(t) ? null : t;
}

function estServicePur(p: Project): boolean {
  const t = Array.isArray(p.typeServices) ? p.typeServices : [];
  return t.length === 1 && /^\s*services?\s*$/i.test(t[0] || "");
}

function aCommande(p: Project): boolean {
  return !vide(p.cmdTM) || !vide(p.cmdTMUsine) || !vide(p.cmdGrossiste)
    || !!p.dateCMDRecue || !!p.dateCMDUsine;
}

function arrivage(p: Project): string | null {
  return p.arrivageTM || p.arrivageGrossiste || null;
}

/**
 * Étape du carnet — l'ordre dit l'avancement, du plus proche de la pose au
 * plus lointain. Une cabine n'appartient qu'à une seule étape.
 */
function etapeDe(p: Project): string {
  if (p.dateMontage) return "Rendez-vous fixé";
  if (arrivage(p)) return "Livrée, rendez-vous à fixer";
  if (aCommande(p)) return "Commandée, en attente de livraison";
  if (p.dateMesuresRecue || p.etatMesures === "Terminé") return "Mesurée, pas encore commandée";
  return "En attente de mesures";
}

/**
 * Saisonnalité de la pose, sur les vingt-quatre derniers mois complets.
 *
 * Le carnet annonce « six semaines de travail » sans dire si elles tombent
 * dans un mois habituellement chargé ou creux. L'indice répond à la question
 * qui suit immédiatement : faut-il renforcer l'équipe, ou est-ce le pic
 * d'automne qui retombera de lui-même ?
 */
function saisonnalite(projets: Project[], maintenant: Date): LigneSaison[] {
  const fin = new Date(maintenant.getFullYear(), maintenant.getMonth(), 1).getTime();
  const debut = new Date(maintenant.getFullYear() - 2, maintenant.getMonth(), 1).getTime();

  const parMois = new Map<number, { cabines: number; annees: Set<number> }>();
  let total = 0;
  projets.forEach((p) => {
    if (MORTS.has(p.etatCMD) || estServicePur(p)) return;
    const t = jourDe(p.dateMontage);
    // Le mois en cours est exclu : incomplet, il tirerait son indice vers le bas.
    if (t === null || t < debut || t >= fin) return;
    const n = Number(p.nbCabinesInstallees) || Number(p.nbCabines) || 0;
    if (n <= 0) return;
    const d = new Date(t);
    const m = d.getMonth() + 1;
    const cur = parMois.get(m) || { cabines: 0, annees: new Set<number>() };
    cur.cabines += n;
    cur.annees.add(d.getFullYear());
    parMois.set(m, cur);
    total += n;
  });

  const moisObserves = parMois.size;
  if (moisObserves === 0 || total === 0) return [];
  const moyenne = total / moisObserves;

  return Array.from({ length: 12 }, (_, i) => {
    const v = parMois.get(i + 1);
    return {
      mois: i + 1,
      cabines: v?.cabines ?? 0,
      indice: v ? Math.round(((v.cabines - moyenne) / moyenne) * 100) : -100,
      annees: v?.annees.size ?? 0,
    };
  });
}

/**
 * Charge des douze prochaines semaines, semaine par semaine.
 *
 * Le carnet dit COMBIEN de travail reste, la saisonnalité dans quel MOIS il
 * tombe ; il manquait QUAND, à la semaine près. Ici on ne calcule rien de
 * nouveau : on répartit les rendez-vous déjà fixés sur leur semaine réelle, et
 * on les compare au rythme observé. C'est ce rapprochement — et lui seul — qui
 * dit s'il faut décaler un chantier ou appeler un renfort, ce qu'un total ne
 * dit jamais.
 */
function chargeAVenir(
  projets: Project[],
  cabinesParSemaine: number,
  maintenant: Date,
): LigneSemaine[] {
  // Lundi de la semaine en cours, à midi pour échapper aux changements d'heure.
  const lundi = new Date(maintenant);
  lundi.setDate(maintenant.getDate() - ((maintenant.getDay() + 6) % 7));
  lundi.setHours(12, 0, 0, 0);

  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const numeroSemaine = (d: Date): number => {
    const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
    const premier = new Date(t.getFullYear(), 0, 4);
    return 1 + Math.round(((t.getTime() - premier.getTime()) / 86400000
      - 3 + ((premier.getDay() + 6) % 7)) / 7);
  };

  const semaines: LigneSemaine[] = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(lundi);
    d.setDate(lundi.getDate() + i * 7);
    return {
      lundi: iso(d), numero: numeroSemaine(d),
      planifiees: 0, capacite: Math.round(cabinesParSemaine), surcharge: 0,
    };
  });
  const index = new Map(semaines.map((s, i) => [s.lundi, i]));

  projets.forEach((p) => {
    if (MORTS.has(p.etatCMD) || p.etatCMD === "Terminé" || estServicePur(p)) return;
    const t = jourDe(p.dateMontage);
    if (t === null) return;
    const d = new Date(t);
    const l = new Date(d);
    l.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    l.setHours(12, 0, 0, 0);
    const i = index.get(iso(l));
    if (i === undefined) return;
    semaines[i].planifiees += restantes(p);
  });

  return semaines.map((s) => ({
    ...s,
    surcharge: s.capacite > 0 ? Math.max(0, s.planifiees - s.capacite) : 0,
  }));
}

/** Cabines restant à poser sur un projet ; 0 si tout est posé. */
function restantes(p: Project): number {
  const total = Number(p.nbCabines) || 0;
  const posees = Number(p.nbCabinesInstallees) || 0;
  return Math.max(0, total - posees);
}

function cumuler(m: Map<string, LigneCarnet>, cle: string, cabines: number, minutes: number) {
  const cur = m.get(cle) || { cle, cabines: 0, minutes: 0, projets: 0 };
  cur.cabines += cabines;
  cur.minutes += minutes;
  cur.projets += 1;
  m.set(cle, cur);
}

function trier(m: Map<string, LigneCarnet>): LigneCarnet[] {
  return [...m.values()].sort((a, b) => b.cabines - a.cabines);
}

/**
 * Construit le carnet à partir de TOUS les projets — les terminés servent à
 * établir le barème de durée et le rythme des dernières semaines.
 */
export function construireCarnet(projets: Project[], maintenant: Date = new Date()): Carnet {
  const bareme = baremeDurees(projets.filter((p) => p.etatCMD === "Terminé"));

  /* Le carnet : ce qui est vendu et pas encore posé. Les services purs sont
     écartés — ils n'ont pas de cabine à poser — comme les projets annulés. */
  const enAttente = projets.filter((p) =>
    !MORTS.has(p.etatCMD) && p.etatCMD !== "Terminé"
    && !estServicePur(p) && restantes(p) > 0);

  const parEtape = new Map<string, LigneCarnet>();
  const parFournisseur = new Map<string, LigneCarnet>();
  const parRegion = new Map<string, LigneCarnet>();
  let cabines = 0, minutes = 0, planifiees = 0;

  enAttente.forEach((p) => {
    const n = restantes(p);
    const m = Math.round(bareme.parCabine(p.fournisseurs) * n);
    cabines += n;
    minutes += m;
    if (p.dateMontage) planifiees += n;
    cumuler(parEtape, etapeDe(p), n, m);
    cumuler(parFournisseur, (p.fournisseurs || [])[0] || "Sans marque", n, m);
    cumuler(parRegion, regionLabel(`${p.adresseChantier || ""} ${p.projet || ""}`) || "Hors zone", n, m);
  });

  /* Rythme : cabines réellement posées sur les dernières semaines complètes.
     On le mesure au lieu de le supposer — l'application ne connaît ni les
     vacances ni les absences, et un effectif théorique mentirait. */
  const finFenetre = maintenant.getTime();
  const debutFenetre = finFenetre - SEMAINES_REFERENCE * 7 * 86400000;
  let poseesRecentes = 0;
  projets.forEach((p) => {
    if (MORTS.has(p.etatCMD)) return;
    const t = jourDe(p.dateMontage);
    if (t === null || t < debutFenetre || t > finFenetre) return;
    const n = Number(p.nbCabinesInstallees) || Number(p.nbCabines) || 0;
    poseesRecentes += n;
  });
  const cabinesParSemaine = poseesRecentes / SEMAINES_REFERENCE;
  const semaines = cabinesParSemaine > 0 ? cabines / cabinesParSemaine : null;
  const dateAbsorption = semaines !== null
    ? new Date(finFenetre + semaines * 7 * 86400000).toISOString().slice(0, 10)
    : null;

  // Le carnet qui dort : livré depuis longtemps, toujours sans rendez-vous.
  const dormants = enAttente.filter((p) => {
    if (p.dateMontage) return false;
    const t = jourDe(arrivage(p));
    return t !== null && (finFenetre - t) / 86400000 >= SEUIL_DORMANT;
  });

  return {
    cabines,
    projets: enAttente.length,
    minutes,
    jours: Math.round((minutes / JOURNEE_MINUTES) * 10) / 10,
    parEtape: trier(parEtape),
    parFournisseur: trier(parFournisseur),
    parRegion: trier(parRegion),
    planifiees,
    rythme: {
      cabinesParSemaine: Math.round(cabinesParSemaine * 10) / 10,
      semainesObservees: SEMAINES_REFERENCE,
      semaines: semaines !== null ? Math.round(semaines * 10) / 10 : null,
      dateAbsorption,
    },
    dormantes: {
      cabines: dormants.reduce((s, p) => s + restantes(p), 0),
      projets: dormants.length,
      seuilJours: SEUIL_DORMANT,
    },
    saison: saisonnalite(projets, maintenant),
    semainesAVenir: chargeAVenir(projets, cabinesParSemaine, maintenant),
  };
}
