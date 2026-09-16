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
    // Convertit rgb()/rgba()/hex en [r,g,b].
    const toRgb = (c: string): [number, number, number] | null => {
      const rgb = c.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
      if (rgb) return [+rgb[1], +rgb[2], +rgb[3]];
      let h = c.replace("#", "").trim();
      if (h.length === 3) h = h.split("").map((x) => x + x).join("");
      if (h.length >= 6) return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
      return null;
    };
    const mix = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);

    const apply = () => {
      try {
        const cs = getComputedStyle(document.body);
        let c = firstColor(cs.backgroundImage || "");
        if (!c) {
          const bg = cs.backgroundColor;
          if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") c = bg;
        }
        if (!c) return;
        const rgb = toRgb(c);
        if (!rgb) { meta!.setAttribute("content", c); return; }
        // La barre est un verre translucide (≈45 % blanc en clair / sombre en
        // sombre) : on applique le même mélange pour que les coins derrière les
        // contrôles natifs prennent la MÊME teinte apparente que la barre.
        const dark = document.documentElement.classList.contains("dark");
        const [br, bg2, bb] = dark ? [22, 24, 30] : [255, 255, 255];
        const t = 0.45;
        const r = mix(rgb[0], br, t), g = mix(rgb[1], bg2, t), b = mix(rgb[2], bb, t);
        meta!.setAttribute("content", `rgb(${r}, ${g}, ${b})`);
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
