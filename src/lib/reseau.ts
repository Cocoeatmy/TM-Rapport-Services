"use client";

/**
 * Est-ce que le réseau SERT À QUELQUE CHOSE, ici, maintenant ?
 *
 * `navigator.onLine` ne répond pas à cette question : sur un chantier, le
 * téléphone est presque toujours « en ligne » — une barre de 4G au sous-sol, un
 * wifi de chantier sans accès internet — et l'app, croyant le réseau
 * disponible, attendait des requêtes qui mettaient trente secondes à mourir.
 * C'est ce qui donnait le sentiment que « l'app ne marche pas avec peu de
 * réseau » : elle marchait, elle attendait.
 *
 * On raisonne donc sur ce qu'on OBSERVE. Deux échecs ou expirations d'affilée
 * et l'on considère le réseau inutilisable pendant un moment : les
 * enregistrements partent alors directement dans la file d'attente, sans
 * attendre, et l'écran répond tout de suite. Une tentative est refaite
 * régulièrement ; au premier succès, tout redevient normal.
 */

/** Deux échecs d'affilée suffisent : un seul peut être un hasard. */
const SEUIL_ECHECS = 2;
/** Durée pendant laquelle on cesse d'attendre le réseau avant de retenter. */
export const REPOS_MS = 20_000;

let echecs = 0;
let degradeJusqua = 0;

function emettre(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("tm-reseau", { detail: { degrade: reseauDegrade() } }));
}

/** Vrai quand on a renoncé à attendre le réseau (temporairement). */
export function reseauDegrade(): boolean {
  return degradeJusqua > Date.now();
}

/** Vrai si une requête vaut la peine d'être tentée. */
export function reseauUtilisable(): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  return !reseauDegrade();
}

/** Une requête a échoué ou expiré. */
export function noterEchecReseau(): void {
  echecs += 1;
  if (echecs >= SEUIL_ECHECS && !reseauDegrade()) {
    degradeJusqua = Date.now() + REPOS_MS;
    emettre();
  }
}

/** Une requête a abouti : le réseau est de nouveau bon. */
export function noterSuccesReseau(): void {
  const etaitDegrade = reseauDegrade();
  echecs = 0;
  degradeJusqua = 0;
  if (etaitDegrade) emettre();
}

/** Remise à zéro — tests, et retour de l'événement `online` du navigateur. */
export function reinitialiserReseau(): void {
  echecs = 0;
  degradeJusqua = 0;
}

/**
 * `fetch` qui abandonne au bout de `msMax` au lieu d'attendre la fin du monde,
 * et qui tient à jour l'état du réseau. Une expiration compte comme un échec :
 * c'est exactement le cas « une barre de réseau » qu'on veut détecter.
 */
export async function fetchAvecDelai(
  url: string,
  init: RequestInit | undefined,
  msMax: number,
): Promise<Response> {
  const ctrl = new AbortController();
  const minuteur = setTimeout(() => ctrl.abort(), msMax);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    /* Une erreur serveur n'est pas un problème de réseau : le réseau a
       fonctionné. On ne dégrade que sur l'absence de réponse. */
    noterSuccesReseau();
    return res;
  } catch (e) {
    noterEchecReseau();
    throw e;
  } finally {
    clearTimeout(minuteur);
  }
}

if (typeof window !== "undefined") {
  // Le navigateur annonce le retour du réseau : on lui laisse sa chance tout de
  // suite plutôt que d'attendre la fin de la période de repos.
  window.addEventListener("online", () => { reinitialiserReseau(); emettre(); });
}
