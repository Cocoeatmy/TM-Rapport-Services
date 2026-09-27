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
  /** Attente cumulée devant une porte avant une heure imposée. */
  minutesAttente: number;
  /** Retard sur une heure imposée : 0 si tout est tenu. */
  retardMax: number;
  /** Horaire de chaque étape, dans l'ordre de visite. */
  horaires: { id: string; arrivee: string; depart: string; impose?: string; enRetard: boolean }[];
  /** Heure de retour au dépôt. */
  retourDepot: string;
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

/** « 07:30 » → 450 minutes. */
export function enMinutes(hhmm: string): number | null {
  const m = String(hhmm || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}
/** 450 → « 07:30 ». */
export function enHeure(min: number): string {
  const h = Math.floor(min / 60) % 24, m = Math.round(min % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export interface Contraintes {
  nombre: number;
  secteur?: string;
  cartonsMax?: number;
  /** Durée maximale de la journée, trajets compris. 0 = non limitée. */
  minutesMax?: number;
  /** Montage imposé : il sera dans la tournée quoi qu'il arrive. */
  obligatoire?: string;
  /** Chantiers imposés. S'ils sont moins nombreux que `nombre`, la tournée est
   *  COMPLÉTÉE autour d'eux avec les meilleurs voisins. */
  imposes?: string[];
  /** Heure d'arrivée imposée sur certains chantiers, « HH:MM ». */
  heures?: Record<string, string>;
  /** Heure de départ du dépôt, « HH:MM ». */
  departHeure?: string;
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

/**
 * Déroulé de la journée pour un ordre donné : dépôt → étapes → dépôt.
 *
 * Une heure d'arrivée imposée est respectée si possible : on attend devant la
 * porte plutôt que d'entrer trop tôt, et tout retard est mesuré — il sert à
 * écarter les ordres qui ne tiennent pas le rendez-vous.
 */
function evaluer(
  etapes: Candidat[],
  depot: Lieu,
  heures: Record<string, number> = {},
  depart = 450,
) {
  let minutesTrajet = 0, kmTotal = 0, minutesAttente = 0, retardMax = 0;
  let t = depart;
  let precedent: Lieu = depot;
  const horaires: Tournee["horaires"] = [];

  etapes.forEach((c) => {
    const tr = trajet(precedent, c);
    minutesTrajet += tr.minutes; kmTotal += tr.km;
    t += tr.minutes;
    const impose = heures[c.id];
    let enRetard = false;
    if (impose != null) {
      if (t < impose) { minutesAttente += impose - t; t = impose; }
      else if (t > impose) { retardMax = Math.max(retardMax, t - impose); enRetard = true; }
    }
    const arrivee = t;
    t += c.minutes;
    horaires.push({
      id: c.id, arrivee: enHeure(arrivee), depart: enHeure(t),
      impose: impose != null ? enHeure(impose) : undefined, enRetard,
    });
    precedent = c;
  });

  const retour = trajet(precedent, depot);
  minutesTrajet += retour.minutes; kmTotal += retour.km;
  t += retour.minutes;

  const minutesPose = etapes.reduce((s, c) => s + c.minutes, 0);
  return {
    minutesTrajet, kmTotal, minutesPose, minutesAttente, retardMax, horaires,
    retourDepot: enHeure(t),
    // La journée inclut l'attente : elle est bien passée hors du dépôt.
    total: t - depart,
  };
}

/** Meilleur ordre de visite : le retard sur une heure imposée prime sur tout. */
function ordonner(
  etapes: Candidat[], depot: Lieu,
  heures: Record<string, number> = {}, depart = 450,
): Candidat[] {
  if (etapes.length <= 2) return etapes;
  if (etapes.length > 7) {
    // Au-delà, on se contente du plus proche en plus proche.
    const reste = [...etapes];
    const ordre: Candidat[] = [];
    let cur: Lieu = depot;
    while (reste.length) {
      // Une heure imposée tire l'étape vers sa place dans la journée.
      reste.sort((a, b) => {
        const ha = heures[a.id], hb = heures[b.id];
        if (ha != null && hb != null) return ha - hb;
        if (ha != null) return -1;
        if (hb != null) return 1;
        return trajet(cur, a).minutes - trajet(cur, b).minutes;
      });
      const suivant = reste.shift()!;
      ordre.push(suivant);
      cur = suivant;
    }
    return ordre;
  }
  let meilleur = etapes, meilleurScore = Infinity;
  permutations(etapes).forEach((p) => {
    const e = evaluer(p, depot, heures, depart);
    // Un retard coûte très cher : mieux vaut une journée plus longue qu'un
    // rendez-vous manqué.
    const score = e.total + e.retardMax * 100;
    if (score < meilleurScore) { meilleurScore = score; meilleur = p; }
  });
  return meilleur;
}

function finaliser(
  etapes: Candidat[], depot: Lieu, minutesMax: number,
  heures: Record<string, number>, depart: number,
): Tournee {
  const ordre = ordonner(etapes, depot, heures, depart);
  const e = evaluer(ordre, depot, heures, depart);
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
    minutesAttente: e.minutesAttente,
    retardMax: e.retardMax,
    horaires: e.horaires,
    retourDepot: e.retourDepot,
  };
}

export function construireTournee(
  candidats: Candidat[],
  contraintes: Contraintes,
  posDepot?: Position | null,
): Tournee | null {
  const {
    nombre, secteur, cartonsMax = 0, minutesMax = JOURNEE_MINUTES,
    obligatoire, imposes, heures = {}, departHeure = "07:30",
  } = contraintes;
  const depot = lieuDepot(posDepot);
  const depart = enMinutes(departHeure) ?? 450;
  if (candidats.length === 0) return null;

  // Heures imposées, converties une fois pour toutes.
  const horaires: Record<string, number> = {};
  Object.entries(heures).forEach(([id, h]) => {
    const m = enMinutes(h);
    if (m !== null) horaires[id] = m;
  });

  /* Chantiers imposés : ceux cochés à la main, plus l'éventuel montage
     obligatoire. Ils seront TOUS dans la tournée ; si leur nombre est
     inférieur au nombre voulu, on complète autour d'eux. */
  const idsImposes = new Set([...(imposes || []), ...(obligatoire ? [obligatoire] : [])]);
  const requis = candidats.filter((c) => idsImposes.has(c.id));

  const pool = secteur?.trim() ? candidats.filter((c) => correspondSecteur(c, secteur)) : candidats;

  /** Complète une base jusqu'au nombre voulu, au plus proche et dans les temps. */
  const completer = (base: Candidat[]): Candidat[] => {
    const etapes = [...base];
    let cartons = etapes.reduce((s2, c) => s2 + c.cartons, 0);

    while (etapes.length < nombre) {
      const dernier: Lieu = etapes.length ? etapes[etapes.length - 1] : depot;
      const restants = pool
        .filter((c) => !etapes.some((e) => e.id === c.id))
        .filter((c) => cartonsMax === 0 || cartons + c.cartons <= cartonsMax)
        .sort((a, b) =>
          (trajet(dernier, a).minutes + a.minutes) - (trajet(dernier, b).minutes + b.minutes));
      let ajoute = false;
      for (const c of restants) {
        const essai = [...etapes, c];
        const e = evaluer(ordonner(essai, depot, horaires, depart), depot, horaires, depart);
        // On n'ajoute jamais un chantier qui fait manquer un rendez-vous.
        if (e.retardMax > 0) continue;
        if (minutesMax > 0 && e.total > minutesMax) continue;
        etapes.push(c); cartons += c.cartons; ajoute = true;
        break;
      }
      if (!ajoute) break;
    }
    return etapes;
  };

  // Des chantiers imposés : ils forment la base, on complète autour.
  if (requis.length > 0) {
    const etapes = requis.length >= nombre ? requis : completer(requis);
    return finaliser(etapes, depot, minutesMax, horaires, depart);
  }

  if (pool.length === 0) return null;

  // Rien d'imposé : on essaie chaque chantier comme point de départ.
  let meilleure: Tournee | null = null;
  for (const d of pool) {
    const t = finaliser(completer([d]), depot, minutesMax, horaires, depart);
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
