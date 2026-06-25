"use client";

/**
 * Upload DIRECT client → Cloudinary, puis rattachement Notion.
 *
 * Pourquoi : l'ancienne route /api/upload faisait transiter les octets par
 * Vercel (limite 4,5 Mo, requête lourde) ET écrivait Notion dans la même
 * requête. Sur réseau mobile, ça « gelait » (timeout) et la photo restait
 * bloquée « en attente de synchro » pendant des minutes.
 *
 * Nouveau flux, en 2 étapes découplées :
 *   1. uploadToCloudinary : les octets vont DIRECTEMENT du téléphone à
 *      Cloudinary (robuste, CDN mondial, pas de limite Vercel). Une fois
 *      réussi, la photo est SÛRE et ne sera jamais re-uploadée.
 *   2. attachPhotos : petit JSON vers /api/photos/attach pour lier l'URL au
 *      champ Notion. Réessayable indéfiniment SANS renvoyer les octets.
 */

export interface UploadedPhoto {
  name: string;
  url: string;
}

/** Erreur réseau/temporaire (à réessayer) vs permanente (4xx). */
export class UploadError extends Error {
  permanent: boolean;
  constructor(message: string, permanent = false) {
    super(message);
    this.permanent = permanent;
  }
}

const CLOUDINARY_TIMEOUT_MS = 60_000; // les octets : on laisse le temps même en 5G lente
const API_TIMEOUT_MS = 20_000;        // appels Vercel (sign / attach) : petits JSON

async function fetchWithTimeout(input: RequestInfo, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(to);
  }
}

/**
 * Upload un blob directement vers Cloudinary (signé). Retourne l'URL sécurisée.
 * Lève UploadError(permanent=false) sur échec réseau (à réessayer).
 */
export async function uploadToCloudinary(
  blob: Blob,
  name: string,
  projectId: string,
  category: string,
): Promise<string> {
  // 1. Signature (petit appel Vercel)
  let sign: { signature: string; timestamp: number; folder: string; apiKey: string; cloudName: string };
  try {
    const res = await fetchWithTimeout(
      "/api/photos/sign",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId, category }) },
      API_TIMEOUT_MS,
    );
    if (!res.ok) throw new UploadError(`sign ${res.status}`, res.status >= 400 && res.status < 500 && res.status !== 429);
    sign = await res.json();
  } catch (e: any) {
    if (e instanceof UploadError) throw e;
    throw new UploadError(e?.name === "AbortError" ? "signature timeout" : "réseau (signature)");
  }

  // 2. Upload direct vers Cloudinary (les octets ne passent PAS par Vercel)
  const fd = new FormData();
  fd.append("file", new File([blob], name, { type: blob.type || "image/jpeg" }));
  fd.append("api_key", sign.apiKey);
  fd.append("timestamp", String(sign.timestamp));
  fd.append("signature", sign.signature);
  fd.append("folder", sign.folder);

  let res: Response;
  try {
    res = await fetchWithTimeout(
      `https://api.cloudinary.com/v1_1/${sign.cloudName}/image/upload`,
      { method: "POST", body: fd },
      CLOUDINARY_TIMEOUT_MS,
    );
  } catch (e: any) {
    throw new UploadError(e?.name === "AbortError" ? "Cloudinary timeout" : "réseau (Cloudinary)");
  }
  if (!res.ok) {
    // 4xx Cloudinary (signature périmée, fichier invalide…) = permanent.
    const permanent = res.status >= 400 && res.status < 500;
    throw new UploadError(`Cloudinary ${res.status}`, permanent);
  }
  const data = await res.json();
  if (!data?.secure_url) throw new UploadError("Cloudinary: pas d'URL");
  return data.secure_url as string;
}

/**
 * Rattache des URLs Cloudinary à un champ Notion (petit JSON, réessayable).
 * Lève UploadError(permanent) sur 4xx.
 */
export async function attachPhotos(
  projectId: string,
  notionField: string,
  photos: UploadedPhoto[],
): Promise<void> {
  let res: Response;
  try {
    res = await fetchWithTimeout(
      "/api/photos/attach",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId, notionField, photos }) },
      API_TIMEOUT_MS,
    );
  } catch (e: any) {
    throw new UploadError(e?.name === "AbortError" ? "attach timeout" : "réseau (attach)");
  }
  if (!res.ok) {
    const permanent = res.status >= 400 && res.status < 500 && res.status !== 429;
    let msg = `attach ${res.status}`;
    try { const d = await res.json(); if (d?.error) msg = String(d.error).slice(0, 140); } catch {}
    throw new UploadError(msg, permanent);
  }
}
