/**
 * Vider les caches de lecture — et seulement eux.
 *
 * Le navigateur garde deux choses très différentes sous le même toit :
 *
 *   • des COPIES de ce que le serveur sait déjà — listes de chantiers,
 *     statistiques, cache hors-ligne. Les jeter ne coûte qu'un rechargement.
 *   • du TRAVAIL qui n'est pas encore parti — la file d'envoi, les photos en
 *     attente, les noms de lots et pointages saisis sur le chantier. Les jeter
 *     perd du travail, définitivement.
 *
 * Un bouton « vider le cache » qui efface tout serait donc un bouton « perdre
 * ce que je viens de saisir ». Celui-ci ne touche qu'à la première catégorie,
 * et il refuse d'agir tant qu'il reste quelque chose à envoyer.
 */

/** Clés de COPIES, jetables sans rien perdre. */
const CACHES_DE_LECTURE = [
  "tm-projects-cache",
  "tm-projects-cache-ts",
  "tm-rapport-cache",   // cache hors-ligne (listes préchargées)
  "tm-cache-warm-ts",
  "tm-stats-data-v2",
  "tm-stats-ts-v2",
];

/** Préfixes de clés à NE JAMAIS toucher : du travail pas encore parti. */
const A_PRESERVER = [
  "tm-rapport-queue",      // file d'envoi hors-ligne
  "tm-offline-abandons",   // envois abandonnés, pas encore acquittés
  "tm-cabin-noms-",        // noms de lots saisis sur place
  "tm-cabin-monteurs-",
  "tm-pointages-",         // heures saisies sur place
  "carton-photos-",
  "stock-usage-",
];

/** Réglages personnels : on ne les efface pas, ce n'est pas du cache. */
const REGLAGES = ["tm-ui-mode", "tm-dark-mode", "tm-dashboard-order-", "tm-rdv-", "tm-stat-chart-types", "tm-arrivage-statuts", "tm-crm-", "tm-push-subscribed"];

export function estPreservee(cle: string): boolean {
  return A_PRESERVER.some((p) => cle.startsWith(p)) || REGLAGES.some((p) => cle.startsWith(p));
}

/** Les clés que le vidage emporterait, dans l'état actuel du navigateur. */
export function clesAVider(toutesLesCles: string[]): string[] {
  return toutesLesCles.filter((k) => CACHES_DE_LECTURE.includes(k) && !estPreservee(k));
}

/**
 * Vide les caches de lecture. Retourne le nombre de clés supprimées.
 * Ne touche ni à la file d'envoi, ni aux saisies locales, ni aux réglages.
 */
export function viderCachesDeLecture(): number {
  if (typeof window === "undefined") return 0;
  let n = 0;
  for (const cle of clesAVider(Object.keys(localStorage))) {
    try { localStorage.removeItem(cle); n++; } catch { /* rien à faire */ }
  }
  return n;
}

/** Demande au service worker d'oublier ses réponses d'API mises en cache. */
export async function viderCacheServiceWorker(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    reg?.active?.postMessage({ type: "INVALIDATE_API_CACHE" });
  } catch { /* sans service worker, rien à vider */ }
}
