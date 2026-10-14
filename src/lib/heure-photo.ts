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
 * Seule la DATE fait obstacle : une photo d'un autre jour appartient à un
 * autre passage, et son heure n'a rien à dire sur celui-ci.
 *
 * Il y avait ici un second garde-fou : sans EXIF, l'heure n'était acceptée
 * que si elle décrivait une journée de moins de onze heures, de peur qu'un
 * envoi fait le soir n'inscrive « 21:34 ». Il refusait plus souvent qu'il ne
 * protégeait, et chaque refus ouvrait une fenêtre qui demandait l'heure à la
 * main — ce que Micael ne veut pas (14 octobre 2026). La règle est
 * désormais celle qu'il a posée : l'heure de départ est celle de la dernière
 * photo d'après intervention, ou la plus tardive des métadonnées de montage
 * et d'après intervention. En pratique le risque est faible : dès qu'une
 * photo du lot porte un EXIF, c'est lui qui parle, et à défaut la date du
 * fichier reste celle de la prise de vue, pas de l'envoi.
 */
export function departAcceptable(c: HeurePhoto, arrivee: string, jourRef: string): boolean {
  if (c.jour && jourRef && c.jour !== jourRef) return false;
  return true;
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
 * - photo d'APRÈS INTERVENTION : c'est la fin du chantier, et son heure fait
 *   foi dès qu'elle est postérieure. La règle est de Micael : le départ est
 *   l'heure de la dernière photo d'après intervention ;
 * - sinon (montage) on n'avance l'heure que sur une preuve sûre (EXIF plus
 *   tardif) et jamais en arrière : une heure saisie à la main n'est pas
 *   écrasée par une photo de milieu de pose.
 */
export function departApresPhoto(
  actuel: string,
  c: HeurePhoto,
  arrivee: string,
  jourRef: string,
  options: { finDuChantier?: boolean } = {},
): string | null {
  if (!departAcceptable(c, arrivee, jourRef)) return null;
  const nouveau = c.heure;
  const courant = minutesDe(actuel);
  if (courant < 0) return nouveau;
  const a = minutesDe(arrivee);
  if (a >= 0 && courant <= a) return nouveau === actuel ? null : nouveau;
  /* Pour AVANCER une heure déjà valable, il faut un témoignage de la prise de
     vue : l'EXIF partout, et la date du fichier sur la photo de fin. L'heure
     d'envoi seule ne suffit jamais — elle remplit un champ vide, elle
     n'écrase pas un départ correct par l'heure à laquelle le téléphone a
     retrouvé du réseau. */
  const temoigneDeLaPriseDeVue = c.source === "exif" || (c.source === "fichier" && !!options.finDuChantier);
  if (minutesDe(nouveau) > courant && temoigneDeLaPriseDeVue) return nouveau;
  return null;
}
