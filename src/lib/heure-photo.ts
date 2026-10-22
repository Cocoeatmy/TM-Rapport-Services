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
 *
 * Ni après le départ déjà noté : le 20 octobre 2026, une photo « avant
 * intervention » ajoutée à 13 h 12 sur un lot terminé à 11 h 33 est devenue
 * son heure d'arrivée — le rapport annonçait une équipe arrivée après être
 * repartie. Une photo d'avant, prise après la fin, ne dit rien de l'arrivée.
 */
export function arriveeAcceptable(c: HeurePhoto, jourRef: string, depart = ""): boolean {
  if (c.jour && jourRef && c.jour !== jourRef) return false;
  const d = minutesDe(depart), a = minutesDe(c.heure);
  if (d >= 0 && a >= 0 && a > d) return false;
  return true;
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
 * - sinon (montage) on n'avance l'heure que sur une preuve sûre et jamais en
 *   arrière : une heure saisie à la main n'est pas écrasée par une photo de
 *   milieu de pose.
 *
 * Rien n'est plus jamais REFUSÉ, et aucune question n'est posée. Deux
 * garde-fous ont vécu ici : une journée de plus de onze heures sans EXIF, et
 * une photo datée d'un autre jour. Chacun ouvrait une fenêtre demandant
 * l'heure à la main, que Micael ne veut pas voir (14 octobre 2026) — mieux
 * vaut l'heure de la dernière photo qu'une question. Le passage visé reste
 * choisi par l'appelant, qui prend celui du jour de la photo.
 */
export function departApresPhoto(
  actuel: string,
  c: HeurePhoto,
  arrivee: string,
  options: { finDuChantier?: boolean } = {},
): string | null {
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

/**
 * Le couple arrivée / départ, corrigé par la PRISE DE VUE d'une photo
 * (22.10.2026 — TM-2600765).
 *
 * Deux heures voyagent avec chaque photo : celle de l'ajout dans l'app, et
 * celle de la prise de vue. Un monteur qui remplit son rapport après coup
 * appuie sur « Maintenant » à l'étape Arrivée : l'arrivée devenait l'heure
 * où il écrivait (14:56), alors que sa photo d'avant intervention, prise à
 * 14:10, disait la vérité. Et le départ, posé sur une photo, n'était jamais
 * confronté à l'arrivée : « arrivée 15:06, départ 14:53 ».
 *
 * La photo fait foi quand elle atteste sa prise de vue (EXIF, ou date du
 * fichier) et qu'elle est du jour du passage :
 *   • AVANT : on ne peut pas arriver APRÈS sa photo d'avant intervention —
 *     l'arrivée recule jusqu'à elle (jamais l'inverse : arriver avant la
 *     première photo est normal) ;
 *   • APRÈS : le départ est l'heure de la DERNIÈRE photo d'après
 *     intervention (règle de Micael) — en avant comme en arrière, dès que
 *     celle-ci est la plus récente des photos d'après connues ;
 *   • MONTAGE : la règle d'avant (departApresPhoto) ;
 *   • et jamais un départ avant l'arrivée : la première photo du jour
 *     ramène l'arrivée si elle le peut ; sinon on garde le départ d'avant.
 */
export function corrigerCoupleParPhoto(
  couple: { arrivee: string; depart: string },
  c: HeurePhoto,
  bucket: string,
  jourRef: string,
  preuves: { premierePrise?: string | null; dernierePriseApres?: string | null } = {},
): { arrivee: string; depart: string } {
  let arrivee = couple.arrivee || "";
  let depart = couple.depart || "";
  const atteste = c.source === "exif" || c.source === "fichier";
  const memeJour = !c.jour || !jourRef || c.jour === jourRef;
  const m = (h?: string | null) => minutesDe(h || "");

  if (bucket === "AVANT_INTERVENTION") {
    if (!arrivee) {
      if (arriveeAcceptable(c, jourRef, depart)) arrivee = c.heure;
    } else if (atteste && memeJour && m(c.heure) >= 0 && m(c.heure) < m(arrivee)) {
      arrivee = c.heure;
    }
  }

  const fin = ["MONTAGE_GAUCHE", "MONTAGE_CENTRE", "MONTAGE_DROITE", "APRES_INTERVENTION"].includes(bucket);
  if (fin) {
    const finDuChantier = bucket === "APRES_INTERVENTION";
    let d = departApresPhoto(depart, c, arrivee, { finDuChantier });
    if (finDuChantier && atteste && memeJour) {
      const dernier = preuves.dernierePriseApres;
      if (!dernier || m(c.heure) >= m(dernier)) d = c.heure;
    }
    if (d) depart = d;
  }

  /* Jamais de départ avant l'arrivée. */
  if (arrivee && depart && m(depart) >= 0 && m(arrivee) >= 0 && m(depart) < m(arrivee)) {
    const premiere = preuves.premierePrise;
    const candidats = [premiere, atteste && memeJour ? c.heure : null]
      .filter((h): h is string => !!h && m(h) >= 0 && m(h) <= m(depart));
    if (candidats.length) {
      arrivee = candidats.reduce((a, b) => (m(a) <= m(b) ? a : b));
    } else {
      depart = couple.depart && m(couple.depart) >= m(arrivee) ? couple.depart : "";
    }
  }
  return { arrivee, depart };
}
