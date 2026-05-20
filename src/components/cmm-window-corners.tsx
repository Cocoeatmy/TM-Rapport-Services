"use client";

/**
 * CmmWindowCorners — Coins arrondis de fenêtre macOS pour le thème CleanMyMac.
 *
 * Technique : 4 petits divs fixes (16×16 px) positionnés dans chaque coin de
 * l'écran. Chacun recouvre le coin carré avec la couleur de fond de l'élément
 * html (#040010) et un border-radius orienté vers le centre, créant l'illusion
 * parfaite de coins arrondis — sans clip-path qui ne clippe pas les éléments
 * position:fixed dans les navigateurs actuels.
 *
 * Uniquement visible sur desktop (≥ 1024 px) en thème CleanMyMac.
 * Mis à jour en temps réel via MutationObserver si l'utilisateur change de thème.
 */

import { useEffect, useState } from "react";

const R = 16;           // rayon du coin en pixels — doit correspondre à globals.css
const BG = "#040010";   // couleur de l'élément html (fond derrière la fenêtre)
const Z = 2147483645;   // juste sous le filet de fenêtre (2147483647) et les feux (2147483646)

export function CmmWindowCorners() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const check = () =>
      setVisible(document.documentElement.getAttribute("data-ui") === "cleanmymac");
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-ui"],
    });
    return () => obs.disconnect();
  }, []);

  if (!visible) return null;

  const base: React.CSSProperties = {
    position: "fixed",
    width: R,
    height: R,
    background: BG,
    pointerEvents: "none",
    zIndex: Z,
  };

  return (
    // lg:block = uniquement sur desktop ≥ 1024 px
    <div className="hidden lg:contents">
      {/* Coin haut-gauche */}
      <div style={{ ...base, top: 0, left: 0, borderBottomRightRadius: R }} />
      {/* Coin haut-droite */}
      <div style={{ ...base, top: 0, right: 0, borderBottomLeftRadius: R }} />
      {/* Coin bas-gauche */}
      <div style={{ ...base, bottom: 0, left: 0, borderTopRightRadius: R }} />
      {/* Coin bas-droite */}
      <div style={{ ...base, bottom: 0, right: 0, borderTopLeftRadius: R }} />
    </div>
  );
}
