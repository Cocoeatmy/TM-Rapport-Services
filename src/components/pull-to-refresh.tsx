"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

/**
 * Tirer vers le bas pour recharger — avec la retenue du geste natif d'iOS.
 *
 * Il se déclenchait en défilant : un simple glissement rapide vers le haut
 * de la page rechargeait tout (20.10.2026). Trois raisons :
 *  - seul `window.scrollY` était regardé au moment du toucher : une page qui
 *    remontait encore sur son ÉLAN arrivait à 0 et le geste suivant était
 *    pris pour un « tirer » ;
 *  - une zone qui défile seule (liste, panneau) laisse la fenêtre à 0 : tout
 *    glissement vers le bas y armait le rechargement ;
 *  - 200 px de glissement suffisaient, ce qu'un défilement rapide atteint.
 *
 * Désormais : la page doit être immobile en haut depuis un instant, le geste
 * doit partir hors d'une zone qui défile, rester vertical, et tirer
 * franchement (~270 px) — puis on relâche.
 */
const DEMARRAGE = 24;   // px de glissement avant que la pastille n'apparaisse
const AMORTI = 0.45;    // la pastille descend moins vite que le doigt
const SEUIL = 110;      // distance amortie à atteindre (≈ 270 px de doigt)
const ELAN_MS = 450;    // un défilement plus récent que cela : la page bouge encore

/** Le toucher part-il d'une zone qui défile (et n'est pas en haut) ou d'une fenêtre ouverte ? */
function dansUneZoneQuiDefile(cible: EventTarget | null): boolean {
  let el = cible instanceof Element ? cible : null;
  while (el && el !== document.body && el !== document.documentElement) {
    if (el.matches("[role='dialog'], .tm-chatbot-panneau, .tm-ios-feuille, [data-nav-ios]")) return true;
    const s = getComputedStyle(el);
    if (/(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 1 && el.scrollTop > 0) return true;
    el = el.parentElement;
  }
  return false;
}

export function PullToRefresh() {
  const [visible, setVisible] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const startX = useRef(0);
  const isActive = useRef(false);
  const dernierDefilement = useRef(0);

  const annuler = () => {
    isActive.current = false;
    setPulling(false);
    setVisible(false);
    setDistance(0);
  };

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (refreshing || e.touches.length !== 1) return;
    if (window.scrollY > 0) return;
    if (Date.now() - dernierDefilement.current < ELAN_MS) return; // la page bouge encore
    if (dansUneZoneQuiDefile(e.target)) return;
    startY.current = e.touches[0].clientY;
    startX.current = e.touches[0].clientX;
    isActive.current = true;
  }, [refreshing]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isActive.current || refreshing) return;
    const dy = e.touches[0].clientY - startY.current;
    const dx = e.touches[0].clientX - startX.current;
    /* Un doigt qui remonte (on fait défiler la page vers le bas), un geste
       de côté, ou une page qui s'est mise à défiler : ce n'est pas un
       « tirer ». Les premiers pixels, eux, tremblent — tolérés. */
    if (window.scrollY > 0 || dy < -8 || (dy < DEMARRAGE && Math.abs(dx) > Math.max(Math.abs(dy), 8))) { annuler(); return; }
    if (dy > DEMARRAGE) {
      setDistance(Math.min((dy - DEMARRAGE) * AMORTI, 160));
      setPulling(true);
      setVisible(true);
    }
  }, [refreshing]);

  const handleTouchEnd = useCallback(() => {
    if (!isActive.current || !pulling) {
      isActive.current = false;
      return;
    }
    isActive.current = false;

    if (distance >= SEUIL && window.scrollY <= 0) {
      setRefreshing(true);
      setDistance(60);
      setPulling(false);
      setTimeout(() => {
        window.location.reload();
      }, 400);
    } else {
      annuler();
    }
  }, [pulling, distance]);

  useEffect(() => {
    /* L'élan : seul le défilement VERTICAL de la page compte — un bandeau
       qui défile de côté, ou un défilement automatique ailleurs, ne doit
       pas désarmer le geste. */
    let dernierY = window.scrollY;
    const surDefilement = () => {
      if (window.scrollY !== dernierY) dernierDefilement.current = Date.now();
      dernierY = window.scrollY;
    };
    window.addEventListener("scroll", surDefilement, { passive: true });
    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchmove", handleTouchMove, { passive: true });
    document.addEventListener("touchend", handleTouchEnd, { passive: true });
    document.addEventListener("touchcancel", annuler, { passive: true });
    return () => {
      window.removeEventListener("scroll", surDefilement);
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
      document.removeEventListener("touchcancel", annuler);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  if (!visible) return null;

  const ready = distance >= SEUIL;

  return (
    <div
      className="fixed left-1/2 z-[100] transition-all duration-200"
      style={{
        top: `${Math.max(distance - 50, 10)}px`,
        transform: "translateX(-50%)",
      }}
    >
      <div className={`w-11 h-11 rounded-full shadow-xl flex items-center justify-center transition-colors duration-200 ${
        refreshing ? "bg-blue-500" : ready ? "bg-green-500" : "bg-white dark:bg-slate-800"
      } border-2 ${refreshing ? "border-blue-400" : ready ? "border-green-400" : "border-gray-200 dark:border-gray-600"}`}>
        <RefreshCw
          className={`w-5 h-5 transition-all duration-200 ${
            refreshing ? "text-white animate-spin" : ready ? "text-white" : "text-gray-400"
          }`}
          style={!refreshing ? { transform: `rotate(${distance * 2.5}deg)` } : undefined}
        />
      </div>
    </div>
  );
}
