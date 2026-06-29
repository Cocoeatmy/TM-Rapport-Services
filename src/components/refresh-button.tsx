"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";

/**
 * Petit bouton dans l'en-tête pour recharger la page — équivalent de
 * CMD+R / Ctrl+R / pull-to-refresh, mais accessible à la souris sur
 * desktop (macOS / iPadOS avec trackpad) où le raccourci n'est pas
 * toujours pratique.
 *
 * Le short spin local sert de feedback immédiat : on sait que le tap
 * a été reçu, le rechargement effectif enchaîne derrière.
 */
export function RefreshButton() {
  const [spinning, setSpinning] = useState(false);

  const handleClick = () => {
    setSpinning(true);
    // Rafraîchissement FORCÉ : on contourne tous les caches pour récupérer les
    // toutes dernières modifs Notion (sinon les derniers RDV ajoutés manquent).
    try {
      // 1) vide le cache API du service worker (mobile surtout).
      navigator.serviceWorker?.controller?.postMessage({ type: "INVALIDATE_API_CACHE" });
    } catch {}
    try {
      // 2) drapeau lu au rechargement → les requêtes ajoutent ?fresh (contourne
      //    cache serveur + CDN).
      sessionStorage.setItem("tm-force-fresh", "1");
    } catch {}
    setTimeout(() => {
      window.location.reload();
    }, 200);
  };

  return (
    <button
      onClick={handleClick}
      aria-label="Rafraîchir la page"
      title="Rafraîchir"
      className="w-9 h-9 shrink-0 rounded-full bg-white/15 border border-white/20 flex items-center justify-center text-white hover:bg-white/25 active:scale-95 transition-all"
    >
      <RefreshCw className={`w-4 h-4 ${spinning ? "animate-spin" : ""}`} />
    </button>
  );
}
