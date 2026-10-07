/**
 * Combien de cabines d'un chantier pèsent sur UN jour donné.
 *
 * Un montage de sept cabines étalé sur trois semaines n'occupe pas sept
 * cabines chaque jour. Compter le chantier entier sur chacune de ses journées
 * gonflait les totaux : le tableau de bord annonçait douze cabines pour un
 * vendredi où il en restait cinq à poser, et la charge de la semaine, qui
 * appliquait déjà cette règle, en affichait cinq juste en dessous. Deux
 * chiffres pour la même journée, à vingt centimètres l'un de l'autre.
 *
 * La règle vit donc ici, et les deux vues s'en servent.
 */

import { getWorkingDays } from "./time-utils";

interface SourceJour {
  nbCabines?: number | null;
  dateMontage?: string | null;
  dateMontageEnd?: string | null;
  /** « Heure arrivée », qui porte le jour de pose relevé par cabine. */
  heureArrivee?: string | null;
}

/** Les jours où le montage était PRÉVU. */
export function joursPlanifies(p: SourceJour): string[] {
  const debut = (p.dateMontage || "").split("T")[0];
  if (!debut) return [];
  const fin = (p.dateMontageEnd || "").split("T")[0];
  return fin && fin > debut ? getWorkingDays(debut, fin) : [debut];
}

/**
 * Le jour de pose RELEVÉ pour chaque cabine, lu dans « Heure arrivée » au
 * format « Cab3:2026-08-11:14:04 ». C'est la trace du travail réellement fait,
 * et elle seule sait quelle cabine a été posée quel jour.
 */
export function joursDesCabines(p: SourceJour): string[] {
  return [...String(p.heureArrivee || "").matchAll(/Cab\d+\s*:\s*(\d{4}-\d{2}-\d{2})/g)].map((m) => m[1]);
}

/**
 * Les jours où ce chantier pèse : ceux prévus et ceux réellement travaillés.
 * Une cabine montée en août doit compter en août, même si la date de montage
 * du chantier est restée au 1er octobre.
 */
export function joursDuChantier(p: SourceJour): string[] {
  return [...new Set([...joursPlanifies(p), ...joursDesCabines(p)])];
}

/**
 * Les cabines de ce chantier qui pèsent sur `jour` : celles pointées ce
 * jour-là, plus la part des cabines encore sans relevé, répartie sur les
 * jours planifiés.
 */
export function cabinesDuJour(p: SourceJour, jour: string): number {
  const total = p.nbCabines || 0;
  const releves = joursDesCabines(p);
  const ceJour = releves.filter((d) => d === jour).length;
  const sansReleve = Math.max(total - releves.length, 0);
  if (sansReleve === 0) return ceJour;
  const planifies = joursPlanifies(p);
  const i = planifies.indexOf(jour);
  if (i < 0) return ceJour;
  const base = Math.floor(sansReleve / planifies.length);
  const reste = sansReleve % planifies.length;
  return ceJour + base + (i < reste ? 1 : 0);
}
