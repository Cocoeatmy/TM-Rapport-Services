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

import { identifiantCloudinary } from "./cle-envoi";
import { uploadToCloudinary, attachPhotos, attacherChampTexte, envoyerSignalement, UploadError } from "@/lib/cloudinary-upload";
import { coffreDeposerPhoto, coffreRetirerPhoto } from "@/lib/pont-apple";
import { leverLesDelais } from "@/lib/offline";

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
  /**
   * Propriété TEXTE à remplir avec l'URL, au lieu d'un champ « fichiers ».
   *
   * La signature du client passe par là : elle se range dans `signatureUrl`,
   * une URL, et non dans une galerie. Elle profite ainsi de tout ce que cette
   * file sait déjà faire — reprise après coupure, backoff, conservation des
   * octets, aucune suppression avant confirmation (audit A2 du 17.10.2026).
   */
  champTexte?: string;
  /**
   * Un signalement de défaut saisi SANS réseau, avec ses photos. Une fois les
   * photos sur Cloudinary, il est créé (POST /api/defauts) avec leurs URLs.
   * Son `id` est fabriqué à la saisie : un renvoi ne le crée pas deux fois.
   */
  signalement?: Record<string, unknown>;
  /**
   * Clé de l'envoi quand il a d'abord été tenté en ligne (/api/upload) —
   * défauts, cartons. La file réutilise le même identifiant Cloudinary :
   * si le premier essai était arrivé sans que la réponse revienne, la photo
   * est remplacée, pas dédoublée. Voir src/lib/cle-envoi.ts.
   */
  cleEnvoi?: string;
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
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  /* Dans l'app Apple seulement : un double au coffre natif, hors de WebKit.
     La photo est déjà en sûreté dans la file ci-dessus ; un échec ici ne
     change donc rien au parcours du monteur. Dans un navigateur : rien. */
  try { await coffreDeposerPhoto(item); } catch { /* le double est un bonus */ }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("tm-pending-upload-added", { detail: { id } }));
  }
  return id;
}

/**
 * Remet dans la file une photo rendue par le coffre de l'app Apple, AVEC son
 * identifiant d'origine. N'écrase jamais : si l'identifiant est déjà dans la
 * file, rien n'est fait et la réponse est `false`.
 */
export async function remettrePendingUpload(item: PendingUpload): Promise<boolean> {
  const db = await openDB();
  return new Promise<boolean>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    let doublon = false;
    const req = tx.objectStore(STORE).add(item); // add : refuse un doublon
    req.onerror = (e) => { doublon = true; e.preventDefault(); };
    tx.oncomplete = () => {
      if (!doublon && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("tm-pending-upload-added", { detail: { id: item.id } }));
      }
      resolve(!doublon);
    };
    tx.onerror = () => resolve(false);
    tx.onabort = () => resolve(false);
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

export async function removePendingUpload(id: string, motif = "retire"): Promise<void> {
  /* Le coffre de l'app Apple d'abord : s'il gardait une photo que la file a
     oubliée, il la rendrait plus tard et elle repartirait. */
  try { await coffreRetirerPhoto(id, motif); } catch { /* noté pour être rejoué */ }
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

/**
 * Les octets d'une photo, recopiés dans un Blob neuf, en mémoire.
 *
 * WebKit (Safari, l'app Apple) refuse de réenregistrer TEL QUEL un Blob qu'il
 * vient de relire dans IndexedDB : « Error preparing Blob/File data to be
 * stored in object store ». Or chaque mise à jour d'une photo en attente —
 * noter son URL Cloudinary, son nombre d'essais — la réécrit. L'erreur
 * figeait la file : les octets repartaient chez Cloudinary à chaque essai,
 * sans que la photo soit jamais rattachée. Une copie neuve s'enregistre.
 */
async function avecOctetsNeufs(item: PendingUpload): Promise<PendingUpload> {
  const files = await Promise.all(item.files.map(async (f) => {
    try {
      const octets = await f.blob.arrayBuffer();
      return { ...f, blob: new Blob([octets], { type: f.blob.type || f.type }) };
    } catch {
      return f; // illisible : on garde l'original, l'écriture dira si elle passe
    }
  }));
  return { ...item, files };
}

async function updatePendingUpload(item: PendingUpload): Promise<void> {
  // Lecture des octets AVANT d'ouvrir la transaction : une transaction
  // IndexedDB se referme d'elle-même si l'on attend autre chose pendant.
  item = await avecOctetsNeufs(item);
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
  /* Les saisies aussi : elles attendaient jusqu'à trente minutes après un
     échec, même une fois le réseau revenu. */
  try { leverLesDelais(); } catch { /* stockage illisible : la passe suivante rattrapera */ }
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

/** Une entrée de la file, relue à l'instant (références d'octets fraîches). */
async function lireEntree(id: string): Promise<PendingUpload | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result as PendingUpload | undefined);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Les octets d'un fichier en file, copiés en mémoire au moment de l'envoi.
 *
 * WebKit range les octets d'une entrée dans un nouveau fichier à chaque
 * réécriture, et une référence lue AVANT se lit alors comme un fichier vide
 * — constaté : une photo partie avec 0 octet. On relit donc l'entrée juste
 * avant l'envoi, on copie ses octets, et l'on n'envoie rien de vide.
 */
async function octetsPourEnvoi(id: string, index: number, secours: PendingUploadFile): Promise<Blob | null> {
  for (let essai = 0; essai < 3; essai++) {
    try {
      const frais = (await lireEntree(id))?.files?.[index] ?? secours;
      /* Banc d'essai (fake-indexeddb sous jsdom) : la base y rend un objet
         qui n'est plus un Blob. Un vrai navigateur rend toujours un Blob. */
      if (typeof (frais.blob as Blob | undefined)?.arrayBuffer !== "function") return frais.blob;
      const octets = await frais.blob.arrayBuffer();
      if (octets.byteLength > 0) return new Blob([octets], { type: frais.blob.type || frais.type });
    } catch { /* référence en cours de réécriture : on relit */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  return null;
}

/** Résultat du traitement d'un seul item. */
interface ItemOutcome { success: number; failed: number; permanentlyFailed: number; }

/* ── Progression, pour l'écran ───────────────────────────────────────────
   Chaque entrée annonce où elle en est : l'écran affiche « en cours
   d'envoi », « synchronisée », « échec — nouvel essai prévu », et un
   pourcentage pour les gros fichiers. */
export type EtatEnvoi = "en-cours" | "octets-envoyes" | "envoyee" | "echec";
function annoncer(id: string, etat: EtatEnvoi, extra: { pct?: number; reason?: string; nouvelEssai?: number; entree?: unknown } = {}): void {
  if (typeof window === "undefined") return;
  try { window.dispatchEvent(new CustomEvent("tm-envoi-progression", { detail: { id, etat, ...extra } })); } catch { /* sans effet */ }
}

/** Les octets d'une entrée partent ensemble ; trois entrées au plus à la fois. */
const ENVOIS_SIMULTANES = 3;
/** Au plus tant de photos par rattachement groupé (une requête raisonnable). */
const PHOTOS_PAR_RATTACHEMENT = 20;

interface Avancement {
  item: PendingUpload;
  files: PendingUploadFile[];
  networkError: boolean;
  permanent: boolean;
  reasonMsg: string;
}

/**
 * Étape 1 d'une entrée : ses octets vers Cloudinary (ceux qui n'y sont pas
 * déjà). L'URL obtenue est notée aussitôt : un nouvel essai ne renvoie
 * jamais les octets.
 */
async function _envoyerOctets(item: PendingUpload): Promise<Avancement | null> {
  /* L'entrée a pu changer, ou être envoyée, depuis la lecture de la liste. */
  try {
    const frais = await lireEntree(item.id);
    if (!frais) return null;
    item = { ...frais, status: frais.status ?? "pending" };
  } catch { /* lecture impossible : on garde la version de la liste */ }
  const av: Avancement = { item, files: item.files.map((f) => ({ ...f })), networkError: false, permanent: false, reasonMsg: "" };
  if (av.files.some((f) => !f.uploadedUrl)) annoncer(item.id, "en-cours");
  for (const [index, f] of av.files.entries()) {
    if (f.uploadedUrl) continue;
    const octets = await octetsPourEnvoi(item.id, index, f);
    if (!octets) {
      av.reasonMsg = "octets illisibles pour l'instant";
      av.networkError = true; // passager : la photo reste, on réessaiera
      break;
    }
    try {
      // Les photos d'un défaut saisi hors ligne se rangent avec celles des
      // défauts envoyés en ligne (dossier « defauts »).
      const dossier = item.signalement ? "defauts" : item.category;
      f.uploadedUrl = await uploadToCloudinary(octets, f.name, item.projectId, dossier,
        (pct) => annoncer(item.id, "en-cours", { pct }), identifiantCloudinary(item.cleEnvoi, index));
      // Persiste immédiatement : si la suite échoue, ce fichier ne sera pas
      // re-uploadé (octets déjà sûrs sur Cloudinary). Si cette écriture-là
      // échoue, on continue quand même avec l'URL en mémoire : le rattachement
      // peut aboutir, et au pire un nouvel essai renverra les octets — le
      // serveur écarte le doublon par son nom.
      try { await updatePendingUpload({ ...item, files: av.files }); }
      catch (e) { console.warn("[idb-uploads] URL Cloudinary non notée", item.id, e); }
    } catch (e) {
      const ue = e as UploadError;
      av.reasonMsg = ue?.message || "upload échoué";
      if (ue?.permanent) av.permanent = true; else av.networkError = true;
      break;
    }
  }
  if (!av.networkError && !av.permanent) annoncer(item.id, "octets-envoyes");
  return av;
}

/** Une entrée est arrivée : retirée de la file, l'écran prévenu. */
async function _confirmer(av: Avancement): Promise<void> {
  const { item, files } = av;
  await removePendingUpload(item.id, "confirme");
  annoncer(item.id, "envoyee", { entree: {
    projectId: item.projectId, category: item.category, notionField: item.notionField,
    champTexte: item.champTexte, signalement: item.signalement, files: files.map((f) => ({ name: f.name })),
  } });
  if (typeof window === "undefined") return;
  try {
    const { invalidateApiCache } = await import("@/lib/api-helpers");
    invalidateApiCache();
  } catch {}
  /* L'écran qui a pris ces photos veut le savoir : c'est maintenant
     qu'elles existent côté serveur, avec leurs URLs. Il les ajoute à sa
     liste sans attendre une relecture du projet — sinon le compteur
     d'une planche retomberait d'un cran le temps d'un aller-retour. */
  window.dispatchEvent(new CustomEvent("tm-upload-attached", {
    detail: {
      projectId: item.projectId,
      category: item.category,
      notionField: item.notionField,
      champTexte: item.champTexte,
      files: files.map((f) => ({ name: f.name, url: f.uploadedUrl as string })),
    },
  }));
}

/** Échec : délai de reprise, ou mise de côté — jamais d'effacement. */
async function _noterEchec(av: Avancement, now: number): Promise<ItemOutcome> {
  const { item, files, permanent, reasonMsg } = av;
  const reason = `${permanent ? "Erreur" : "Réseau"}${reasonMsg ? " : " + reasonMsg : ""}`;
  if (permanent) {
    console.warn("[idb-uploads] échec permanent", item.id, reason);
    try { await _markPermanentlyFailed({ ...item, files }, reason); }
    catch (e) { console.warn("[idb-uploads] statut non noté", item.id, e); }
    annoncer(item.id, "echec", { reason });
    return { success: 0, failed: 1, permanentlyFailed: 1 };
  }
  const retries = (item.retryCount || 0) + 1;
  if (retries >= MAX_RETRIES) {
    console.error("[idb-uploads] MAX_RETRIES atteint — permanently-failed", item.id, reason);
    try { await _markPermanentlyFailed({ ...item, files }, reason); }
    catch (e) { console.warn("[idb-uploads] statut non noté", item.id, e); }
    annoncer(item.id, "echec", { reason });
    return { success: 0, failed: 1, permanentlyFailed: 1 };
  }
  /* Le premier nouvel essai arrive vite (1,5 s) : sur un réseau instable,
     la coupure est souvent brève. Puis le délai double, jusqu'à 30 s. */
  const delayMs = Math.min(1_500 * 2 ** (retries - 1), 30_000);
  try { await updatePendingUpload({ ...item, files, retryCount: retries, nextAttemptAt: now + delayMs, reason }); }
  catch (e) { console.warn("[idb-uploads] délai non noté", item.id, e); }
  annoncer(item.id, "echec", { reason, nouvelEssai: now + delayMs });
  return { success: 0, failed: 1, permanentlyFailed: 0 };
}

/**
 * Étape 2 : le rattachement, pour un GROUPE d'entrées visant le même champ
 * du même projet, une écriture à la fois (lecture-écriture côté serveur :
 * deux à la fois pourraient effacer une photo). Les photos prêtes d'un même
 * champ partent en UN seul rattachement : une écriture Notion au lieu d'une
 * par photo.
 */
async function _rattacherGroupe(avs: Avancement[], now: number): Promise<ItemOutcome> {
  const t: ItemOutcome = { success: 0, failed: 0, permanentlyFailed: 0 };
  const ajouter = (r: ItemOutcome) => { t.success += r.success; t.failed += r.failed; t.permanentlyFailed += r.permanentlyFailed; };
  const echec = (av: Avancement, e: unknown, motif: string) => {
    const ue = e as UploadError;
    av.reasonMsg = ue?.message || motif;
    if (ue?.permanent) av.permanent = true; else av.networkError = true;
  };
  const prets: Avancement[] = [];
  for (const av of avs) {
    if (av.networkError || av.permanent || !av.files.every((f) => f.uploadedUrl)) { ajouter(await _noterEchec(av, now)); continue; }
    prets.push(av);
  }
  // Champs « fichiers » : par lots, une écriture par lot.
  const enGalerie = prets.filter((av) => !av.item.signalement && !av.item.champTexte && av.item.notionField);
  for (let i = 0; i < enGalerie.length; i += PHOTOS_PAR_RATTACHEMENT) {
    const lot = enGalerie.slice(i, i + PHOTOS_PAR_RATTACHEMENT);
    const { projectId, notionField } = lot[0].item;
    try {
      await attachPhotos(projectId, notionField as string,
        lot.flatMap((av) => av.files.map((f) => ({ name: f.name, url: f.uploadedUrl as string }))));
      for (const av of lot) { await _confirmer(av); t.success++; }
    } catch (e) {
      const ue = e as UploadError;
      if (ue?.permanent && lot.length > 1) {
        /* Refus DÉFINITIF d'un lot : une seule photo en est peut-être la
           cause. On les reprend une par une, pour que seule la fautive reste
           en échec — les autres ne doivent pas être bloquées avec elle. */
        for (const av of lot) {
          try {
            await attachPhotos(projectId, notionField as string, av.files.map((f) => ({ name: f.name, url: f.uploadedUrl as string })));
            await _confirmer(av); t.success++;
          } catch (e2) {
            echec(av, e2, "rattachement échoué"); ajouter(await _noterEchec(av, now));
          }
        }
      } else {
        for (const av of lot) { echec(av, e, "rattachement échoué"); ajouter(await _noterEchec(av, now)); }
      }
    }
  }
  // Signatures, signalements, entrées sans champ : une par une, dans l'ordre.
  for (const av of prets.filter((x) => !enGalerie.includes(x))) {
    const { item, files } = av;
    try {
      if (item.signalement) {
        await envoyerSignalement({ ...item.signalement, photoUrls: files.map((f) => f.uploadedUrl as string) });
      } else if (item.champTexte) {
        await attacherChampTexte(item.projectId, item.champTexte, files[0].uploadedUrl as string);
      } // pas de champ Notion → rien à rattacher
      await _confirmer(av);
      t.success++;
    } catch (e) {
      echec(av, e, item.signalement ? "signalement non enregistré" : "enregistrement du champ échoué");
      ajouter(await _noterEchec(av, now));
    }
  }
  return t;
}

/**
 * Tente de rejouer chaque upload pendant. Backoff exponentiel sur
 * les items qui ont déjà raté. Passe en "permanently-failed" après
 * MAX_RETRIES — ne supprime JAMAIS les données (zéro perte photo).
 *
 * Deux phases :
 *  1. les OCTETS, trois entrées à la fois, tous champs confondus — c'est le
 *     transfert long, et il ne touche à aucune donnée du serveur ;
 *  2. le RATTACHEMENT, groupé par champ (projet + champ) : une seule écriture
 *     à la fois sur un même champ — le verrou serveur est par conteneur, deux
 *     écritures parallèles sur le même champ pourraient s'écraser — mais des
 *     champs différents en parallèle, et toutes les photos prêtes d'un champ
 *     en une seule écriture.
 *
 * Une demande qui arrive pendant une passe n'est pas perdue : une nouvelle
 * passe suit aussitôt la première.
 */
const GROUP_CONCURRENCY = 4;
let _relanceDemandee = false;

/** Une passe d'envoi des photos est-elle en cours ? (MajAuto ne recharge pas pendant.) */
export function photosEnCoursDEnvoi(): boolean {
  return _processingUploads;
}

export async function processPendingUploads(): Promise<{
  success: number;
  failed: number;
  total: number;
  permanentlyFailed: number;
}> {
  // Guard : une seule passe à la fois ; la demande est notée pour la suite.
  if (_processingUploads) {
    _relanceDemandee = true;
    return { success: 0, failed: 0, total: 0, permanentlyFailed: 0 };
  }
  _processingUploads = true;
  const totals = { success: 0, failed: 0, permanentlyFailed: 0 };
  let total = 0;
  try { // try global pour libérer _processingUploads même sur erreur inattendue
    do {
      _relanceDemandee = false;
      let all: PendingUpload[];
      try {
        all = await getPendingUploads({ status: "pending" });
      } catch {
        break;
      }
      total += all.length;
      const now = Date.now();
      const dus = all
        .filter((item) => !(item.nextAttemptAt && item.nextAttemptAt > now))
        .sort((a, b) => a.createdAt - b.createdAt);

      // ── Phase 1 : les octets, ENVOIS_SIMULTANES à la fois ────────────────
      const avancements: Avancement[] = [];
      let suivant = 0;
      await Promise.all(Array.from({ length: Math.min(ENVOIS_SIMULTANES, dus.length) }, async () => {
        while (suivant < dus.length) {
          const item = dus[suivant++];
          try {
            const av = await _envoyerOctets(item);
            if (av) avancements.push(av);
          } catch (e) {
            console.warn("[idb-uploads] envoi inattendu", item.id, e);
          }
        }
      }));

      // ── Phase 2 : le rattachement, par champ ─────────────────────────────
      const groupes = new Map<string, Avancement[]>();
      for (const av of avancements.sort((a, b) => a.item.createdAt - b.item.createdAt)) {
        const { item } = av;
        const key = `${item.projectId}::${item.champTexte ?? item.notionField ?? item.category ?? ""}`;
        const arr = groupes.get(key);
        if (arr) arr.push(av); else groupes.set(key, [av]);
      }
      const listes = [...groupes.values()];
      let prochain = 0;
      await Promise.all(Array.from({ length: Math.min(GROUP_CONCURRENCY, listes.length) }, async () => {
        while (prochain < listes.length) {
          const r = await _rattacherGroupe(listes[prochain++], now);
          totals.success += r.success;
          totals.failed += r.failed;
          totals.permanentlyFailed += r.permanentlyFailed;
        }
      }));
    } while (_relanceDemandee);
  } finally {
    _processingUploads = false;
  }
  return { ...totals, total };
}

/** Le prochain essai prévu d'une photo en attente (ms epoch), ou null. */
export async function prochainEssaiPhotos(): Promise<number | null> {
  try {
    const items = await getPendingUploads({ status: "pending" });
    const dates = items.map((i) => i.nextAttemptAt || 0);
    return dates.length ? Math.min(...dates) : null;
  } catch {
    return null;
  }
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
