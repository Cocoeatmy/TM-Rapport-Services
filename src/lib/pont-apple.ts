"use client";

/**
 * Le pont vers l'application Apple (iPhone, iPad, Mac).
 *
 * L'app Apple affiche ce site tel quel. Elle ajoute une seule chose qu'un
 * navigateur n'a pas : un COFFRE natif, dans les fichiers de l'application,
 * qui garde un double de tout ce que le serveur n'a pas encore confirmé —
 * photos, signatures, saisies. Le cache d'un navigateur peut être vidé par le
 * système ; le coffre, non.
 *
 * Ce module ne fait RIEN dans un navigateur : sans
 * `window.webkit.messageHandlers.tmCoffre`, chaque fonction rend aussitôt la
 * main. Les files du site restent les seules à envoyer ; le coffre n'envoie
 * jamais rien lui-même.
 *
 * Il n'importe aucun autre module de l'app : idb-uploads et offline
 * l'appellent, et rien ne tourne en rond.
 */

type Pont = { postMessage(message: unknown): Promise<unknown> };

function pont(): Pont | null {
  if (typeof window === "undefined") return null;
  const h = (window as unknown as {
    webkit?: { messageHandlers?: { tmCoffre?: Pont } };
  }).webkit?.messageHandlers?.tmCoffre;
  return h && typeof h.postMessage === "function" ? h : null;
}

/** Sommes-nous dans l'application Apple ? */
export function dansAppApple(): boolean {
  return pont() !== null;
}

/**
 * Un message au pont, avec un délai : une réponse qui ne vient pas ne doit
 * jamais bloquer le travail du monteur. `null` = pas de réponse.
 */
export async function demanderAuPont<T = Record<string, unknown>>(
  message: Record<string, unknown>,
  delaiMs = 8000,
): Promise<T | null> {
  const p = pont();
  if (!p) return null;
  let minuterie: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p.postMessage(message) as Promise<T>,
      new Promise<null>((r) => { minuterie = setTimeout(() => r(null), delaiMs); }),
    ]);
  } catch (e) {
    console.warn("[pont-apple]", message.action, e);
    return null;
  } finally {
    if (minuterie) clearTimeout(minuterie);
  }
}

export function versBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const texte = String(r.result || "");
      const virgule = texte.indexOf(",");
      resolve(virgule >= 0 ? texte.slice(virgule + 1) : texte);
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export function depuisBase64(b64: string, type: string): Blob {
  const binaire = atob(b64);
  const octets = new Uint8Array(binaire.length);
  for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i);
  return new Blob([octets], { type });
}

/** Ce que le coffre doit savoir d'une photo en attente : tout, sauf les octets. */
export interface FichePhoto {
  id: string;
  files: { name: string; type: string; blob: Blob; uploadedUrl?: string }[];
}

/**
 * Dépose le double d'une photo (ou d'une signature) au coffre. Rend `true`
 * si le coffre l'a, `false` hors de l'app ou en cas d'échec — le site garde
 * alors sa propre copie, comme dans un navigateur.
 */
export async function coffreDeposerPhoto(item: FichePhoto): Promise<boolean> {
  if (!pont()) return false;
  try {
    const fichiers = await Promise.all(item.files.map(async (f) => ({
      nom: f.name,
      type: f.type || f.blob.type || "application/octet-stream",
      base64: await versBase64(f.blob),
    })));
    const meta = JSON.stringify({
      ...item,
      files: item.files.map((f) => ({ name: f.name, type: f.type, uploadedUrl: f.uploadedUrl })),
    });
    const r = await demanderAuPont<{ ok?: boolean }>(
      { action: "deposerPhoto", id: item.id, meta, fichiers },
      10_000,
    );
    return !!r?.ok;
  } catch (e) {
    console.warn("[pont-apple] dépôt impossible", e);
    return false;
  }
}

/** Les retraits que le coffre n'a pas encore pris en compte. */
const CLE_RETRAITS = "tm-coffre-retraits";

function lireRetraits(): string[] {
  try {
    const t = JSON.parse(localStorage.getItem(CLE_RETRAITS) || "[]");
    return Array.isArray(t) ? t.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function ecrireRetraits(ids: string[]): void {
  try {
    if (ids.length) localStorage.setItem(CLE_RETRAITS, JSON.stringify(ids.slice(-500)));
    else localStorage.removeItem(CLE_RETRAITS);
  } catch { /* stockage plein : le retrait sera simplement rejoué */ }
}

/**
 * La photo est confirmée par le serveur (ou écartée par l'utilisateur) : le
 * coffre la range à l'archive. Si le coffre ne répond pas, on note le
 * retrait pour le rejouer — sans quoi il la rendrait au site plus tard, et
 * elle repartirait une seconde fois.
 */
export async function coffreRetirerPhoto(id: string, motif: string): Promise<void> {
  if (!pont()) return;
  const r = await demanderAuPont<{ ok?: boolean }>({ action: "retirerPhoto", id, motif });
  if (!r?.ok) ecrireRetraits([...lireRetraits().filter((x) => x !== id), id]);
}

/** Rejoue les retraits en souffrance. Rend les identifiants encore en souffrance. */
export async function rejouerRetraits(): Promise<Set<string>> {
  const restants: string[] = [];
  for (const id of lireRetraits()) {
    const r = await demanderAuPont<{ ok?: boolean }>({ action: "retirerPhoto", id, motif: "confirme" });
    if (!r?.ok) restants.push(id);
  }
  ecrireRetraits(restants);
  return new Set(restants);
}
