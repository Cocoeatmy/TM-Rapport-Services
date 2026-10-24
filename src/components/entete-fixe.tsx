"use client";

/**
 * Suit la hauteur réelle de l'en-tête (bandeau hors ligne compris) et la
 * pose dans `--entete-h` : la cale qui lui garde sa place quand il est figé
 * (globals.css, `.tm-entete-place`) a toujours exactement sa taille, même
 * quand le bandeau paraît ou que la barre du thème Signal s'y greffe.
 */

import { useEffect } from "react";

export function EnteteFixe() {
  useEffect(() => {
    const bloc = document.getElementById("tm-entete");
    if (!bloc) return;
    const poser = () => document.documentElement.style.setProperty("--entete-h", `${bloc.offsetHeight}px`);
    poser();
    const ro = new ResizeObserver(poser);
    ro.observe(bloc);
    return () => ro.disconnect();
  }, []);
  return null;
}
