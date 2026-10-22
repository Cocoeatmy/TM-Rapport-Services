"use client";

/**
 * L'app Apple sur Mac agrandit la page (×1,3) par sa balise viewport
 * (voir apple/TMRapport/Navigateur.swift, scriptEchelle). Quand la fenêtre
 * change de taille, ou au réveil du Mac, WebKit applique parfois ce réglage
 * à moitié : la page reste réduite et décalée — rail plus étroit, bande vide
 * en haut — jusqu'à ce qu'on rafraîchisse (22.10.2026).
 *
 * Ce composant le détecte et fait ce que Micael faisait à la main : il
 * recharge la page. Seulement :
 *   • dans l'app Apple sur Mac (le script d'échelle a posé __tmEchelleF ≠ 1) ;
 *   • quand l'échelle réelle s'écarte nettement de celle voulue, ou que la
 *     vue est décalée ;
 *   • jamais pendant une saisie (champ actif), et au plus deux fois en dix
 *     minutes — un rechargement qui ne répare pas ne boucle pas.
 * Les saisies sont déjà enregistrées au fil de l'eau (sauvegarde auto et
 * file hors ligne) : un rechargement ne perd rien.
 */

import { useEffect } from "react";

const CLE = "tm-reparation-echelle";

export function ReparationEchelle() {
  useEffect(() => {
    const w = window as unknown as { __tmEchelleF?: number };
    const f = w.__tmEchelleF;
    if (typeof f !== "number" || Math.abs(f - 1) < 0.01) return;
    const vv = window.visualViewport;
    if (!vv) return;

    let minuterie: ReturnType<typeof setTimeout> | null = null;
    const verifier = () => {
      /* La largeur AFFICHÉE doit valoir la largeur de la vue divisée par
         l'échelle : c'est ce que pose la balise viewport. Un écart net dit
         que l'agrandissement n'a pris qu'à moitié. */
      const largeur = (window as unknown as { __tmLargeurVue?: number }).__tmLargeurVue || window.outerWidth;
      if (!largeur) return;
      const attendu = largeur / f;
      const derive = Math.abs(window.innerWidth - attendu) / attendu > 0.08 || vv.offsetTop > 4 || vv.offsetLeft > 4;
      if (!derive) return;
      const a = document.activeElement as HTMLElement | null;
      if (a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) return;
      /* Frein : deux rechargements au plus en dix minutes. Si le diagnostic
         se trompait, l'app ne boucle pas. */
      try {
        const maintenant = Date.now();
        const recents = (JSON.parse(sessionStorage.getItem(CLE) || "[]") as number[]).filter((t) => maintenant - t < 600_000);
        if (recents.length >= 2) return;
        sessionStorage.setItem(CLE, JSON.stringify([...recents, maintenant]));
      } catch { return; }
      console.warn(`[échelle] affichage dérivé (${window.innerWidth} px au lieu de ${Math.round(attendu)}) — rechargement`);
      window.location.reload();
    };
    const planifier = () => {
      if (minuterie) clearTimeout(minuterie);
      minuterie = setTimeout(verifier, 700);
    };
    window.addEventListener("resize", planifier);
    vv.addEventListener("resize", planifier);
    const auRetour = () => { if (!document.hidden) planifier(); };
    document.addEventListener("visibilitychange", auRetour);
    window.addEventListener("focus", planifier);
    planifier();
    return () => {
      if (minuterie) clearTimeout(minuterie);
      window.removeEventListener("resize", planifier);
      vv.removeEventListener("resize", planifier);
      document.removeEventListener("visibilitychange", auRetour);
      window.removeEventListener("focus", planifier);
    };
  }, []);
  return null;
}
