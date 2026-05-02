/**
 * Compresse une image côté client avant upload.
 * - Redimensionne à maxWidth px max (préserve le ratio)
 * - Encode en JPEG à la qualité donnée
 * - Retourne le File original si la compression échoue
 *
 * Objectif : rester sous les 4 Mo (limite Vercel serverless)
 * pour les photos de caméra iPhone qui peuvent dépasser 10 Mo.
 */
export async function compressImage(
  file: File,
  maxWidth = 1600,
  quality = 0.82,
): Promise<File> {
  // Bypass pour les fichiers déjà petits (< 1.5 Mo)
  if (file.size < 1.5 * 1024 * 1024) return file;

  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let { width: w, height: h } = img;
      if (w > maxWidth) {
        h = Math.round((h * maxWidth) / w);
        w = maxWidth;
      }

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(file); return; }

      ctx.drawImage(img, 0, 0, w, h);

      canvas.toBlob(
        (blob) => {
          if (!blob) { resolve(file); return; }
          // Si la compression ne réduit pas le fichier, garder l'original
          if (blob.size >= file.size) { resolve(file); return; }
          const compressed = new File(
            [blob],
            file.name.replace(/\.[^.]+$/, ".jpg"),
            { type: "image/jpeg" },
          );
          resolve(compressed);
        },
        "image/jpeg",
        quality,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file); // fallback : original
    };

    img.src = objectUrl;
  });
}
