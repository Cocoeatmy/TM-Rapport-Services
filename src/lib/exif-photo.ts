/**
 * La date de prise de vue, lue dans la photo elle-même.
 *
 * Le rapport affichait jusqu'ici l'heure à laquelle la photo entrait dans
 * la file d'envoi. Micael l'a vu tout de suite : « 9 h 02 pour une photo
 * d'avant montage, alors que le montage dure quarante-cinq minutes ». Il
 * avait raison — cette heure-là ne dit pas quand le cliché a été pris,
 * seulement quand il a été ajouté.
 *
 * La vraie date est dans le fichier, dans son bloc EXIF. Sauf qu'elle n'y
 * est plus quand elle arrive chez nous : la compression — celle qui rend
 * les envois fiables en 5G — redessine l'image sur un canvas et n'en
 * ressort que des pixels. Vérifié sur trente photos chez Cloudinary :
 * zéro date de prise de vue.
 *
 * On la lit donc AVANT, sur le fichier tel que le téléphone le donne, et
 * on la garde.
 *
 * ── POURQUOI PAS UNE BIBLIOTHÈQUE ───────────────────────────────────────
 *
 * On ne cherche qu'un champ : `DateTimeOriginal`. Le trouver demande de
 * suivre trois sauts dans l'en-tête JPEG — APP1, TIFF, sous-répertoire
 * EXIF. C'est court, c'est figé depuis trente ans, et cela évite
 * d'ajouter des dizaines de kilo-octets au paquet que les monteurs
 * téléchargent sur un chantier.
 *
 * ── CE QU'ON NE SAIT PAS LIRE, ET ON LE DIT ─────────────────────────────
 *
 * Un HEIC range ses métadonnées autrement : on renvoie `null` plutôt que
 * d'inventer. En pratique Safari convertit en JPEG à l'envoi, mais la
 * limite existe et l'écran ne doit jamais faire passer une heure d'ajout
 * pour une heure de prise de vue.
 */

/** Étiquette EXIF de la date de prise de vue, et ses deux variantes. */
const TAG_DATE_ORIGINALE = 0x9003; // DateTimeOriginal
const TAG_DATE_NUMERISEE = 0x9004; // DateTimeDigitized
const TAG_DATE_FICHIER = 0x0132;   // DateTime (modification)
const TAG_SOUS_IFD_EXIF = 0x8769;  // ExifOffset

/** « 2026:10:16 08:12:30 » → millisecondes, en heure locale de l'appareil. */
export function dateExifEnMs(brut: string): number | null {
  const m = String(brut || "").match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, a, mo, j, h, mi, s] = m.map(Number) as unknown as number[];
  /* L'EXIF n'a pas de fuseau : l'heure est celle qu'affichait l'appareil.
     On la construit en heure locale, qui est celle du chantier. */
  const d = new Date(a, mo - 1, j, h, mi, s);
  const ms = d.getTime();
  if (!Number.isFinite(ms)) return null;
  const annee = d.getFullYear();
  if (annee < 2000 || annee > 2100) return null;
  return ms;
}

/**
 * Parcourt un répertoire TIFF et rend la première étiquette voulue.
 * Rend aussi le décalage du sous-répertoire EXIF s'il le croise.
 */
function lireRepertoire(
  vue: DataView,
  debutTiff: number,
  debutIFD: number,
  petitBoutiste: boolean,
): { dates: Map<number, string>; sousIFD: number | null } {
  const dates = new Map<number, string>();
  let sousIFD: number | null = null;
  if (debutIFD + 2 > vue.byteLength) return { dates, sousIFD };
  const nb = vue.getUint16(debutIFD, petitBoutiste);
  for (let i = 0; i < nb; i++) {
    const e = debutIFD + 2 + i * 12;
    if (e + 12 > vue.byteLength) break;
    const tag = vue.getUint16(e, petitBoutiste);
    const type = vue.getUint16(e + 2, petitBoutiste);
    const nombre = vue.getUint32(e + 4, petitBoutiste);

    if (tag === TAG_SOUS_IFD_EXIF && type === 4) {
      sousIFD = debutTiff + vue.getUint32(e + 8, petitBoutiste);
      continue;
    }
    if (tag !== TAG_DATE_ORIGINALE && tag !== TAG_DATE_NUMERISEE && tag !== TAG_DATE_FICHIER) continue;
    /* Type 2 = chaîne ASCII, « 2026:10:16 08:12:30\0 » = 20 octets. */
    if (type !== 2 || nombre < 19) continue;
    const ou = debutTiff + vue.getUint32(e + 8, petitBoutiste);
    if (ou + 19 > vue.byteLength) continue;
    let texte = "";
    for (let k = 0; k < 19; k++) texte += String.fromCharCode(vue.getUint8(ou + k));
    dates.set(tag, texte);
  }
  return { dates, sousIFD };
}

/**
 * La date de prise de vue d'un JPEG, en millisecondes, ou `null`.
 *
 * On ne lit que le début du fichier : l'en-tête EXIF s'y trouve toujours,
 * et il serait absurde de charger dix mégaoctets en mémoire sur un
 * téléphone pour vingt octets de date.
 */
export function dateDePriseDeVue(octets: ArrayBuffer): number | null {
  const vue = new DataView(octets);
  if (vue.byteLength < 4) return null;
  /* Un JPEG commence par 0xFFD8. Autre chose — HEIC, PNG — : on ne sait
     pas, et on le dit en rendant null. */
  if (vue.getUint16(0) !== 0xffd8) return null;

  let pos = 2;
  while (pos + 4 <= vue.byteLength) {
    if (vue.getUint8(pos) !== 0xff) break;
    const marqueur = vue.getUint8(pos + 1);
    /* 0xDA = début des données image : l'en-tête est passé. */
    if (marqueur === 0xda) break;
    const taille = vue.getUint16(pos + 2);
    if (taille < 2) break;

    if (marqueur === 0xe1) {
      const app1 = pos + 4;
      /* « Exif\0\0 » */
      if (app1 + 6 <= vue.byteLength
        && vue.getUint32(app1) === 0x45786966
        && vue.getUint16(app1 + 4) === 0) {
        const tiff = app1 + 6;
        if (tiff + 8 > vue.byteLength) return null;
        const ordre = vue.getUint16(tiff);
        const petitBoutiste = ordre === 0x4949;
        if (!petitBoutiste && ordre !== 0x4d4d) return null;
        if (vue.getUint16(tiff + 2, petitBoutiste) !== 42) return null;
        const ifd0 = tiff + vue.getUint32(tiff + 4, petitBoutiste);

        const premier = lireRepertoire(vue, tiff, ifd0, petitBoutiste);
        let dates = premier.dates;
        if (premier.sousIFD !== null) {
          const sous = lireRepertoire(vue, tiff, premier.sousIFD, petitBoutiste);
          /* Le sous-répertoire porte la VRAIE prise de vue ; IFD0 ne
             connaît que la date de dernière modification du fichier. */
          if (sous.dates.size > 0) dates = new Map([...dates, ...sous.dates]);
        }
        for (const tag of [TAG_DATE_ORIGINALE, TAG_DATE_NUMERISEE, TAG_DATE_FICHIER]) {
          const brut = dates.get(tag);
          if (brut) {
            const ms = dateExifEnMs(brut);
            if (ms !== null) return ms;
          }
        }
        return null;
      }
    }
    pos += 2 + taille;
  }
  return null;
}

/** Combien d'octets suffisent pour l'en-tête : 256 Ko couvrent large. */
const ENTETE_OCTETS = 256 * 1024;

/**
 * La date de prise de vue d'un fichier choisi par le monteur.
 *
 * Jamais d'exception : une photo sans EXIF est le cas normal (capture
 * d'écran, image reçue par message), pas une erreur.
 */
export async function priseDeVueDuFichier(fichier: File): Promise<number | null> {
  try {
    if (!fichier.type.startsWith("image/")) return null;
    const debut = fichier.slice(0, Math.min(ENTETE_OCTETS, fichier.size));
    return dateDePriseDeVue(await debut.arrayBuffer());
  } catch {
    return null;
  }
}
