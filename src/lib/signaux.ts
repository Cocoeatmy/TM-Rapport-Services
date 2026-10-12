/**
 * Ce qui demande une décision aujourd'hui.
 *
 * Le tableau de bord compte déjà ce qu'il y a à faire — rapports, SAV,
 * facturation. Ces signaux-ci répondent à une autre question : qu'est-ce qui
 * risque de mal tourner ? Un montage prévu jeudi dont la cabine n'est pas
 * arrivée, un chantier commencé qu'on a oublié de finir, une commande dont la
 * date de livraison est passée.
 *
 * Chaque règle est écrite ici, à part de l'écran, pour une raison simple : un
 * compteur d'alerte qui se trompe ne se lit plus. On l'a vérifié avec les
 * chantiers « non facturés » — cent cinquante-cinq annoncés, six réels — et la
 * liste serait morte en une semaine. Chaque prédicat porte donc ce qu'il
 * exclut, et se teste.
 */

import { cabinesPosees, type SourcePose } from "@/lib/cabines-posees";

export interface ChantierSignal extends SourcePose {
  id: string;
  etatCMD?: string | null;
  dateMontage?: string | null;
  emplacementCabine?: string | null;
  previsionLivraison?: string | null;
  arrivageTM?: string | null;
  arrivageGrossiste?: string | null;
}

/** Un chantier clos ne déclenche plus rien. */
export function estClos(p: ChantierSignal): boolean {
  const e = String(p.etatCMD || "").trim();
  return e === "Terminé" || e === "Annulé";
}

/** Le jour d'un chantier, sans l'heure. */
export function jourDe(v: string | null | undefined): string {
  return String(v || "").split("T")[0].slice(0, 10);
}

/** Jour + n, au format AAAA-MM-JJ. */
export function jourPlus(jour: string, n: number): string {
  const d = new Date(`${jour}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return jour;
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * MATÉRIEL NON RÉCEPTIONNÉ — la cabine n'est pas là, et on pose bientôt.
 *
 * L'emplacement de cabine ne se renseigne qu'à la réception : tant qu'il est
 * vide, rien n'est arrivé au dépôt. Seuls comptent les montages des prochains
 * jours — un chantier prévu dans deux mois sans marchandise n'a rien
 * d'anormal, c'est le cours normal des choses.
 */
export function materielNonReceptionne(
  p: ChantierSignal,
  aujourdhui: string,
  horizonJours = 3,
): boolean {
  if (estClos(p)) return false;
  if (String(p.emplacementCabine || "").trim()) return false;
  const total = p.nbCabines || 0;
  if (total > 0 && cabinesPosees(p) >= total) return false;
  const jour = jourDe(p.dateMontage);
  if (!jour) return false;
  return jour >= aujourdhui && jour <= jourPlus(aujourdhui, horizonJours);
}

/**
 * CHANTIER BLOQUÉ — on ne peut pas finir, et ce n'est pas de notre fait.
 *
 * Receveur non prêt, accès impossible, pièce manquante : cela ne se déduit
 * d'aucune date. Ce sont les signalements ouverts qui le disent — une pièce
 * demandée et pas reçue bloque la pose — et le statut « Soucis montage »
 * quand quelqu'un l'a posé à la main.
 */
export function chantierBloque(
  p: ChantierSignal,
  aPieceOuverte: boolean,
): boolean {
  if (estClos(p)) return false;
  return aPieceOuverte || String(p.etatCMD || "").trim() === "Soucis montage";
}

/**
 * INTERVENTION NON TERMINÉE — commencée, pas finie, il faudra revenir.
 *
 * Au moins une cabine posée, et il en reste. Le chantier n'est donc ni à
 * planifier ni à clore : il attend un second passage, et c'est le seul de ces
 * signaux qui demande une DATE plutôt qu'un appel.
 */
export function interventionNonTerminee(p: ChantierSignal): boolean {
  if (estClos(p)) return false;
  const total = p.nbCabines || 0;
  if (total <= 0) return false;
  const posees = cabinesPosees(p);
  return posees > 0 && posees < total;
}

/**
 * RETARD DE MONTAGE — la date est passée et rien n'a été posé.
 *
 * Les chantiers commencés sont écartés : ils sont déjà dans « interventions
 * non terminées », et un même chantier qui apparaît dans deux alertes fait
 * douter des deux. Ici, le montage n'a pas eu lieu du tout.
 */
export function retardDeMontage(p: ChantierSignal, aujourdhui: string): boolean {
  if (estClos(p)) return false;
  const jour = jourDe(p.dateMontage);
  if (!jour || jour >= aujourdhui) return false;
  return cabinesPosees(p) === 0;
}

/**
 * COMMANDE EN RETARD — la livraison annoncée est passée, rien n'est arrivé.
 *
 * Une date d'arrivage, chez TM ou chez le grossiste, vaut réception : la
 * commande est honorée, même en retard, et il n'y a plus à relancer.
 */
export function commandeEnRetard(p: ChantierSignal, aujourdhui: string): boolean {
  if (estClos(p)) return false;
  if (String(p.arrivageTM || "").trim() || String(p.arrivageGrossiste || "").trim()) return false;
  const prevu = jourDe(p.previsionLivraison);
  return !!prevu && prevu < aujourdhui;
}

/* ── Les devis sans réponse ─────────────────────────────────────────────────
   Relevé du 13 octobre 2026 sur les 1 887 offres bexio : 1 515 confirmées,
   223 en attente, 147 déclinées, 2 brouillons. Le statut « en attente » est
   donc tenu à jour — sur les 223, neuf seulement ont déjà une facture au même
   titre. L'alerte repose sur du solide. */

/** Statut bexio d'une offre envoyée et restée sans réponse. */
export const OFFRE_EN_ATTENTE = 2;

export interface OffreSignal {
  nr: string;
  titre: string;
  total: number;
  date: string;
  statut?: number | null;
}

/** Âge en jours d'une date AAAA-MM-JJ. */
export function ageEnJours(jour: string, aujourdhui: string): number {
  const a = Date.parse(`${jour}T12:00:00Z`);
  const b = Date.parse(`${aujourdhui}T12:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86400000));
}

/**
 * Les devis envoyés et restés sans réponse depuis au moins `seuil` jours.
 *
 * Sous une semaine, personne n'est en retard pour répondre : relancer ferait
 * perdre la confiance plutôt qu'un marché.
 */
export function devisEnAttente(
  offres: readonly OffreSignal[],
  aujourdhui: string,
  seuil = 7,
): OffreSignal[] {
  return offres
    .filter((o) => o.statut === OFFRE_EN_ATTENTE)
    .filter((o) => o.date && ageEnJours(o.date, aujourdhui) >= seuil)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export interface FactureSignal {
  nr: string;
  titre: string;
  client?: string;
  total: number;
  restant: number;
  /** Échéance de paiement (is_valid_to chez bexio). */
  echeance?: string | null;
}

/**
 * Les factures dont le délai de paiement est dépassé et qui restent dues.
 *
 * Une facture soldée n'est jamais en retard, quelle que soit son échéance.
 */
export function facturesEchues(
  factures: readonly FactureSignal[],
  aujourdhui: string,
): FactureSignal[] {
  return factures
    .filter((f) => (f.restant || 0) > 0.005)
    .filter((f) => !!f.echeance && String(f.echeance).slice(0, 10) < aujourdhui)
    .sort((a, b) => String(a.echeance).localeCompare(String(b.echeance)));
}
