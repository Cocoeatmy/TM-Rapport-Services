"use client";

import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";

/**
 * L'assistant IA, dans l'en-tête, juste à droite du bouton Accueil.
 *
 * Il flottait en bas à droite et masquait, selon la page, des informations ou
 * des boutons (demande de Micael, 20.10.2026). Même pastille que ses voisines ;
 * il ouvre le même panneau, par l'évènement que le rail du thème Signal
 * utilisait déjà. Absent de la fiche projet, comme l'assistant lui-même.
 */
export function BoutonAssistant() {
  const pathname = usePathname();
  if (pathname?.startsWith("/projet/")) return null;
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("tm-ouvrir-assistant"))}
      aria-label="Assistant IA"
      title="Assistant IA"
      className="tm-ai-entete w-9 h-9 shrink-0 rounded-full bg-white/15 border border-white/20 flex items-center justify-center text-white hover:bg-white/25 active:scale-95 transition-all"
    >
      <Sparkles className="w-[18px] h-[18px]" />
    </button>
  );
}
