"use client";

import { useEffect } from "react";

/**
 * En mode app macOS (window-controls-overlay), le navigateur peint la zone des
 * contrôles de fenêtre (feux à gauche, boutons à droite) avec la couleur
 * `<meta name="theme-color">`. Pour que ces bandes se fondent dans la page
 * (façon Calendrier Apple), on synchronise le theme-color avec la couleur du
 * HAUT de la page (premier stop du dégradé `.lg-bg`), en suivant les changements
 * de thème / section. N'agit QUE en WCO → le comportement mobile est inchangé.
 */
export function ThemeColorSync() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const wco = window.matchMedia?.("(display-mode: window-controls-overlay)");
    if (!wco?.matches) return;

    let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "theme-color");
      document.head.appendChild(meta);
    }

    // Premier code couleur (rgb/rgba/hex) trouvé dans une chaîne de dégradé.
    const firstColor = (s: string): string | null => {
      const m = s.match(/rgba?\([^)]*\)|#[0-9a-fA-F]{3,8}/);
      return m ? m[0] : null;
    };

    const apply = () => {
      try {
        const cs = getComputedStyle(document.body);
        let c = firstColor(cs.backgroundImage || "");
        if (!c) {
          const bg = cs.backgroundColor;
          if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") c = bg;
        }
        if (c) meta!.setAttribute("content", c);
      } catch { /* ignore */ }
    };

    apply();
    // Suivre les changements de thème (data-ui / dark) et de section.
    const obs = new MutationObserver(apply);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-ui", "data-cmm-active-section"] });
    obs.observe(document.body, { attributes: true, attributeFilter: ["class", "style"] });
    // Repli : certains fonds changent via `:has(...)` (onglet actif) sans muter
    // d'attribut observé → on ré-échantillonne périodiquement (léger).
    const t = window.setInterval(apply, 1500);
    document.addEventListener("visibilitychange", apply);

    return () => {
      obs.disconnect();
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", apply);
    };
  }, []);

  return null;
}
