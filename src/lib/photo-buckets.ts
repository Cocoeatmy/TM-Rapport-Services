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
  | "GARANTIE"
  | "SAV_DEMANDE"
  | "SAV_RETOUCHE";

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
  SAV_DEMANDE: "SAV demande",
  SAV_RETOUCHE: "SAV",
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
  SAV_DEMANDE: "Documents SAV (photos/vidéos de la demande)",
  SAV_RETOUCHE: "Photos SAV / Retouches (une fois réglé)",
};

/** Texte d'instruction affiché en sous-titre dans le rapport (null = aucun). */
export const BUCKET_HINT: Partial<Record<PhotoBucketKey, string>> = {
  AVANT_INTERVENTION: "1 photo des lieux + 1 photo de l'état du receveur de douche",
  DEMONTAGE:          "1 photo de l'état après démontage + 1 photo après nettoyage",
  APRES_INTERVENTION: "1 photo de l'état du receveur de douche + 1 photo de l'état de la salle de douche",
};

// Mapping bucket → champ Notion qui stocke ses fichiers.
export const BUCKET_NOTION_FIELD: Record<
  PhotoBucketKey,
  "photosAvant" | "photosDemontage" | "photosMontage" | "photosQRCode" | "photosGaranties" | "photosSavRetouches" | "documentsSavDemande"
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
  SAV_DEMANDE: "documentsSavDemande",
  SAV_RETOUCHE: "photosSavRetouches",
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
  "SAV_DEMANDE",
  "SAV_RETOUCHE",
];

// Bucket par défaut pour un fichier non préfixé dans un champ Notion donné.
// On choisit celui qui correspond à l'ancien comportement, afin que les
// photos déjà uploadées avant ce refactor restent visibles à un seul endroit.
export function defaultBucketForField(
  field: "photosAvant" | "photosDemontage" | "photosMontage" | "photosQRCode" | "photosGaranties" | "photosSavRetouches" | "documentsSavDemande",
): PhotoBucketKey {
  if (field === "photosAvant") return "AVANT_INTERVENTION";
  if (field === "photosDemontage") return "DEMONTAGE";
  if (field === "photosMontage") return "MONTAGE_CENTRE";
  if (field === "photosQRCode") return "QR_CODE";
  if (field === "photosSavRetouches") return "SAV_RETOUCHE";
  if (field === "documentsSavDemande") return "SAV_DEMANDE";
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
  photosSavRetouches?: { name: string }[];
  documentsSavDemande?: { name: string }[];
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

// Groupes de photos vérifiés à l'envoi du rapport (version ACTUELLE). Un groupe
// est « présent » si AU MOINS un de ses buckets a une photo. Les 3 photos de
// montage (gauche/centre/droite) sont regroupées en une seule ligne, et l'ancien
// bucket "AVANT_MONTAGE" (jamais uploadé) est retiré.
const MISSING_CHECK_GROUPS: { label: string; buckets: PhotoBucketKey[] }[] = [
  { label: "Photos avant intervention", buckets: ["AVANT_INTERVENTION"] },
  { label: "Photos démontage", buckets: ["DEMONTAGE"] },
  { label: "Photos montage (1 gauche, 1 centre, 1 droite)", buckets: ["MONTAGE_GAUCHE", "MONTAGE_CENTRE", "MONTAGE_DROITE"] },
  { label: "Photos après intervention", buckets: ["APRES_INTERVENTION"] },
  { label: "Photos QR Code", buckets: ["QR_CODE"] },
  { label: "Photos Garantie", buckets: ["GARANTIE"] },
];

// ── Photos OBLIGATOIRES avec nombre minimum (bloquant à l'envoi) ────────────
// Le montage regroupe gauche/centre/droite : min 3 photos au total, peu importe
// la répartition. Avant et après intervention : min 2 chacun.
export interface RequiredPhotoShortfall {
  label: string;
  have: number;
  min: number;
}
const REQUIRED_PHOTO_GROUPS: { label: string; buckets: PhotoBucketKey[]; min: number }[] = [
  { label: "Photos avant intervention", buckets: ["AVANT_INTERVENTION"], min: 2 },
  { label: "Photos montage", buckets: ["MONTAGE_GAUCHE", "MONTAGE_CENTRE", "MONTAGE_DROITE"], min: 3 },
  { label: "Photos après intervention", buckets: ["APRES_INTERVENTION"], min: 2 },
];
// Groupes RECOMMANDÉS (rappel contournable) — pas de minimum imposé.
const OPTIONAL_PHOTO_GROUPS: { label: string; buckets: PhotoBucketKey[] }[] = [
  { label: "Photos démontage", buckets: ["DEMONTAGE"] },
  { label: "Photos QR Code", buckets: ["QR_CODE"] },
  { label: "Photos Garantie", buckets: ["GARANTIE"] },
];

/** Compte les photos d'un projet pour un bucket donné (option : par cabine). */
function countBucket(
  project: ProjectPhotoSources,
  bucket: PhotoBucketKey,
  cabineIdx?: number,
): number {
  const field = BUCKET_NOTION_FIELD[bucket];
  const list = project[field] as { name: string }[] | undefined;
  return filterByBucket(list, bucket, cabineIdx, defaultBucketForField(field)).length;
}

/** Total de photos présentes pour un groupe (somme de ses buckets). */
function countGroup(
  project: ProjectPhotoSources,
  buckets: PhotoBucketKey[],
  cabineIdx?: number,
): number {
  return buckets.reduce((sum, b) => sum + countBucket(project, b, cabineIdx), 0);
}

/**
 * Photos OBLIGATOIRES manquantes (avec compteur have/min). Bloque l'envoi.
 * Mono ou multi-cabine (préfixe « Cabine N — » dans ce dernier cas).
 */
export function missingRequiredPhotos(
  project: ProjectPhotoSources,
  options: { multiCabine: boolean; nbCabines: number },
): RequiredPhotoShortfall[] {
  const shortfalls = (cabineIdx: number | undefined, prefix: string): RequiredPhotoShortfall[] =>
    REQUIRED_PHOTO_GROUPS.flatMap((g) => {
      const have = countGroup(project, g.buckets, cabineIdx);
      return have >= g.min ? [] : [{ label: `${prefix}${g.label}`, have, min: g.min }];
    });

  if (!options.multiCabine || options.nbCabines <= 1) return shortfalls(undefined, "");
  const out: RequiredPhotoShortfall[] = [];
  for (let i = 1; i <= options.nbCabines; i++) out.push(...shortfalls(i, `Cabine ${i} — `));
  return out;
}

/** Groupes RECOMMANDÉS absents (présence ≥1), au format texte. Contournable. */
export function missingOptionalPhotoLabels(
  project: ProjectPhotoSources,
  options: { multiCabine: boolean; nbCabines: number },
): string[] {
  const missing = (cabineIdx: number | undefined, prefix: string): string[] =>
    OPTIONAL_PHOTO_GROUPS.filter((g) => countGroup(project, g.buckets, cabineIdx) === 0).map(
      (g) => `${prefix}${g.label}`,
    );

  if (!options.multiCabine || options.nbCabines <= 1) return missing(undefined, "");
  const out: string[] = [];
  for (let i = 1; i <= options.nbCabines; i++) out.push(...missing(i, `Cabine ${i} — `));
  return out;
}

/** Liste les groupes de photos manquants au format texte, mono ou multi-cabine. */
export function missingBucketLabels(
  project: ProjectPhotoSources,
  options: { multiCabine: boolean; nbCabines: number },
): string[] {
  const missingGroups = (present: Set<PhotoBucketKey>) =>
    MISSING_CHECK_GROUPS.filter((g) => !g.buckets.some((b) => present.has(b))).map((g) => g.label);

  if (!options.multiCabine || options.nbCabines <= 1) {
    return missingGroups(bucketsPresent(project));
  }
  const out: string[] = [];
  for (let i = 1; i <= options.nbCabines; i++) {
    for (const label of missingGroups(bucketsPresent(project, i))) {
      out.push(`Cabine ${i} — ${label}`);
    }
  }
  return out;
}
