/**
 * Un départ ne peut pas précéder une arrivée.
 *
 * Le 16 octobre 2026, un rapport est parti chez le client en annonçant
 * une équipe arrivée à 9 h 00 et repartie à 8 h 52 — le même jour. Six
 * chantiers portaient la même incohérence, dont un écart de trois heures.
 *
 * Le garde-fou existait pourtant… sur le champ DÉPART uniquement. Rien
 * n'empêchait de poser ensuite une arrivée plus tardive, ni d'appuyer sur
 * « Arrêter » avant l'heure d'arrivée saisie. La règle ne tenait donc que
 * dans un sens, et il suffisait de remplir les deux champs dans l'autre
 * ordre pour la contourner.
 *
 * Elle est écrite ici une fois, et appliquée aux deux champs, au minuteur
 * et au serveur — qui est le seul endroit que tous les chemins
 * traversent, y compris la file d'attente hors ligne.
 */

/** Minutes depuis minuit, ou `null` si la chaîne ne porte pas d'heure. */
export function minutesDeLHeure(valeur?: string | null): number | null {
  const texte = String(valeur || "");
  /* L'heure est À LA FIN : un passage s'écrit « 2026-10-16 Claudio 09:00 »,
     la date d'abord. On ancre donc sur la fin — sinon « 2026-07-16:12:44 »
     se lit « 16:12 », parce que les deux candidats se chevauchent. */
  let m = texte.match(/(\d{1,2}):(\d{2})\s*$/);
  if (!m) {
    /* Forme inhabituelle (l'heure devant) : on prend la dernière trouvée. */
    const tous = [...texte.matchAll(/(\d{1,2}):(\d{2})/g)];
    m = tous.length ? tous[tous.length - 1] : null;
  }
  if (!m) return null;
  const h = parseInt(m[1], 10), min = parseInt(m[2], 10);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** La date d'un passage, si elle y figure. */
function dateDuPassage(valeur?: string | null): string {
  const m = String(valeur || "").match(/\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : "";
}

/**
 * Ce couple d'heures est-il impossible ?
 *
 * On ne juge que l'ordre, et seulement quand les deux heures sont là et
 * portent le même jour. Un passage à cheval sur deux dates — rare mais
 * légitime — n'est pas une erreur.
 */
export function departAvantArrivee(
  arrivee?: string | null,
  depart?: string | null,
): boolean {
  const a = minutesDeLHeure(arrivee);
  const d = minutesDeLHeure(depart);
  if (a === null || d === null) return false;
  const ja = dateDuPassage(arrivee), jd = dateDuPassage(depart);
  if (ja && jd && ja !== jd) return false;
  return d < a;
}

export const MESSAGE_DEPART_AVANT = "L'heure de départ ne peut pas être avant l'arrivée.";
export const MESSAGE_ARRIVEE_APRES = "L'heure d'arrivée ne peut pas être après le départ.";

/** Découpe une valeur multi-passages « bloc | bloc | bloc ». */
function blocs(valeur?: string | null): string[] {
  return String(valeur || "").split("|").map((x) => x.trim()).filter(Boolean);
}

/** Découpe une valeur par cabine « Cab1:… | Cab2:… ». */
function parCabine(valeur?: string | null): Record<string, string> {
  const map: Record<string, string> = {};
  const re = /Cab(\d+)\s*:\s*([^|]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(String(valeur || "")))) map[m[1]] = m[2].trim();
  return map;
}

export interface IncoherenceHeures {
  /** « Cabine 3 », « passage 2 », ou «  » pour un couple simple. */
  ou: string;
  arrivee: string;
  depart: string;
}

/**
 * Toutes les inversions d'un couple de colonnes, quelle que soit sa forme.
 *
 * Trois formes coexistent dans la base, et un contrôle qui n'en connaît
 * qu'une laisse passer les deux autres :
 *   « 09:00 »                              un couple simple ;
 *   « Cab1:09:00 | Cab2:10:00 »            une valeur par cabine ;
 *   « 2026-10-16 Claudio 09:00 | … »       une liste de passages.
 */
export function incoherencesHeures(
  arriveeBrut?: string | null,
  departBrut?: string | null,
): IncoherenceHeures[] {
  const A = String(arriveeBrut || ""), D = String(departBrut || "");
  if (!A || !D) return [];
  const out: IncoherenceHeures[] = [];

  if (/Cab\d+\s*:/.test(A) || /Cab\d+\s*:/.test(D)) {
    const ca = parCabine(A), cd = parCabine(D);
    for (const n of Object.keys(ca)) {
      if (departAvantArrivee(ca[n], cd[n])) {
        out.push({ ou: `Cabine ${n}`, arrivee: ca[n], depart: cd[n] });
      }
    }
    return out;
  }

  const ba = blocs(A), bd = blocs(D);
  const n = Math.max(ba.length, bd.length);
  for (let i = 0; i < n; i++) {
    if (departAvantArrivee(ba[i], bd[i])) {
      out.push({ ou: n > 1 ? `passage ${i + 1}` : "", arrivee: ba[i], depart: bd[i] });
    }
  }
  return out;
}

/** Le message à montrer, nommant l'endroit fautif. */
export function messageIncoherence(liste: IncoherenceHeures[]): string {
  if (liste.length === 0) return "";
  const dire = (x: IncoherenceHeures) => {
    const a = minutesDeLHeure(x.arrivee), d = minutesDeLHeure(x.depart);
    const hhmm = (v: number | null) => (v === null ? "?" : `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`);
    return `${x.ou ? x.ou + " : " : ""}départ ${hhmm(d)} avant l'arrivée ${hhmm(a)}`;
  };
  return `Heures impossibles — ${liste.map(dire).join(" ; ")}`;
}

/** Les couples de colonnes qui portent des heures d'arrivée / de départ. */
export const COUPLES_HEURES: [string, string][] = [
  ["heureArrivee", "heureDepart"],
  ["heureArriveeSav", "heureDepartSav"],
];

/**
 * Les colonnes de PASSAGES : « Cab2:2026-10-20~Miguel~08:12~11:33 ; … ».
 *
 * C'est elles que lit le rapport PDF. Le 20 octobre 2026, un lot y portait
 * « arrivée 13:12, départ 11:33 » : l'écran envoyait la liste des passages
 * et les colonnes d'heures dans DEUX requêtes ; le serveur refusait la
 * seconde, mais la première — qu'il ne contrôlait pas — était passée.
 */
export const COLONNES_PASSAGES = ["interventionsMontageCabines", "interventionsSavCabines"];

/** Les passages d'une colonne « CabN:p ; p | CabM:… », lot par lot. */
function passagesParLot(valeur?: string | null): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [n, v] of Object.entries(parCabine(valeur))) {
    out[n] = v.split(";").map((x) => x.trim()).filter(Boolean);
  }
  return out;
}

/**
 * Les passages impossibles (départ avant l'arrivée) d'une colonne de
 * passages. Ceux qui figurent déjà, à l'identique, dans la valeur en base ne
 * sont pas jugés : une erreur ancienne sur un autre lot ne doit pas bloquer
 * l'enregistrement du lot qu'on est en train de remplir.
 */
export function incoherencesPassages(valeur?: string | null, existante?: string | null): IncoherenceHeures[] {
  const avant = passagesParLot(existante);
  const out: IncoherenceHeures[] = [];
  for (const [n, liste] of Object.entries(passagesParLot(valeur))) {
    for (const bloc of liste) {
      if ((avant[n] || []).includes(bloc)) continue;
      const [, , arrivee = "", depart = ""] = bloc.split("~").map((x) => x.trim());
      if (departAvantArrivee(arrivee, depart)) out.push({ ou: `Cabine ${n}`, arrivee, depart });
    }
  }
  return out;
}

/** Une écriture touche-t-elle des heures ? (sinon, rien à vérifier) */
export function toucheDesHeures(corps: Record<string, unknown>): boolean {
  return COUPLES_HEURES.some(([a, d]) => corps[a] !== undefined || corps[d] !== undefined)
    || COLONNES_PASSAGES.some((c) => corps[c] !== undefined);
}

/**
 * Le refus à opposer à une écriture, ou `null` si elle est acceptable.
 *
 * On juge le RÉSULTAT : la valeur entrante quand elle est fournie, celle
 * déjà en base sinon. Envoyer une arrivée seule doit être refusé si elle
 * passe après le départ déjà enregistré — c'est précisément ainsi que
 * l'incohérence s'est installée.
 */
export function verifierHeuresEntrantes(
  corps: Record<string, unknown>,
  existant: Record<string, unknown> | null,
): string | null {
  for (const [champA, champD] of COUPLES_HEURES) {
    if (corps[champA] === undefined && corps[champD] === undefined) continue;
    const arrivee = corps[champA] !== undefined ? corps[champA] : existant?.[champA];
    const depart = corps[champD] !== undefined ? corps[champD] : existant?.[champD];
    const fautes = incoherencesHeures(
      typeof arrivee === "string" ? arrivee : "",
      typeof depart === "string" ? depart : "",
    );
    if (fautes.length > 0) return messageIncoherence(fautes);
  }
  for (const col of COLONNES_PASSAGES) {
    if (typeof corps[col] !== "string") continue;
    const existante = existant?.[col];
    const fautes = incoherencesPassages(corps[col] as string, typeof existante === "string" ? existante : "");
    if (fautes.length > 0) return messageIncoherence(fautes);
  }
  return null;
}
