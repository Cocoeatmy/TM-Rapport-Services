/**
 * Compresse une image côté client AVANT upload.
 *
 * Pourquoi c'est critique (iPhone + 5G) :
 *   Une photo iPhone fait 3 à 12 Mo. En wifi rapide elle part quand même ;
 *   en 5G (débit montant souvent faible/instable) l'upload « gèle » et finit
 *   en timeout → la photo reste bloquée « en attente de synchro ». En la
 *   réduisant à ~200-400 Ko ici, l'envoi tient dans un seul aller-retour court,
 *   fiable même sur un réseau mobile médiocre.
 *
 * Garanties :
 *   - Redimensionne à maxWidth px (préserve le ratio).
 *   - Encode en JPEG, en BAISSANT la qualité par paliers jusqu'à passer sous
 *     le plafond de taille cible (TARGET_BYTES). Si même à qualité minimale
 *     c'est encore trop gros, on réduit aussi les dimensions.
 *   - Décodage robuste : `createImageBitmap` d'abord (rapide, respecte
 *     l'orientation EXIF), repli sur <img> (qui décode le HEIC sur iOS Safari).
 *   - En dernier recours seulement, renvoie l'original.
 */

/** Taille cible après compression (octets). Largement sous la limite Vercel 4,5 Mo. */
const TARGET_BYTES = 900 * 1024;
/** Plafond dur : au-delà on refuse de renvoyer (on retente plus petit). */
const HARD_CAP_BYTES = 1.6 * 1024 * 1024;

interface Decoded {
  width: number;
  height: number;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  cleanup: () => void;
}

/** Décode le fichier via createImageBitmap (préféré) puis repli <img>. */
async function decodeImage(file: File): Promise<Decoded> {
  // createImageBitmap : décodage hors thread principal + orientation EXIF.
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
      return {
        width: bmp.width,
        height: bmp.height,
        draw: (ctx, w, h) => ctx.drawImage(bmp, 0, 0, w, h),
        cleanup: () => { try { bmp.close(); } catch {} },
      };
    } catch {
      // HEIC parfois non géré par createImageBitmap → on tente <img> ci-dessous.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error("decode <img> échoué"));
      im.src = url;
    });
    return {
      width: img.naturalWidth,
      height: img.naturalHeight,
      draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
      cleanup: () => { try { URL.revokeObjectURL(url); } catch {} },
    };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", quality));
}

export async function compressImage(
  file: File,
  maxWidth = 1280,
  quality = 0.8,
): Promise<File> {
  // Pas une image (ne devrait pas arriver) → tel quel.
  if (!file.type.startsWith("image/")) return file;
  // Déjà petit ET dans un format directement envoyable (jpeg/png/webp) → tel quel.
  const alreadyWeb = /jpe?g|png|webp/i.test(file.type);
  if (alreadyWeb && file.size < 700 * 1024) return file;

  let decoded: Decoded | null = null;
  try {
    decoded = await decodeImage(file);

    // Dimensions de départ (bornées à maxWidth).
    let targetW = decoded.width;
    let targetH = decoded.height;
    if (targetW > maxWidth) {
      targetH = Math.round((targetH * maxWidth) / targetW);
      targetW = maxWidth;
    }

    // On tente successivement : qualité décroissante, puis réduction des
    // dimensions, jusqu'à passer sous TARGET_BYTES (ou au pire HARD_CAP_BYTES).
    let best: Blob | null = null;
    for (let dimStep = 0; dimStep < 4; dimStep++) {
      const w = Math.max(1, Math.round(targetW * (1 - dimStep * 0.2)));
      const h = Math.max(1, Math.round(targetH * (1 - dimStep * 0.2)));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) break;
      // Fond blanc : les PNG/HEIC à transparence ne deviennent pas noirs en JPEG.
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, w, h);
      decoded.draw(ctx, w, h);

      for (const q of [quality, 0.7, 0.6, 0.5]) {
        const blob = await canvasToBlob(canvas, q);
        if (!blob) continue;
        if (!best || blob.size < best.size) best = blob;
        if (blob.size <= TARGET_BYTES) {
          return toJpegFile(file, blob);
        }
      }
      // Trop gros même à qualité mini → on réduit les dimensions au tour suivant.
    }

    // Aucun palier sous la cible : on garde le plus petit obtenu s'il est
    // raisonnable et plus petit que l'original.
    if (best && best.size < file.size && best.size <= HARD_CAP_BYTES) {
      return toJpegFile(file, best);
    }
    // Dernier recours : original (rare).
    return best && best.size < file.size ? toJpegFile(file, best) : file;
  } catch {
    return file; // décodage impossible → original
  } finally {
    decoded?.cleanup();
  }
}

function toJpegFile(original: File, blob: Blob): File {
  return new File([blob], original.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" });
}
