"use client";

import { useEffect, useState } from "react";

/**
 * Indique si le thème « Signal » est actif (attribut data-ui sur <html>).
 *
 * Réagit au changement de thème via MutationObserver, comme le fait déjà
 * la détection du thème CleanMyMac dans page.tsx. Rend `false` au premier
 * rendu (serveur + hydratation) : les composants doivent donc considérer
 * `false` comme « thème historique », ce qui garantit qu'aucun autre thème
 * ne voit jamais le rendu Signal.
 */
export function useIsSignalTheme(): boolean {
  const [isSignal, setIsSignal] = useState(false);
  useEffect(() => {
    const check = () => setIsSignal(document.documentElement.getAttribute("data-ui") === "signal");
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-ui"] });
    return () => obs.disconnect();
  }, []);
  return isSignal;
}
