/**
 * Qui est chargé, qui ne l'est pas — jour par jour.
 *
 * La charge de la semaine dit combien de cabines tombent chaque jour, et par
 * quelle équipe. Elle ne dit pas la seule chose qu'on veut savoir au moment de
 * caler un rendez-vous : QUI a encore de la place mardi.
 *
 * La règle de métier, telle qu'elle se vit sur le terrain : un monteur seul
 * pose trois cabines dans sa journée ; à deux on monte à quatre ; à trois ou
 * plus, cinq.
 *
 * Ce ne sont que des repères, et ils le restent. Le type de cabine, le type de
 * montage, l'éloignement du dépôt changent la donne — et une journée passée
 * sur UN SEUL chantier en porte davantage, la pose s'enchaînant sans
 * déplacement. Aucun de ces facteurs n'est devinable ici : la pastille ne dit
 * donc que « vide / entamé / plein », et le détail — cabines, plafond, nombre
 * de chantiers — s'affiche au survol, pour qu'on tranche soi-même.
 */

import { listeDeNoms } from "@/lib/equipe-intervention";

/** Cabines posables dans une journée, selon la taille de l'équipe. */
export const CAPACITE = { solo: 3, binome: 4, groupe: 5 } as const;

export function capaciteDuJour(tailleEquipe: number): number {
  if (tailleEquipe <= 1) return CAPACITE.solo;
  if (tailleEquipe === 2) return CAPACITE.binome;
  return CAPACITE.groupe;
}

/**
 * `libre` : rien de prévu — la journée est à prendre.
 * `partiel` : commencée, mais il reste de la place.
 * `plein` : la journée est faite, ne rien y ajouter.
 * `absent` : noté à la main — vacances, formation, maladie. Rien dans les
 *            données ne permet de le deviner, c'est donc un clic.
 */
export type EtatJour = "libre" | "partiel" | "plein" | "absent";

export interface CaseJour {
  cabines: number;
  capacite: number;
  etat: EtatJour;
  /** Les équipes où il figure ce jour-là — c'est l'explication de l'état. */
  equipes: string[];
  /** Nombre de chantiers distincts : un seul lieu lève le plafond. */
  chantiers: number;
  /** Absence notée à la main. */
  absent: boolean;
}

/** Un groupe de la journée, tel que la charge de la semaine le calcule. */
export interface SegmentJour {
  /** « Claudio », « Jean-Marc & Miguel », « Non attribué »… */
  label: string;
  /** Cabines de ce groupe ce jour-là. */
  cab: number;
  /** Chantiers distincts de ce groupe ce jour-là. */
  chantiers?: number;
}

export interface LigneDispo {
  nom: string;
  jours: CaseJour[];
  /** Cabines de la semaine. */
  total: number;
  /**
   * Ce qu'il AURAIT pu poser : la somme des plafonds du jour.
   *
   * Et non un forfait de quinze (trois par jour, cinq jours). Quelqu'un qui
   * travaille en binôme toute la semaine peut en poser vingt : le compter sur
   * quinze l'afficherait à 67 % alors qu'il est à la moitié de ce qu'il peut
   * faire, et la marge restante — la seule chose qu'on cherche ici — serait
   * fausse d'un tiers. Le plafond bouge donc d'une semaine à l'autre, comme
   * les équipes.
   *
   * Un jour d'ABSENCE ne compte pas : quelqu'un en congé le vendredi n'a pas
   * trois cabines de retard, il a une semaine de quatre jours. Son plafond
   * tombe donc de quinze à douze, et son pourcentage dit enfin la charge de
   * ses journées présentes.
   */
  plafond: number;
  /** Part de la semaine occupée, en pour-cent entiers. */
  pourcent: number;
}

const memeNom = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * L'état d'une journée.
 *
 * L'absence prime sur tout le reste : noircir la case ne retire PAS le travail
 * qui y est planifié — l'écran garde le nombre de cabines, en rouge. Une
 * contradiction se montre, elle ne se corrige pas en silence.
 */
export function etatDuJour(c: { cabines: number; capacite: number; absent?: boolean }): EtatJour {
  if (c.absent) return "absent";
  if (c.cabines <= 0) return "libre";
  return c.cabines >= c.capacite ? "plein" : "partiel";
}

/** La journée d'UN collaborateur, à partir des groupes de ce jour. */
export function journeeDe(nom: string, segs: readonly SegmentJour[], absent = false): CaseJour {
  let cabines = 0;
  let taille = 1;
  let chantiers = 0;
  const equipes: string[] = [];
  for (const s of segs) {
    const noms = listeDeNoms(s.label);
    if (!noms.some((n) => memeNom(n, nom))) continue;
    cabines += s.cab || 0;
    chantiers += s.chantiers ?? 1;
    taille = Math.max(taille, noms.length);
    equipes.push(s.label);
  }
  const capacite = capaciteDuJour(taille);
  const brut: CaseJour = { cabines, capacite, etat: "libre", equipes, chantiers, absent };
  return { ...brut, etat: etatDuJour(brut) };
}

/**
 * Le tableau complet : une ligne par collaborateur, une case par jour.
 *
 * L'ordre des collaborateurs est celui qu'on donne — celui de l'app — et non
 * un classement par charge : on cherche un nom, et un tableau dont les lignes
 * bougent d'un jour à l'autre ne se lit pas.
 */
export function tableauDisponibilites(
  joursSegs: readonly (readonly SegmentJour[])[],
  collaborateurs: readonly string[],
  options: {
    /** Les jours, en AAAA-MM-JJ, dans le même ordre que `joursSegs`. */
    jours?: readonly string[];
    /** Clés « prénom en minuscules|AAAA-MM-JJ » des absences notées. */
    absents?: ReadonlySet<string>;
  } = {},
): LigneDispo[] {
  const { jours: dates, absents } = options;
  return collaborateurs.map((nom) => {
    const jours = joursSegs.map((segs, i) => {
      const cle = dates?.[i] ? `${nom.trim().toLowerCase()}|${dates[i]}` : "";
      return journeeDe(nom, segs, !!(cle && absents?.has(cle)));
    });
    const total = jours.reduce((s, j) => s + j.cabines, 0);
    const plafond = jours.reduce((s, j) => s + (j.absent ? 0 : j.capacite), 0);
    return {
      nom,
      jours,
      total,
      plafond,
      pourcent: plafond > 0 ? Math.round((total / plafond) * 100) : 0,
    };
  });
}
