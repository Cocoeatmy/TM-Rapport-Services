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

import { uploadToCloudinary, attachPhotos, UploadError } from "@/lib/cloudinary-upload";

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
  /** URL Cloudinary une fois les octets uploadés. Persistée → un re-essai ne
   *  re-uploade JAMAIS les octets, il ne refait que le rattachement Notion. */
  uploadedUrl?: string;
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
  /** Motif du dernier échec (ex. "Erreur 413"), pour diagnostic UI. */
  reason?: string;
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

/** Résultat du traitement d'un seul item. */
interface ItemOutcome { success: number; failed: number; permanentlyFailed: number; }

/**
 * Traite UN item en 2 étapes DÉCOUPLÉES :
 *   1. Upload des octets DIRECTEMENT vers Cloudinary (robuste, hors Vercel).
 *      L'URL obtenue est persistée → un re-essai ne re-uploade jamais les octets.
 *   2. Rattachement des URLs au champ Notion (petit JSON, réessayable).
 * Ne lève jamais — renvoie un décompte et met à jour l'IDB (retrait / backoff /
 * échec permanent après MAX_RETRIES).
 */
async function _processOneItem(item: PendingUpload, now: number): Promise<ItemOutcome> {
  const files = item.files.map((f) => ({ ...f })); // copie mutable (uploadedUrl)
  let networkError = false;
  let permanent = false;
  let reasonMsg = "";

  // ── Étape 1 : Cloudinary pour chaque fichier pas encore uploadé ──────────
  for (const f of files) {
    if (f.uploadedUrl) continue;
    try {
      f.uploadedUrl = await uploadToCloudinary(f.blob, f.name, item.projectId, item.category);
      // Persiste immédiatement : si la suite échoue, ce fichier ne sera pas
      // re-uploadé (octets déjà sûrs sur Cloudinary).
      await updatePendingUpload({ ...item, files });
    } catch (e) {
      const ue = e as UploadError;
      reasonMsg = ue?.message || "upload échoué";
      if (ue?.permanent) permanent = true; else networkError = true;
      break;
    }
  }

  // ── Étape 2 : rattachement Notion (si tout est sur Cloudinary) ───────────
  let done = false;
  if (!networkError && !permanent && files.every((f) => f.uploadedUrl)) {
    if (item.notionField) {
      try {
        await attachPhotos(
          item.projectId,
          item.notionField,
          files.map((f) => ({ name: f.name, url: f.uploadedUrl as string })),
        );
        done = true;
      } catch (e) {
        const ue = e as UploadError;
        reasonMsg = ue?.message || "rattachement échoué";
        if (ue?.permanent) permanent = true; else networkError = true;
      }
    } else {
      done = true; // pas de champ Notion → rien à rattacher
    }
  }

  // ── Succès complet ───────────────────────────────────────────────────────
  if (done) {
    await removePendingUpload(item.id);
    if (typeof window !== "undefined") {
      try {
        const { invalidateApiCache } = await import("@/lib/api-helpers");
        invalidateApiCache();
      } catch {}
    }
    return { success: 1, failed: 0, permanentlyFailed: 0 };
  }

  // ── Échec ────────────────────────────────────────────────────────────────
  const reason = `${permanent ? "Erreur" : "Réseau"}${reasonMsg ? " : " + reasonMsg : ""}`;
  if (permanent) {
    console.warn("[idb-uploads] échec permanent", item.id, reason);
    await _markPermanentlyFailed({ ...item, files }, reason);
    return { success: 0, failed: 1, permanentlyFailed: 1 };
  }
  const retries = (item.retryCount || 0) + 1;
  if (retries >= MAX_RETRIES) {
    console.error("[idb-uploads] MAX_RETRIES atteint — permanently-failed", item.id, reason);
    await _markPermanentlyFailed({ ...item, files }, reason);
    return { success: 0, failed: 1, permanentlyFailed: 1 };
  }
  const delayMs = Math.min(3_000 * 2 ** (retries - 1), 30_000);
  await updatePendingUpload({ ...item, files, retryCount: retries, nextAttemptAt: now + delayMs, reason });
  return { success: 0, failed: 1, permanentlyFailed: 0 };
}

/**
 * Tente de rejouer chaque upload pendant. Backoff exponentiel sur
 * les items qui ont déjà raté. Passe en "permanently-failed" après
 * MAX_RETRIES — ne supprime JAMAIS les données (zéro perte photo).
 *
 * Parallélisation SÛRE : on regroupe par champ Notion (projet + champ).
 * Les uploads vers un MÊME champ restent SÉQUENTIELS — le verrou serveur
 * est par-conteneur, donc deux envois parallèles sur le même champ peuvent
 * atterrir sur deux conteneurs Vercel et s'écraser (read-modify-write) →
 * perte de photo. Mais des champs DIFFÉRENTS (montage, après-intervention…)
 * s'envoient EN PARALLÈLE sans risque → la file se vide bien plus vite en 5G.
 */
const GROUP_CONCURRENCY = 4;

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
  const totals = { success: 0, failed: 0, permanentlyFailed: 0 };
  const now = Date.now();

  try { // try global pour libérer _processingUploads même sur erreur inattendue
    // Regroupement par champ (sérialisation intra-groupe, parallélisme inter-groupe).
    const groups = new Map<string, PendingUpload[]>();
    for (const item of all) {
      const key = `${item.projectId}::${item.notionField ?? item.category ?? ""}`;
      const arr = groups.get(key);
      if (arr) arr.push(item);
      else groups.set(key, [item]);
    }

    const processGroup = async (items: PendingUpload[]) => {
      for (const item of items) {
        if (item.nextAttemptAt && item.nextAttemptAt > now) continue;
        const r = await _processOneItem(item, now);
        totals.success += r.success;
        totals.failed += r.failed;
        totals.permanentlyFailed += r.permanentlyFailed;
      }
    };

    // Pool de workers : au plus GROUP_CONCURRENCY champs traités en parallèle.
    const groupArrays = [...groups.values()];
    let next = 0;
    const workers = Array.from(
      { length: Math.min(GROUP_CONCURRENCY, groupArrays.length) },
      async () => {
        while (next < groupArrays.length) {
          const mine = groupArrays[next++];
          await processGroup(mine);
        }
      },
    );
    await Promise.all(workers);
  } finally {
    _processingUploads = false;
  }
  return { ...totals, total: all.length };
}

/**
 * Marque un item comme "permanently-failed" ET dispatch un event
 * pour que l'UI affiche une alerte persistante à l'utilisateur.
 * Les données (blobs) sont conservées — zéro perte.
 */
async function _markPermanentlyFailed(item: PendingUpload, reason: string): Promise<void> {
  await updatePendingUpload({ ...item, status: "permanently-failed", reason });
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
