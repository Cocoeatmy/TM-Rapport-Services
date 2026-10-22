"use client";

/**
 * Plus de rebond élastique dans Safari sur Mac (22.10.2026).
 *
 * Au bout du défilement, Safari macOS fait « rebondir » toute la page — barre
 * du haut et rail compris — et découvre une bande claire au-dessus (ou à
 * gauche). `overscroll-behavior: none` (globals.css) suffit dans Chrome et
 * dans l'app Apple (rebond coupé côté natif), mais Safari l'ignore pour la
 * page entière. Ici, un défilement à la molette ou au trackpad qui DÉPASSERAIT
 * le bord est arrêté net au bord : la page s'arrête, rien ne bouge.
 *
 * Les zones qui défilent seules (liste, fiche latérale, tableau large) gardent
 * leur défilement : on ne touche qu'à ce qui irait à la page entière.
 * Rien ne s'installe ailleurs que dans Safari sur Mac (ni iPhone/iPad, ni
 * Chrome) ; le zoom au pincement (ctrl + molette) n'est pas concerné.
 */

import { useEffect } from "react";

function safariMac(): boolean {
  const ua = navigator.userAgent;
  return /Macintosh/.test(ua) && /Safari\//.test(ua)
    && !/Chrome|Chromium|CriOS|Edg|Firefox|FxiOS/.test(ua)
    && (navigator.maxTouchPoints || 0) === 0;
}

/** Un ancêtre de la cible défile-t-il lui-même dans cet axe ? */
function zoneQuiDefile(depart: EventTarget | null, axe: "x" | "y", delta: number): boolean {
  let el = depart instanceof Element ? depart : null;
  const racine = document.scrollingElement || document.documentElement;
  while (el && el !== racine && el !== document.body) {
    const s = getComputedStyle(el);
    const ov = axe === "y" ? s.overflowY : s.overflowX;
    if (ov === "auto" || ov === "scroll" || ov === "overlay") {
      const plein = axe === "y" ? el.scrollHeight > el.clientHeight + 1 : el.scrollWidth > el.clientWidth + 1;
      if (plein) {
        const pos = axe === "y" ? el.scrollTop : el.scrollLeft;
        const max = axe === "y" ? el.scrollHeight - el.clientHeight : el.scrollWidth - el.clientWidth;
        if (delta > 0 ? pos < max - 1 : pos > 1) return true;
        // Au bord mais sans chaînage vers la page : c'est à elle seule.
        const ob = axe === "y" ? s.overscrollBehaviorY : s.overscrollBehaviorX;
        if (ob === "contain" || ob === "none") return true;
      }
    }
    el = el.parentElement;
  }
  return false;
}

export function SansRebondMac() {
  useEffect(() => {
    if (!safariMac()) return;
    const surMolette = (e: WheelEvent) => {
      if (e.ctrlKey || e.defaultPrevented) return;
      const facteur = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1;
      const dx = e.deltaX * facteur, dy = e.deltaY * facteur;
      // Geste surtout horizontal : la page ne défile jamais en largeur.
      if (Math.abs(dx) > Math.abs(dy)) {
        if (dx !== 0 && !zoneQuiDefile(e.target, "x", dx)) e.preventDefault();
        return;
      }
      if (dy === 0 || zoneQuiDefile(e.target, "y", dy)) return;
      const racine = document.scrollingElement || document.documentElement;
      const y = racine.scrollTop;
      const max = racine.scrollHeight - window.innerHeight;
      if (dy < 0 && y + dy < 0) {
        e.preventDefault();
        if (y > 0) window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
      } else if (dy > 0 && y + dy > max) {
        e.preventDefault();
        if (y < max) window.scrollTo({ top: max, behavior: "instant" as ScrollBehavior });
      }
    };
    window.addEventListener("wheel", surMolette, { passive: false });
    return () => window.removeEventListener("wheel", surMolette);
  }, []);
  return null;
}
