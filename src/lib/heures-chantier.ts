/**
 * Temps réellement passé sur un chantier, tous formats d'heures confondus.
 *
 * Les heures d'un chantier s'écrivent de trois façons selon le cas :
 *
 *   1. simple        « 08:30 »
 *   2. par cabine    « Cab1:2026-05-20:08:30 | Cab2:2026-05-21:09:15 »
 *   3. par passage   « 2026-04-27 Jean-Marc 08:30 | 2026-05-02 Miguel 09:00 »
 *
 * Le calcul de rentabilité cherchait la PREMIÈRE suite « chiffres:chiffres »
 * de la chaîne. Sur « Cab1:2026-05-20:08:30 » il trouvait « 1:20 » — dans
 * « Cab1:2026 » — et comptait une heure vingt là où le monteur avait passé
 * sa journée. Tous les chantiers multi-cabines étaient faux, et c'est la
 * majorité d'entre eux.
 *
 * On lit donc l'heure à la FIN de chaque segment, et l'on additionne les
 * passages : un chantier repris une seconde fois coûte deux déplacements de
 * temps, pas un.
 */

/** L'heure se trouve toujours en fin de segment, quel que soit le format. */
function heureDe(segment: string): number {
  const m = String(segment || "").trim().match(/(\d{1,2}):(\d{2})$/);
  if (!m) return -1;
  const h = parseInt(m[1], 10), min = parseInt(m[2], 10);
  if (h > 23 || min > 59) return -1;
  return h * 60 + min;
}

/** Minutes travaillées sur un chantier, toutes cabines et tous passages. */
export function minutesDuChantier(
  heureArrivee: string | null | undefined,
  heureDepart: string | null | undefined,
): number {
  const arr = String(heureArrivee || "").split("|").map((x) => x.trim()).filter(Boolean);
  const dep = String(heureDepart || "").split("|").map((x) => x.trim()).filter(Boolean);
  const n = Math.max(arr.length, dep.length);
  let total = 0;
  for (let i = 0; i < n; i++) {
    const a = heureDe(arr[i] || "");
    const d = heureDe(dep[i] || "");
    /* Une arrivée sans départ ne dit rien de la durée : on ne devine pas. */
    if (a >= 0 && d >= 0 && d > a) total += d - a;
  }
  return total;
}
