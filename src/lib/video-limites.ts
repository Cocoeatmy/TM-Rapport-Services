/**
 * Ce qu'un fichier a le droit de peser avant de partir chez Cloudinary.
 *
 * Il y a eu ici un plafond de 4 Mo, posé du temps où les octets transitaient
 * par Vercel (limite 4,5 Mo par requête). Ce temps est révolu : l'upload est
 * DIRECT depuis le téléphone (voir src/lib/cloudinary-upload.ts), Vercel ne
 * voit plus passer que la signature et le rattachement Notion. Le plafond de
 * 4 Mo ne protégeait donc plus de rien — il refusait seulement des clips de
 * quinze secondes.
 *
 * Restent deux limites, et elles sont réelles :
 *   • UNE MINUTE de film. C'est une règle de métier, pas une contrainte
 *     technique : une vidéo de montage montre un jeu, un frottement, une
 *     manœuvre — pas un chantier entier.
 *   • Les plafonds du compte Cloudinary (plan Free, relevés le 14 octobre
 *     2026) : 100 Mo par vidéo, 10 Mo par image et par document. Au-delà,
 *     Cloudinary répond 400 et l'envoi repart en boucle dans la file des
 *     différés sans que personne comprenne pourquoi. Autant le dire tout de
 *     suite, et en clair.
 */

/** Durée maximale d'une vidéo, en secondes. */
export const VIDEO_DUREE_MAX_S = 60;

/** Un « une minute » filmé à la main en fait 61 ou 62 : on ne chicane pas. */
export const VIDEO_TOLERANCE_S = 5;

/** Plafonds du compte Cloudinary (plan Free). */
export const VIDEO_TAILLE_MAX = 100 * 1024 * 1024;
export const IMAGE_TAILLE_MAX = 10 * 1024 * 1024;
export const DOCUMENT_TAILLE_MAX = 10 * 1024 * 1024;

/** « 143 Mo », « 4,2 Mo ». */
export function moLisible(octets: number): string {
  return `${(octets / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`;
}

/** « 1 min 12 », « 48 s ». */
export function dureeLisible(secondes: number): string {
  const s = Math.round(secondes);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r === 0 ? `${m} min` : `${m} min ${r}`;
}

export interface FichierAEnvoyer {
  taille: number;
  /** Type MIME ; vide = inconnu, traité comme un document. */
  type: string;
  /** Durée en secondes pour une vidéo ; null si illisible (on laisse passer). */
  duree?: number | null;
}

/**
 * Pourquoi ce fichier ne peut pas partir — ou null s'il le peut.
 *
 * Une durée illisible ne bloque pas : mieux vaut laisser passer une vidéo
 * qu'on n'a pas su mesurer que refuser un envoi légitime. La taille, elle,
 * est toujours connue, et c'est elle que Cloudinary refusera.
 */
export function refusFichier(f: FichierAEnvoyer): string | null {
  const type = String(f.type || "");

  if (type.startsWith("video/")) {
    const d = f.duree;
    if (typeof d === "number" && Number.isFinite(d) && d > VIDEO_DUREE_MAX_S + VIDEO_TOLERANCE_S) {
      return `Vidéo trop longue (${dureeLisible(d)}) — une minute au maximum.`;
    }
    if (f.taille > VIDEO_TAILLE_MAX) {
      return `Vidéo trop lourde (${moLisible(f.taille)}) — 100 Mo au maximum. Filmez en 1080p plutôt qu'en 4K : Réglages → Appareil photo → Enregistrer vidéo.`;
    }
    return null;
  }

  if (type.startsWith("image/")) {
    return f.taille > IMAGE_TAILLE_MAX
      ? `Image trop lourde (${moLisible(f.taille)}) — 10 Mo au maximum.`
      : null;
  }

  return f.taille > DOCUMENT_TAILLE_MAX
    ? `Fichier trop lourd (${moLisible(f.taille)}) — 10 Mo au maximum.`
    : null;
}
