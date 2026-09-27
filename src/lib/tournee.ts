/**
 * Assistant de tournée — regroupement géographique des montages.
 *
 * Ce que ce module fait, et ce qu'il ne fait pas :
 *
 * Il NE calcule PAS des kilomètres routiers. Les projets n'ont pas de
 * coordonnées ; les obtenir demande un géocodage adresse par adresse, à une
 * requête par seconde — c'est ce qui a rendu la carte inutilisable. On mesure
 * donc la proximité par le CODE POSTAL, du plus fin au plus large : même
 * localité, même secteur (3 premiers chiffres), même région de travail, même
 * canton. C'est une approximation, mais elle est instantanée et suffit à
 * décider « ces trois-là se font dans la même journée ».
 *
 * Les durées viennent de l'historique réel (heures pointées sur les montages
 * terminés), pas d'un barème inventé : moyenne par cabine du fournisseur
 * concerné, à défaut moyenne générale.
 */

import { regionLabel, cantonOf } from "@/lib/swiss-cantons";

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
  minutes: number;
  source: CandidatSource;
}

export interface Tournee {
  etapes: Candidat[];
  cabines: number;
  cartons: number;
  minutes: number;
  /** Étendue géographique : « 1 localité », « 3 localités du Nord vaudois »… */
  etendue: string;
  /** Plus la valeur est basse, plus les chantiers sont proches. */
  dispersion: number;
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

/** Minutes réellement passées sur un montage, d'après les heures pointées. */
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

/**
 * Minutes par cabine observées, par fournisseur, sur les montages terminés.
 * Retourne aussi la moyenne générale, utilisée quand un fournisseur n'a pas
 * encore d'historique.
 */
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
        // Au moins 3 cabines observées, sinon la moyenne ne vaut rien.
        if (v && v.cab >= 3) return v.min / v.cab;
      }
      return general;
    },
  };
}

/** Prépare les candidats : géographie, charge et durée estimée. */
export function preparerCandidats(
  projets: CandidatSource[],
  historique: CandidatSource[],
): Candidat[] {
  const bareme = baremeDurees(historique);
  return projets.map((p) => {
    const texte = p.adresseChantier || p.projet || "";
    const npa = npaDe(p.adresseChantier || "") || npaDe(p.projet || "");
    const cabines = Number(p.nbCabines) || 0;
    return {
      id: p.id,
      ofrTM: p.ofrTM || "—",
      projet: p.projet || "Sans nom",
      adresse: p.adresseChantier || "",
      npa,
      localite: localiteDe(p.adresseChantier || "") || localiteDe(p.projet || "") || "Sans localité",
      region: regionLabel(texte),
      canton: cantonOf(texte) || "",
      cabines,
      cartons: Number(p.nbCartons) || 0,
      minutes: Math.round(bareme.parCabine(p.fournisseurs) * Math.max(cabines, 1)),
      source: p,
    };
  });
}

/** Coût de proximité entre deux chantiers : 0 = même localité, 4 = sans rapport. */
export function distance(a: Candidat, b: Candidat): number {
  if (a.npa && a.npa === b.npa) return 0;
  if (a.npa && b.npa && a.npa.slice(0, 3) === b.npa.slice(0, 3)) return 1;
  if (a.region && a.region === b.region) return 2;
  if (a.canton && a.canton === b.canton) return 3;
  return 4;
}

export interface Contraintes {
  /** Nombre de montages souhaités dans la tournée. */
  nombre: number;
  /** Localité, code postal ou région imposés comme point de départ. */
  secteur?: string;
  /** Capacité du véhicule, en cartons. 0 = non limitée. */
  cartonsMax?: number;
  /** Durée maximale de la journée, en minutes. 0 = non limitée. */
  minutesMax?: number;
}

function correspondSecteur(c: Candidat, secteur: string): boolean {
  const s = secteur.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  if (!s) return true;
  const champs = [c.npa, c.localite, c.region, c.canton, c.adresse]
    .map((v) => String(v || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase());
  return champs.some((v) => v.includes(s));
}

/**
 * Construit la meilleure tournée possible.
 *
 * Chaque chantier est essayé comme point de départ ; on lui adjoint les plus
 * proches tant que les contraintes tiennent, et on garde la combinaison la
 * moins dispersée. À dispersion égale, la tournée la plus courte en temps
 * l'emporte.
 */
export function construireTournee(
  candidats: Candidat[],
  contraintes: Contraintes,
): Tournee | null {
  const { nombre, secteur, cartonsMax = 0, minutesMax = 0 } = contraintes;
  if (candidats.length === 0 || nombre < 1) return null;

  const departs = secteur?.trim()
    ? candidats.filter((c) => correspondSecteur(c, secteur))
    : candidats;
  if (departs.length === 0) return null;

  let meilleure: Tournee | null = null;

  for (const depart of departs) {
    const etapes: Candidat[] = [depart];
    let cartons = depart.cartons;
    let minutes = depart.minutes;

    // Les autres chantiers, du plus proche du départ au plus éloigné.
    const restants = candidats
      .filter((c) => c.id !== depart.id)
      .sort((a, b) => distance(depart, a) - distance(depart, b) || a.minutes - b.minutes);

    for (const c of restants) {
      if (etapes.length >= nombre) break;
      if (cartonsMax > 0 && cartons + c.cartons > cartonsMax) continue;
      if (minutesMax > 0 && minutes + c.minutes > minutesMax) continue;
      etapes.push(c);
      cartons += c.cartons;
      minutes += c.minutes;
    }

    // Dispersion = somme des écarts au point de départ.
    const dispersion = etapes.reduce((s, c) => s + distance(depart, c), 0);
    const complete = etapes.length === Math.min(nombre, candidats.length);

    const t: Tournee = {
      // Ordre de visite : par code postal croissant, comme on roule.
      etapes: [...etapes].sort((a, b) => (a.npa || "9999").localeCompare(b.npa || "9999")),
      cabines: etapes.reduce((s, c) => s + c.cabines, 0),
      cartons,
      minutes,
      dispersion,
      etendue: resumeEtendue(etapes),
    };

    const mieux = !meilleure
      || (complete && meilleure.etapes.length < t.etapes.length)
      || (t.etapes.length === meilleure.etapes.length
          && (t.dispersion < meilleure.dispersion
              || (t.dispersion === meilleure.dispersion && t.minutes < meilleure.minutes)));
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

/** « 4h30 » à partir de minutes. */
export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}
