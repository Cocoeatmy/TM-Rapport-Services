// Sous-buckets logiques de photos. On ne peut pas créer de nouvelles
// colonnes Notion à la volée, donc on encode le bucket dans le préfixe
// du nom de fichier et on stocke tout dans les colonnes Notion existantes :
//
//   "Photos avant montage"     ← AVANT_INTERVENTION + AVANT_MONTAGE
//   "Photos montage terminé"   ← MONTAGE_GAUCHE + MONTAGE_CENTRE
//                                + MONTAGE_DROITE + APRES_INTERVENTION
//   "Photos QR Code"           ← QR_CODE (seul)
//   "Photos garanties"         ← GARANTIE (seul)
//
// Un fichier nommé "Avant montage.Cab1.2.jpg" appartient au bucket
// AVANT_MONTAGE de la cabine 1. Un fichier sans préfixe reconnu ou avec
// un ancien préfixe est rangé dans un bucket par défaut, défini ci-dessous.

export type PhotoBucketKey =
  | "AVANT_INTERVENTION"
  | "AVANT_MONTAGE"
  | "MONTAGE_GAUCHE"
  | "MONTAGE_CENTRE"
  | "MONTAGE_DROITE"
  | "APRES_INTERVENTION"
  | "QR_CODE"
  | "GARANTIE";

export const BUCKET_PREFIX: Record<PhotoBucketKey, string> = {
  AVANT_INTERVENTION: "Avant intervention",
  AVANT_MONTAGE: "Avant montage",
  MONTAGE_GAUCHE: "Montage gauche",
  MONTAGE_CENTRE: "Montage centre",
  MONTAGE_DROITE: "Montage droite",
  APRES_INTERVENTION: "Apres intervention",
  QR_CODE: "QR Code",
  GARANTIE: "Garantie",
};

export const BUCKET_LABEL: Record<PhotoBucketKey, string> = {
  AVANT_INTERVENTION: "Photos avant intervention",
  AVANT_MONTAGE: "Photos avant montage",
  MONTAGE_GAUCHE: "Photos montage — gauche",
  MONTAGE_CENTRE: "Photos montage — centre",
  MONTAGE_DROITE: "Photos montage — droite",
  APRES_INTERVENTION: "Photos après intervention",
  QR_CODE: "Photos QR Code",
  GARANTIE: "Photos Garantie",
};

// Mapping bucket → champ Notion qui stocke ses fichiers.
export const BUCKET_NOTION_FIELD: Record<
  PhotoBucketKey,
  "photosAvant" | "photosMontage" | "photosQRCode" | "photosGaranties"
> = {
  AVANT_INTERVENTION: "photosAvant",
  AVANT_MONTAGE: "photosAvant",
  MONTAGE_GAUCHE: "photosMontage",
  MONTAGE_CENTRE: "photosMontage",
  MONTAGE_DROITE: "photosMontage",
  APRES_INTERVENTION: "photosMontage",
  QR_CODE: "photosQRCode",
  GARANTIE: "photosGaranties",
};

// Ordre d'affichage demandé par le client.
export const BUCKET_ORDER: PhotoBucketKey[] = [
  "AVANT_INTERVENTION",
  "AVANT_MONTAGE",
  "MONTAGE_GAUCHE",
  "MONTAGE_CENTRE",
  "MONTAGE_DROITE",
  "APRES_INTERVENTION",
  "QR_CODE",
  "GARANTIE",
];

// Bucket par défaut pour un fichier non préfixé dans un champ Notion donné.
// On choisit celui qui correspond à l'ancien comportement, afin que les
// photos déjà uploadées avant ce refactor restent visibles à un seul endroit.
export function defaultBucketForField(
  field: "photosAvant" | "photosMontage" | "photosQRCode" | "photosGaranties",
): PhotoBucketKey {
  if (field === "photosAvant") return "AVANT_INTERVENTION";
  if (field === "photosMontage") return "MONTAGE_CENTRE";
  if (field === "photosQRCode") return "QR_CODE";
  return "GARANTIE";
}

const LEGACY_FALLBACK: { match: string; bucket: PhotoBucketKey }[] = [
  { match: "Etat avant intervention", bucket: "AVANT_INTERVENTION" },
  { match: "Photos - Montage termine", bucket: "MONTAGE_CENTRE" },
  { match: "Photos - QR Code", bucket: "QR_CODE" },
  { match: "Photos - Garantie", bucket: "GARANTIE" },
];

/** Identifie le bucket d'un fichier à partir de son nom. */
export function detectBucket(
  filename: string | undefined | null,
  fallback: PhotoBucketKey,
): PhotoBucketKey {
  const name = filename || "";
  for (const k of BUCKET_ORDER) {
    const p = BUCKET_PREFIX[k];
    if (name.startsWith(p + ".") || name.startsWith(p + "-")) return k;
  }
  for (const { match, bucket } of LEGACY_FALLBACK) {
    if (name.startsWith(match)) return bucket;
  }
  return fallback;
}

export function extractCabine(filename: string | undefined | null): number | null {
  const m = /\.Cab(\d+)\./.exec(filename || "");
  return m ? parseInt(m[1], 10) : null;
}

/** Préfixe à passer à PhotoUpload pour cibler un bucket (avec cabine optionnelle). */
export function bucketFilePrefix(bucket: PhotoBucketKey, cabineIdx?: number): string {
  const base = BUCKET_PREFIX[bucket];
  if (cabineIdx && cabineIdx >= 1) return `${base}.Cab${cabineIdx}`;
  return base;
}

/** Filtre une liste de fichiers pour un bucket donné, avec cabine optionnelle. */
export function filterByBucket<T extends { name: string }>(
  files: T[] | undefined,
  bucket: PhotoBucketKey,
  cabineIdx?: number,
  fallbackBucket: PhotoBucketKey = bucket,
): T[] {
  if (!files) return [];
  return files.filter((f) => {
    if (detectBucket(f.name, fallbackBucket) !== bucket) return false;
    if (cabineIdx !== undefined) {
      const cab = extractCabine(f.name);
      if (cabineIdx >= 1) return cab === cabineIdx;
      return cab === null; // 0 = global
    }
    return true;
  });
}
