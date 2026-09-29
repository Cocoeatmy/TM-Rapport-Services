/**
 * Jours ouvrés dans le canton de Vaud.
 *
 * Un délai compté en jours calendaires ment sur ce qu'il mesure : dire qu'un
 * chantier a attendu quatorze jours quand quatre d'entre eux étaient un week-end
 * et le 1er août, c'est reprocher à l'entreprise du temps où personne ne
 * travaillait. Les statistiques d'attente se comptent donc en jours OUVRÉS.
 *
 * Les jours fériés retenus sont ceux que la loi vaudoise reconnaît :
 *
 *   1er janvier · 2 janvier (Berchtold) · Vendredi saint · lundi de Pâques ·
 *   Ascension · lundi de Pentecôte · 1er août · lundi du Jeûne fédéral ·
 *   25 décembre.
 *
 * Vaud ne chôme PAS le 26 décembre, contrairement à d'autres cantons : l'y
 * ajouter enlèverait un jour de travail réel à chaque fin d'année.
 */

/**
 * Dimanche de Pâques, par l'algorithme de Meeus — comput grégorien.
 *
 * Quatre des neuf fériés vaudois en dépendent : sans lui, il faudrait une
 * table à tenir à jour chaque année, qui finirait par se périmer en silence.
 */
function paques(annee: number): Date {
  const a = annee % 19;
  const b = Math.floor(annee / 100);
  const c = annee % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31);
  const jour = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(annee, mois - 1, jour));
}

/** Le lundi du Jeûne fédéral : lendemain du troisième dimanche de septembre. */
function jeuneFederal(annee: number): Date {
  const d = new Date(Date.UTC(annee, 8, 1));
  // Premier dimanche, puis deux semaines, puis le lundi qui suit.
  const premierDimanche = 1 + ((7 - d.getUTCDay()) % 7);
  return new Date(Date.UTC(annee, 8, premierDimanche + 14 + 1));
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const decale = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

/** Mémoire par année : le comput ne se refait pas à chaque projet. */
const cache = new Map<number, Set<string>>();

/** Jours fériés vaudois d'une année, en AAAA-MM-JJ. */
export function feriesVaud(annee: number): Set<string> {
  const vu = cache.get(annee);
  if (vu) return vu;
  const p = paques(annee);
  const f = new Set([
    iso(new Date(Date.UTC(annee, 0, 1))),   // Nouvel An
    iso(new Date(Date.UTC(annee, 0, 2))),   // Berchtold
    iso(decale(p, -2)),                     // Vendredi saint
    iso(decale(p, 1)),                      // lundi de Pâques
    iso(decale(p, 39)),                     // Ascension
    iso(decale(p, 50)),                     // lundi de Pentecôte
    iso(new Date(Date.UTC(annee, 7, 1))),   // Fête nationale
    iso(jeuneFederal(annee)),               // lundi du Jeûne fédéral
    iso(new Date(Date.UTC(annee, 11, 25))), // Noël
  ]);
  cache.set(annee, f);
  return f;
}

/** Ce jour-là, travaille-t-on ? */
export function estOuvre(jour: string): boolean {
  const d = new Date(`${jour}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  const s = d.getUTCDay();
  if (s === 0 || s === 6) return false;
  return !feriesVaud(d.getUTCFullYear()).has(jour);
}

/** Au-delà, ce n'est plus un délai mais un dossier repris longtemps après. */
const PLAFOND_JOURS = 730;

/**
 * Jours ouvrés séparant deux dates, bornes comprises pour la seconde.
 *
 * Renvoie `null` quand le calcul n'aurait pas de sens : date illisible, ordre
 * inversé — une saisie fautive, pas une attente — ou écart si grand qu'il ne
 * dit rien du rythme habituel.
 *
 * Deux dates du même jour donnent zéro : l'attente a été nulle, ce qui est une
 * information, pas une absence de mesure.
 */
export function joursOuvresEntre(de: string, a: string): number | null {
  const d1 = String(de || "").slice(0, 10);
  const d2 = String(a || "").slice(0, 10);
  const t1 = Date.parse(`${d1}T12:00:00Z`);
  const t2 = Date.parse(`${d2}T12:00:00Z`);
  if (Number.isNaN(t1) || Number.isNaN(t2)) return null;
  const brut = Math.round((t2 - t1) / 86400000);
  if (brut < 0 || brut > PLAFOND_JOURS) return null;

  let n = 0;
  for (let t = t1 + 86400000; t <= t2; t += 86400000) {
    if (estOuvre(new Date(t).toISOString().slice(0, 10))) n += 1;
  }
  return n;
}
