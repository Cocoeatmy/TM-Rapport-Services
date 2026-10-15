"use client";

/**
 * Un champ de texte qui montre tout ce qu'on y écrit.
 *
 * Les zones de texte avaient une hauteur fixe : passé trois lignes, le
 * collaborateur devait faire défiler À L'INTÉRIEUR du champ pour se relire.
 * Sur un téléphone, où le clavier mange déjà la moitié de l'écran, c'est
 * intenable — on écrit sans voir, et on se relit mal.
 *
 * Le champ grandit donc avec le texte et rétrécit quand on efface. La règle
 * est la plus simple possible : on laisse le navigateur mesurer la hauteur
 * qu'il faudrait (`scrollHeight`), et on la donne au champ.
 *
 * Trois précautions, chacune pour un cas réel :
 *
 *   • la hauteur d'origine (celle de l'attribut `rows`) sert de plancher —
 *     un champ prévu sur trois lignes ne se réduit pas à une seule parce
 *     qu'il est vide ;
 *   • un champ encore invisible — onglet replié, modale fermée — mesure
 *     zéro : on ne touche à rien et on attend qu'il s'affiche, sinon il
 *     resterait écrasé à zéro ;
 *   • la largeur change (rotation du téléphone, volet qui s'ouvre) et le
 *     texte se recoupe autrement : un observateur recalcule.
 *
 * `field-sizing: content` fait tout cela en CSS, mais Safari ne le connaît
 * pas — c'est-à-dire ni l'iPhone ni l'iPad, les seuls appareils des
 * monteurs. D'où ce calcul en JavaScript.
 */

import { useLayoutEffect, type RefObject } from "react";

/** Donne au champ la hauteur exacte de son contenu. */
export function ajusterHauteur(el: HTMLTextAreaElement | null | undefined): void {
  if (!el) return;
  /* Invisible : toute mesure vaudrait zéro, et on figerait le champ à rien. */
  if (el.offsetParent === null && el.offsetHeight === 0) return;
  if (!el.dataset.hmin && el.offsetHeight > 0) {
    el.dataset.hmin = String(el.offsetHeight);
  }
  const plancher = parseFloat(el.dataset.hmin || "0") || 0;
  el.style.overflowY = "hidden";
  el.style.height = "auto";
  /* `scrollHeight` mesure le contenu et ses marges intérieures, pas les
     bordures. Avec `box-sizing: border-box` — la règle dans toute l'app —
     la hauteur qu'on pose les INCLUT : sans les rajouter, les deux derniers
     pixels de la dernière ligne restent coupés. */
  const cs = window.getComputedStyle(el);
  const bordures = cs.boxSizing === "border-box"
    ? (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0)
    : 0;
  el.style.height = `${Math.max(el.scrollHeight + bordures, plancher)}px`;
}

/**
 * Tient la hauteur d'un champ à jour : à l'affichage, à chaque frappe, et
 * quand un texte déjà enregistré arrive de l'extérieur.
 */
export function useHauteurAuto(
  ref: RefObject<HTMLTextAreaElement | null>,
  valeur?: unknown,
): void {
  useLayoutEffect(() => {
    ajusterHauteur(ref.current);
  });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    /* On observe le PARENT : observer le champ lui-même rebouclerait, puisque
       c'est sa hauteur qu'on modifie. Le parent, lui, ne change que de
       largeur — rotation, volet, apparition d'un onglet. */
    const cible = el.parentElement || el;
    const obs = new ResizeObserver(() => ajusterHauteur(el));
    obs.observe(cible);
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, valeur]);
}
