"use client";

import { useRouter } from "next/navigation";

/**
 * Bouton Accueil (petite maison) du header.
 * Au clic : ferme tout panneau de dashboard ouvert (état + mémoire) PUIS
 * navigue vers le dashboard principal. Sans ça, la restauration de panneau
 * (sessionStorage) rouvrait le panneau et l'utilisateur restait "coincé".
 */
export function HomeButton() {
  const router = useRouter();
  return (
    <a
      href="/"
      aria-label="Accueil"
      onClick={(e) => {
        e.preventDefault();
        try { sessionStorage.removeItem("tm-dash-panel"); } catch {}
        // Réinitialise la page principale au dashboard (mode + filtres + panneau).
        // Le mode étant un état figé à l'init, router.push("/") seul ne suffit pas.
        try { window.dispatchEvent(new CustomEvent("tm-go-home")); } catch {}
        router.push("/");
      }}
      className="home-badge inline-flex items-center justify-center w-9 h-9 rounded-xl shadow-lg text-white"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-5 h-5"
      >
        <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    </a>
  );
}
