"use client";

/**
 * Bouton Retour de l'en-tête.
 *
 * Il ne peut pas se contenter de `router.back()` : l'application change de
 * section avec `router.replace`, qui ne laisse aucune trace dans l'historique
 * du navigateur. Le retour sautait donc par-dessus les sections visitées et
 * ramenait ailleurs que sur la dernière page vue. Il s'appuie désormais sur la
 * pile tenue par `historique-navigation`, et ne se rabat sur l'historique du
 * navigateur que lorsque celle-ci ne sait rien — première page ouverte,
 * arrivée par un lien externe.
 */

import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import { suivreNavigation, revenir } from "@/lib/historique-navigation";

export function BackButton() {
  const router = useRouter();
  const pathname = usePathname();

  /* Monté dans l'en-tête, donc présent sur toutes les pages : c'est l'endroit
     naturel pour tenir le journal des déplacements. */
  useEffect(() => suivreNavigation(), []);

  if (pathname === "/") return null;

  return (
    <button
      type="button"
      onClick={() => { if (!revenir((url) => router.push(url))) router.back(); }}
      aria-label="Retour"
      title="Retour à la page précédente"
      className="back-btn inline-flex items-center justify-center w-9 h-9 rounded-xl text-white/70 hover:text-white transition-colors"
    >
      <ArrowLeft className="w-5 h-5" />
    </button>
  );
}
