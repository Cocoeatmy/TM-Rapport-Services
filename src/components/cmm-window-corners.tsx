"use client";

/**
 * CmmWindowCorners — Coins arrondis + feux de signalisation macOS pour le thème CleanMyMac.
 *
 * Coins : 4 divs fixes qui masquent les coins avec la couleur de fond (#040010).
 * Feux  : 3 boutons rouge/jaune/vert fonctionnels (fermer / réduire / plein écran).
 *         Masqués via CSS en mode Window Controls Overlay (les natifs macOS prennent le relai).
 */

import { useEffect, useState } from "react";

const R  = 20;          // rayon coin en px
const BG = "#040010";   // couleur fond html (derrière la fenêtre)
const ZC = 2147483645;  // z-index coins (sous frame 2147483647, sous feux 2147483646)
const ZT = 2147483646;  // z-index feux (sous frame)

export function CmmWindowCorners() {
  const [visible, setVisible]       = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const checkTheme = () =>
      setVisible(document.documentElement.getAttribute("data-ui") === "cleanmymac");
    checkTheme();

    const obs = new MutationObserver(checkTheme);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-ui"] });

    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);

    return () => {
      obs.disconnect();
      document.removeEventListener("fullscreenchange", onFsChange);
    };
  }, []);

  if (!visible) return null;

  const handleClose = () => window.close();

  const handleMinimize = () => {
    // Pas d'API web standard pour réduire une fenêtre.
    // On tente window.blur() pour reléguer l'app au second plan.
    window.blur();
  };

  const handleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen?.();
    }
  };

  const cornerBase: React.CSSProperties = {
    position: "fixed",
    width: R,
    height: R,
    background: BG,
    pointerEvents: "none",
    zIndex: ZC,
  };

  const dotBase: React.CSSProperties = {
    position: "fixed",
    top: 18,
    width: 12,
    height: 12,
    borderRadius: "50%",
    cursor: "pointer",
    zIndex: ZT,
    border: "none",
    padding: 0,
    outline: "none",
    transition: "filter 0.12s ease, transform 0.10s ease",
  };

  return (
    // hidden lg:contents = uniquement sur desktop ≥ 1024 px
    <div className="hidden lg:contents">
      {/* ── Masques de coins ── */}
      <div style={{ ...cornerBase, top: 0, left: 0, borderBottomRightRadius: R }} />
      <div style={{ ...cornerBase, top: 0, right: 0, borderBottomLeftRadius: R }} />
      <div style={{ ...cornerBase, bottom: 0, left: 0, borderTopRightRadius: R }} />
      <div style={{ ...cornerBase, bottom: 0, right: 0, borderTopLeftRadius: R }} />

      {/* ── Feux de signalisation ── */}
      {/* Masqués en mode Window Controls Overlay via .cmm-traffic-btn en globals.css */}

      {/* Rouge – Fermer */}
      <button
        className="cmm-traffic-btn"
        onClick={handleClose}
        aria-label="Fermer la fenêtre"
        title="Fermer"
        style={{
          ...dotBase,
          left: 20,
          background: "#FF5F57",
          boxShadow: "0 0 0 0.5px rgba(0,0,0,0.22)",
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.filter = "brightness(0.82)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.filter = ""; }}
        onMouseDown={(e)  => { (e.currentTarget as HTMLElement).style.transform = "scale(0.88)"; }}
        onMouseUp={(e)    => { (e.currentTarget as HTMLElement).style.transform = ""; }}
      />

      {/* Jaune – Réduire */}
      <button
        className="cmm-traffic-btn"
        onClick={handleMinimize}
        aria-label="Réduire la fenêtre"
        title="Réduire"
        style={{
          ...dotBase,
          left: 40,
          background: "#FEBC2E",
          boxShadow: "0 0 0 0.5px rgba(0,0,0,0.14)",
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.filter = "brightness(0.82)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.filter = ""; }}
        onMouseDown={(e)  => { (e.currentTarget as HTMLElement).style.transform = "scale(0.88)"; }}
        onMouseUp={(e)    => { (e.currentTarget as HTMLElement).style.transform = ""; }}
      />

      {/* Vert – Plein écran */}
      <button
        className="cmm-traffic-btn"
        onClick={handleFullscreen}
        aria-label={isFullscreen ? "Quitter le plein écran" : "Plein écran"}
        title={isFullscreen ? "Quitter le plein écran" : "Plein écran"}
        style={{
          ...dotBase,
          left: 60,
          background: "#28C840",
          boxShadow: "0 0 0 0.5px rgba(0,0,0,0.14)",
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.filter = "brightness(0.82)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.filter = ""; }}
        onMouseDown={(e)  => { (e.currentTarget as HTMLElement).style.transform = "scale(0.88)"; }}
        onMouseUp={(e)    => { (e.currentTarget as HTMLElement).style.transform = ""; }}
      />
    </div>
  );
}
