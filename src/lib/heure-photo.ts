/**
 * De quelle heure une photo témoigne-t-elle — et peut-on l'écrire sans rien
 * demander au monteur ?
 *
 * Règle métier : l'heure de départ d'un chantier est l'heure de la dernière
 * photo « après intervention / montage ». Deux usages coexistent sur le
 * terrain, et il faut servir les deux sans poser de question dans le cas
 * courant :
 *
 *   1. Envoi sur place, juste avant de partir → l'heure de l'envoi est juste.
 *   2. Envoi le soir à la maison (l'upload passe mal sur le chantier) →
 *      l'heure de l'envoi ne veut plus rien dire. Seule la date de PRISE DE
 *      VUE (EXIF), qui voyage avec la photo, dit l'heure du travail.
 *
 * D'où l'ordre : EXIF d'abord, date du fichier ensuite, heure d'envoi en
 * dernier — et un garde-fou qui refuse d'écrire une heure invraisemblable
 * plutôt que d'en inventer une.
 */

import { dateExifDuFichier, type DatePhoto } from "@/lib/exif-date";

export type SourceHeure = "exif" | "fichier" | "envoi";

export interface HeurePhoto extends DatePhoto {
  /** D'où vient l'heure — « exif » seule fait foi pour un envoi différé. */
  source: SourceHeure;
}

/** Journée de travail la plus longue qu'on accepte sans confirmation. */
export const JOURNEE_MAX_MIN = 11 * 60;

export function minutesDe(heure: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec((heure || "").trim());
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : -1;
}

function horodate(d: Date): DatePhoto {
  const p2 = (n: number) => String(n).padStart(2, "0");
  return {
    jour: `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`,
    heure: `${p2(d.getHours())}:${p2(d.getMinutes())}`,
  };
}

function rang(h: HeurePhoto): string {
  return `${h.jour} ${h.heure}`;
}

/**
 * Heure retenue pour un lot de photos : la PLUS TARDIVE pour une fin
 * d'intervention, la plus précoce pour un début. Le code se contentait de la
 * première photo du lot, qui n'est ni l'une ni l'autre — l'ordre d'un envoi
 * multiple n'a rien de chronologique.
 *
 * Dès qu'une seule photo du lot porte un EXIF, les autres sont ignorées : une
 * capture d'écran glissée dans la sélection ne doit pas imposer l'heure de
 * l'envoi à tout le lot.
 */
export async function heureDesPhotos(
  files: File[],
  genre: "debut" | "fin",
  maintenant: Date = new Date(),
): Promise<HeurePhoto | null> {
  if (!files || files.length === 0) return null;
  const lues: HeurePhoto[] = [];
  for (const f of files) {
    const exif = await dateExifDuFichier(f);
    if (exif) {
      lues.push({ ...exif, source: "exif" });
      continue;
    }
    const ts = typeof f.lastModified === "number" && f.lastModified > 0 ? f.lastModified : 0;
    lues.push(
      ts
        ? { ...horodate(new Date(ts)), source: "fichier" }
        : { ...horodate(maintenant), source: "envoi" },
    );
  }
  const exifs = lues.filter((h) => h.source === "exif");
  const retenues = exifs.length > 0 ? exifs : lues;
  return retenues.reduce((best, h) =>
    genre === "fin"
      ? (rang(h) > rang(best) ? h : best)
      : (rang(h) < rang(best) ? h : best),
  );
}

/**
 * Peut-on poser cette heure d'arrivée telle quelle ? Une photo prise un autre
 * jour appartient à un autre passage, pas à celui-ci.
 */
export function arriveeAcceptable(c: HeurePhoto, jourRef: string): boolean {
  if (c.jour && jourRef && c.jour !== jourRef) return false;
  return true;
}

/**
 * Peut-on poser cette heure de départ telle quelle ?
 *
 * Avec un EXIF, oui : l'heure est celle de la prise de vue, même si la photo
 * part le soir. Sans EXIF, on n'a que l'heure de l'envoi : on ne l'accepte que
 * si elle décrit une journée plausible — sinon c'est un envoi différé, et
 * écrire « 21:34 » comme heure de départ serait un faux.
 */
export function departAcceptable(c: HeurePhoto, arrivee: string, jourRef: string): boolean {
  if (c.jour && jourRef && c.jour !== jourRef) return false;
  if (c.source === "exif") return true;
  const a = minutesDe(arrivee);
  if (a < 0) return true; // pas d'arrivée connue : rien à contredire
  const d = minutesDe(c.heure) - a;
  return d > 0 && d <= JOURNEE_MAX_MIN;
}

/**
 * Une heure de départ déjà posée tient-elle debout ? Un champ vide, ou un
 * départ antérieur ou égal à l'arrivée (chrono arrêté par mégarde), n'est pas
 * une heure de départ : il faut la retrouver, par la photo ou en la demandant.
 */
export function departValable(depart?: string | null, arrivee?: string | null): boolean {
  const d = minutesDe(depart || "");
  if (d < 0) return false;
  const a = minutesDe(arrivee || "");
  return a < 0 ? true : d > a;
}

/**
 * Nouvelle heure de départ à écrire après l'ajout de photos de fin — ou
 * `null` s'il ne faut rien toucher.
 *
 * - champ vide → on le remplit ;
 * - départ antérieur ou égal à l'arrivée → fausse manœuvre (chrono arrêté par
 *   erreur juste après l'avoir lancé) : la photo corrige. C'est le cas qui
 *   laissait des rapports « arrivée 08:06 / départ 08:06 » ;
 * - sinon on n'avance l'heure que sur une preuve sûre (EXIF plus tardif) et
 *   jamais en arrière : une heure saisie à la main n'est pas écrasée.
 */
export function departApresPhoto(
  actuel: string,
  c: HeurePhoto,
  arrivee: string,
  jourRef: string,
): string | null {
  if (!departAcceptable(c, arrivee, jourRef)) return null;
  const nouveau = c.heure;
  const courant = minutesDe(actuel);
  if (courant < 0) return nouveau;
  const a = minutesDe(arrivee);
  if (a >= 0 && courant <= a) return nouveau === actuel ? null : nouveau;
  if (c.source === "exif" && minutesDe(nouveau) > courant) return nouveau;
  return null;
}
