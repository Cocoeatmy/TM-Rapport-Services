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
  | "SAV_PIECES"
  | "SAV_RETOUCHE"
  /** Le numéro du lot, sur la porte de l'appartement. */
  | "NUMERO_LOT"
  /** Une vidéo du montage — ce qu'une photo ne montre pas. */
  | "VIDEO_MONTAGE";

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
  SAV_PIECES: "SAV pieces",
  SAV_RETOUCHE: "SAV",
  NUMERO_LOT: "Numero lot",
  VIDEO_MONTAGE: "Video montage",
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
  SAV_DEMANDE: "Documents SAV (photos, vidéos ou PDF de la demande)",
  SAV_PIECES: "Photos des cartons SAV reçus",
  SAV_RETOUCHE: "SAV / Retouches une fois réglé (photos, vidéos ou PDF)",
  NUMERO_LOT: "Photos numéro de Lot",
  VIDEO_MONTAGE: "Vidéo Montage",
};

/** Texte d'instruction affiché en sous-titre dans le rapport (null = aucun). */
export const BUCKET_HINT: Partial<Record<PhotoBucketKey, string>> = {
  AVANT_INTERVENTION: "1 photo des lieux + 1 photo de l'état du receveur de douche",
  DEMONTAGE:          "1 photo de l'état après démontage + 1 photo après nettoyage",
  APRES_INTERVENTION: "1 photo de l'état du receveur de douche + 1 photo de l'état de la salle de douche",
  NUMERO_LOT:         "Le numéro affiché sur la porte de l'appartement",
  VIDEO_MONTAGE:      "Ce qu'une photo ne montre pas — un jeu, un frottement, une manœuvre (1 minute au maximum)",
  SAV_DEMANDE:        "Le constat du client, un devis, un plan — tout se joint au rapport SAV",
  SAV_RETOUCHE:       "Ce qui prouve que c'est réglé — photo, vidéo ou document",
};

// Mapping bucket → champ Notion qui stocke ses fichiers.
export const BUCKET_NOTION_FIELD: Record<
  PhotoBucketKey,
  "photosAvant" | "photosDemontage" | "photosMontage" | "photosQRCode" | "photosGaranties" | "photosSavRetouches" | "documentsSavDemande" | "photosNumeroLot" | "videosMontage"
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
  /* Les cartons partagent la colonne « Documents SAV » : c'est le préfixe
     du nom de fichier qui les distingue, comme pour tous les autres
     sous-buckets. Le rapport SAV les écarte explicitement. */
  SAV_PIECES: "documentsSavDemande",
  SAV_DEMANDE: "documentsSavDemande",
  SAV_RETOUCHE: "photosSavRetouches",
  /* Chacune a sa propre colonne Notion : pas de sous-groupe à distinguer,
     mais le préfixe « Cab{n} » reste porté par le nom de fichier — c'est lui
     qui rattache la photo à SON appartement. */
  NUMERO_LOT: "photosNumeroLot",
  VIDEO_MONTAGE: "videosMontage",
};

// Ordre d'affichage demandé par le client.
export const BUCKET_ORDER: PhotoBucketKey[] = [
  "NUMERO_LOT",
  "AVANT_INTERVENTION",
  "AVANT_MONTAGE",
  "DEMONTAGE",
  "MONTAGE_GAUCHE",
  "MONTAGE_CENTRE",
  "MONTAGE_DROITE",
  "APRES_INTERVENTION",
  "QR_CODE",
  "GARANTIE",
  "VIDEO_MONTAGE",
  "SAV_DEMANDE",
  "SAV_PIECES",
  "SAV_RETOUCHE",
];

// Bucket par défaut pour un fichier non préfixé dans un champ Notion donné.
// On choisit celui qui correspond à l'ancien comportement, afin que les
// photos déjà uploadées avant ce refactor restent visibles à un seul endroit.
export function defaultBucketForField(
  field: "photosAvant" | "photosDemontage" | "photosMontage" | "photosQRCode" | "photosGaranties" | "photosSavRetouches" | "documentsSavDemande" | "photosNumeroLot" | "videosMontage",
): PhotoBucketKey {
  if (field === "photosAvant") return "AVANT_INTERVENTION";
  if (field === "photosDemontage") return "DEMONTAGE";
  if (field === "photosMontage") return "MONTAGE_CENTRE";
  if (field === "photosQRCode") return "QR_CODE";
  if (field === "photosSavRetouches") return "SAV_RETOUCHE";
  if (field === "documentsSavDemande") return "SAV_DEMANDE";
  if (field === "photosNumeroLot") return "NUMERO_LOT";
  if (field === "videosMontage") return "VIDEO_MONTAGE";
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
  /** Colonne Notion « Type de services » — dit ce que ce chantier comporte. */
  typeServices?: string[] | null;
  photosAvant?: { name: string }[];
  photosDemontage?: { name: string }[];
  photosMontage?: { name: string }[];
  photosQRCode?: { name: string }[];
  photosGaranties?: { name: string }[];
  photosSavRetouches?: { name: string }[];
  documentsSavDemande?: { name: string }[];
  photosNumeroLot?: { name: string }[];
  videosMontage?: { name: string }[];
}

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

/**
 * Nombre de photos exigées sur une cabine posée — la somme des groupes
 * ci-dessus. Exporté pour que la statistique de conformité se cale sur la
 * règle appliquée à l'envoi, au lieu d'en tenir une copie qui dériverait.
 */
export const TOTAL_PHOTOS_REQUISES = REQUIRED_PHOTO_GROUPS.reduce((s, g) => s + g.min, 0);
/**
 * Le chantier comporte-t-il un démontage ?
 *
 * La colonne Notion « Type de services » le dit — c'est une liste à cocher où
 * figurent « Mesures », « Démontage », « Montages », « Services », « SAV »,
 * « Livraison ». Hors démontage, réclamer des photos de démontage n'a aucun
 * sens, et un rappel qui se déclenche à chaque enregistrement finit par se
 * cliquer sans être lu — y compris les fois où il avait raison.
 */
export function chantierAvecDemontage(project: ProjectPhotoSources): boolean {
  return (project.typeServices || []).some((t) => /d[ée]montage/i.test(String(t || "")));
}

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
  options: {
    multiCabine: boolean;
    nbCabines: number;
    /* Les photos encore sur le téléphone comptent AUTANT que celles déjà
       chez Notion. Sans elles, un monteur qui a tout photographié sans
       réseau se voyait refuser l'envoi avec « 0/2, 0/3, 0/2 » alors que ses
       sept photos étaient là, en train de partir (chantier Defferard,
       16 octobre 2026). */
    locales?: readonly PhotoLocale[];
  },
): RequiredPhotoShortfall[] {
  const shortfalls = (cabineIdx: number | undefined, prefix: string): RequiredPhotoShortfall[] =>
    REQUIRED_PHOTO_GROUPS.flatMap((g) => {
      const have = countGroup(project, g.buckets, cabineIdx)
        + compteLocalesGroupe(options.locales || [], g.buckets, cabineIdx);
      return have >= g.min ? [] : [{ label: `${prefix}${g.label}`, have, min: g.min }];
    });

  if (!options.multiCabine || options.nbCabines <= 1) return shortfalls(undefined, "");
  const out: RequiredPhotoShortfall[] = [];
  for (let i = 1; i <= options.nbCabines; i++) out.push(...shortfalls(i, `Cabine ${i} — `));
  return out;
}

/* ── Les photos qui ne sont encore que sur le téléphone ─────────────────── */

/** Une photo posée sur l'appareil, en attente d'envoi. */
export interface PhotoLocale {
  name: string;
  notionField?: string;
  /** « pending » : la file réessaie. « permanently-failed » : elle attend un geste. */
  statut: "pending" | "permanently-failed";
}

/**
 * Combien de photos LOCALES appartiennent à ce groupe de planches.
 *
 * Le rattachement se lit dans le nom du fichier — « Montage gauche.Cab3.2… » —
 * exactement comme pour les photos déjà chez Notion, et par le même filtre :
 * une seule façon de décider à quelle planche appartient une photo.
 *
 * Piège : la file retient le LIBELLÉ de la colonne Notion (« Photos avant
 * montage ») là où le projet porte sa clé (`photosAvant`). On accepte les
 * deux — ne reconnaître qu'une seule écriture revient à ne rien compter.
 */
export function compteLocalesGroupe(
  locales: readonly PhotoLocale[],
  buckets: readonly PhotoBucketKey[],
  cabineIdx?: number,
): number {
  if (!locales.length) return 0;
  let total = 0;
  for (const bucket of buckets) {
    const champ = BUCKET_NOTION_FIELD[bucket];
    const libelle = BUCKET_NOTION_LABEL[champ];
    const liste = locales.filter((l) => l.notionField === champ || l.notionField === libelle);
    total += filterByBucket(liste, bucket, cabineIdx, defaultBucketForField(champ)).length;
  }
  return total;
}

/**
 * Le NOM de la colonne Notion, tel que l'API l'attend au rattachement.
 *
 * Deux conventions coexistent : la clé du projet côté app (`photosAvant`) et
 * le libellé de la colonne côté Notion (« Photos avant montage »). La file
 * d'attente des envois stocke le second ; le compte des photos doit donc
 * savoir traduire, sous peine de ne rien reconnaître.
 */
export const BUCKET_NOTION_LABEL: Record<
  "photosAvant" | "photosDemontage" | "photosMontage" | "photosQRCode" | "photosGaranties"
  | "photosSavRetouches" | "documentsSavDemande" | "photosNumeroLot" | "videosMontage",
  string
> = {
  photosAvant: "Photos avant montage",
  photosDemontage: "Photos démontage",
  photosMontage: "Photos montage terminé",
  photosQRCode: "Photos QR Code",
  photosGaranties: "Photos garanties",
  photosSavRetouches: "Photos SAV / Retouches cabines",
  documentsSavDemande: "Documents SAV",
  photosNumeroLot: "Photos numéro de Lot",
  videosMontage: "Vidéo Montage",
};

/**
 * Combien de photos un groupe exige — 0 s'il est facultatif.
 *
 * L'assistant pas à pas s'en sert pour bloquer le passage à l'étape suivante.
 * Il lit la MÊME table que le contrôle d'envoi : une planche qu'on a pu
 * franchir ne peut plus se faire refuser à la fin, et il n'y a pas deux
 * chiffres à tenir à jour.
 */
export function minimumRequis(buckets: readonly PhotoBucketKey[]): number {
  const cle = [...buckets].sort().join("|");
  const groupe = REQUIRED_PHOTO_GROUPS.find((g) => [...g.buckets].sort().join("|") === cle);
  return groupe ? groupe.min : 0;
}

/** Photos déjà prises pour un groupe de buckets (option : par cabine). */
export function comptePhotosGroupe(
  project: ProjectPhotoSources,
  buckets: readonly PhotoBucketKey[],
  cabineIdx?: number,
): number {
  return countGroup(project, [...buckets], cabineIdx);
}

/* ── « Il n'y en a pas » ────────────────────────────────────────────────────
   Toutes les cabines n'ont pas de QR code, toutes les poses ne donnent pas
   lieu à une garantie, et la vidéo reste exceptionnelle. Sans moyen de le
   DIRE, le rappel revenait à chaque enregistrement sur des planches qui
   n'auraient jamais rien à recevoir — et un rappel qu'on apprend à cliquer
   sans lire ne sert plus les fois où il a raison. Le monteur coche donc
   l'absence, une fois, et elle est consignée. */

/** Les planches dont on peut déclarer qu'elles n'ont pas lieu d'être. */
export const BUCKETS_DECLARABLES_ABSENTS: PhotoBucketKey[] = ["QR_CODE", "GARANTIE", "VIDEO_MONTAGE"];

/** Ce que dit la case à cocher, planche par planche. */
export const LIBELLE_ABSENCE: Partial<Record<PhotoBucketKey, string>> = {
  QR_CODE: "Pas de QR Code",
  GARANTIE: "Pas de garantie",
  VIDEO_MONTAGE: "Pas de vidéo",
};

/* Le rappel « photos recommandées non ajoutées » a été RETIRÉ le 14 octobre
   2026, à la demande de Micael. Il listait démontage, QR code et garantie —
   les trois cas désormais traités à la source : le démontage s'ajoute d'un
   bouton depuis la planche « avant intervention », le QR code et la garantie
   se déclarent absents d'une case à cocher. Le seul contrôle qui reste est
   celui qui BLOQUE (missingRequiredPhotos) : deux photos avant, trois au
   montage, deux après. Ne pas réintroduire de rappel contournable — on
   apprend à le cliquer sans le lire, et il finit par couvrir les fois où il
   avait raison. */

