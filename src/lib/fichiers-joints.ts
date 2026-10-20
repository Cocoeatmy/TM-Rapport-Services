/**
 * Les fichiers joints : photos, vidéos, et tout le reste (PDF, Word, Excel…).
 *
 * Les zones d'envoi n'acceptaient que des images. On peut désormais y joindre
 * n'importe quel fichier : un bon de livraison en PDF, une vidéo d'un défaut,
 * un tableau Excel. La chaîne d'envoi le savait déjà (Cloudinary « raw » pour
 * les documents, « video » pour les vidéos) ; ce qui manquait, c'est de les
 * reconnaître PARTOUT où l'on affiche une vignette : une adresse de PDF
 * passée à une balise <img> — ou au moteur des rapports PDF — donnait une
 * image cassée, voire un rapport qui échoue.
 *
 * Ce module ne dépend de rien : utilisable dans les pages et sur le serveur.
 */

/** Les zones « fichiers » : tout est permis (photo, vidéo, document). */
export const ACCEPTE_TOUT = undefined;
/** Les boutons « appareil photo » : photo ou vidéo prise sur le moment. */
export const ACCEPTE_CAMERA = "image/*,video/*";

const EXT_IMAGE = /\.(jpe?g|png|gif|webp|heic|heif|avif|bmp|tiff?)(\?|#|$)/i;
const EXT_VIDEO = /\.(mp4|mov|m4v|webm|avi|3gp|mkv)(\?|#|$)/i;

/** L'extension d'une adresse (« pdf », « docx »…), sans le point, ou "". */
export function extensionDe(url: string | null | undefined): string {
  const chemin = String(url || "").split(/[?#]/)[0];
  const m = /\.([a-z0-9]{1,5})$/i.exec(chemin);
  return m ? m[1].toLowerCase() : "";
}

export function estVideoUrl(url: string | null | undefined): boolean {
  const u = String(url || "");
  return u.includes("/video/upload/") || EXT_VIDEO.test(u.split("#")[0]);
}

/**
 * Un DOCUMENT (ni photo ni vidéo) : PDF, Word, Excel, texte, archive…
 * Cloudinary les range sous « /raw/upload/ » ; ailleurs (Notion, anciens
 * envois), on se fie à l'extension. Une adresse sans extension reconnue
 * reste traitée comme une image — c'est le cas de toutes les photos.
 */
export function estDocumentUrl(url: string | null | undefined): boolean {
  const u = String(url || "");
  if (!u || u.startsWith("data:image/") || u.startsWith("blob:")) return false;
  if (u.includes("/raw/upload/")) return true;
  if (u.includes("/image/upload/") && extensionDe(u) === "pdf") return true;
  if (estVideoUrl(u) || EXT_IMAGE.test(u.split("#")[0])) return false;
  return extensionDe(u) !== "" && !/^(jpe?g|png|gif|webp|heic|heif|avif)$/.test(extensionDe(u))
    && /^(pdf|docx?|xlsx?|pptx?|csv|txt|rtf|odt|ods|odp|zip|pages|numbers|key|eml|msg|dwg|dxf)$/.test(extensionDe(u));
}

/** Le nom du fichier, lisible (« Bon_de_livraison.pdf »). */
export function nomDuFichier(url: string | null | undefined): string {
  const chemin = String(url || "").split(/[?#]/)[0];
  const brut = chemin.slice(chemin.lastIndexOf("/") + 1) || "document";
  try { return decodeURIComponent(brut); } catch { return brut; }
}

/** L'étiquette courte d'un type de document : PDF, DOC, XLS… */
export function etiquetteDocument(url: string | null | undefined): string {
  const e = extensionDe(url);
  if (e === "docx" || e === "doc" || e === "odt" || e === "rtf" || e === "pages") return "DOC";
  if (e === "xlsx" || e === "xls" || e === "ods" || e === "csv" || e === "numbers") return "XLS";
  if (e === "pptx" || e === "ppt" || e === "odp" || e === "key") return "PPT";
  return (e || "doc").toUpperCase().slice(0, 4);
}

/**
 * Une vignette pour un document : une icône dessinée (SVG en data URI),
 * lisible dans toute balise <img> — pas de requête, pas d'image cassée.
 */
export function iconeDocument(url: string | null | undefined): string {
  const etiquette = etiquetteDocument(url);
  const couleur = etiquette === "PDF" ? "#dc2626" : etiquette === "DOC" ? "#2563eb" : etiquette === "XLS" ? "#15803d" : "#475569";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="#f1f5f9"/>`
    + `<path d="M38 18h32l20 20v62a4 4 0 0 1-4 4H38a4 4 0 0 1-4-4V22a4 4 0 0 1 4-4z" fill="#fff" stroke="#cbd5e1" stroke-width="3"/>`
    + `<path d="M70 18v20h20" fill="none" stroke="#cbd5e1" stroke-width="3"/>`
    + `<rect x="26" y="62" width="${Math.max(36, etiquette.length * 13 + 14)}" height="24" rx="4" fill="${couleur}"/>`
    + `<text x="${26 + Math.max(36, etiquette.length * 13 + 14) / 2}" y="79" font-family="-apple-system,Helvetica,Arial,sans-serif" font-size="15" font-weight="700" fill="#fff" text-anchor="middle">${etiquette}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** L'image d'aperçu d'une vidéo Cloudinary (première image), ou null. */
export function affichePosterVideo(url: string, largeur = 400): string | null {
  const marque = "/video/upload/";
  const i = url.indexOf(marque);
  if (i < 0) return null;
  const suite = url.slice(i + marque.length).replace(/^(?:[a-z]+_[^,/]+,?)+\//i, "").replace(/\.[a-z0-9]+(\?.*)?$/i, ".jpg");
  return `${url.slice(0, i + marque.length)}so_0,w_${largeur},c_fill,ar_1:1,q_auto/${suite}`;
}
