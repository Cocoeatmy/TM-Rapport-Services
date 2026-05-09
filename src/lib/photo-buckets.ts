// Sous-buckets logiques de photos. On ne peut pas créer de nouvelles
// colonnes Notion à la volée, donc on encode le bucket dans le préfixe
// du nom de fichier et on stocke tout dans les colonnes Notion existantes :
//
//   "Photos avant montage"     ← AVANT_INTERVENTION + AVANT_MONTAGE
//   "Photos démontage"         ← DEMONTAGE (seul)
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
  | "DEMONTAGE"
  | "MONTAGE_GAUCHE"
  | "MONTAGE_CENTRE"
  | "MONTAGE_DROITE"
  | "APRES_INTERVENTION"
  | "QR_CODE"
  | "GARANTIE";

export const BUCKET_PREFIX: Record<PhotoBucketKey, string> = {
  AVANT_INTERVENTION: "Avant intervention",
  AVANT_MONTAGE: "Avant montage",
  DEMONTAGE: "Demontage",
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
  DEMONTAGE: "Photos démontage",
  MONTAGE_GAUCHE: "Photos montage — gauche",
  MONTAGE_CENTRE: "Photos montage — centre",
  MONTAGE_DROITE: "Photos montage — droite",
  APRES_INTERVENTION: "Photos après intervention",
  QR_CODE: "Photos QR Code",
  GARANTIE: "Photos Garantie",
};

/** Texte d'instruction affiché en sous-titre dans le rapport (null = aucun). */
export const BUCKET_HINT: Partial<Record<PhotoBucketKey, string>> = {
  AVANT_INTERVENTION: "1 photo des lieux + 1 photo de l'état du receveur de douche",
  DEMONTAGE:          "1 photo de l'état après démontage + 1 photo après nettoyage",
  APRES_INTERVENTION: "1 photo de l'état du receveur de douche",
};

// Mapping bucket → champ Notion qui stocke ses fichiers.
export const BUCKET_NOTION_FIELD: Record<
  PhotoBucketKey,
  "photosAvant" | "photosDemontage" | "photosMontage" | "photosQRCode" | "photosGaranties"
> = {
  AVANT_INTERVENTION: "photosAvant",
  AVANT_MONTAGE: "photosAvant",
  DEMONTAGE: "photosDemontage",
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
  "DEMONTAGE",
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
  field: "photosAvant" | "photosDemontage" | "photosMontage" | "photosQRCode" | "photosGaranties",
): PhotoBucketKey {
  if (field === "photosAvant") return "AVANT_INTERVENTION";
  if (field === "photosDemontage") return "DEMONTAGE";
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

/** Photos sources d'un projet, regroupées par champ Notion. */
export interface ProjectPhotoSources {
  photosAvant?: { name: string }[];
  photosDemontage?: { name: string }[];
  photosMontage?: { name: string }[];
  photosQRCode?: { name: string }[];
  photosGaranties?: { name: string }[];
}

/** Buckets effectivement présents dans un projet (option : pour une cabine donnée). */
export function bucketsPresent(
  project: ProjectPhotoSources,
  cabineIdx?: number,
): Set<PhotoBucketKey> {
  const present = new Set<PhotoBucketKey>();
  const check = (
    list: { name: string }[] | undefined,
    field: "photosAvant" | "photosDemontage" | "photosMontage" | "photosQRCode" | "photosGaranties",
  ) => {
    if (!list) return;
    const fallback = defaultBucketForField(field);
    for (const f of list) {
      if (cabineIdx !== undefined) {
        const cab = extractCabine(f.name);
        if (cabineIdx >= 1) {
          if (cab !== cabineIdx) continue;
        } else if (cab !== null) {
          continue;
        }
      }
      present.add(detectBucket(f.name, fallback));
    }
  };
  check(project.photosAvant, "photosAvant");
  check(project.photosDemontage, "photosDemontage");
  check(project.photosMontage, "photosMontage");
  check(project.photosQRCode, "photosQRCode");
  check(project.photosGaranties, "photosGaranties");
  return present;
}

/** Liste les buckets manquants au format texte, pour un projet mono ou multi-cabine. */
export function missingBucketLabels(
  project: ProjectPhotoSources,
  options: { multiCabine: boolean; nbCabines: number },
): string[] {
  if (!options.multiCabine || options.nbCabines <= 1) {
    const present = bucketsPresent(project);
    return BUCKET_ORDER.filter((b) => !present.has(b)).map((b) => BUCKET_LABEL[b]);
  }
  const out: string[] = [];
  for (let i = 1; i <= options.nbCabines; i++) {
    const present = bucketsPresent(project, i);
    const missing = BUCKET_ORDER.filter((b) => !present.has(b));
    for (const b of missing) {
      out.push(`Cabine ${i} — ${BUCKET_LABEL[b]}`);
    }
  }
  return out;
}
