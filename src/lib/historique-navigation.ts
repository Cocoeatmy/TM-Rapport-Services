"use client";

/**
 * Historique applicatif — « la dernière page consultée ».
 *
 * `router.back()` ne suffit pas ici. L'application change de section — Mesures,
 * Montages, SAV, panneau du tableau de bord… — avec `router.replace`, qui
 * REMPLACE l'entrée d'historique au lieu d'en créer une. Le retour du
 * navigateur saute donc par-dessus tout ce qui a été visité sans changer de
 * route, et atterrit sur une page qu'on croyait avoir quittée depuis longtemps.
 *
 * On tient donc notre propre pile d'adresses visitées. Elle vivait dans le
 * composant de navigation au geste ; celui-ci a été retiré — trop sensible, il
 * changeait de page sur un simple mouvement du doigt — mais sa pile, elle,
 * restait la seule chose capable de répondre correctement à « reviens en
 * arrière ». Elle est donc devenue ce module, au service du bouton Retour.
 */

/** Au-delà, on oublie le plus ancien : personne ne remonte soixante pages. */
const MAX_PILE = 60;

let pile: string[] = [];
/** Adresse vers laquelle NOUS venons de naviguer. Tant que la barre d'adresse
 *  ne l'affiche pas, on n'enregistre rien — sans quoi notre propre navigation
 *  serait relue comme un déplacement de l'utilisateur et empilée deux fois. */
let attendue: string | null = null;
let attendueDepuis = 0;
let lecteurs = 0;
let poll: number | null = null;

function ici(): string {
  return window.location.pathname + window.location.search;
}

function noter() {
  const url = ici();
  if (attendue !== null) {
    if (url === attendue) { attendue = null; return; }
    // Filet : une navigation qui n'aboutit pas ne doit pas geler la pile.
    if (Date.now() - attendueDepuis < 2500) return;
    attendue = null;
  }
  if (pile[pile.length - 1] === url) return;
  pile.push(url);
  if (pile.length > MAX_PILE) pile.shift();
}

/**
 * Commence à suivre les déplacements. Appelable plusieurs fois : le suivi
 * s'arrête quand le dernier appelant a rendu sa fonction d'arrêt.
 */
export function suivreNavigation(): () => void {
  if (typeof window === "undefined") return () => {};
  lecteurs += 1;
  if (lecteurs === 1) {
    pile = [ici()];
    /* `router.replace` ne déclenche pas `popstate` : on relit l'adresse. Une
       fois par seconde suffit, et jamais quand l'écran est éteint — c'est un
       rattrapage, l'évènement `tm-url-changed` fait déjà l'essentiel. */
    poll = window.setInterval(() => { if (!document.hidden) noter(); }, 1000);
    window.addEventListener("popstate", noter);
    window.addEventListener("tm-url-changed", noter);
  }
  return () => {
    lecteurs -= 1;
    if (lecteurs > 0) return;
    if (poll !== null) { window.clearInterval(poll); poll = null; }
    window.removeEventListener("popstate", noter);
    window.removeEventListener("tm-url-changed", noter);
  };
}

/** Reste-t-il une page où revenir ? */
export function peutRevenir(): boolean {
  return pile.length >= 2;
}

/**
 * Revient à la page précédente réellement consultée.
 *
 * @param naviguer  Ce qu'il faut faire pour changer de route — `router.push`.
 * @returns `false` si la pile ne sait pas où aller ; à l'appelant de se
 *          rabattre alors sur l'historique du navigateur.
 */
export function revenir(naviguer: (url: string) => void): boolean {
  if (typeof window === "undefined" || pile.length < 2) return false;
  pile.pop();
  const cible = pile[pile.length - 1];
  attendue = cible;
  attendueDepuis = Date.now();

  const t = new URL(cible, window.location.origin);
  if (t.pathname === window.location.pathname) {
    /* Même route, paramètres différents : le mode et les filtres vivent dans
       l'état React et ne sont lus qu'au premier rendu. Changer l'adresse ne
       ramènerait donc rien à l'écran — on prévient la page. */
    window.history.replaceState(null, "", cible);
    window.dispatchEvent(new CustomEvent("tm-restore-view", { detail: { url: cible } }));
  } else {
    naviguer(cible);
  }
  return true;
}
