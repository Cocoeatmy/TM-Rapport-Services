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
 */

const DB_NAME = "tm-rapport-uploads";
const DB_VERSION = 1;
const STORE = "pendingUploads";
const MAX_RETRIES = 8;

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
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB indisponible"));
  }
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("projectId", "projectId", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export async function addPendingUpload(
  data: Omit<PendingUpload, "id" | "createdAt" | "retryCount">,
): Promise<string> {
  const db = await openDB();
  const id = `up-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const item: PendingUpload = { ...data, id, createdAt: Date.now(), retryCount: 0 };
  return new Promise<string>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(item);
    tx.oncomplete = () => {
      // Notifie l'UI qu'un upload est en attente (badge bannière).
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("tm-pending-upload-added", { detail: { id } }));
      }
      resolve(id);
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPendingUploads(filter?: { projectId?: string }): Promise<PendingUpload[]> {
  const db = await openDB();
  return new Promise<PendingUpload[]>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      const all = req.result as PendingUpload[];
      const filtered = filter?.projectId ? all.filter((u) => u.projectId === filter.projectId) : all;
      resolve(filtered);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function countPendingUploads(): Promise<number> {
  try {
    const all = await getPendingUploads();
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
 * Tente de rejouer chaque upload pendant. Backoff exponentiel sur
 * les items qui ont déjà raté. Retire les items qui dépassent
 * MAX_RETRIES ou qui retournent un 4xx (validation, données
 * permanentes invalides).
 */
export async function processPendingUploads(): Promise<{ success: number; failed: number; total: number }> {
  let all: PendingUpload[];
  try {
    all = await getPendingUploads();
  } catch {
    return { success: 0, failed: 0, total: 0 };
  }
  let success = 0;
  let failed = 0;
  const now = Date.now();

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
        success++;
      } else if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
        // 4xx hors 408/429 : erreur permanente, on ne réessaie pas.
        console.warn("[idb-uploads] Upload retiré (erreur permanente)", item.id, res.status);
        await removePendingUpload(item.id);
        failed++;
      } else {
        const retries = (item.retryCount || 0) + 1;
        if (retries >= MAX_RETRIES) {
          console.error("[idb-uploads] Upload retiré après MAX_RETRIES", item.id);
          await removePendingUpload(item.id);
        } else {
          const delayMs = Math.min(60_000 * 2 ** (retries - 1), 30 * 60_000);
          await updatePendingUpload({ ...item, retryCount: retries, nextAttemptAt: now + delayMs });
        }
        failed++;
      }
    } catch {
      const retries = (item.retryCount || 0) + 1;
      if (retries >= MAX_RETRIES) {
        await removePendingUpload(item.id);
      } else {
        const delayMs = Math.min(60_000 * 2 ** (retries - 1), 30 * 60_000);
        await updatePendingUpload({ ...item, retryCount: retries, nextAttemptAt: now + delayMs });
      }
      failed++;
    }
  }
  return { success, failed, total: all.length };
}
