/**
 * Tenir la LISTE DES PASSAGES d'un lot en accord avec ses heures.
 *
 * Les heures d'un lot vivent à deux endroits : les colonnes historiques
 * « Heure arrivée » / « Heure départ » (« Cab1:2026-10-09:10:14 ») et la
 * liste des passages (« Cab1:2026-10-09~Jean-Marc~10:14~11:09 »), qui sait
 * dire qu'on est revenu un autre jour.
 *
 * L'automatisme de la photo n'écrivait que les colonnes. Le rapport PDF, lui,
 * lit la liste des passages dès qu'elle existe : un lot dont le passage avait
 * été créé AVANT le départ affichait « Départ --:-- » alors que l'heure était
 * bien enregistrée à côté. Vu du chantier, l'automatisme avait l'air cassé ;
 * en réalité les deux versions de la même vérité avaient divergé.
 *
 * Cette fonction remet la liste en accord. Elle ne force rien : une heure déjà
 * écrite n'est jamais remplacée par une plus ancienne.
 */

import { parseInterventions, encodeInterventions, type InterventionSav } from "@/lib/sav-interventions";

const enMinutes = (h: string): number => {
  const m = /^(\d{1,2}):(\d{2})$/.exec((h || "").trim());
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : -1;
};

export interface MajPassage {
  /** AAAA-MM-JJ du passage concerné. */
  date: string;
  arrivee?: string;
  depart?: string;
  collaborateurs?: string;
}

/**
 * Valeur encodée du lot, mise en accord avec ces heures.
 *
 * Le passage visé est celui du MÊME JOUR ; s'il n'existe pas, il est créé —
 * une pose faite un autre jour est un autre passage, pas une correction du
 * précédent.
 */
export function fusionnerPassage(encode: string | null | undefined, maj: MajPassage): string {
  const date = (maj.date || "").slice(0, 10);
  if (!date) return String(encode || "");
  const liste: InterventionSav[] = parseInterventions(encode);

  let i = -1;
  for (let k = liste.length - 1; k >= 0; k--) {
    if (liste[k].date === date) { i = k; break; }
  }
  if (i < 0) {
    liste.push({ date, collaborateurs: maj.collaborateurs || "", arrivee: maj.arrivee || "", depart: maj.depart || "" });
    return encodeInterventions(liste);
  }

  const p = { ...liste[i] };
  if (maj.collaborateurs && !p.collaborateurs) p.collaborateurs = maj.collaborateurs;
  /* Une arrivée ne se corrige pas d'elle-même : on ne comble qu'un vide. */
  if (maj.arrivee && !p.arrivee) p.arrivee = maj.arrivee;
  /* Un départ, si : une photo plus tardive prouve qu'on était encore là. */
  if (maj.depart && (!p.depart || enMinutes(maj.depart) > enMinutes(p.depart))) p.depart = maj.depart;
  liste[i] = p;
  return encodeInterventions(liste);
}
