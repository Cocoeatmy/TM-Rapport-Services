"use client";

/**
 * Queue d'uploads binaires en IndexedDB.
 *
 * Pourquoi pas localStorage : les blobs photo (1-3 Mo chacun)
 * exploseraient le quota localStorage (~5 Mo/origine). IDB n'a
 * pas cette limite et stocke nativement des Blobs.
 *
 * Flux :
 *   1. PhotoUpload tente /api/upload normalement.
 *   2. En cas d'échec réseau (ou hors ligne avant l'envoi), on
 *      enregistre le File ici via `addPendingUpload`.
 *   3. Le composant continue d'afficher la photo via une URL
 *      object-blob locale (preview), de sorte que l'utilisateur
 *      a un retour visuel immédiat.
 *   4. À chaque retour `online` (event navigateur) ou poll de 30 s
 *      depuis SyncButton, on appelle `processPendingUploads()` qui
 *      reconstitue le FormData depuis le Blob en IDB et POST sur
 *      /api/upload. Sur succès : retrait de l'IDB et invalidation
 *      du cache projet pour que le prochain fetch montre les
 *      photos enfin "officielles" depuis Notion.
 *   5. Au mount d'un composant photo, il consulte l'IDB pour
 *      retrouver d'éventuels uploads pendants (survie au reload),
 *      recrée des URL object-blob et les affiche avec un badge
 *      "en attente de synchro".
 *
 * Garantie zéro perte :
 *   - Les photos ne sont JAMAIS supprimées de l'IDB automatiquement,
 *     même après MAX_RETRIES échecs. Elles passent en statut
 *     "permanently-failed" et restent accessibles jusqu'à ce que
 *     l'utilisateur les valide manuellement.
 *   - Un event `tm-upload-permanently-failed` est dispatché pour
 *     afficher une alerte persistante dans l'UI.
 */

const DB_NAME = "tm-rapport-uploads";
const DB_VERSION = 2; // bumped : ajout du champ `status`
const STORE = "pendingUploads";

/** Nombre maximum de tentatives avant passage en "permanently-failed". */
const MAX_RETRIES = 20; // ~2 semaines d'essais avec backoff plafonné à 1h

export type UploadStatus = "pending" | "permanently-failed";

export interface PendingUploadFile {
  /** Nom de fichier final (avec préfixe de bucket si applicable). */
  name: string;
  /** MIME type, ex. "image/jpeg". */
  type: string;
  /** Données binaires brutes — IDB stocke les Blobs en natif. */
  blob: Blob;
}

export interface PendingUpload {
  id: string;
  projectId: string;
  category: string;
  notionField?: string;
  files: PendingUploadFile[];
  createdAt: number;
  retryCount: number;
  nextAttemptAt?: number;
  /** Statut de l'upload : "pending" (en cours) ou "permanently-failed"
   *  (MAX_RETRIES atteint — conservé pour inspection/retry manuel). */
  status?: UploadStatus;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB indisponible"));
  }
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("projectId", "projectId", { unique: false });
        store.createIndex("status", "status", { unique: false });
      } else if (event.oldVersion < 2) {
        // Migration v1 → v2 : ajout de l'index "status" sans recréer le store
        const store = req.transaction!.objectStore(STORE);
        if (!store.indexNames.contains("status")) {
          store.createIndex("status", "status", { unique: false });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null; // reset pour permettre une nouvelle tentative
      reject(req.error);
    };
  });
  return dbPromise;
}

/** Vérifie qu'il reste suffisamment d'espace de stockage avant d'ajouter. */
async function checkStorageQuota(blobSizeBytes: number): Promise<void> {
  if (!navigator?.storage?.estimate) return; // API non dispo
  try {
    const { quota = 0, usage = 0 } = await navigator.storage.estimate();
    const available = quota - usage;
    // Refuser si le blob représente plus de 80% de l'espace libre
    if (available > 0 && blobSizeBytes > available * 0.8) {
      throw new Error(
        `Espace insuffisant : ${Math.round(blobSizeBytes / 1024 / 1024)} Mo requis, ` +
        `${Math.round(available / 1024 / 1024)} Mo disponibles.`
      );
    }
  } catch (e: any) {
    if (e.message?.includes("Espace insuffisant")) throw e;
    // Autres erreurs de l'API estimate → on laisse passer
  }
}

export async function addPendingUpload(
  data: Omit<PendingUpload, "id" | "createdAt" | "retryCount" | "status">,
): Promise<string> {
  // Vérification du quota avant écriture
  const totalBytes = data.files.reduce((sum, f) => sum + f.blob.size, 0);
  await checkStorageQuota(totalBytes);

  const db = await openDB();
  const id = `up-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const item: PendingUpload = {
    ...data,
    id,
    createdAt: Date.now(),
    retryCount: 0,
    status: "pending",
  };
  return new Promise<string>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(item);
    tx.oncomplete = () => {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("tm-pending-upload-added", { detail: { id } }));
      }
      resolve(id);
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPendingUploads(filter?: {
  projectId?: string;
  status?: UploadStatus | "all";
}): Promise<PendingUpload[]> {
  const db = await openDB();
  return new Promise<PendingUpload[]>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      let all = req.result as PendingUpload[];
      // Items sans statut (v1 de l'IDB) → traiter comme "pending"
      all = all.map((u) => ({ ...u, status: u.status ?? "pending" }));
      if (filter?.projectId) {
        all = all.filter((u) => u.projectId === filter.projectId);
      }
      // Par défaut, ne retourner que les items "pending" (pas les failed permanents)
      const statusFilter = filter?.status ?? "pending";
      if (statusFilter !== "all") {
        all = all.filter((u) => u.status === statusFilter);
      }
      resolve(all);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function countPendingUploads(): Promise<number> {
  try {
    const all = await getPendingUploads({ status: "pending" });
    return all.length;
  } catch {
    return 0;
  }
}

export async function countPermanentlyFailed(): Promise<number> {
  try {
    const all = await getPendingUploads({ status: "permanently-failed" });
    return all.length;
  } catch {
    return 0;
  }
}

export async function removePendingUpload(id: string): Promise<void> {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("tm-pending-upload-removed", { detail: { id } }));
      }
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

async function updatePendingUpload(item: PendingUpload): Promise<void> {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Remet un item "permanently-failed" en statut "pending" pour le retenter.
 * Réinitialise le compteur de retries et le nextAttemptAt.
 */
export async function retryFailedUpload(id: string): Promise<void> {
  const db = await openDB();
  const item = await new Promise<PendingUpload | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  if (!item) return;
  await updatePendingUpload({
    ...item,
    status: "pending",
    retryCount: 0,
    nextAttemptAt: undefined,
  });
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("tm-pending-upload-added", { detail: { id } }));
  }
}

/**
 * Remet TOUS les items "permanently-failed" en "pending" pour les retenter.
 */
export async function retryAllFailedUploads(): Promise<number> {
  const failed = await getPendingUploads({ status: "permanently-failed" });
  await Promise.all(failed.map((item) => retryFailedUpload(item.id)));
  return failed.length;
}

/**
 * Réinitialise les timers de backoff pour TOUS les uploads en attente.
 * Appelé quand l'admin demande une synchro forcée ou quand l'app
 * revient au premier plan — permet de retenter immédiatement sans
 * attendre l'expiration du backoff (jusqu'à 1h).
 */
export async function resetBackoffForAll(): Promise<number> {
  try {
    const items = await getPendingUploads({ status: "pending" });
    await Promise.all(
      items
        .filter((item) => item.nextAttemptAt && item.nextAttemptAt > Date.now())
        .map((item) => updatePendingUpload({ ...item, nextAttemptAt: 0 }))
    );
    return items.length;
  } catch {
    return 0;
  }
}

/**
 * Guard global : garantit qu'une seule instance de processPendingUploads
 * tourne à la fois. Évite la race condition quand l'event `online` ET
 * le poll de 30 s déclenchent autoSync simultanément sur le même client.
 *
 * Sans ce guard : deux instances lisent les mêmes items IDB, envoient
 * les mêmes fichiers à deux containers Vercel différents → le verrou
 * in-memory serveur est bypassé → le second write Notion écrase le premier
 * → perte d'une photo.
 */
let _processingUploads = false;

/**
 * Tente de rejouer chaque upload pendant. Backoff exponentiel sur
 * les items qui ont déjà raté. Passe en "permanently-failed" après
 * MAX_RETRIES — ne supprime JAMAIS les données (zéro perte photo).
 */
export async function processPendingUploads(): Promise<{
  success: number;
  failed: number;
  total: number;
  permanentlyFailed: number;
}> {
  // Guard : si une synchro est déjà en cours, on abandonne immédiatement.
  if (_processingUploads) {
    return { success: 0, failed: 0, total: 0, permanentlyFailed: 0 };
  }
  _processingUploads = true;

  let all: PendingUpload[];
  try {
    all = await getPendingUploads({ status: "pending" });
  } catch {
    _processingUploads = false;
    return { success: 0, failed: 0, total: 0, permanentlyFailed: 0 };
  }
  let success = 0;
  let failed = 0;
  let permanentlyFailed = 0;
  const now = Date.now();

  try { // try global pour libérer _processingUploads même sur erreur inattendue
  for (const item of all) {
    if (item.nextAttemptAt && item.nextAttemptAt > now) continue;

    try {
      const formData = new FormData();
      for (const f of item.files) {
        formData.append("files", new File([f.blob], f.name, { type: f.type }));
      }
      formData.append("category", item.category);
      formData.append("projectId", item.projectId);
      if (item.notionField) formData.append("notionField", item.notionField);

      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (res.ok) {
        await removePendingUpload(item.id);
        // Invalider le cache client pour que la photo apparaisse immédiatement.
        if (typeof window !== "undefined") {
          try {
            const { invalidateApiCache } = await import("@/lib/api-helpers");
            invalidateApiCache();
          } catch {}
        }
        success++;
      } else if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
        // 4xx hors 408/429 : erreur permanente (ex. projectId invalide).
        // On marque comme permanently-failed mais on garde les données.
        console.warn("[idb-uploads] Upload marqué failed (4xx permanent)", item.id, res.status);
        await _markPermanentlyFailed(item, `Erreur ${res.status}`);
        permanentlyFailed++;
        failed++;
      } else {
        // 5xx ou 408/429 : erreur temporaire, backoff exponentiel.
        const retries = (item.retryCount || 0) + 1;
        if (retries >= MAX_RETRIES) {
          // MAX_RETRIES atteint → on garde dans l'IDB mais on marque permanently-failed.
          // L'utilisateur sera notifié et pourra retenter manuellement.
          console.error("[idb-uploads] MAX_RETRIES atteint — upload marqué permanently-failed", item.id);
          await _markPermanentlyFailed(item, `${MAX_RETRIES} tentatives échouées`);
          permanentlyFailed++;
        } else {
          // Backoff : 1min, 2min, 4min…, plafonné à 1h (au lieu de 30min)
          const delayMs = Math.min(60_000 * 2 ** (retries - 1), 60 * 60_000);
          await updatePendingUpload({ ...item, retryCount: retries, nextAttemptAt: now + delayMs });
        }
        failed++;
      }
    } catch {
      // Erreur réseau (offline) : backoff, on ne compte pas ça contre MAX_RETRIES
      // car ce n'est pas une erreur serveur — le réseau était juste absent.
      const retries = (item.retryCount || 0) + 1;
      if (retries >= MAX_RETRIES) {
        console.error("[idb-uploads] MAX_RETRIES réseau atteint — marqué permanently-failed", item.id);
        await _markPermanentlyFailed(item, "Réseau indisponible après plusieurs tentatives");
        permanentlyFailed++;
      } else {
        const delayMs = Math.min(60_000 * 2 ** (retries - 1), 60 * 60_000);
        await updatePendingUpload({ ...item, retryCount: retries, nextAttemptAt: now + delayMs });
      }
      failed++;
    }
  }
  } finally {
    _processingUploads = false;
  }
  return { success, failed, total: all.length, permanentlyFailed };
}

/**
 * Marque un item comme "permanently-failed" ET dispatch un event
 * pour que l'UI affiche une alerte persistante à l'utilisateur.
 * Les données (blobs) sont conservées — zéro perte.
 */
async function _markPermanentlyFailed(item: PendingUpload, reason: string): Promise<void> {
  await updatePendingUpload({ ...item, status: "permanently-failed" });
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("tm-upload-permanently-failed", {
        detail: {
          id: item.id,
          projectId: item.projectId,
          fileCount: item.files.length,
          reason,
        },
      })
    );
    // Retire du badge "pending" mais garde les données
    window.dispatchEvent(new CustomEvent("tm-pending-upload-removed", { detail: { id: item.id } }));
  }
}
