"use client";

/**
 * Où en est un rapport : fini sur le chantier, ou arrivé jusqu'à nous.
 *
 * Un monteur qui termine sans réseau a besoin de savoir deux choses, et pas
 * une de plus : que son travail est en sécurité sur le téléphone, et qu'il
 * reste à partir. Lui dire « envoyé » alors que trois photos attendent
 * encore serait un mensonge utile le temps d'un trajet, et un vrai problème
 * le jour où il faudra le prouver.
 *
 * D'où deux états seulement, et une règle stricte entre les deux :
 *
 *   « Rapport finalisé — Synchronisation en attente »
 *      le rapport est clos côté chantier, il dort dans le téléphone.
 *
 *   « Rapport synchronisé »
 *      TOUT est arrivé : les photos, les écritures en attente, et le PDF
 *      que le serveur a généré. Il suffit d'UNE photo en attente pour que
 *      cet état ne s'affiche pas.
 *
 * L'état se garde dans le navigateur : fermer l'app, verrouiller le
 * téléphone ou le redémarrer ne doit pas effacer ce que le monteur a vu.
 */

export interface Finalisation {
  /** Quand le monteur a clos le rapport, côté chantier. */
  quand: number;
  /** Rapport client (sans les heures) ou interne. */
  client: boolean;
  /** Le serveur a produit le PDF et expédié le rapport. */
  envoye: boolean;
}

export type EtatRapport = "aucun" | "en-attente" | "synchronise";

const cle = (projectId: string) => `tm-rapport-finalise-${projectId}`;

export function lireFinalisation(projectId: string): Finalisation | null {
  if (typeof localStorage === "undefined" || !projectId) return null;
  try {
    const brut = localStorage.getItem(cle(projectId));
    if (!brut) return null;
    const v = JSON.parse(brut) as Partial<Finalisation>;
    if (typeof v?.quand !== "number") return null;
    return { quand: v.quand, client: !!v.client, envoye: !!v.envoye };
  } catch {
    return null;
  }
}

function ecrire(projectId: string, f: Finalisation): void {
  if (typeof localStorage === "undefined" || !projectId) return;
  try {
    localStorage.setItem(cle(projectId), JSON.stringify(f));
    window.dispatchEvent(new CustomEvent("tm-rapport-finalise", { detail: { projectId } }));
  } catch {
    /* Stockage plein : l'état d'affichage n'est pas une donnée de travail,
       on ne casse rien pour lui. */
  }
}

/** Le monteur vient de clore le rapport sur le chantier. */
export function marquerFinalise(projectId: string, options: { client: boolean; envoye?: boolean }): void {
  const avant = lireFinalisation(projectId);
  ecrire(projectId, {
    quand: avant?.quand || Date.now(),
    client: options.client,
    envoye: !!options.envoye,
  });
}

/** Le serveur a produit le PDF et expédié le rapport. */
export function marquerEnvoye(projectId: string): void {
  const avant = lireFinalisation(projectId);
  if (!avant) return;
  ecrire(projectId, { ...avant, envoye: true });
}

/** Repartir de zéro — rouvrir un chantier, corriger un rapport. */
export function oublierFinalisation(projectId: string): void {
  if (typeof localStorage === "undefined" || !projectId) return;
  try {
    localStorage.removeItem(cle(projectId));
    window.dispatchEvent(new CustomEvent("tm-rapport-finalise", { detail: { projectId } }));
  } catch {}
}

/**
 * L'état à afficher.
 *
 * « Synchronisé » exige TOUT : le PDF produit par le serveur, aucune photo
 * dans la file du téléphone, aucune écriture en attente. Un seul de ces
 * trois points en suspens et l'on reste « en attente » — c'est la garantie
 * que demande Micael, et elle ne souffre pas d'exception.
 */
export function etatRapport(args: {
  finalise: Finalisation | null;
  photosEnAttente: number;
  requetesEnAttente: number;
}): EtatRapport {
  const { finalise, photosEnAttente, requetesEnAttente } = args;
  if (!finalise) return "aucun";
  if (!finalise.envoye) return "en-attente";
  if (photosEnAttente > 0 || requetesEnAttente > 0) return "en-attente";
  return "synchronise";
}

/** Ce qui est écrit à l'écran, pour chaque état. */
export const LIBELLE_ETAT_RAPPORT: Record<Exclude<EtatRapport, "aucun">, string> = {
  "en-attente": "Rapport finalisé — Synchronisation en attente",
  synchronise: "Rapport synchronisé",
};
