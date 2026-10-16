/**
 * Récupérer les passages SAV restés dans les colonnes d'heures.
 *
 * L'écran mono-cabine, dès la deuxième intervention, écrivait la liste des
 * passages dans « Heure arrivée SAV » et « Heure départ SAV » — deux
 * colonnes de texte faites pour des horaires, qu'aucune liste ne lit. Les
 * colonnes que tout le monde lit, « Interventions SAV cabines » et
 * « Dates RDV SAV cabines », restaient vides.
 *
 * Conséquence sur TM-2600864 : deux passages saisis, le second calé au
 * 20 octobre, et le chantier figurait toujours dans « RDV SAV à fixer »
 * comme si rien n'était prévu. Trois chantiers étaient dans ce cas le
 * 16 octobre 2026.
 *
 * La saisie écrit désormais aux deux endroits. Restent les dossiers
 * d'avant : ce module dit comment les rattraper, sans rien inventer —
 * tout est déjà là, simplement rangé au mauvais endroit.
 */

import { parsePointages } from "./pointages";
import { encodeInterventions } from "./sav-interventions";

export interface ReprisePassages {
  /** Valeur pour « Interventions SAV cabines » (sans le préfixe de lot). */
  interventions: string;
  /** Le prochain passage calé — la date la plus lointaine. */
  derniereDate: string;
  /** Combien de passages ont été retrouvés. */
  nombre: number;
}

/**
 * Ce qu'il faut réécrire pour un chantier donné, ou `null` s'il n'y a rien
 * à reprendre.
 *
 * On ne touche RIEN si la colonne par lot porte déjà quelque chose : la
 * saisie récente fait autorité, et une reprise ne doit jamais l'écraser.
 */
export function repriseDepuisHeures(p: {
  heureArriveeSav?: string | null;
  heureDepartSav?: string | null;
  interventionsSavCabines?: string | null;
}): ReprisePassages | null {
  if (String(p.interventionsSavCabines || "").trim()) return null;

  const passages = parsePointages(p.heureArriveeSav, p.heureDepartSav)
    .filter((x) => /^\d{4}-\d{2}-\d{2}$/.test((x.date || "").slice(0, 10)));
  if (passages.length === 0) return null;

  const interventions = encodeInterventions(passages.map((x) => ({
    date: x.date,
    collaborateurs: x.collaborateur,
    arrivee: x.arrivee,
    depart: x.depart,
  })));
  if (!interventions.trim()) return null;

  /* La plus LOINTAINE : un passage fait n'est pas un rendez-vous, celui
     qui reste à venir en est un. */
  const derniereDate = passages
    .map((x) => x.date.slice(0, 10))
    .sort()
    .pop() || "";

  return { interventions, derniereDate, nombre: passages.length };
}
