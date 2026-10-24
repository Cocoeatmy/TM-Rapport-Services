"use client";

/**
 * Un signalement proposé par le rapport dicté, en attente d'être ouvert.
 *
 * Le rapport dicté repère « il manque une poignée » ; le monteur appuie sur
 * « Signaler » et la feuille des signalements s'ouvre avec le bon formulaire
 * déjà rempli. La feuille se monte APRÈS l'appui : le brouillon attend donc
 * ici qu'on vienne le prendre (ou arrive par événement si elle est ouverte).
 * Rien n'est créé tant que le monteur n'a pas envoyé le formulaire.
 */

export interface BrouillonSignalement {
  id: number;
  type: "piece" | "defaut";
  description: string;
  /** Numéro du lot (1, 2…), absent pour un chantier simple. */
  cabineIdx?: number;
}

const EVENEMENT = "tm-brouillon-signalement";
let enAttente: BrouillonSignalement | null = null;
let compteur = 0;

export function proposerSignalement(b: Omit<BrouillonSignalement, "id">): void {
  enAttente = { ...b, id: ++compteur };
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENEMENT));
}

/** Prend le brouillon s'il concerne ce lot (ou ce chantier simple). */
export function prendreBrouillon(cabineIdx?: number): BrouillonSignalement | null {
  if (!enAttente) return null;
  if ((enAttente.cabineIdx ?? null) !== (cabineIdx ?? null)) return null;
  const b = enAttente;
  enAttente = null;
  return b;
}

export function ecouterBrouillons(fn: () => void): () => void {
  window.addEventListener(EVENEMENT, fn);
  return () => window.removeEventListener(EVENEMENT, fn);
}
