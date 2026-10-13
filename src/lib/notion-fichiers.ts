/**
 * Comment rendre à Notion un fichier qu'on lui a pris.
 *
 * Une propriété « Files » ne s'ajoute pas : elle se réécrit en entier. Pour
 * ajouter une photo il faut donc relire les précédentes et tout renvoyer
 * ensemble. Et c'est là que ça casse.
 *
 * Un fichier déposé DANS Notion (glissé dans la fiche, importé depuis
 * l'application Notion) y est hébergé : son adresse pointe chez Notion. Le
 * code renvoyait tout en « external », le type des fichiers qui vivent
 * ailleurs — chez Cloudinary pour nos photos. Notion refuse alors la
 * propriété ENTIÈRE :
 *
 *   « value at index 0 contains invalid url. A file with type 'external'
 *     cannot contain a Notion hosted file url. Use type 'file'. »
 *
 * Résultat : il suffisait qu'une seule photo ait été déposée à la main dans
 * Notion pour que plus aucune photo de l'app ne puisse être enregistrée dans
 * ce champ — et le message d'erreur, lui, parlait d'une URL invalide.
 *
 * Chaque fichier repart donc avec le type sous lequel Notion le connaît.
 */

/**
 * Adresses des fichiers hébergés par Notion.
 *
 * Notion a changé de domaine plusieurs fois ; les trois formes coexistent
 * dans une base qui a quelques années. On les reconnaît par l'hôte, jamais
 * par un morceau de chaîne quelque part dans l'adresse : un nom de fichier
 * peut contenir n'importe quoi.
 */
const HOTES_NOTION = [
  "prod-files-secure.s3.us-west-2.amazonaws.com",
  "s3.us-west-2.amazonaws.com",
  "secure.notion-static.com",
  "file.notion.so",
  "prod-files.notion-static.com",
];

/** Vrai si l'adresse désigne un fichier hébergé par Notion. */
export function estFichierNotion(url: string): boolean {
  if (!url) return false;
  let hote: string;
  try {
    hote = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (hote.endsWith(".notion-static.com") || hote === "notion-static.com") return true;
  if (hote.endsWith(".notion.so")) return true;
  return HOTES_NOTION.includes(hote);
}

export type DescripteurFichier =
  | { type: "external"; name: string; external: { url: string } }
  | { type: "file"; name: string; file: { url: string } };

/** L'adresse que porte un descripteur, quel que soit son type. */
export function urlDuDescripteur(d: DescripteurFichier): string {
  return d.type === "file" ? d.file.url : d.external.url;
}

/**
 * Le descripteur à renvoyer à Notion pour un fichier donné.
 *
 * Le nom est tronqué à cent caractères — la limite de Notion — et jamais
 * vide : un fichier sans nom est refusé.
 */
export function descripteurFichier(nom: string, url: string): DescripteurFichier {
  const name = String(nom || "fichier").slice(0, 100);
  return estFichierNotion(url)
    ? { type: "file", name, file: { url } }
    : { type: "external", name, external: { url } };
}
