"use client";

/**
 * Envoyer un fichier quel qu'il soit — photo, vidéo, PDF, Word, Excel…
 *
 * Certaines zones envoyaient leurs fichiers par /api/upload, qui passe par
 * Vercel : 4,5 Mo au plus par requête. Une photo compressée y tient ; un PDF
 * scanné ou une vidéo de téléphone, non (refus 413, « Échec de l'upload »).
 * Ces fichiers-là partent donc DIRECTEMENT vers Cloudinary (signature
 * courte, puis octets envoyés sans passer par Vercel), comme les photos du
 * rapport : « raw » pour un document, « video » pour une vidéo.
 *
 * Les plafonds sont ceux de toute l'app (src/lib/video-limites.ts) : 10 Mo
 * pour une image ou un document, 100 Mo et une minute pour une vidéo.
 */
import { uploadToCloudinary, type UploadedPhoto } from "./cloudinary-upload";
import { refusFichier } from "./video-limites";
import { dureeVideo } from "./video-duree";

/** Au-delà, ou si ce n'est pas une image, l'envoi passe directement par Cloudinary. */
export const SEUIL_ENVOI_DIRECT = 3.5 * 1024 * 1024;

export function doitPartirEnDirect(f: File): boolean {
  return !f.type.startsWith("image/") || f.size > SEUIL_ENVOI_DIRECT;
}

/** Pourquoi ce fichier ne peut pas partir (taille, durée), ou null. */
export async function refusPour(f: File): Promise<string | null> {
  const duree = f.type.startsWith("video/") ? await dureeVideo(f).catch(() => null) : null;
  return refusFichier({ taille: f.size, type: f.type, duree });
}

/** Envoie ces fichiers directement vers Cloudinary, un par un. */
export async function envoyerEnDirect(fichiers: File[], projectId: string, categorie: string): Promise<UploadedPhoto[]> {
  const out: UploadedPhoto[] = [];
  for (const f of fichiers) {
    const nom = f.name || "fichier";
    out.push({ name: nom, url: await uploadToCloudinary(f, nom, projectId, categorie) });
  }
  return out;
}

/**
 * Envoie des fichiers de tout type et les rattache à un champ Notion :
 * photos légères par /api/upload (qui rattache lui-même, comme avant),
 * documents, vidéos et gros fichiers directement vers Cloudinary puis
 * rattachés par la même voie que les photos du rapport. Les fichiers refusés
 * (trop lourds, vidéo trop longue) sont rendus avec leur motif.
 */
export async function envoyerEtRattacher(
  fichiers: File[],
  projectId: string,
  categorie: string,
  champNotion: string,
): Promise<{ envoyes: UploadedPhoto[]; refuses: { nom: string; motif: string }[] }> {
  const refuses: { nom: string; motif: string }[] = [];
  const acceptes: File[] = [];
  for (const f of fichiers) {
    const motif = await refusPour(f);
    if (motif) refuses.push({ nom: f.name, motif }); else acceptes.push(f);
  }
  const envoyes: UploadedPhoto[] = [];
  const legers = acceptes.filter((f) => !doitPartirEnDirect(f));
  const directs = acceptes.filter(doitPartirEnDirect);
  if (legers.length > 0) {
    const fd = new FormData();
    legers.forEach((f) => fd.append("files", f));
    fd.append("projectId", projectId);
    fd.append("category", categorie);
    fd.append("notionField", champNotion);
    const r = await fetch("/api/upload", { method: "POST", body: fd });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    envoyes.push(...((d.uploaded || d.files || []) as UploadedPhoto[]));
  }
  if (directs.length > 0) {
    const { attachPhotos } = await import("./cloudinary-upload");
    const faits = await envoyerEnDirect(directs, projectId, categorie);
    await attachPhotos(projectId, champNotion, faits);
    envoyes.push(...faits);
  }
  return { envoyes, refuses };
}
