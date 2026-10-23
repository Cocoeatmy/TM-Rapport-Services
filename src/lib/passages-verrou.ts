/**
 * Les passages d'un jour écoulé ne se réécrivent plus (23.10.2026).
 *
 * TM-2600933 : le passage du DÉMONTAGE du 12.10 a reçu, le 23.10, les heures
 * du montage du jour. L'écran figeait déjà les passages anciens pour la saisie
 * à la main, mais l'enregistrement automatique (heures des photos) passait à
 * côté — et le serveur acceptait tout.
 *
 * Désormais le SERVEUR garde chaque passage daté d'avant la limite tel qu'il
 * est en base, quoi que l'appareil envoie : il n'est ni modifié, ni supprimé,
 * ni remplacé. Seul le propriétaire (Micael) y échappe. On ne refuse pas
 * l'écriture : les heures du jour, envoyées dans la même requête, passent —
 * seul l'ancien est rétabli.
 *
 * Formats couverts :
 *   • « Cab1:2026-10-09:10:14 | Cab2:… »          (une date par lot)
 *   • « Cab1:2026-10-09~JM~10:14~11:09;2026-10-14~… | Cab2:… » (passages)
 *   • « 2026-10-12 JM & Miguel 08:00 | 2026-10-23 … » (un lot, plusieurs jours)
 */

const ISO = /\d{4}-\d{2}-\d{2}/;

/** Les colonnes protégées : heures et passages, montage et SAV. */
export const COLONNES_DATEES = [
  "heureArrivee", "heureDepart", "heureArriveeSav", "heureDepartSav",
  "interventionsMontageCabines", "interventionsSavCabines",
] as const;

/** Colonnes où un lot n'a qu'UNE case (une date) — pas une liste de passages. */
const UNE_CASE_PAR_LOT = new Set(["heureArrivee", "heureDepart", "heureArriveeSav", "heureDepartSav"]);

type Groupes = { parLot: boolean; ordre: string[]; lots: Map<string, string[]> };

function decouper(valeur: string, passages: boolean): Groupes {
  const v = String(valeur || "");
  const parLot = /Cab\d+\s*:/.test(v);
  const lots = new Map<string, string[]>();
  const ordre: string[] = [];
  if (!parLot) {
    const segs = v.split("|").map((x) => x.trim()).filter(Boolean);
    lots.set("", segs);
    ordre.push("");
    return { parLot, ordre, lots };
  }
  const re = /Cab(\d+)\s*:([^|]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(v))) {
    const cle = `Cab${m[1]}`;
    const corps = m[2].trim();
    const segs = passages ? corps.split(";").map((x) => x.trim()).filter(Boolean) : (corps ? [corps] : []);
    if (!lots.has(cle)) { lots.set(cle, []); ordre.push(cle); }
    lots.get(cle)!.push(...segs);
  }
  return { parLot, ordre, lots };
}

function recoller(g: Groupes): string {
  if (!g.parLot) return (g.lots.get("") || []).join(" | ");
  const num = (c: string) => parseInt(c.slice(3), 10) || 0;
  return [...g.ordre].sort((a, b) => num(a) - num(b))
    .filter((c) => (g.lots.get(c) || []).length > 0)
    .map((c) => `${c}:${(g.lots.get(c) || []).join(";")}`)
    .join(" | ");
}

const dateDe = (seg: string) => seg.match(ISO)?.[0] || "";
const ancien = (seg: string, limite: string) => { const d = dateDe(seg); return !!d && d < limite; };
const norm = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * La valeur à écrire, une fois les passages anciens rétablis, et le nombre
 * de passages anciens que l'écriture aurait touchés.
 */
export function protegerPassages(
  colonne: string,
  existante: string | null | undefined,
  entrante: string,
  limite: string,
): { valeur: string; touches: number } {
  const passages = !UNE_CASE_PAR_LOT.has(colonne);
  const avant = decouper(String(existante || ""), passages);
  const apres = decouper(entrante, passages);
  const parLot = avant.parLot || apres.parLot;
  const lotsTous = [...new Set([...avant.ordre, ...apres.ordre])];
  const sortie: Groupes = { parLot, ordre: lotsTous, lots: new Map() };
  let touches = 0;

  for (const lot of lotsTous) {
    const anciensAvant = (avant.lots.get(lot) || []).filter((s) => ancien(s, limite));
    const segsApres = apres.lots.get(lot) || [];
    const anciensApres = segsApres.filter((s) => ancien(s, limite));
    const recents = segsApres.filter((s) => !ancien(s, limite));

    const cles = (l: string[]) => l.map(norm).sort().join("\u0001");
    if (cles(anciensAvant) !== cles(anciensApres)) touches += Math.max(anciensAvant.length, anciensApres.length, 1);

    if (!passages && parLot && lot !== "" && anciensAvant.length > 0) {
      // Une seule case pour le lot, datée d'un jour écoulé : elle reste.
      sortie.lots.set(lot, anciensAvant);
      continue;
    }
    const tous = [...anciensAvant, ...recents];
    tous.sort((a, b) => (dateDe(a) || "9999").localeCompare(dateDe(b) || "9999"));
    sortie.lots.set(lot, tous);
  }
  return { valeur: recoller(sortie), touches };
}

/** Jour (AAAA-MM-JJ) en Suisse. */
export function jourSuisse(d: Date = new Date()): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat("fr-CH", {
    timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

/**
 * La limite : aujourd'hui — ou, pour une saisie faite HORS LIGNE et rejouée
 * plus tard, le jour où elle a été faite (en-tête `x-tm-saisi-le`, posé par
 * la file). Le monteur qui a noté ses heures hier soir sans réseau ne doit
 * pas les perdre parce que la synchro passe ce matin.
 */
export function limitePassages(saisiLe?: string | null, maintenant: Date = new Date()): string {
  const auj = jourSuisse(maintenant);
  const t = Number(saisiLe);
  if (!Number.isFinite(t) || t <= 0) return auj;
  const age = maintenant.getTime() - t;
  if (age < 0 || age > 14 * 86_400_000) return auj;
  const j = jourSuisse(new Date(t));
  return j < auj ? j : auj;
}
