"use client";

/**
 * Le nom d'un lot, et qui a le dernier mot.
 *
 * Ce nom a trois écrivains : le monteur qui tape, le serveur qui répond, et
 * l'app qui propose « Cabine 3 » tant que personne n'a choisi. Jusqu'ici
 * chacun écrivait quand il voulait, et le dernier arrivé gagnait — d'où des
 * lettres qui disparaissent en cours de frappe et des noms qui reviennent
 * d'eux-mêmes au libellé par défaut, signalés plusieurs fois.
 *
 * La règle est désormais unique et sans exception :
 *
 *   TANT QUE LE SERVEUR N'A PAS CONFIRMÉ LE NOM VOULU, C'EST LUI QUI
 *   S'AFFICHE. Rien d'autre ne peut le remplacer — ni une relecture
 *   périmée, ni le cache du CDN, ni le nom par défaut.
 *
 * « Confirmé » veut dire : une lecture du serveur renvoie exactement ce que
 * le monteur a tapé. À cet instant seulement, l'app oublie son souhait et
 * repasse en lecture simple. Les souhaits non encore confirmés sont gardés
 * sur l'appareil : fermer l'app, la rouvrir ou changer de page ne les perd
 * pas, et un renommage fait sans réseau tient jusqu'à ce qu'il parte.
 *
 * Aucune horloge n'intervient : l'ancien garde-fou tenait soixante secondes,
 * ce qui suffisait les bons jours et pas les autres.
 */

/** Le nom proposé par l'app quand personne n'a choisi. */
export function nomParDefautLot(idx0: number): string {
  return `Cabine ${idx0 + 1}`;
}

/** Deux noms sont-ils le même ? (espaces en trop, casse) */
export function memeNom(a: string | undefined | null, b: string | undefined | null): boolean {
  return (a || "").trim().toLowerCase() === (b || "").trim().toLowerCase();
}

/** Les renommages de ce chantier qui attendent encore la confirmation. */
export type NomsVoulus = Record<number, string>;

const cle = (projectId: string) => `tm-noms-voulus-${projectId}`;

export function lireNomsVoulus(projectId: string | undefined): NomsVoulus {
  if (!projectId || typeof localStorage === "undefined") return {};
  try {
    const brut = localStorage.getItem(cle(projectId));
    if (!brut) return {};
    const v = JSON.parse(brut);
    if (!v || typeof v !== "object") return {};
    const out: NomsVoulus = {};
    for (const [k, nom] of Object.entries(v)) {
      const i = parseInt(k, 10);
      if (Number.isFinite(i) && i >= 0 && typeof nom === "string") out[i] = nom;
    }
    return out;
  } catch {
    return {};
  }
}

export function ecrireNomsVoulus(projectId: string | undefined, voulus: NomsVoulus): void {
  if (!projectId || typeof localStorage === "undefined") return;
  try {
    if (Object.keys(voulus).length === 0) localStorage.removeItem(cle(projectId));
    else localStorage.setItem(cle(projectId), JSON.stringify(voulus));
  } catch {
    /* Stockage plein : on perd la mémoire du souhait, pas le nom affiché. */
  }
}

export interface DecisionNom {
  /** Le nom à afficher. */
  nom: string;
  /** Le serveur a rattrapé le souhait : on peut l'oublier. */
  confirme: boolean;
}

/**
 * Quel nom afficher pour un lot, et peut-on oublier le souhait ?
 *
 * - un souhait non confirmé l'emporte sur tout ;
 * - le serveur ne gagne que s'il propose un nom CHOISI (pas « Cabine 3 ») ;
 * - sinon on garde ce qui est déjà à l'écran.
 */
export function deciderNomLot(args: {
  idx0: number;
  /** Ce que le monteur a tapé et qui n'est pas encore confirmé. */
  voulu?: string;
  /** Ce que le serveur renvoie pour ce lot (vide = rien de choisi). */
  serveur?: string;
  /** Ce qui est affiché en ce moment. */
  actuel: string;
}): DecisionNom {
  const { idx0, voulu, serveur, actuel } = args;
  const defaut = nomParDefautLot(idx0);
  const serveurChoisi = serveur && serveur.trim() && !memeNom(serveur, defaut) ? serveur.trim() : "";

  if (typeof voulu === "string") {
    /* Le serveur dit enfin la même chose : le souhait a abouti. On accepte
       SA graphie — c'est elle qui sera lue partout ailleurs. */
    if (serveurChoisi && memeNom(serveurChoisi, voulu)) return { nom: serveurChoisi, confirme: true };
    /* Cas du retour au nom par défaut, demandé explicitement : le serveur
       finit par ne plus rien proposer, et c'est bien ce qu'on voulait. */
    if (!serveurChoisi && memeNom(voulu, defaut)) return { nom: defaut, confirme: true };
    return { nom: voulu, confirme: false };
  }

  if (serveurChoisi) return { nom: serveurChoisi, confirme: false };
  return { nom: actuel || defaut, confirme: false };
}
