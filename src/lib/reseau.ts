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
 * Lenteur du SERVEUR, ou réseau absent ?
 *
 * Une écriture Notion met parfois dix ou quinze secondes — relecture fraîche,
 * fusion par lot, invalidation du cache. Au bureau, sur la fibre, deux de ces
 * écritures d'affilée suffisaient à afficher « Réseau trop faible » : on
 * comptait l'expiration comme une panne de réseau, alors que le réseau allait
 * très bien (constaté le 16 octobre 2026, connexion à 300 Mb/s).
 *
 * On tranche donc par une question courte posée au serveur. S'il répond —
 * quel que soit le code — la ligne est bonne et c'est le traitement qui
 * traînait : rien à dégrader. S'il ne répond pas davantage, c'est bien le
 * réseau.
 */
async function trancherApresExpiration(): Promise<void> {
  try {
    const ctrl = new AbortController();
    const minuteur = setTimeout(() => ctrl.abort(), 4000);
    try {
      await fetch(`/api/build?sonde=${Date.now()}`, { cache: "no-store", signal: ctrl.signal });
      noterSuccesReseau();
      return;
    } finally {
      clearTimeout(minuteur);
    }
  } catch {
    /* Même une question d'un mot ne passe pas : le réseau, lui, est en cause. */
  }
  noterEchecReseau();
}

/**
 * `fetch` qui abandonne au bout de `msMax` au lieu d'attendre la fin du monde,
 * et qui tient à jour l'état du réseau.
 *
 * Un rejet immédiat (pas de route, DNS, avion) accuse le réseau tout de
 * suite. Une EXPIRATION, elle, ne prouve rien : on va le demander au serveur
 * avant de déclarer quoi que ce soit.
 */
export async function fetchAvecDelai(
  url: string,
  init: RequestInit | undefined,
  msMax: number,
): Promise<Response> {
  const ctrl = new AbortController();
  let expire = false;
  const minuteur = setTimeout(() => { expire = true; ctrl.abort(); }, msMax);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    /* Une erreur serveur n'est pas un problème de réseau : le réseau a
       fonctionné. On ne dégrade que sur l'absence de réponse. */
    noterSuccesReseau();
    return res;
  } catch (e) {
    if (expire) await trancherApresExpiration();
    else noterEchecReseau();
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
