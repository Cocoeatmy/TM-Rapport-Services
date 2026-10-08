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
  userName: string,
  /** Ignore le délai d'une heure — bouton « Préparer la journée ». */
  force = false,
): Promise<number> {
  if (typeof window === "undefined") return 0;
  if (!navigator.onLine) return 0;

  const todayStr = new Date().toISOString().split("T")[0];
  // Date limite : aujourd'hui + 7 jours
  const limitDate = new Date();
  limitDate.setDate(limitDate.getDate() + 7);
  const limitStr = limitDate.toISOString().split("T")[0];

  // ── Throttle : 1 exécution par heure maximum ─────────────────────────────
  const ONE_HOUR_MS = 60 * 60 * 1000;
  const lastTs = parseInt(localStorage.getItem(LS_LAST_PREFETCH) || "0", 10);
  if (!force && Date.now() - lastTs < ONE_HOUR_MS) return lireEtat().projets;

  const moi = userName.toLowerCase();
  const aMoi = (champ: string | null | undefined) => {
    const c = (champ || "").toLowerCase();
    return !!c && (c.includes(moi) || c.includes("team tm"));
  };
  /** Une intervention des sept prochains jours, qui n'est pas déjà passée. */
  const dansLaFenetre = (debut: string | null | undefined, fin?: string | null) => {
    const d = (debut || "").slice(0, 10);
    if (!d) return false;
    const f = (fin || debut || "").slice(0, 10);
    return d <= limitStr && f >= todayStr;
  };

  /* Un relevé de mesures se fait aussi sans réseau — et dans une salle de bain
     en sous-sol plus souvent qu'ailleurs. Seuls les MONTAGES étaient préparés :
     le collaborateur envoyé prendre des mesures arrivait devant une page vide.
     Les SAV, affectés par leur propre champ, étaient logés à la même enseigne. */
  const mine = allProjects.filter((p) =>
    (dansLaFenetre(p.dateMontage, p.dateMontageEnd) && aMoi(p.collaborateurs)) ||
    (dansLaFenetre(p.dateMesures) && aMoi(p.mesuresTraiteePar)) ||
    (dansLaFenetre(p.dateMontage, p.dateMontageEnd) && aMoi(p.collaborateursSAV))
  );

  if (mine.length === 0) {
    // Aucun chantier : on note quand même le passage, l'interface doit
    // pouvoir dire « rien à préparer aujourd'hui » plutôt que de rester muette.
    try {
      localStorage.setItem(LS_LAST_PREFETCH, String(Date.now()));
      localStorage.setItem(LS_OFFLINE_READY, "[]");
    } catch {}
    return 0;
  }

  // Marque immédiatement l'exécution pour éviter le double-déclenchement.
  try { localStorage.setItem(LS_LAST_PREFETCH, String(Date.now())); } catch {}

  /* Les documents ne sont pré-cachés que pour les montages IMMINENTS — le jour
     même et le lendemain. Sur sept jours, on téléchargerait des dizaines de
     plans dont la plupart auront changé d'ici là. */
  const demain = new Date();
  demain.setDate(demain.getDate() + 1);
  const demainStr = demain.toISOString().split("T")[0];
  const imminent = (p: Project) => {
    const jours = [(p.dateMontage || "").split("T")[0], (p.dateMesures || "").split("T")[0]];
    return jours.some((d) => d === todayStr || d === demainStr);
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
    window.dispatchEvent(new CustomEvent("tm-offline-ready"));
  } catch {}
  return mine.length;
}

export interface EtatHorsLigne {
  /** Nombre de chantiers téléchargés pour un usage sans réseau. */
  projets: number;
  /** Horodatage de la dernière préparation, 0 si jamais faite. */
  quand: number;
}

/**
 * Ce qui est réellement disponible sans réseau.
 *
 * L'information existait déjà, mais n'était affichée nulle part : un monteur
 * ne pouvait pas vérifier, avant de partir, que sa journée était chargée. Or
 * c'est précisément le moment où il peut encore y remédier.
 */
export function lireEtat(): EtatHorsLigne {
  if (typeof window === "undefined") return { projets: 0, quand: 0 };
  try {
    const raw = localStorage.getItem(LS_OFFLINE_READY);
    const ids = raw ? (JSON.parse(raw) as string[]) : [];
    return {
      projets: Array.isArray(ids) ? ids.length : 0,
      quand: parseInt(localStorage.getItem(LS_LAST_PREFETCH) || "0", 10) || 0,
    };
  } catch {
    return { projets: 0, quand: 0 };
  }
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
