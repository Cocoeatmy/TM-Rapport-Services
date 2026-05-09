/**
 * Pré-téléchargement hors-ligne des projets du jour
 * ──────────────────────────────────────────────────
 * Appelé après que page.tsx a chargé projectsData + currentUser.
 * Effectue des fetch() silencieux des pages projet et de leurs données API.
 * Le Service Worker intercepte ces requêtes → les met en cache automatiquement.
 * Résultat : les pages sont consultables hors ligne même si jamais visitées.
 */

import type { Project } from "./notion";

const LS_OFFLINE_READY = "tm-offline-ready-projects";

/** Pré-cache une page projet et ses données API essentielles. */
async function prefetchOne(projectId: string): Promise<void> {
  const urls = [
    `/projet/${projectId}`,               // Page HTML (navigation hors ligne)
    `/api/projects/${projectId}`,          // Données projet
    `/api/pieces?projectId=${projectId}`,  // Pièces manquantes
    `/api/defauts?projectId=${projectId}`, // Défauts
  ];

  await Promise.allSettled(
    urls.map((url) =>
      fetch(url, { credentials: "include", cache: "no-store" }).catch(() => {})
    )
  );
}

/**
 * Pré-télécharge les projets du jour assignés à l'utilisateur courant.
 * - Chaque collaborateur ne télécharge que ses propres projets.
 * - Limité à 10 projets max pour ne pas saturer le réseau.
 * - Stocke la liste des IDs prêts dans localStorage pour un affichage d'état.
 */
export async function prefetchTodaysProjects(
  allProjects: Project[],
  userName: string
): Promise<void> {
  if (typeof window === "undefined") return;
  if (!navigator.onLine) return;

  const todayStr = new Date().toISOString().split("T")[0];

  const mine = allProjects.filter((p) => {
    const start = p.dateMontage || "";
    const end = p.dateMontageEnd || start;
    if (!start) return false;
    // Le projet couvre aujourd'hui (peut durer plusieurs jours)
    if (!(start <= todayStr && end >= todayStr)) return false;
    const collab = (p.collaborateurs || "").toLowerCase();
    return (
      collab.includes(userName.toLowerCase()) ||
      collab.includes("team tm")
    );
  });

  if (mine.length === 0) return;

  // Pré-cache en séquence pour ne pas surcharger le réseau
  for (const p of mine.slice(0, 10)) {
    await prefetchOne(p.id);
  }

  // Marque ces projets comme disponibles hors ligne
  try {
    localStorage.setItem(LS_OFFLINE_READY, JSON.stringify(mine.map((p) => p.id)));
  } catch {}
}

/** Retourne true si ce projet est marqué comme disponible hors ligne. */
export function isProjectOfflineReady(projectId: string): boolean {
  try {
    const raw = localStorage.getItem(LS_OFFLINE_READY);
    if (!raw) return false;
    return (JSON.parse(raw) as string[]).includes(projectId);
  } catch {
    return false;
  }
}
