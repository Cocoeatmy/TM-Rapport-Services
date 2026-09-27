/**
 * Trois analyses que les données permettent depuis toujours.
 *
 *   • TRANSFORMATION — sur cent mesures prises pour ce sanitaire, combien
 *     deviennent des commandes ? Une mesure est un déplacement de deux heures ;
 *     celles qui ne se transforment jamais sont une perte sèche, invisible
 *     parce que diluée.
 *
 *   • ROUTE — ce que coûte en trajet une cabine posée, région par région. Un
 *     argument tarifaire, ou une raison de grouper les chantiers d'une région
 *     au lieu de les prendre à l'unité.
 *
 *   • SAV — non pas combien de SAV par marque, ce que l'application sait déjà,
 *     mais combien d'HEURES ils coûtent. « Cette série nous prend 14 h pour
 *     100 cabines posées » se négocie autrement qu'un pourcentage d'incidents.
 *
 * Tout est pur : ces fonctions reçoivent des projets et rendent des chiffres.
 */

import type { Project } from "@/lib/notion";
import { minutesPointees, trajet, lieuDepot, type Position } from "@/lib/tournee";
import { regionLabel, cantonOf } from "@/lib/swiss-cantons";

const MORTS = new Set(["Annulé"]);

function vide(v: unknown): boolean {
  return !String(v ?? "").trim();
}

function jourDe(v: string | null | undefined): number | null {
  if (!v) return null;
  const t = Date.parse(String(v).length <= 10 ? `${v}T12:00:00` : String(v));
  return Number.isNaN(t) ? null : t;
}

function dansFenetre(v: string | null | undefined, de?: string, a?: string): boolean {
  const t = jourDe(v);
  if (t === null) return false;
  if (de && t < jourDe(de)!) return false;
  if (a && t > jourDe(a)! + 86400000) return false;
  return true;
}

function estServicePur(p: Project): boolean {
  const t = Array.isArray(p.typeServices) ? p.typeServices : [];
  return t.length === 1 && /^\s*services?\s*$/i.test(t[0] || "");
}

function aCommande(p: Project): boolean {
  return !vide(p.cmdTM) || !vide(p.cmdTMUsine) || !vide(p.cmdGrossiste)
    || !!p.dateCMDRecue || !!p.dateCMDUsine;
}

/* ── Transformation ─────────────────────────────────────────────────────── */

export interface LigneTransformation {
  client: string;
  mesures: number;
  offres: number;
  commandes: number;
  /** Mesures anciennes restées sans commande : le déplacement perdu. */
  perdues: number;
  /** Commandes rapportées aux mesures, en pourcentage. */
  taux: number;
  cabines: number;
}

/** Une mesure sans commande est perdue au-delà de ce délai. */
const DELAI_PERDU = 60;

/**
 * Taux de transformation par client, sur les mesures reçues dans la fenêtre.
 *
 * On compte par MESURE et non par projet : c'est le déplacement qui coûte, et
 * c'est lui qu'on cherche à rentabiliser. Un client sous trois mesures n'est
 * pas affiché — un taux sur deux dossiers ne dit rien.
 */
export function transformation(
  projets: Project[],
  axe: "sanitaire" | "grossiste",
  de?: string, a?: string,
  maintenant: Date = new Date(),
): LigneTransformation[] {
  const m = new Map<string, LigneTransformation>();

  projets.forEach((p) => {
    if (MORTS.has(p.etatCMD) || estServicePur(p)) return;
    if (!dansFenetre(p.dateMesuresRecue, de, a)) return;

    const noms = axe === "sanitaire" ? (p.sanitaireNames || []) : (p.grossistesNames || []);
    const client = noms[0] || "Sans client renseigné";
    const cur = m.get(client) || {
      client, mesures: 0, offres: 0, commandes: 0, perdues: 0, taux: 0, cabines: 0,
    };
    cur.mesures += 1;
    if (p.dateOffre) cur.offres += 1;
    if (aCommande(p)) {
      cur.commandes += 1;
      cur.cabines += Number(p.nbCabines) || 0;
    } else {
      const age = (maintenant.getTime() - (jourDe(p.dateMesuresRecue) ?? 0)) / 86400000;
      if (age >= DELAI_PERDU) cur.perdues += 1;
    }
    m.set(client, cur);
  });

  return [...m.values()]
    .filter((l) => l.mesures >= 3)
    .map((l) => ({ ...l, taux: Math.round((l.commandes / l.mesures) * 100) }))
    .sort((a2, b) => b.mesures - a2.mesures);
}

/* ── Route ──────────────────────────────────────────────────────────────── */

export interface LigneRoute {
  region: string;
  cabines: number;
  projets: number;
  /** Minutes de route aller-retour depuis le dépôt, cumulées. */
  minutes: number;
  km: number;
  minutesParCabine: number;
  kmParCabine: number;
}

/** Clé du cache de géocodage — même normalisation que /api/geocode. */
function cleAdresse(adresse: string): string {
  return (adresse || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Coût de trajet par région, rapporté à la cabine posée.
 *
 * Le trajet est compté ALLER-RETOUR depuis le dépôt, pour chaque chantier pris
 * isolément. C'est volontairement pessimiste : une tournée qui enchaîne trois
 * chantiers d'une même région coûte bien moins. Le chiffre ne dit donc pas ce
 * qu'on dépense, il dit ce que coûterait chaque région si l'on y allait
 * séparément — ce qui est exactement la comparaison qu'on veut faire.
 */
export function coutRoute(
  projets: Project[],
  positions: Record<string, Position | null>,
  de?: string, a?: string,
): LigneRoute[] {
  const depot = lieuDepot(positions[cleAdresse("1400 Yverdon-les-Bains")] || undefined);
  const m = new Map<string, LigneRoute>();

  projets.forEach((p) => {
    if (p.etatCMD !== "Terminé" || estServicePur(p)) return;
    if (!dansFenetre(p.dateMontage, de, a)) return;
    const cabines = Number(p.nbCabinesInstallees) || Number(p.nbCabines) || 0;
    if (cabines <= 0) return;

    const texte = `${p.adresseChantier || ""} ${p.projet || ""}`;
    const npa = texte.match(/\b(\d{4})\b/)?.[1] || "";
    if (!npa) return;
    const lieu = {
      npa,
      region: regionLabel(texte),
      canton: cantonOf(texte) || "",
      pos: positions[cleAdresse(p.adresseChantier || "")] || undefined,
    };
    const t = trajet(depot, lieu);
    const region = lieu.region || "Hors zone";
    const cur = m.get(region) || {
      region, cabines: 0, projets: 0, minutes: 0, km: 0, minutesParCabine: 0, kmParCabine: 0,
    };
    cur.cabines += cabines;
    cur.projets += 1;
    cur.minutes += t.minutes * 2;
    cur.km += t.km * 2;
    m.set(region, cur);
  });

  return [...m.values()]
    .filter((l) => l.projets >= 3)
    .map((l) => ({
      ...l,
      minutesParCabine: Math.round(l.minutes / l.cabines),
      kmParCabine: Math.round(l.km / l.cabines),
    }))
    .sort((x, y) => y.minutesParCabine - x.minutesParCabine);
}

/* ── SAV ────────────────────────────────────────────────────────────────── */

export interface LigneSav {
  cle: string;
  /** Interventions SAV distinctes. */
  interventions: number;
  minutes: number;
  /** Cabines posées de cette marque ou série sur la période. */
  cabinesPosees: number;
  /** Heures de SAV pour cent cabines posées. */
  heuresPour100: number;
  /** Part des SAV imputés « Erreur TM ». */
  erreursTM: number;
}

/** Durée d'un SAV, cabines multiples comprises — même encodage que le montage. */
function minutesSav(p: Project): number {
  return minutesPointees({
    id: p.id,
    heureArrivee: p.heureArriveeSav,
    heureDepart: p.heureDepartSav,
  }) ?? 0;
}

function compteErreursTM(p: Project): number {
  const raw = String(p.causeSavCabines || "");
  const parCabine = [...raw.matchAll(/Cab\d+\s*:\s*([^|]*)/g)].map((x) => x[1].trim());
  const valeurs = parCabine.length > 0 ? parCabine : [String(p.causeSAV || "")];
  return valeurs.filter((v) => /erreur\s*tm/i.test(v)).length;
}

/**
 * Coût du SAV en heures, par marque ou par série.
 *
 * Le dénominateur est le nombre de cabines POSÉES de la même marque sur la
 * période : sans lui, un gros fournisseur paraîtrait toujours le pire.
 */
export function coutSav(
  projets: Project[],
  axe: "marque" | "serie",
  de?: string, a?: string,
): LigneSav[] {
  const champ = (p: Project) => (axe === "marque" ? p.fournisseurs : p.seriesCabines) || [];
  const m = new Map<string, LigneSav>();
  const ligne = (cle: string) => {
    const cur = m.get(cle) || {
      cle, interventions: 0, minutes: 0, cabinesPosees: 0, heuresPour100: 0, erreursTM: 0,
    };
    m.set(cle, cur);
    return cur;
  };

  // Dénominateur : les cabines posées sur la période.
  projets.forEach((p) => {
    if (p.etatCMD !== "Terminé" || estServicePur(p)) return;
    if (!dansFenetre(p.dateMontage, de, a)) return;
    const n = Number(p.nbCabinesInstallees) || Number(p.nbCabines) || 0;
    champ(p).forEach((k) => { ligne(k || "Non renseigné").cabinesPosees += n; });
  });

  // Numérateur : les heures de SAV, datées par la réception du SAV.
  projets.forEach((p) => {
    if (MORTS.has(p.etatCMD)) return;
    const quand = p.dateSAVRecu || p.dateRDVSAV || p.dateMontage;
    if (!dansFenetre(quand, de, a)) return;
    const min = minutesSav(p);
    const aSav = min > 0 || !!p.dateSAVRecu || !!p.dateRDVSAV;
    if (!aSav) return;
    const erreurs = compteErreursTM(p);
    champ(p).forEach((k) => {
      const l = ligne(k || "Non renseigné");
      l.interventions += 1;
      l.minutes += min;
      l.erreursTM += erreurs;
    });
  });

  return [...m.values()]
    .filter((l) => l.interventions > 0 && l.cabinesPosees >= 10)
    .map((l) => ({
      ...l,
      heuresPour100: Math.round((l.minutes / 60) / l.cabinesPosees * 100 * 10) / 10,
    }))
    .sort((x, y) => y.heuresPour100 - x.heuresPour100);
}
