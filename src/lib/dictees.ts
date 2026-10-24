"use client";

/**
 * Les dictées vocales, gardées sur l'appareil jusqu'à ce qu'elles soient
 * réellement dans le rapport (24.10.2026).
 *
 * Constat de Micael : un monteur dicte son rapport, voit le texte transcrit,
 * pense que c'est fait — et le soir, rien n'est enregistré. Deux trous :
 *   1. le texte transcrit attendait un appui sur « Ajouter au rapport » ;
 *      sans cet appui, il disparaissait avec la page ;
 *   2. sans réseau (ou si la transcription échouait), l'audio était jeté.
 *
 * Désormais l'audio est écrit ICI avant même d'être envoyé à la
 * transcription, puis le texte obtenu y est noté, et l'entrée n'est retirée
 * que lorsque le texte est dans le champ ET que son enregistrement est parti
 * (ou en file d'attente hors ligne). Tout ce qui reste ici est repris : au
 * retour du réseau, ou à la prochaine ouverture du projet.
 *
 * Base à part (`tm-dictees`) : la file des photos garde son schéma intact.
 */

const DB_NAME = "tm-dictees";
const DB_VERSION = 1;
const STORE = "dictees";

export interface Dictee {
  id: string;
  /** Où va le texte : `rapport:<projet>`, `note:<projet>`… */
  cle: string;
  blob: Blob;
  mime: string;
  creeLe: number;
  /** Le texte, dès qu'il est connu : une reprise ne retranscrit pas. */
  texte?: string;
}

/** Ce qu'est devenu le texte une fois versé dans son champ. */
export type EtatAjout = "enregistre" | "en-attente" | "echec" | "ajoute";

function ouvrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("IndexedDB absent")); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const s = db.createObjectStore(STORE, { keyPath: "id" });
        s.createIndex("cle", "cle", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function operation<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await ouvrir();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      let resultat: T | undefined;
      if (req) req.onsuccess = () => { resultat = req.result; };
      tx.oncomplete = () => resolve(resultat);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Garde l'audio. Renvoie son identifiant, ou null si l'appareil refuse. */
export async function garderDictee(cle: string, blob: Blob, mime: string): Promise<string | null> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    await operation("readwrite", (s) => s.put({ id, cle, blob, mime, creeLe: Date.now() } satisfies Dictee));
    return id;
  } catch {
    return null;
  }
}

export async function noterTexte(id: string, texte: string): Promise<void> {
  try {
    const d = await operation<Dictee>("readonly", (s) => s.get(id) as IDBRequest<Dictee>);
    if (d) await operation("readwrite", (s) => s.put({ ...d, texte }));
  } catch { /* l'audio reste : une reprise retranscrira */ }
}

export async function oublierDictee(id: string): Promise<void> {
  try { await operation("readwrite", (s) => s.delete(id)); } catch { /* rien */ }
}

export async function dicteesEnAttente(cle: string): Promise<Dictee[]> {
  try {
    const toutes = await operation<Dictee[]>("readonly", (s) => s.index("cle").getAll(cle) as IDBRequest<Dictee[]>);
    return (toutes || []).sort((a, b) => a.creeLe - b.creeLe);
  } catch {
    return [];
  }
}

export function extensionAudio(mime: string): string {
  if (mime.includes("mp4") || mime.includes("m4a") || mime.includes("aac")) return "mp4";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("wav")) return "wav";
  return "webm";
}

export type Transcription =
  | { ok: true; texte: string }
  | { ok: false; raison: "reseau" | "vide" | "erreur"; message: string };

/** Envoie l'audio à la transcription (Groq Whisper, /api/transcribe). */
export async function transcrire(blob: Blob, mime: string): Promise<Transcription> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { ok: false, raison: "reseau", message: "Pas de réseau." };
  }
  try {
    const nom = `audio.${extensionAudio(mime)}`;
    const form = new FormData();
    form.append("audio", blob, nom);
    form.append("filename", nom);
    const res = await fetch("/api/transcribe", { method: "POST", body: form });
    const data = await res.json().catch(() => ({} as Record<string, unknown>));
    const texte = typeof data.text === "string" ? data.text.trim() : "";
    if (res.ok && texte) return { ok: true, texte };
    if (res.ok) return { ok: false, raison: "vide", message: "Rien n'a été compris. Réessayez en parlant plus près du micro." };
    return { ok: false, raison: "erreur", message: (typeof data.error === "string" && data.error) || "La transcription a échoué." };
  } catch {
    return { ok: false, raison: "reseau", message: "Pas de réseau." };
  }
}

/* Une même dictée ne se traite qu'une fois à la fois, même si la page et
   l'enregistreur la reprennent ensemble. */
const enCours = new Set<string>();

/**
 * Reprend les dictées restées sur l'appareil pour cette clé : transcrit
 * celles qui ne le sont pas encore, verse le texte, puis les retire — sauf
 * si le versement a échoué. `dejaPresent` évite de verser deux fois un
 * texte déjà arrivé dans le champ (enregistrement réussi juste avant une
 * fermeture, par exemple).
 */
export async function reprendreDictees(
  cle: string,
  verser: (texte: string) => EtatAjout | void | Promise<EtatAjout | void>,
  dejaPresent: (texte: string) => boolean,
): Promise<{ versees: number; restantes: number }> {
  let versees = 0, restantes = 0;
  for (const d of await dicteesEnAttente(cle)) {
    if (enCours.has(d.id)) { restantes++; continue; }
    enCours.add(d.id);
    try {
      let texte = d.texte;
      if (!texte) {
        const t = await transcrire(d.blob, d.mime);
        if (!t.ok) {
          // Rien de compréhensible : inutile de la garder éternellement.
          if (t.raison === "vide") await oublierDictee(d.id);
          else restantes++;
          continue;
        }
        texte = t.texte;
        await noterTexte(d.id, texte);
      }
      if (dejaPresent(texte)) { await oublierDictee(d.id); continue; }
      const etat = await verser(texte);
      if (etat === "echec") { restantes++; continue; }
      await oublierDictee(d.id);
      versees++;
    } finally {
      enCours.delete(d.id);
    }
  }
  return { versees, restantes };
}

/** Pour l'enregistreur : marque une dictée comme prise en charge. */
export function prendreEnCharge(id: string): () => void {
  enCours.add(id);
  return () => { enCours.delete(id); };
}
