// Gestionnaire de cache offline et file d'attente.
//
// Stratégie globale :
//   - LECTURE : le service worker fait du network-first avec fallback
//     cache (cf. /public/sw.js). Donc tout GET déjà visité est lisible
//     hors ligne.
//   - ÉCRITURE : on enveloppe les mutations dans `offlineFetch` qui :
//       a) tente le fetch direct si on est en ligne
//       b) sinon (ou si le fetch échoue avec une erreur réseau), met
//          l'opération en file d'attente et renvoie une réponse
//          synthétique `{ queued: true }` pour ne pas casser les
//          appelants.
//   - SYNC : SyncButton écoute l'événement `online` et appelle
//     `processQueue()` automatiquement quand la connexion revient.
//     Un poll de 30 s sert de filet de sécurité.

import { besoinDeFusion, fusionnerAvecExistant, CHAMPS_PAR_LOT } from "./fusion-cabines";
import { reseauUtilisable, fetchAvecDelai } from "./reseau";
import { debutEcriture, finEcriture, projetEcrit } from "@/lib/ecritures-projet";

const CACHE_KEY = "tm-rapport-cache";
const QUEUE_KEY = "tm-rapport-queue";
const MAX_RETRIES = 8;
const WARM_TS_KEY = "tm-cache-warm-ts";

// Endpoints à préchauffer pour que le collaborateur ait des données hors-ligne.
// Ce sont TOUTES les URLs utilisées par MODE_API dans page.tsx + monteur-dashboard.
const WARM_ENDPOINTS = [
  "/api/projects",
  "/api/projects/all-active",
  "/api/projects/all",
  "/api/projects/mesures",
  "/api/projects/mesures-termine",
  "/api/projects/mesures-sans-commande",
  "/api/projects/mesures-annulees",
  "/api/projects/cmd-termine",
  "/api/projects/services",
  "/api/projects/services-termine",
  "/api/projects/sav",
  "/api/projects/sav-termine",
  "/api/projects/snapshot",
];

// Préchauffage minimum entre deux warms automatiques (15 min)
const WARM_COOLDOWN_MS = 15 * 60 * 1000;

/**
 * Télécharge les endpoints clés en arrière-plan (priority low) pour que
 * le service worker les mette en cache. Silencieux, non bloquant.
 * Cooldown de 15 min pour ne pas spam Notion à chaque refresh de page.
 */
export async function warmOfflineCache(force = false): Promise<number> {
  if (typeof window === "undefined" || !isOnline()) return 0;
  const lastWarm = parseInt(localStorage.getItem(WARM_TS_KEY) || "0");
  if (!force && Date.now() - lastWarm < WARM_COOLDOWN_MS) return 0;

  let warmed = 0;

  // Double stratégie :
  //   1. Le SW intercepte chaque fetch et met la réponse en cache SW (Cache Storage).
  //   2. On parse aussi la réponse et on la sauvegarde en localStorage via saveToCache()
  //      pour avoir un fallback si le cache SW est purgé par l'OS (fréquent sur iOS).
  await Promise.allSettled(
    WARM_ENDPOINTS.map(async (url) => {
      try {
        const r = await fetch(url, { credentials: "include" });
        if (!r.ok) return;
        warmed++;
        // Sauvegarder en localStorage pour double couverture offline.
        const data = await r.clone().json().catch(() => null);
        if (data && Array.isArray(data) && data.length > 0) {
          // Clé calquée sur tm-projects-cache utilisé par page.tsx
          const cacheKey = url.replace(/^\/api\/projects\/?/, "") || "projects";
          saveToCache(`warm-${cacheKey}`, data);
        } else if (data && data.ok && data.data) {
          // Format snapshot ({ ok, data: {...} })
          saveToCache("warm-snapshot", data.data);
        }
      } catch {}
    })
  );

  localStorage.setItem(WARM_TS_KEY, String(Date.now()));
  window.dispatchEvent(new CustomEvent("tm-cache-warmed", { detail: { warmed } }));
  return warmed;
}

/** Retourne le timestamp du dernier préchauffage réussi (ms epoch, 0 si jamais fait). */
export function getLastCacheWarmTs(): number {
  if (typeof window === "undefined") return 0;
  return parseInt(localStorage.getItem(WARM_TS_KEY) || "0");
}

export interface CachedData {
  projects: any[];
  mesures: any[];
  timestamp: number;
}

export interface QueueItem {
  id: string;
  type: "update" | "upload" | "pdf";
  url: string;
  method: string;
  body?: any;
  files?: { name: string; data: string }[];
  timestamp: number;
  /** Nombre d'essais ratés. Sert au backoff. */
  retryCount?: number;
  /** Date du prochain retry à respecter (ms epoch). */
  nextAttemptAt?: number;
  /** « echec » : mise de côté après trop d'essais — JAMAIS supprimée, relancée
   *  automatiquement à la prochaine occasion (ouverture de l'app, retour du
   *  réseau, retour au premier plan). */
  statut?: "attente" | "echec";
}

// Sauvegarder les données en cache
/* Le cache hors-ligne tient dans un budget, et il n'est pas seul au monde.
 *
 * Il avait atteint 34 Mo sur un poste — il garde des listes entieres, photos
 * et documents compris. Le navigateur refusait alors TOUTE nouvelle ecriture
 * dans son stockage, et pas seulement les siennes : le cache des listes du
 * tableau de bord, bien plus petit, echouait en silence et restait fige sur
 * une version vieille de plusieurs semaines. Au reveil, l'app ressortait donc
 * des chantiers cloture depuis longtemps.
 *
 * On se donne donc un plafond, et quand il est atteint on sacrifie les plus
 * grosses entrees — ce sont les listes les plus lourdes, aussi les moins
 * utiles hors ligne, et elles se reconstruisent au premier rechargement. */
const BUDGET_CACHE = 4_000_000; // ~4 Mo de caracteres

function ecrireCache(cache: Record<string, any>): boolean {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    return true;
  } catch {
    return false;
  }
}

/** Les cles du cache, de la plus lourde a la plus legere. */
function clesParPoids(cache: Record<string, any>): string[] {
  return Object.keys(cache)
    .filter((k) => k !== "_timestamp")
    .map((k) => ({ k, poids: JSON.stringify(cache[k] ?? null).length }))
    .sort((a, b) => b.poids - a.poids)
    .map((x) => x.k);
}

export function saveToCache(key: string, data: any) {
  try {
    const cache = getCache();
    cache[key] = data;
    cache._timestamp = Date.now();

    // 1) Respect du budget : on allege AVANT d'ecrire.
    let cles = clesParPoids(cache);
    while (JSON.stringify(cache).length > BUDGET_CACHE && cles.length > 1) {
      const lourde = cles.find((k) => k !== key) || cles[0];
      delete cache[lourde];
      cles = clesParPoids(cache);
    }

    // 2) Le navigateur peut refuser malgre tout (quota partage, mode prive) :
    //    on sacrifie la plus grosse entree et on retente, plutot que
    //    d'abandonner en silence comme avant.
    for (let essai = 0; essai < 4; essai++) {
      if (ecrireCache(cache)) return;
      const restantes = clesParPoids(cache);
      const aJeter = restantes.find((k) => k !== key) || restantes[0];
      if (!aJeter) break;
      delete cache[aJeter];
    }
    // Dernier recours : on repart d'un cache ne contenant que cette entree.
    if (!ecrireCache({ [key]: data, _timestamp: Date.now() })) {
      console.error("[offline] stockage local sature — cache non enregistre");
    }
  } catch (e) {
    console.error("Cache save error:", e);
  }
}

export function getCache(): Record<string, any> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function getCacheTimestamp(): number {
  return getCache()._timestamp || 0;
}

// File d'attente pour les opérations offline
/**
 * Range une écriture dans la file. Rend VRAI seulement si elle y est.
 *
 * Jusqu'au 17 octobre 2026, cette fonction avalait l'échec : stockage plein,
 * mode privé, quota partagé — elle écrivait une ligne dans la console que
 * personne ne lit, et `offlineFetch` renvoyait quand même un succès. Le
 * monteur voyait « enregistré » sur une saisie qui n'existait nulle part
 * (audit A4).
 *
 * Avant de renoncer, on fait de la place : le cache des listes se reconstruit
 * tout seul au prochain chargement, la saisie d'un monteur ne se reconstruit
 * pas. Entre les deux, le choix n'est pas difficile.
 */
/**
 * Écrit la file. Lève une exception si le stockage est plein — addToQueue
 * s'en sert pour faire de la place. Prévient ensuite qui veut le savoir
 * (l'app Apple en garde un double dans son coffre natif).
 */
function ecrireFile(json: string): void {
  localStorage.setItem(QUEUE_KEY, json);
  if (typeof window !== "undefined") {
    try { window.dispatchEvent(new CustomEvent("tm-file-modifiee")); } catch { /* sans effet */ }
  }
}

export function addToQueue(item: Omit<QueueItem, "id" | "timestamp">): boolean {
  const ligne: QueueItem = {
    ...item,
    id: Math.random().toString(36).slice(2),
    timestamp: Date.now(),
  };

  const essayer = (): boolean => {
    try {
      const queue = getQueue();
      queue.push(ligne);
      ecrireFile(JSON.stringify(queue));
      return true;
    } catch {
      return false;
    }
  };

  if (essayer()) return true;

  /* Plein. On sacrifie le cache, du plus lourd au plus léger, et on retente
     après chaque sacrifice. */
  try {
    const cache = getCache();
    for (const cle of clesParPoids(cache)) {
      delete cache[cle];
      ecrireCache(cache);
      if (essayer()) {
        console.warn("[offline] cache allégé pour faire place à une écriture en attente");
        return true;
      }
    }
    /* Dernier recours : on vide entièrement le cache. */
    localStorage.removeItem(CACHE_KEY);
    if (essayer()) return true;
  } catch { /* même le ménage a échoué */ }

  console.error("[offline] IMPOSSIBLE de mettre l'écriture en file — stockage saturé", item.url);
  return false;
}

/**
 * Le nombre de saisies en file — ou une ERREUR si la file est illisible.
 * `getQueue` rend [] sur erreur (commode pour l'affichage) ; pour décider
 * d'un rechargement, « illisible » ne doit jamais valoir « vide ».
 */
export function compterSaisiesStrict(): number {
  const raw = localStorage.getItem(QUEUE_KEY);
  if (!raw) return 0;
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("file de saisies illisible");
  return parsed.length;
}

export function getQueue(): QueueItem[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    // Garde contre les valeurs corrompues (null, objet, etc.)
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Les saisies qui attendent encore dans la file, reportées sur une fiche.
 *
 * À la réouverture sans réseau, la fiche se construit depuis la copie faite le
 * matin : elle réaffichait l'ancien rapport, et l'enregistrement automatique
 * suivant (qu'une simple photo déclenche) renvoyait ce vieux texte APRÈS la
 * correction encore en file — la correction était perdue sans erreur
 * (scénario 60, test 5, 19.10.2026). Avec réseau, même risque tant que la
 * file n'est pas partie : le serveur rend encore l'ancienne version.
 *
 * Même chose pour les colonnes par lot (« Cab4:… ») : constaté en production
 * sur TEST 5 le 19.10.2026, un lot rempli hors ligne paraissait vide après
 * réouverture ; en le reprenant, le monteur mettait en file un « Cab4: » vide
 * qui, rejoué APRÈS l'heure saisie, l'effaçait. Ces colonnes sont fusionnées
 * avec la fonction même du serveur (`fusionnerAvecExistant`) : la fiche montre
 * exactement ce que le serveur aura une fois la file passée.
 */
const TEXTES_ENTIERS = new Set([
  "rapportMonteur", "commentairesMontages", "commentairesMesures",
  "explicationsTravaux", "noteInterneMontage",
]);

export function avecSaisiesEnAttente<T extends { id?: string }>(projet: T): T {
  if (!projet?.id) return projet;
  const url = `/api/projects/${projet.id}`;
  let out: Record<string, unknown> | null = null;
  for (const q of getQueue()) {
    if (q.url !== url || q.method !== "PATCH" || !q.body || typeof q.body !== "object") continue;
    const corps: Record<string, unknown> = { ...(q.body as Record<string, unknown>) };
    const fiche: Record<string, unknown> = out ?? { ...(projet as Record<string, unknown>) };
    let touche = false;
    if (besoinDeFusion(corps)) {
      fusionnerAvecExistant(fiche, corps); // la file est dans l'ordre : chaque écriture part de la précédente
      for (const cle of CHAMPS_PAR_LOT) {
        if (typeof corps[cle] === "string") { fiche[cle] = corps[cle]; touche = true; }
      }
    }
    for (const [cle, valeur] of Object.entries(corps)) {
      if (TEXTES_ENTIERS.has(cle) && typeof valeur === "string") { fiche[cle] = valeur; touche = true; }
    }
    if (touche) out = fiche;
  }
  return (out as T | null) ?? projet;
}

export function removeFromQueue(id: string) {
  const queue = getQueue().filter((q) => q.id !== id);
  ecrireFile(JSON.stringify(queue));
}

export function clearQueue() {
  ecrireFile("[]");
}

/* ───────────────────────────────────────────────────────────────────────────
   Les modifications abandonnées laissent une trace.

   La file jette un envoi dans trois cas : trop vieux, refusé définitivement
   par le serveur, ou huit essais ratés. Jusqu'ici ça se terminait par une
   ligne dans la console du navigateur, que personne ne lit : le collaborateur
   croyait avoir enregistré. On garde donc la liste de ce qui a été abandonné,
   pour pouvoir le DIRE.
   ─────────────────────────────────────────────────────────────────────────── */

const ABANDONS_KEY = "tm-offline-abandons";
const ABANDONS_MAX = 50;

export interface Abandon {
  id: string;
  url: string;
  method: string;
  raison: "trop-ancien" | "refus-serveur" | "trop-d-essais";
  statut?: number;
  /** Date de la saisie d'origine, pas de l'abandon : c'est elle qui parle. */
  saisiLe: number;
  abandonneLe: number;
  /**
   * CE QUE LE MONTEUR AVAIT ÉCRIT.
   *
   * Il manquait jusqu'au 17 octobre 2026 : on gardait l'adresse et la
   * méthode, c'est-à-dire de quoi savoir QU'une saisie avait été perdue,
   * mais rien pour la retrouver (audit A5). Un rapport d'intervention
   * abandonné après huit essais était définitivement perdu, et le monteur
   * n'avait plus qu'à tout retaper — s'il s'en souvenait.
   */
  corps?: unknown;
  /** Le chantier concerné, lu dans l'adresse : de quoi s'y retrouver. */
  projet?: string;
}

/** Le projet dont parle une écriture, déduit de son adresse. */
export function projetDeLUrl(url: string): string | undefined {
  const m = /\/api\/projects\/([0-9a-fA-F-]{8,})/.exec(url);
  return m?.[1];
}

export function getAbandons(): Abandon[] {
  try {
    const raw = localStorage.getItem(ABANDONS_KEY);
    const l = raw ? JSON.parse(raw) : [];
    return Array.isArray(l) ? l : [];
  } catch {
    return [];
  }
}

export function clearAbandons(): void {
  try { localStorage.removeItem(ABANDONS_KEY); } catch {}
}

function noterAbandon(item: QueueItem, raison: Abandon["raison"], statut?: number): void {
  try {
    /* Un même item relancé puis remis de côté ne doit pas occuper deux
       lignes : la liste est courte, et deux fois la même saisie prête à
       croire qu'on en a perdu deux. */
    const liste = getAbandons().filter((x) => x.id !== item.id);
    liste.unshift({
      id: item.id, url: item.url, method: item.method, raison, statut,
      saisiLe: item.timestamp, abandonneLe: Date.now(),
      corps: item.body,
      projet: projetDeLUrl(item.url),
    });
    localStorage.setItem(ABANDONS_KEY, JSON.stringify(liste.slice(0, ABANDONS_MAX)));
    window.dispatchEvent(new CustomEvent("tm-abandon", { detail: { url: item.url, raison } }));
  } catch {}
}

/**
 * Remet une saisie abandonnée dans la file.
 *
 * C'est la contrepartie d'avoir gardé son contenu : pouvoir la renvoyer,
 * plutôt que de seulement savoir qu'elle existait.
 */
export function rejouerAbandon(id: string): boolean {
  const a = getAbandons().find((x) => x.id === id);
  if (!a) return false;
  const range = addToQueue({ type: "update", url: a.url, method: a.method, body: a.corps });
  if (!range) return false;
  try {
    const reste = getAbandons().filter((x) => x.id !== id);
    localStorage.setItem(ABANDONS_KEY, JSON.stringify(reste));
  } catch { /* la saisie est en file, c'est l'essentiel */ }
  return true;
}

/** Met à jour un item dans la queue (ex. après un retry raté). */
function updateQueueItem(updated: QueueItem) {
  const queue = getQueue().map((q) => (q.id === updated.id ? updated : q));
  ecrireFile(JSON.stringify(queue));
}

// Traiter la file d'attente quand le réseau revient.
// Backoff exponentiel : 1, 2, 4, 8, 16, 32 min. Au-delà de
// MAX_RETRIES essais, on log et on retire (sinon une opération
// fondamentalement cassée bloquerait toute la queue indéfiniment).
/**
 * Âge maximum d'un item en file.
 *
 * Il était de VINGT-QUATRE HEURES, et l'item était purement et simplement
 * supprimé. Un chantier du vendredi après-midi sans réseau, une app rouverte
 * le lundi : les heures et le rapport du monteur avaient disparu, sans que
 * personne ne l'ait demandé. Deux semaines laissent le temps à n'importe quel
 * week-end prolongé, et c'est la même durée que la file des photos.
 */
const MAX_QUEUE_AGE_MS = 14 * 24 * 60 * 60 * 1000;

/** Ce qu'il faut faire d'une écriture qui vient d'échouer. */
export type SuiteEssai =
  | { action: "reessayer"; dansMs: number }
  | { action: "mettre-de-cote"; motif: "refus-serveur" | "trop-d-essais" };

/**
 * La règle, en un seul endroit et vérifiable : une écriture n'est JAMAIS
 * supprimée. Au pire elle est mise de côté — gardée, signalée, et relancée
 * d'elle-même à la prochaine occasion.
 */
export function suiteApresEchec(essaisFaits: number, statutHttp?: number): SuiteEssai {
  const refusDefinitif =
    statutHttp !== undefined &&
    statutHttp >= 400 && statutHttp < 500 &&
    statutHttp !== 408 && statutHttp !== 429;
  if (refusDefinitif) return { action: "mettre-de-cote", motif: "refus-serveur" };
  if (essaisFaits >= MAX_RETRIES) return { action: "mettre-de-cote", motif: "trop-d-essais" };
  return { action: "reessayer", dansMs: Math.min(60_000 * 2 ** (essaisFaits - 1), 30 * 60_000) };
}

/* Une seule passe à la fois. Le retour du réseau, le minuteur, le retour au
   premier plan, un signal du bureau ou l'app Apple peuvent la demander au
   même moment : deux passes simultanées enverraient deux fois la même saisie. */
let passeEnCours: Promise<{ success: number; failed: number; skipped: number }> | null = null;

/** Une passe d'envoi des saisies est-elle en cours ? (MajAuto ne recharge pas pendant.) */
export function saisiesEnCoursDEnvoi(): boolean {
  return passeEnCours !== null;
}

export function processQueue(): Promise<{ success: number; failed: number; skipped: number }> {
  if (passeEnCours) return passeEnCours.then((r) => ({ success: 0, failed: 0, skipped: r.skipped }));
  passeEnCours = passeDeFile().finally(() => { passeEnCours = null; });
  return passeEnCours;
}

/** Où en est une saisie, pour l'écran (« en cours », « envoyée », « échec »). */
function annoncerSaisie(item: QueueItem, etat: "en-cours" | "envoyee" | "echec", nouvelEssai?: number): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent("tm-saisie-progression", {
      detail: { id: item.id, etat, nouvelEssai, entree: { url: item.url, method: item.method, body: item.body, type: item.type } },
    }));
  } catch { /* sans effet */ }
}

async function passeDeFile(): Promise<{ success: number; failed: number; skipped: number }> {
  const queue = getQueue();
  let success = 0;
  let failed = 0;
  let skipped = 0;
  const now = Date.now();

  /* Réseau inutilisable : on ne tente RIEN. Sinon chaque passage consommait un
     essai — huit tentatives suffisaient à épuiser un item en une après-midi de
     sous-sol, et il était alors jeté avant même que le réseau ne revienne. */
  if (!reseauUtilisable()) {
    return { success: 0, failed: 0, skipped: queue.length };
  }

  /* L'ORDRE par adresse est sacré. Si une écriture vers une fiche ne part pas
     (délai d'attente, échec passager), les suivantes vers la MÊME fiche
     attendent leur tour : sinon une correction faite plus tard partait
     avant l'ancienne version, que le serveur écrivait ensuite par-dessus
     (constaté : « V2 puis V1 », le serveur gardait V1). Les autres fiches,
     elles, partent normalement. */
  const enAttente = new Set<string>();
  const cle = (it: QueueItem) => `${it.method} ${it.url}`;

  for (const item of queue) {
    // Mis de côté : attend une relance explicite (retour au premier plan,
    // retour du réseau). Il n'est jamais supprimé pour autant.
    if (item.statut === "echec") { skipped++; continue; }
    // Une écriture plus ancienne vers la même fiche n'est pas encore partie.
    if (enAttente.has(cle(item))) { skipped++; continue; }
    // Garde-fou d'ÂGE : un item trop vieux (poison / projet supprimé) est
    // abandonné, quel que soit son compteur de retries.
    if (item.timestamp && now - item.timestamp > MAX_QUEUE_AGE_MS) {
      /* MIS DE CÔTÉ, PAS SUPPRIMÉ.
         Il était purement et simplement retiré de la file : au bout de deux
         semaines, la saisie disparaissait pour de bon. Elle reste désormais,
         avec son contenu, et peut être renvoyée d'un bouton (audit A5). */
      console.warn("[offline] Item mis de côté (trop ancien)", item.url, item.method);
      noterAbandon(item, "trop-ancien");
      updateQueueItem({ ...item, statut: "echec" });
      failed++;
      continue;
    }
    if (item.nextAttemptAt && item.nextAttemptAt > now) {
      enAttente.add(cle(item));
      skipped++;
      continue;
    }
    try {
      const options: RequestInit = {
        method: item.method,
        /* Le moment RÉEL de la saisie : le serveur protège les passages des
           jours écoulés, et une saisie d'hier rejouée ce matin doit garder
           le droit qu'elle avait hier (voir passages-verrou). */
        headers: item.body !== undefined
          ? { "Content-Type": "application/json", "x-tm-saisi-le": String(item.timestamp || "") }
          : undefined,
        body: item.body !== undefined ? JSON.stringify(item.body) : undefined,
      };

      // Même garde-fou : un rejeu ne doit pas bloquer la file une minute.
      annoncerSaisie(item, "en-cours");
      const res = await fetchAvecDelai(item.url, options, DELAI_MUTATION_MS);
      if (res.ok) {
        removeFromQueue(item.id);
        annoncerSaisie(item, "envoyee");
        success++;
      } else {
        /* Réessayer à l'identique un refus du serveur ne servira à rien, mais
           la saisie du monteur ne nous appartient pas : on la garde et on la
           signale, au lieu de l'effacer en silence. */
        const retries = (item.retryCount || 0) + 1;
        const suite = suiteApresEchec(retries, res.status);
        if (suite.action === "mettre-de-cote") {
          console.warn("[offline] Item mis de côté", suite.motif, item.url, res.status);
          noterAbandon(item, suite.motif, res.status);
          updateQueueItem({ ...item, retryCount: retries, statut: "echec" });
        } else {
          updateQueueItem({ ...item, retryCount: retries, nextAttemptAt: now + suite.dansMs });
          enAttente.add(cle(item));
          annoncerSaisie(item, "echec", now + suite.dansMs);
        }
        failed++;
      }
    } catch {
      // Erreur réseau : on garde l'item, on incrémente le retry
      // pour appliquer un backoff au prochain processQueue.
      const retries = (item.retryCount || 0) + 1;
      const suite = suiteApresEchec(retries);
      if (suite.action === "mettre-de-cote") {
        console.error("[offline] Item mis de côté (réseau)", item.url);
        noterAbandon(item, suite.motif);
        updateQueueItem({ ...item, retryCount: retries, statut: "echec" });
      } else {
        updateQueueItem({ ...item, retryCount: retries, nextAttemptAt: now + suite.dansMs });
        enAttente.add(cle(item));
        annoncerSaisie(item, "echec", now + suite.dansMs);
      }
      failed++;
    }
  }

  return { success, failed, skipped };
}

/**
 * Remet en jeu tout ce qui avait été mis de côté.
 *
 * Appelée à chaque occasion où le réseau peut être revenu — ouverture de
 * l'app, événement `online`, retour au premier plan — exactement comme pour
 * les photos. Le monteur n'a jamais à appuyer sur quoi que ce soit.
 */
/**
 * Le réseau revient (ou l'app revient au premier plan) : les délais
 * d'attente des saisies sont levés, comme ceux des photos. Sans cela, une
 * saisie qui avait échoué attendait encore jusqu'à trente minutes alors que
 * le réseau était là. L'ordre par fiche reste respecté par la passe.
 */
export function leverLesDelais(): number {
  const queue = getQueue();
  let n = 0;
  const maj = queue.map((q) => {
    if (q.statut !== "echec" && q.nextAttemptAt && q.nextAttemptAt > Date.now()) { n++; return { ...q, nextAttemptAt: 0 }; }
    return q;
  });
  if (n > 0) ecrireFile(JSON.stringify(maj));
  return n;
}

/** Le prochain essai prévu d'une saisie en attente (ms epoch), ou null. */
export function prochainEssaiSaisies(): number | null {
  const dates = getQueue().filter((q) => q.statut !== "echec").map((q) => q.nextAttemptAt || 0);
  return dates.length ? Math.min(...dates) : null;
}

export function relancerEchecs(): number {
  const queue = getQueue();
  let n = 0;
  for (const item of queue) {
    if (item.statut !== "echec") continue;
    updateQueueItem({ ...item, statut: "attente", retryCount: 0, nextAttemptAt: 0 });
    n++;
  }
  return n;
}

/** Nombre d'écritures mises de côté (affiché dans le bandeau). */
export function compterEchecs(): number {
  return getQueue().filter((i) => i.statut === "echec").length;
}

// Vérifier si on est online
export function isOnline(): boolean {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}

/** Au-delà, on considère que le réseau ne répondra pas : on met de côté. */
/* Une écriture Notion met couramment dix secondes — relecture fraîche,
   fusion par lot, invalidation du cache. À huit secondes, on coupait des
   requêtes qui ABOUTISSAIENT côté serveur : la file les rejouait, et le même
   signalement s'inscrivait deux ou trois fois (16 octobre 2026). */
const DELAI_MUTATION_MS = 25_000;

/**
 * Drop-in pour `fetch()` qui rend les mutations résilientes au réseau.
 *
 * Comportement :
 *   - GET / HEAD : appel direct (le service worker gère le fallback cache).
 *   - POST/PATCH/PUT/DELETE :
 *       * Si on est offline : push immédiat dans la queue, retour d'une
 *         réponse synthétique 200 `{ queued: true }`.
 *       * Si on est online : on tente le fetch ; en cas d'erreur réseau
 *         (TypeError) ou de 5xx, push dans la queue + même réponse synthétique.
 *   - Le body doit être JSON-string (objet sérialisé). Les FormData /
 *     uploads binaires ne sont PAS supportés par cette voie (ils
 *     resteraient en localStorage et exploseraient la taille).
 *
 * Les appelants peuvent traiter `{ queued: true }` comme un succès :
 * la mutation sera rejouée automatiquement dès que le réseau revient.
 */
export async function offlineFetch(url: string, init?: RequestInit): Promise<Response> {
  /* Écriture d'une fiche projet : signalée le temps de son trajet, pour que
     la relecture automatique ne réaffiche pas la fiche d'avant (voir
     ecritures-projet). */
  const pid = projetEcrit(url, (init?.method || "GET").toUpperCase());
  if (!pid) return offlineFetchInterne(url, init);
  debutEcriture(pid);
  try {
    return await offlineFetchInterne(url, init);
  } finally {
    finEcriture(pid);
  }
}

async function offlineFetchInterne(url: string, init?: RequestInit): Promise<Response> {
  const method = (init?.method || "GET").toUpperCase();
  const isMutation = method !== "GET" && method !== "HEAD";

  if (!isMutation) {
    return fetch(url, init);
  }

  // FormData / Blob : pas dans la queue (taille). On laisse remonter
  // l'erreur, l'appelant est censé gérer son propre retry pour les uploads.
  const body = init?.body;
  const isJsonBody = body === undefined || typeof body === "string";
  if (!isJsonBody) {
    return fetch(url, init);
  }

  const queueIt = (reason: "offline" | "network-error") => {
    let parsed: any = undefined;
    if (typeof body === "string") {
      try { parsed = JSON.parse(body); } catch { parsed = body; }
    }
    const range = addToQueue({ type: "update", url, method, body: parsed });

    if (!range) {
      /* On ne dit PAS que c'est enregistré. L'appelant verra un échec, et
         l'écran dira la vérité au monteur : sa saisie n'est nulle part. */
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("tm-offline-queue-pleine", { detail: { url } }));
      }
      return new Response(
        JSON.stringify({
          error: "Stockage de l'appareil saturé : la saisie n'a PAS été enregistrée.",
          queued: false,
        }),
        { status: 507, headers: { "Content-Type": "application/json" } },
      );
    }

    if (typeof window !== "undefined") {
      // Notifie le bouton sync qu'un nouvel item est en queue (poll
      // de 30 s sinon, mais c'est mieux de mettre à jour le badge tout de suite).
      window.dispatchEvent(new CustomEvent("tm-offline-queued", { detail: { reason, url } }));
    }
    return new Response(JSON.stringify({ queued: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  /* « Utilisable » et pas seulement « en ligne » : sur un chantier le
     téléphone est presque toujours en ligne, avec un réseau qui ne passe pas.
     Après deux échecs, on arrête d'attendre et on met directement de côté. */
  if (!reseauUtilisable()) {
    return queueIt("offline");
  }

  try {
    /* Avec un délai maximum : sans lui, une requête pouvait rester pendue une
       demi-minute sur une barre de réseau. L'écran semblait figé, le monteur
       rappuyait, et il ne voyait jamais que sa saisie était bien gardée. */
    const res = await fetchAvecDelai(url, init, DELAI_MUTATION_MS);
    // 5xx ou 429 (rate-limit Notion) : on met en queue pour retry.
    // Autres 4xx : erreur permanente, on retourne tel quel.
    if (res.status >= 500 || res.status === 429) {
      return queueIt("network-error");
    }
    return res;
  } catch {
    // Réseau absent, trop lent, DNS… : la saisie est gardée et repartira seule.
    return queueIt("network-error");
  }
}
