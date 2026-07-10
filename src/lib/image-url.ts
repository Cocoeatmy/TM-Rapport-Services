/**
 * Helpers d'optimisation d'URL d'images.
 *
 * Les photos uploadées via l'app transitent par Cloudinary, donc leurs URLs
 * commencent par `https://res.cloudinary.com/<cloud>/image/upload/...`.
 * On peut injecter des transformations juste après `/upload/` pour obtenir :
 *  - `f_auto` : format automatique (WebP/AVIF si le navigateur le supporte)
 *  - `q_auto` : qualité adaptée au réseau et au contenu
 *  - `w_<N>`  : redimensionnement côté CDN (économise la bande passante)
 *  - `c_limit`: ne jamais agrandir au-dessus de la taille d'origine
 *
 * Pour les URLs non-Cloudinary (Notion, externes, data:), on les retourne
 * telles quelles — la fonction est safe à appeler partout.
 */

const CLOUDINARY_UPLOAD_MARKER = "/image/upload/";

export type ImageTransformOptions = {
  /** Largeur max en pixels. Cloudinary calcule la hauteur en respectant le ratio. */
  width?: number;
  /** Niveau de qualité. Par défaut "auto". */
  quality?: "auto" | "auto:eco" | "auto:good" | "auto:best" | number;
  /** Mode de recadrage. Par défaut "limit" (ne recadre pas, limite juste la taille). */
  crop?: "limit" | "fill" | "fit" | "scale" | "thumb";
  /** Ratio d'aspect (ex "1:1"). Utile avec `crop: "fill"` pour des vignettes carrées. */
  aspectRatio?: string;
  /** Qualité DPR (densité pixel, pour écrans Retina). Par défaut "auto". */
  dpr?: "auto" | number;
};

/**
 * Injecte des transformations dans une URL Cloudinary.
 * Retourne l'URL inchangée si ce n'est pas une URL Cloudinary `/image/upload/`.
 */
export function optimizeImageUrl(
  url: string | null | undefined,
  options: ImageTransformOptions = {},
): string {
  if (!url || typeof url !== "string") return "";

  // URLs non-Cloudinary : on ne peut pas transformer, on retourne tel quel.
  const uploadIdx = url.indexOf(CLOUDINARY_UPLOAD_MARKER);
  if (uploadIdx === -1) return url;

  const { width, quality = "auto", crop = "limit", aspectRatio, dpr = "auto" } = options;

  const parts: string[] = ["f_auto", `q_${quality}`, `dpr_${dpr}`];
  if (width) {
    parts.push(`w_${width}`, `c_${crop}`);
  }
  if (aspectRatio) parts.push(`ar_${aspectRatio}`);

  const transform = parts.join(",");

  const insertAt = uploadIdx + CLOUDINARY_UPLOAD_MARKER.length;
  const rest = url.slice(insertAt);

  // Préserve une rotation bakée dans l'URL stockée (`a_<deg>/` en tête, posée
  // par rotateCloudinaryUrl). Elle doit être appliquée AVANT le
  // redimensionnement, donc en composant chaîné séparé (a_90/f_auto,...).
  let angleComponent = "";
  let restBody = rest;
  const rotMatch = rest.match(/^a_(\d+)\//i);
  if (rotMatch) {
    angleComponent = `a_${rotMatch[1]}/`;
    restBody = rest.slice(rotMatch[0].length);
  }

  // rest peut être : "v123/folder/file.jpg" ou "f_auto,q_auto/v123/folder/file.jpg"
  // On supprime toute transformation d'optimisation qu'on aurait injectée avant.
  const cleanRest = restBody.replace(/^(?:[a-z]+_[^,\/]+,?)+\//i, "");

  return `${url.slice(0, insertAt)}${angleComponent}${transform}/${cleanRest}`;
}

/**
 * Fait pivoter une image Cloudinary de `delta` degrés (multiple de 90) en
 * mettant à jour une transformation d'angle `a_<deg>` bakée dans l'URL stockée.
 * L'angle est cumulé (modulo 360) ; à 0° la transformation est retirée.
 * Retourne l'URL inchangée si ce n'est pas une URL Cloudinary `/image/upload/`
 * (ex. anciennes photos hébergées ailleurs : non pivotables via URL).
 */
export function rotateCloudinaryUrl(url: string, delta: number): string {
  if (!url) return url;
  const uploadIdx = url.indexOf(CLOUDINARY_UPLOAD_MARKER);
  if (uploadIdx === -1) return url;
  const insertAt = uploadIdx + CLOUDINARY_UPLOAD_MARKER.length;
  const rest = url.slice(insertAt);
  let angle = 0;
  let body = rest;
  const m = rest.match(/^a_(\d+)\//i);
  if (m) {
    angle = parseInt(m[1], 10) || 0;
    body = rest.slice(m[0].length);
  }
  angle = (((angle + delta) % 360) + 360) % 360;
  const prefix = url.slice(0, insertAt);
  return angle === 0 ? `${prefix}${body}` : `${prefix}a_${angle}/${body}`;
}

/** Variante : vignette carrée optimisée (galeries, cartes). */
export function thumbnailUrl(url: string | null | undefined, size = 300): string {
  return optimizeImageUrl(url, { width: size, crop: "fill", aspectRatio: "1:1" });
}

/** Variante : image moyenne (aperçus, modales). */
export function previewUrl(url: string | null | undefined, width = 800): string {
  return optimizeImageUrl(url, { width });
}

/** Variante : plein écran (visionneuse). */
export function fullUrl(url: string | null | undefined, width = 1600): string {
  return optimizeImageUrl(url, { width, quality: "auto:good" });
}
