"use client";

/**
 * Navigation au geste — thème « Signal » uniquement.
 *
 *   • Pavé tactile (macOS) : balayage horizontal à deux doigts (évènements
 *     `wheel` avec deltaX).
 *   • Écran tactile (iOS / Android) : balayage horizontal du doigt DEPUIS UN
 *     BORD de l'écran, comme le geste natif d'iOS.
 *
 * Pourquoi un historique applicatif plutôt que router.back() ?
 * L'application change de section (Mesures, Montages, SAV, CRM…) avec
 * `router.replace` : ces changements ne créent AUCUNE entrée dans l'historique
 * du navigateur. Un simple router.back() sautait donc par-dessus toutes les
 * sections visitées et ne ramenait pas « à la dernière page consultée ».
 * On tient donc notre propre pile d'URL visitées, et on restaure l'état :
 *   - changement de route (ex. /projet/x → /) : navigation normale ;
 *   - même route, paramètres différents (ex. /?mode=sav) : le mode est porté
 *     par l'état React et initialisé une seule fois, donc changer l'URL ne
 *     suffit pas → on prévient la page par un évènement `tm-restore-view`.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useIsSignalTheme } from "@/lib/use-signal-theme";

const WHEEL_THRESHOLD = 140;  // px cumulés (pavé tactile)
const TOUCH_THRESHOLD = 90;   // px parcourus (doigt)
/* Largeur des zones de bord, en px, où un balayage du doigt est pris pour une
   navigation — comme le geste natif d'iOS. Ailleurs, le doigt appartient à la
   page : un simple mouvement au milieu de l'écran ne doit PAS changer de page. */
const EDGE_ZONE = 30;
const IDLE_RESET = 260;       // ms sans évènement → on repart de zéro
const LOCK_AFTER = 700;       // ms de verrou après une navigation
const MAX_STACK = 60;

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
  /* Geste réservé à l'administration : un balayage involontaire qui change de
     page gêne plus qu'il n'aide un monteur sur un chantier. */
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    let vivant = true;
    fetch("/api/auth")
      .then((r) => r.json())
      .then((d) => { if (vivant) setIsAdmin(d?.user?.role === "admin"); })
      .catch(() => {});
    return () => { vivant = false; };
  }, []);

  const backStack = useRef<string[]>([]);
  const fwdStack = useRef<string[]>([]);
  /* URL vers laquelle NOUS venons de naviguer. Tant que la barre d'adresse ne
     l'affiche pas, on n'enregistre rien : un simple drapeau booléen était
     consommé par la relecture périodique AVANT que l'URL ait changé, si bien
     que la relecture suivante prenait la nouvelle URL pour une navigation de
     l'utilisateur — et vidait la pile « avant ». D'où un geste vers l'avant
     sans effet. */
  const attendue = useRef<string | null>(null);
  const attendueDepuis = useRef(0);

  const accRef = useRef(0);
  const lastRef = useRef(0);
  const lockRef = useRef(0);
  const hintRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isSignal || !isAdmin) return;

    const hint = hintRef.current;
    const paint = (dir: number, progress: number) => {
      if (!hint) return;
      const p = Math.min(1, Math.max(0, progress));
      if (p < 0.06) { hint.style.opacity = "0"; return; }
      const back = dir < 0;
      hint.style.opacity = String(p);
      hint.dataset.dir = back ? "back" : "forward";
      hint.style.transform = `translateY(-50%) translateX(${back ? (1 - p) * -14 : (1 - p) * 14}px)`;
    };
    const hide = () => { accRef.current = 0; paint(0, 0); };

    /* ── Historique applicatif ────────────────────────────────────────── */
    const here = () => window.location.pathname + window.location.search;
    backStack.current = [here()];

    const record = () => {
      const url = here();
      if (attendue.current !== null) {
        // Navigation en cours : on attend que l'URL corresponde.
        if (url === attendue.current) { attendue.current = null; return; }
        // Filet : une navigation qui n'aboutit pas ne doit pas geler la pile.
        if (Date.now() - attendueDepuis.current < 2500) return;
        attendue.current = null;
      }
      const top = backStack.current[backStack.current.length - 1];
      if (top === url) return;
      backStack.current.push(url);
      if (backStack.current.length > MAX_STACK) backStack.current.shift();
      fwdStack.current = []; // une nouvelle navigation efface l'avant
    };
    /* `router.replace` ne déclenche pas popstate : on observe l'URL. Ce filet
       tournait dix fois par seconde à deux minuteurs, écran éteint compris —
       c'est beaucoup pour un rattrapage dont l'évènement `tm-url-changed`
       fait déjà l'essentiel. Une seconde suffit, et rien en arrière-plan. */
    const poll = window.setInterval(() => { if (!document.hidden) record(); }, 1000);
    window.addEventListener("popstate", record);
    // Une vue qui s'ouvre sans changer de route (panneau du tableau de bord)
    // signale son étape immédiatement, sans attendre la relecture périodique :
    // un geste de retour lancé aussitôt après trouve l'étape déjà en place.
    window.addEventListener("tm-url-changed", record);

    const goTo = (url: string) => {
      attendue.current = url;
      attendueDepuis.current = Date.now();
      const target = new URL(url, window.location.origin);
      if (target.pathname === window.location.pathname) {
        // Même route : l'état (mode, filtres) vit dans React, pas dans l'URL.
        window.history.replaceState(null, "", url);
        window.dispatchEvent(new CustomEvent("tm-restore-view", { detail: { url } }));
      } else {
        router.push(url);
      }
    };

    const goBack = () => {
      if (backStack.current.length < 2) { router.back(); return; }
      const current = backStack.current.pop() as string;
      fwdStack.current.push(current);
      goTo(backStack.current[backStack.current.length - 1]);
    };
    const goForward = () => {
      if (fwdStack.current.length === 0) return;
      const target = fwdStack.current.pop() as string;
      backStack.current.push(target);
      goTo(target);
    };

    const fire = (back: boolean) => {
      lockRef.current = Date.now() + LOCK_AFTER;
      hide();
      if (back) goBack(); else goForward();
    };

    /* ── Pavé tactile (wheel) ─────────────────────────────────────────── */
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      if (scrollableAncestor(e.target, e.deltaX)) return;
      const now = Date.now();
      if (now < lockRef.current) { e.preventDefault(); return; }
      if (now - lastRef.current > IDLE_RESET) accRef.current = 0;
      lastRef.current = now;
      accRef.current += e.deltaX;
      e.preventDefault();
      programmerEffacement();
      paint(accRef.current, Math.abs(accRef.current) / WHEEL_THRESHOLD);
      if (Math.abs(accRef.current) >= WHEEL_THRESHOLD) fire(accRef.current < 0);
    };

    /* ── Écran tactile (iOS / Android) ────────────────────────────────── */
    /* Le geste ne part QUE d'un bord, comme sur iOS : bord gauche pour revenir
       en arrière, bord droit pour repartir en avant. Sans cette contrainte, un
       glissement au milieu de l'écran — pour faire défiler une liste ou juste
       poser le doigt — changeait de page. Le sens est imposé par le bord de
       départ : depuis la gauche, seul un mouvement vers la droite compte. */
    let tx = 0, ty = 0, tracking = false, tdx = 0;
    let bord: "gauche" | "droite" | null = null;
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) { tracking = false; bord = null; return; }
      tx = e.touches[0].clientX;
      ty = e.touches[0].clientY;
      tdx = 0;
      const largeur = window.innerWidth;
      bord = tx <= EDGE_ZONE ? "gauche"
        : tx >= largeur - EDGE_ZONE ? "droite"
        : null;
      tracking = bord !== null && Date.now() >= lockRef.current;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!tracking || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - tx;
      const dy = e.touches[0].clientY - ty;
      // Geste vertical → défilement normal, on abandonne définitivement.
      if (Math.abs(dy) > Math.abs(dx)) { tracking = false; hide(); return; }
      if (Math.abs(dx) < 8) return;
      // Sens contraire au bord de départ : ce n'est pas une navigation.
      if ((bord === "gauche" && dx < 0) || (bord === "droite" && dx > 0)) {
        tracking = false; hide(); return;
      }
      // Une zone défilante horizontalement garde la priorité.
      // dx > 0 (doigt vers la droite) équivaut à deltaX < 0.
      if (scrollableAncestor(e.target, -dx)) { tracking = false; hide(); return; }
      tdx = dx;
      paint(-dx, Math.abs(dx) / TOUCH_THRESHOLD);
      if (e.cancelable) e.preventDefault();
    };
    const onTouchEnd = () => {
      if (tracking && Math.abs(tdx) >= TOUCH_THRESHOLD) fire(tdx > 0);
      else hide();
      tracking = false;
      tdx = 0;
      bord = null;
    };

    /* L'effacement de l'indicateur n'a de sens qu'APRÈS un geste : on ne
       surveille donc plus en continu, on programme un effacement à la fin de
       chaque mouvement. Un minuteur de moins, en permanence. */
    let effacement: ReturnType<typeof setTimeout> | null = null;
    const programmerEffacement = () => {
      if (effacement) clearTimeout(effacement);
      effacement = setTimeout(() => {
        if (Date.now() - lastRef.current >= IDLE_RESET) hide();
      }, IDLE_RESET + 20);
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      window.clearInterval(poll);
      if (effacement) clearTimeout(effacement);
      window.removeEventListener("popstate", record);
      window.removeEventListener("tm-url-changed", record);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [isSignal, isAdmin, router]);

  if (!isSignal || !isAdmin) return null;

  return (
    <div ref={hintRef} className="sg-swipe-hint" aria-hidden="true" style={{ opacity: 0 }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="m15 18-6-6 6-6" />
      </svg>
    </div>
  );
}
