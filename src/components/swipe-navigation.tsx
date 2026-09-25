"use client";

/**
 * Navigation au geste : balayage horizontal à deux doigts sur le pavé tactile
 * (macOS) pour revenir en arrière / aller en avant.
 *
 * En PWA « standalone », le geste natif du navigateur est désactivé : on le
 * réimplémente à partir des évènements `wheel` horizontaux, qui sont ce que le
 * pavé tactile émet pour un balayage à deux doigts.
 *
 * Garde-fous (l'app contient beaucoup de zones qui défilent horizontalement :
 * barre d'onglets, rangées de chips, tableaux) :
 *   - on ignore tout geste à dominante verticale ;
 *   - on ignore le geste si un ancêtre peut encore défiler dans cette
 *     direction — la zone garde donc la priorité ;
 *   - seuil de déclenchement + verrou après navigation, pour éviter les
 *     doubles retours sur un geste à inertie.
 *
 * Actif UNIQUEMENT sous le thème « Signal » : les autres thèmes gardent leur
 * comportement actuel à l'identique.
 */

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useIsSignalTheme } from "@/lib/use-signal-theme";

const THRESHOLD = 140;   // px cumulés avant déclenchement
const IDLE_RESET = 260;  // ms sans évènement → on repart de zéro
const LOCK_AFTER = 900;  // ms de verrou après une navigation

/** Un ancêtre peut-il encore défiler horizontalement dans cette direction ? */
function scrollableAncestor(start: EventTarget | null, dir: number): boolean {
  let el = start instanceof Element ? start : null;
  while (el && el !== document.body && el !== document.documentElement) {
    const ox = getComputedStyle(el).overflowX;
    if ((ox === "auto" || ox === "scroll") && el.scrollWidth > el.clientWidth + 1) {
      if (dir < 0 && el.scrollLeft > 1) return true;
      if (dir > 0 && el.scrollLeft < el.scrollWidth - el.clientWidth - 1) return true;
    }
    el = el.parentElement;
  }
  return false;
}

export function SwipeNavigation() {
  const router = useRouter();
  const isSignal = useIsSignalTheme();
  const accRef = useRef(0);
  const lastRef = useRef(0);
  const lockRef = useRef(0);
  const hintRef = useRef<HTMLDivElement | null>(null);
  const canForwardRef = useRef(false);

  useEffect(() => {
    if (!isSignal) return;

    const hint = hintRef.current;
    const paint = () => {
      if (!hint) return;
      const acc = accRef.current;
      const p = Math.min(1, Math.abs(acc) / THRESHOLD);
      if (p < 0.06) { hint.style.opacity = "0"; return; }
      const back = acc < 0;
      hint.style.opacity = String(p);
      hint.dataset.dir = back ? "back" : "forward";
      hint.style.transform = `translateY(-50%) translateX(${back ? (1 - p) * -14 : (1 - p) * 14}px)`;
    };
    const clear = () => { accRef.current = 0; paint(); };

    const onWheel = (e: WheelEvent) => {
      // Geste à dominante verticale → défilement normal.
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      // Une zone défilante horizontalement garde la priorité.
      if (scrollableAncestor(e.target, e.deltaX)) return;

      const now = Date.now();
      if (now < lockRef.current) { e.preventDefault(); return; }
      if (now - lastRef.current > IDLE_RESET) accRef.current = 0;
      lastRef.current = now;

      accRef.current += e.deltaX;
      // Empêche le rebond horizontal de la page pendant le geste.
      e.preventDefault();
      paint();

      if (Math.abs(accRef.current) >= THRESHOLD) {
        const back = accRef.current < 0;
        lockRef.current = now + LOCK_AFTER;
        clear();
        if (back) {
          canForwardRef.current = true;
          router.back();
        } else if (canForwardRef.current) {
          router.forward();
        }
      }
    };

    const onIdle = () => { if (Date.now() - lastRef.current > IDLE_RESET) clear(); };
    const timer = window.setInterval(onIdle, 200);
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.clearInterval(timer);
    };
  }, [isSignal, router]);

  if (!isSignal) return null;

  return (
    <div ref={hintRef} className="sg-swipe-hint" aria-hidden="true" style={{ opacity: 0 }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="m15 18-6-6 6-6" />
      </svg>
    </div>
  );
}
