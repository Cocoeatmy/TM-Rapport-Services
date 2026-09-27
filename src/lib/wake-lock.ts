"use client";

/**
 * Verrou d'écran (Screen Wake Lock API).
 *
 * Pourquoi (iPhone) : quand l'écran se verrouille, iOS suspend la page web —
 * la boucle de synchro des photos s'arrête net. En maintenant l'écran allumé
 * TANT QU'IL RESTE DES PHOTOS À ENVOYER, on laisse la synchro se terminer
 * pendant que le monteur a l'app ouverte. Le verrou est relâché dès que la
 * file est vide (pour ne pas vider la batterie inutilement).
 *
 * Progressive enhancement : si l'API n'existe pas (vieux iOS), tout est
 * silencieusement ignoré — le reste de la synchro fonctionne quand même.
 */

type WakeLockSentinelLike = { release: () => Promise<void>; released?: boolean };

let sentinel: WakeLockSentinelLike | null = null;
let wanted = false; // veut-on garder l'écran allumé en ce moment ?
let minuteur: ReturnType<typeof setTimeout> | null = null;

/**
 * Durée maximale du verrou.
 *
 * Garder l'écran allumé est, de très loin, ce qui consomme le plus : un envoi
 * qui n'aboutit jamais — photo trop lourde, réseau de sous-sol, serveur qui
 * refuse — maintenait l'écran allumé tant que l'application restait ouverte,
 * et vidait la batterie en une après-midi. Dix minutes suffisent largement à
 * vider une file normale ; au-delà, c'est que quelque chose ne passe pas, et
 * l'écran n'y changera rien.
 */
const DUREE_MAX_MS = 10 * 60_000;

function supported(): boolean {
  return typeof navigator !== "undefined" && "wakeLock" in navigator;
}

/** Demande (ou re-demande) le verrou d'écran si on est visible. */
export async function acquireWakeLock(): Promise<void> {
  wanted = true;
  if (!supported()) return;
  // Chaque demande relance le compte à rebours : tant que la file avance, le
  // verrou tient ; dès qu'elle stagne, il s'éteint tout seul.
  if (minuteur) clearTimeout(minuteur);
  minuteur = setTimeout(() => { releaseWakeLock(); }, DUREE_MAX_MS);
  if (sentinel && !sentinel.released) return;
  if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
  try {
    sentinel = await (navigator as any).wakeLock.request("screen");
    // Le verrou est auto-relâché quand la page passe en arrière-plan : on note
    // l'état pour pouvoir le re-demander au retour au premier plan.
    (sentinel as any)?.addEventListener?.("release", () => { sentinel = null; });
  } catch {
    sentinel = null; // refus (batterie faible, etc.) → on n'insiste pas
  }
}

/** Relâche le verrou d'écran (file vide). */
export async function releaseWakeLock(): Promise<void> {
  wanted = false;
  if (minuteur) { clearTimeout(minuteur); minuteur = null; }
  const s = sentinel;
  sentinel = null;
  try { await s?.release(); } catch {}
}

/**
 * À appeler sur `visibilitychange` : iOS relâche le verrou en arrière-plan,
 * il faut le re-demander au retour si on en a toujours besoin.
 */
export async function reacquireWakeLockIfWanted(): Promise<void> {
  if (wanted && typeof document !== "undefined" && document.visibilityState === "visible") {
    await acquireWakeLock();
  }
}
