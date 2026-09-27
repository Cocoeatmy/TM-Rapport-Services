/**
 * Assistant de tournée — journée complète, dépôt compris.
 *
 * La journée part du dépôt (1400 Yverdon-les-Bains) et y revient : ce sont ces
 * deux trajets, plus ceux entre chantiers, qui font la différence entre « 5 h
 * de pose » et une journée de 10 h.
 *
 * Distances : dès que les coordonnées des adresses sont connues (cache
 * /api/geocode), le trajet est estimé à vol d'oiseau majoré d'un coefficient
 * routier, à vitesse moyenne — une estimation, pas un calcul d'itinéraire.
 * Sans coordonnées, on retombe sur la proximité par code postal, convertie en
 * minutes. L'itinéraire réel, lui, s'ouvre dans Google Maps.
 *
 * Durées de pose : moyennes des heures réellement pointées sur les montages
 * terminés du même fournisseur.
 */

import { regionLabel, cantonOf } from "@/lib/swiss-cantons";

/** Point de départ ET de retour de toute tournée. */
export const DEPOT = "1400 Yverdon-les-Bains";

/** Journée de référence : 8 h 30. Au-delà, ce sont des heures supplémentaires. */
export const JOURNEE_MINUTES = 510;

/** Majoration du vol d'oiseau pour approcher la route, et vitesse moyenne. */
const COEF_ROUTE = 1.35;
const KMH = 62;
/** Stationnement, déchargement, mise en route sur place. */
const MINUTES_ARRET = 8;

export interface CandidatSource {
  id: string;
  ofrTM?: string;
  projet?: string;
  adresseChantier?: string;
  nbCabines?: number | null;
  nbCartons?: number | null;
  fournisseurs?: string[];
  heureArrivee?: string;
  heureDepart?: string;
}

export interface Position { lat: number; lng: number }

export interface Candidat {
  id: string;
  ofrTM: string;
  projet: string;
  adresse: string;
  npa: string;
  localite: string;
  region: string;
  canton: string;
  cabines: number;
  cartons: number;
  /** Minutes de pose estimées. */
  minutes: number;
  pos?: Position;
  source: CandidatSource;
}

export interface Tournee {
  etapes: Candidat[];
  cabines: number;
  cartons: number;
  /** Minutes de pose cumulées. */
  minutesPose: number;
  /** Minutes de route, dépôt → chantiers → dépôt. */
  minutesTrajet: number;
  /** Journée complète : pose + route. */
  minutesTotal: number;
  kmApprox: number;
  etendue: string;
  /** true quand la journée dépasse 8 h 30. */
  heuresSupp: boolean;
}

const DEFAUT_MINUTES_PAR_CABINE = 90;

function npaDe(texte: string): string {
  const m = (texte || "").match(/\b(\d{4})\b/);
  return m ? m[1] : "";
}
function localiteDe(texte: string): string {
  const m = (texte || "").match(/\b(\d{4})\s+([^,]+)/);
  return m ? m[2].trim() : "";
}

function minutesPointees(p: CandidatSource): number | null {
  const lire = (raw?: string) => {
    const m = String(raw || "").match(/(\d{1,2}):(\d{2})/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const a = lire(p.heureArrivee);
  const b = lire(p.heureDepart);
  if (a === null || b === null || b <= a) return null;
  return b - a;
}

export function baremeDurees(historique: CandidatSource[]) {
  const parFournisseur = new Map<string, { min: number; cab: number }>();
  let totalMin = 0, totalCab = 0;
  historique.forEach((p) => {
    const min = minutesPointees(p);
    const cab = Number(p.nbCabines) || 0;
    if (min === null || cab <= 0) return;
    totalMin += min; totalCab += cab;
    (p.fournisseurs || []).forEach((f) => {
      const cur = parFournisseur.get(f) || { min: 0, cab: 0 };
      cur.min += min; cur.cab += cab;
      parFournisseur.set(f, cur);
    });
  });
  const general = totalCab > 0 ? totalMin / totalCab : DEFAUT_MINUTES_PAR_CABINE;
  return {
    general,
    parCabine(fournisseurs?: string[]): number {
      for (const f of fournisseurs || []) {
        const v = parFournisseur.get(f);
        if (v && v.cab >= 3) return v.min / v.cab;
      }
      return general;
    },
  };
}

export function preparerCandidats(
  projets: CandidatSource[],
  historique: CandidatSource[],
  positions?: Record<string, Position | null>,
): Candidat[] {
  const bareme = baremeDurees(historique);
  return projets.map((p) => {
    const texte = p.adresseChantier || p.projet || "";
    const adresse = p.adresseChantier || "";
    const cabines = Number(p.nbCabines) || 0;
    const npa = npaDe(adresse) || npaDe(p.projet || "");
    const pos = positions?.[adresse || texte] || undefined;
    return {
      id: p.id,
      ofrTM: p.ofrTM || "—",
      projet: p.projet || "Sans nom",
      adresse,
      npa,
      localite: localiteDe(adresse) || localiteDe(p.projet || "") || "Sans localité",
      region: regionLabel(texte),
      canton: cantonOf(texte) || "",
      cabines,
      cartons: Number(p.nbCartons) || 0,
      minutes: Math.round(bareme.parCabine(p.fournisseurs) * Math.max(cabines, 1)),
      pos: pos || undefined,
      source: p,
    };
  });
}

/** Écart de proximité par code postal : 0 = même localité, 4 = sans rapport. */
export function distance(a: { npa: string; region: string; canton: string },
                         b: { npa: string; region: string; canton: string }): number {
  if (a.npa && a.npa === b.npa) return 0;
  if (a.npa && b.npa && a.npa.slice(0, 3) === b.npa.slice(0, 3)) return 1;
  if (a.region && a.region === b.region) return 2;
  if (a.canton && a.canton === b.canton) return 3;
  return 4;
}

/** Minutes de route approchées, faute d'itinéraire réel. */
const MINUTES_PAR_ECART = [8, 16, 30, 48, 75];

function km(a: Position, b: Position): number {
  const R = 6371;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export interface Lieu {
  npa: string; region: string; canton: string; pos?: Position;
}

/** Trajet entre deux lieux : minutes et kilomètres approchés. */
export function trajet(a: Lieu, b: Lieu): { minutes: number; km: number } {
  if (a.pos && b.pos) {
    const d = km(a.pos, b.pos) * COEF_ROUTE;
    return { minutes: Math.round((d / KMH) * 60) + MINUTES_ARRET, km: Math.round(d) };
  }
  return { minutes: MINUTES_PAR_ECART[distance(a, b)] + MINUTES_ARRET, km: 0 };
}

/** Le dépôt, sous la forme attendue par le calcul de trajet. */
export function lieuDepot(pos?: Position | null): Lieu {
  return {
    npa: "1400", region: regionLabel(DEPOT), canton: cantonOf(DEPOT) || "VD",
    pos: pos || undefined,
  };
}

export interface Contraintes {
  nombre: number;
  secteur?: string;
  cartonsMax?: number;
  /** Durée maximale de la journée, trajets compris. 0 = non limitée. */
  minutesMax?: number;
  /** Montage imposé : il sera dans la tournée quoi qu'il arrive. */
  obligatoire?: string;
  /** Sélection manuelle : la tournée est exactement cette liste, ordonnée. */
  imposes?: string[];
}

function correspondSecteur(c: Candidat, secteur: string): boolean {
  const s = secteur.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  if (!s) return true;
  return [c.npa, c.localite, c.region, c.canton, c.adresse]
    .map((v) => String(v || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase())
    .some((v) => v.includes(s));
}

/** Toutes les permutations (jusqu'à 6 étapes : 720 ordres, négligeable). */
function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr];
  const out: T[][] = [];
  arr.forEach((v, i) => {
    const reste = [...arr.slice(0, i), ...arr.slice(i + 1)];
    permutations(reste).forEach((p) => out.push([v, ...p]));
  });
  return out;
}

/** Journée complète pour un ordre donné : dépôt → étapes → dépôt. */
function evaluer(etapes: Candidat[], depot: Lieu) {
  let minutesTrajet = 0, kmTotal = 0;
  let precedent: Lieu = depot;
  etapes.forEach((c) => {
    const t = trajet(precedent, c);
    minutesTrajet += t.minutes; kmTotal += t.km;
    precedent = c;
  });
  const retour = trajet(precedent, depot);
  minutesTrajet += retour.minutes; kmTotal += retour.km;
  const minutesPose = etapes.reduce((s, c) => s + c.minutes, 0);
  return { minutesTrajet, kmTotal, minutesPose, total: minutesPose + minutesTrajet };
}

/** Meilleur ordre de visite pour un ensemble donné. */
function ordonner(etapes: Candidat[], depot: Lieu): Candidat[] {
  if (etapes.length <= 2) return etapes;
  if (etapes.length > 7) {
    // Au-delà, on se contente du plus proche en plus proche.
    const reste = [...etapes];
    const ordre: Candidat[] = [];
    let cur: Lieu = depot;
    while (reste.length) {
      reste.sort((a, b) => trajet(cur, a).minutes - trajet(cur, b).minutes);
      const suivant = reste.shift()!;
      ordre.push(suivant);
      cur = suivant;
    }
    return ordre;
  }
  let meilleur = etapes, meilleurTotal = Infinity;
  permutations(etapes).forEach((p) => {
    const t = evaluer(p, depot).total;
    if (t < meilleurTotal) { meilleurTotal = t; meilleur = p; }
  });
  return meilleur;
}

function finaliser(etapes: Candidat[], depot: Lieu, minutesMax: number): Tournee {
  const ordre = ordonner(etapes, depot);
  const e = evaluer(ordre, depot);
  return {
    etapes: ordre,
    cabines: ordre.reduce((s, c) => s + c.cabines, 0),
    cartons: ordre.reduce((s, c) => s + c.cartons, 0),
    minutesPose: e.minutesPose,
    minutesTrajet: e.minutesTrajet,
    minutesTotal: e.total,
    kmApprox: e.kmTotal,
    etendue: resumeEtendue(ordre),
    heuresSupp: e.total > (minutesMax || JOURNEE_MINUTES),
  };
}

export function construireTournee(
  candidats: Candidat[],
  contraintes: Contraintes,
  posDepot?: Position | null,
): Tournee | null {
  const { nombre, secteur, cartonsMax = 0, minutesMax = JOURNEE_MINUTES, obligatoire, imposes } = contraintes;
  const depot = lieuDepot(posDepot);
  if (candidats.length === 0) return null;

  // Sélection manuelle : on ordonne exactement ce qui est demandé.
  if (imposes && imposes.length > 0) {
    const choisis = candidats.filter((c) => imposes.includes(c.id));
    return choisis.length ? finaliser(choisis, depot, minutesMax) : null;
  }

  const pool = secteur?.trim() ? candidats.filter((c) => correspondSecteur(c, secteur)) : candidats;
  if (pool.length === 0) return null;

  const impose = obligatoire ? candidats.find((c) => c.id === obligatoire) : undefined;

  /** Construit une journée en partant d'un premier chantier donné. */
  const depuis = (premier: Candidat): Candidat[] => {
    const etapes: Candidat[] = [premier];
    let cartons = premier.cartons;
    let cur: Lieu = premier;

    while (etapes.length < nombre) {
      const restants = pool
        .filter((c) => !etapes.some((e) => e.id === c.id))
        .filter((c) => cartonsMax === 0 || cartons + c.cartons <= cartonsMax)
        // Le plus proche du point courant, pose comprise.
        .sort((a, b) =>
          (trajet(cur, a).minutes + a.minutes) - (trajet(cur, b).minutes + b.minutes));
      let ajoute = false;
      for (const c of restants) {
        const essai = [...etapes, c];
        if (minutesMax > 0 && evaluer(ordonner(essai, depot), depot).total > minutesMax) continue;
        etapes.push(c); cartons += c.cartons; cur = c; ajoute = true;
        break;
      }
      if (!ajoute) break;
    }
    return etapes;
  };

  const departs = impose ? [impose] : pool;
  let meilleure: Tournee | null = null;

  for (const d of departs) {
    const t = finaliser(depuis(d), depot, minutesMax);
    // Priorité au nombre d'étapes atteint, puis à la journée la plus courte.
    const mieux = !meilleure
      || t.etapes.length > meilleure.etapes.length
      || (t.etapes.length === meilleure.etapes.length && t.minutesTotal < meilleure.minutesTotal);
    if (mieux) meilleure = t;
  }
  return meilleure;
}

function resumeEtendue(etapes: Candidat[]): string {
  const localites = new Set(etapes.map((c) => c.localite).filter(Boolean));
  const regions = new Set(etapes.map((c) => c.region).filter(Boolean));
  if (localites.size === 1) return `1 localité · ${[...localites][0]}`;
  if (regions.size === 1) return `${localites.size} localités · ${[...regions][0]}`;
  return `${localites.size} localités · ${regions.size} régions`;
}

export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}
