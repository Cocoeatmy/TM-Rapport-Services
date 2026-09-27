"use client";

/**
 * Minuteurs économes en batterie.
 *
 * Un `setInterval` réveille le processeur même quand l'écran est éteint ou que
 * l'application est en arrière-plan. Sur un téléphone laissé ouvert sur un
 * chantier, une poignée de minuteurs à quelques secondes suffit à vider une
 * charge dans la journée — non pas par le calcul, qui est dérisoire, mais par
 * les réveils répétés, la radio réseau et les recalculs de style qu'ils
 * entraînent.
 *
 * `intervalleVisible` ne fait rien tant que l'onglet est caché, et rattrape
 * l'exécution manquée au retour au premier plan. L'utilisateur ne voit donc
 * aucune différence : l'écran est à jour dès qu'il le regarde.
 */

/**
 * Comme `setInterval`, mais suspendu quand la page n'est pas visible.
 *
 * @param fn        Travail à répéter.
 * @param ms        Période, en millisecondes.
 * @param auRetour  Exécuter aussitôt quand la page redevient visible
 *                  (défaut : oui). À mettre à `false` pour un travail coûteux
 *                  dont le retard n'a pas d'importance.
 * @returns Fonction d'arrêt, à appeler au démontage.
 */
export function intervalleVisible(
  fn: () => void,
  ms: number,
  auRetour = true,
): () => void {
  if (typeof window === "undefined") return () => {};

  const visible = () => typeof document === "undefined" || !document.hidden;

  const id = window.setInterval(() => {
    if (visible()) fn();
  }, ms);

  const onVisible = () => { if (auRetour && visible()) fn(); };
  document.addEventListener("visibilitychange", onVisible);

  return () => {
    window.clearInterval(id);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
