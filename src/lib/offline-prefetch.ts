/**
 * Pré-téléchargement hors-ligne des projets du jour
 * ──────────────────────────────────────────────────
 * Appelé après que page.tsx a chargé projectsData + currentUser.
 * Effectue des fetch() silencieux des pages projet et de leurs données API.
 * Le Service Worker intercepte ces requêtes → les met en cache automatiquement.
 * Résultat : les pages sont consultables hors ligne même si jamais visitées.
 *
 * Protection anti-spam Notion :
 * - Une seule exécution par jour et par utilisateur (clé localStorage horodatée).
 * - Pas de `cache: "no-store"` → le CDN Vercel (sMaxAge 15 s / SWR 60 s) absorbe
 *   les appels répétés au lieu de frapper Notion à chaque fois.
 * - Délai de 300 ms entre projets pour étaler les requêtes dans le temps.
 */

import type { Project } from "./notion";

const LS_OFFLINE_READY    = "tm-offline-ready-projects";
const LS_LAST_PREFETCH    = "tm-offline-prefetch-ts"; // timestamp Unix (ms)

/** Champ Notion des documents de montage — le nom attendu par /api/file-proxy. */
const CHAMP_DOCS = "Documents pour Montage";
/** Au-delà, on encombre le téléphone pour un plan qu'on n'ouvrira pas. */
const MAX_DOCS = 6;

/**
 * Pré-cache les documents de montage d'un projet imminent.
 *
 * C'est ce qui manquait vraiment hors ligne : la page projet et ses données
 * étaient déjà là, mais les plans — ce qu'on ouvre réellement dans un sous-sol
 * sans réseau — n'arrivaient qu'à la première consultation, donc en ligne.
 *
 * Les octets passent par /api/file-proxy, que le service worker sait servir
 * depuis son cache quand le réseau manque. On ne touche PAS aux PDF générés
 * (fiche de travail, rapports) : ils sont volontairement exclus du cache, un
 * PDF périmé ayant déjà causé assez de confusion.
 */
async function prefetchDocuments(project: Project): Promise<void> {
  const docs = (project.documentsMontagee || []).slice(0, MAX_DOCS);
  if (docs.length === 0) return;
  const urls = docs.map((_, i) =>
    `${location.origin}/api/file-proxy?projectId=${encodeURIComponent(project.id)}`
    + `&field=${encodeURIComponent(CHAMP_DOCS)}&index=${i}`);

  // Le service worker met en cache ce qu'on lui désigne explicitement : une
  // simple requête ne suffit pas ici, /api/file-proxy répondant par une
  // redirection que le SW laisse passer tant qu'on est en ligne.
  try {
    const reg = await navigator.serviceWorker?.ready;
    const sw = reg?.active || navigator.serviceWorker?.controller;
    if (sw) sw.postMessage({ type: "PRECACHE_URLS", urls });
  } catch { /* pas de service worker : tant pis, l'app reste utilisable */ }
}

/** Pré-cache une page projet et ses données API essentielles. */
async function prefetchOne(projectId: string): Promise<void> {
  const urls = [
    `/projet/${projectId}`,               // Page HTML (navigation hors ligne)
    `/api/projects/${projectId}`,          // Données projet
    `/api/pieces?projectId=${projectId}`,  // Pièces manquantes
    `/api/defauts?projectId=${projectId}`, // Défauts
  ];

  // ⚠️ Ne PAS utiliser cache: "no-store" — cela bypasse le CDN Vercel et
  // frappe Notion directement à chaque requête, causant des 429 rate-limit.
  // Le SW (network-first) rafraîchit et met en cache de son côté.
  await Promise.allSettled(
    urls.map((url) =>
      fetch(url, { credentials: "include" }).catch(() => {})
    )
  );
}

/** Attente non-bloquante en ms. */
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Pré-télécharge les projets du jour assignés à l'utilisateur courant.
 *
 * Garde-fous :
 * - Ne s'exécute qu'une seule fois par jour par utilisateur
 *   (vérifié via localStorage — évite le spam si la page est rechargée).
 * - Limité à 10 projets max pour ne pas saturer le réseau.
 * - Pause de 300 ms entre chaque projet pour étaler les requêtes.
 * - Stocke la liste des IDs prêts dans localStorage pour un affichage d'état.
 */
export async function prefetchTodaysProjects(
  allProjects: Project[],
  userName: string
): Promise<void> {
  if (typeof window === "undefined") return;
  if (!navigator.onLine) return;

  const todayStr = new Date().toISOString().split("T")[0];
  // Date limite : aujourd'hui + 7 jours
  const limitDate = new Date();
  limitDate.setDate(limitDate.getDate() + 7);
  const limitStr = limitDate.toISOString().split("T")[0];

  // ── Throttle : 1 exécution par heure maximum ─────────────────────────────
  const ONE_HOUR_MS = 60 * 60 * 1000;
  const lastTs = parseInt(localStorage.getItem(LS_LAST_PREFETCH) || "0", 10);
  if (Date.now() - lastTs < ONE_HOUR_MS) return;

  const mine = allProjects.filter((p) => {
    const start = p.dateMontage || "";
    const end = p.dateMontageEnd || start;
    if (!start) return false;
    // Projets des 7 prochains jours (ou en cours)
    if (start > limitStr || end < todayStr) return false;
    const collab = (p.collaborateurs || "").toLowerCase();
    return (
      collab.includes(userName.toLowerCase()) ||
      collab.includes("team tm")
    );
  });

  if (mine.length === 0) return;

  // Marque immédiatement l'exécution pour éviter le double-déclenchement.
  try { localStorage.setItem(LS_LAST_PREFETCH, String(Date.now())); } catch {}

  /* Les documents ne sont pré-cachés que pour les montages IMMINENTS — le jour
     même et le lendemain. Sur sept jours, on téléchargerait des dizaines de
     plans dont la plupart auront changé d'ici là. */
  const demain = new Date();
  demain.setDate(demain.getDate() + 1);
  const demainStr = demain.toISOString().split("T")[0];
  const imminent = (p: Project) => {
    const d = (p.dateMontage || "").split("T")[0];
    return d === todayStr || d === demainStr;
  };

  // Pré-cache en séquence avec pause pour ne pas surcharger le réseau
  // Limite augmentée à 20 projets (7 jours × quelques projets/jour)
  for (const p of mine.slice(0, 20)) {
    await prefetchOne(p.id);
    if (imminent(p)) await prefetchDocuments(p);
    await sleep(300); // étale les requêtes
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
