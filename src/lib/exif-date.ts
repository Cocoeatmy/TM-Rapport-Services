/**
 * Heure de PRISE DE VUE d'une photo, lue dans ses métadonnées EXIF.
 *
 * Pourquoi : les monteurs envoient parfois leurs photos le soir, à la maison,
 * parce que l'upload passe mal sur le chantier. L'heure de l'envoi ne dit donc
 * rien de l'heure du travail — l'EXIF, si — et c'est la seule donnée qui
 * survit à un envoi différé.
 *
 * La lecture doit se faire sur le fichier ORIGINAL : la compression avant
 * upload (canvas) ré-encode l'image et détruit l'EXIF.
 *
 * L'heure EXIF est une heure murale sans fuseau : c'est précisément ce qu'on
 * veut (l'heure qu'il était sur le chantier). On la renvoie donc telle quelle,
 * en texte, sans jamais passer par un `Date` qui la décalerait.
 */

export interface DatePhoto {
  /** AAAA-MM-JJ */
  jour: string;
  /** HH:MM */
  heure: string;
}

/** Les 128 premiers Ko suffisent : l'EXIF est en tête de fichier. */
const TETE_OCTETS = 128 * 1024;

const TAG_DATETIME = 0x0132; // IFD0 — date de modification
const TAG_EXIF_IFD = 0x8769; // IFD0 — pointeur vers le bloc Exif
const TAG_DATETIME_ORIGINAL = 0x9003; // Exif — date de prise de vue
const TAG_DATETIME_DIGITIZED = 0x9004; // Exif — date de numérisation

/** "2026:10:08 09:29:31" → { jour: "2026-10-08", heure: "09:29" } */
export function parseDateExif(valeur: string): DatePhoto | null {
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2})/.exec((valeur || "").trim());
  if (!m) return null;
  const [, a, mo, j, h, mi] = m;
  if (a === "0000" || mo === "00" || j === "00") return null;
  return { jour: `${a}-${mo}-${j}`, heure: `${h}:${mi}` };
}

/** Lit une chaîne ASCII terminée par 0 dans le buffer. */
function lireAscii(vue: DataView, debut: number, longueur: number): string {
  let out = "";
  for (let i = 0; i < longueur; i++) {
    const c = vue.getUint8(debut + i);
    if (c === 0) break;
    out += String.fromCharCode(c);
  }
  return out;
}

/**
 * Parcourt un IFD TIFF et renvoie la valeur ASCII des tags demandés, plus le
 * pointeur vers le bloc Exif s'il est présent.
 */
function lireIFD(
  vue: DataView,
  tiff: number,
  ifd: number,
  bigEndian: boolean,
  tags: number[],
): { valeurs: Map<number, string>; exifIFD: number } {
  const valeurs = new Map<number, string>();
  let exifIFD = 0;
  if (ifd + 2 > vue.byteLength) return { valeurs, exifIFD };
  const n = vue.getUint16(ifd, !bigEndian);
  for (let i = 0; i < n; i++) {
    const e = ifd + 2 + i * 12;
    if (e + 12 > vue.byteLength) break;
    const tag = vue.getUint16(e, !bigEndian);
    if (tag === TAG_EXIF_IFD) {
      exifIFD = tiff + vue.getUint32(e + 8, !bigEndian);
      continue;
    }
    if (!tags.includes(tag)) continue;
    const compte = vue.getUint32(e + 4, !bigEndian);
    /* ≤ 4 octets : la valeur tient dans le champ lui-même ; au-delà, le champ
       porte un décalage depuis le début du bloc TIFF. */
    const pos = compte <= 4 ? e + 8 : tiff + vue.getUint32(e + 8, !bigEndian);
    if (pos < 0 || pos + Math.min(compte, 20) > vue.byteLength) continue;
    valeurs.set(tag, lireAscii(vue, pos, Math.min(compte, 20)));
  }
  return { valeurs, exifIFD };
}

/**
 * Cherche le bloc EXIF d'un JPEG et en extrait la date de prise de vue.
 * Renvoie `null` pour tout fichier sans EXIF exploitable (PNG, capture
 * d'écran, image déjà ré-encodée…) — l'appelant se rabat alors sur autre chose.
 */
export function dateExifDepuisBuffer(buffer: ArrayBuffer): DatePhoto | null {
  const vue = new DataView(buffer);
  if (vue.byteLength < 4 || vue.getUint16(0) !== 0xffd8) return null; // pas un JPEG

  let p = 2;
  while (p + 4 <= vue.byteLength) {
    if (vue.getUint8(p) !== 0xff) break; // flux désynchronisé
    const marqueur = vue.getUint8(p + 1);
    if (marqueur === 0xd8 || marqueur === 0x01 || (marqueur >= 0xd0 && marqueur <= 0xd7)) {
      p += 2;
      continue;
    }
    if (marqueur === 0xda || marqueur === 0xd9) break; // début des données image
    const taille = vue.getUint16(p + 2);
    if (taille < 2) break;
    if (marqueur === 0xe1 && p + 10 <= vue.byteLength) {
      // APP1 : "Exif\0\0" puis l'en-tête TIFF
      if (lireAscii(vue, p + 4, 4) === "Exif") {
        const tiff = p + 10;
        if (tiff + 8 > vue.byteLength) return null;
        const ordre = vue.getUint16(tiff);
        if (ordre !== 0x4949 && ordre !== 0x4d4d) return null;
        const bigEndian = ordre === 0x4d4d;
        if (vue.getUint16(tiff + 2, !bigEndian) !== 0x002a) return null;
        const ifd0 = tiff + vue.getUint32(tiff + 4, !bigEndian);
        const base = lireIFD(vue, tiff, ifd0, bigEndian, [TAG_DATETIME]);
        if (base.exifIFD) {
          const exif = lireIFD(vue, tiff, base.exifIFD, bigEndian, [
            TAG_DATETIME_ORIGINAL,
            TAG_DATETIME_DIGITIZED,
          ]);
          const prise =
            exif.valeurs.get(TAG_DATETIME_ORIGINAL) || exif.valeurs.get(TAG_DATETIME_DIGITIZED);
          const d = prise ? parseDateExif(prise) : null;
          if (d) return d;
        }
        const brute = base.valeurs.get(TAG_DATETIME);
        return brute ? parseDateExif(brute) : null;
      }
    }
    p += 2 + taille;
  }
  return null;
}

/** Idem, à partir d'un fichier choisi dans le navigateur (lecture de la tête). */
export async function dateExifDuFichier(file: File): Promise<DatePhoto | null> {
  try {
    const tete = file.slice(0, Math.min(TETE_OCTETS, file.size));
    const buffer = await tete.arrayBuffer();
    return dateExifDepuisBuffer(buffer);
  } catch {
    return null;
  }
}
