/**
 * Pointages = plusieurs interventions datées pour un même montage.
 * Chaque intervention : date + collaborateur(s) + heure d'arrivée + heure de départ.
 *
 * Stockage Notion (champs "Heure arrivée" / "Heure départ", rich_text) au format
 * texte déjà compris par les autres consommateurs (dashboard, rapport mensuel,
 * page admin/heures) :
 *
 *   Heure arrivée : "2026-06-09 Micael & Claudio 08:30 | 2026-06-12 Miguel 09:00"
 *   Heure départ  : "2026-06-09 Micael & Claudio 11:45 | 2026-06-12 Miguel 10:20"
 *
 * (À ne pas confondre avec le format multi-cabine "Cab1:2026-05-02:08:00 | …".)
 */

export interface Pointage {
  date: string; // YYYY-MM-DD
  collaborateur: string; // "Nom" ou "Nom1 & Nom2"
  arrivee: string; // HH:MM
  depart: string; // HH:MM
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{1,2}:\d{2}$/;

/**
 * Vrai si les valeurs heures sont au format multi-interventions daté
 * (et PAS au format multi-cabine "Cab1:…").
 */
export function isMultiDayHours(arrivee?: string | null, depart?: string | null): boolean {
  const s = `${arrivee || ""} | ${depart || ""}`;
  if (/Cab\d+\s*:/i.test(s)) return false; // multi-cabine, géré ailleurs
  return /\d{4}-\d{2}-\d{2}/.test(s) || (arrivee || "").includes("|") || (depart || "").includes("|");
}

/** Décompose un segment "YYYY-MM-DD Collab HH:MM" → { date, collaborateur, time }. */
function parseEntry(part: string): { date: string; collaborateur: string; time: string } {
  const tokens = (part || "").trim().split(/\s+/).filter(Boolean);
  let date = "";
  let time = "";
  if (tokens.length && DATE_RE.test(tokens[0])) date = tokens.shift() as string;
  if (tokens.length && TIME_RE.test(tokens[tokens.length - 1])) time = tokens.pop() as string;
  return { date, collaborateur: tokens.join(" "), time };
}

/**
 * Relit les champs heures vers une liste de pointages. Les deux champs sont
 * appariés par position (ils sont toujours écrits dans le même ordre).
 */
export function parsePointages(arrivee?: string | null, depart?: string | null): Pointage[] {
  const arrParts = (arrivee || "").split("|").map((s) => s.trim()).filter(Boolean);
  const depParts = (depart || "").split("|").map((s) => s.trim()).filter(Boolean);
  const n = Math.max(arrParts.length, depParts.length);
  const out: Pointage[] = [];
  for (let i = 0; i < n; i++) {
    const a = parseEntry(arrParts[i] || "");
    const d = parseEntry(depParts[i] || "");
    out.push({
      date: a.date || d.date || "",
      collaborateur: a.collaborateur || d.collaborateur || "",
      arrivee: a.time || "",
      depart: d.time || "",
    });
  }
  return out;
}

/** Encode une liste de pointages vers les deux champs texte Notion. */
export function encodePointages(pts: Pointage[]): { arrivee: string; depart: string } {
  const fmt = (p: Pointage, t: string) =>
    `${p.date} ${p.collaborateur} ${t}`.replace(/\s+/g, " ").trim();
  return {
    arrivee: pts.map((p) => fmt(p, p.arrivee)).join(" | "),
    depart: pts.map((p) => fmt(p, p.depart)).join(" | "),
  };
}

/** Durée totale (minutes) d'une liste de pointages. */
export function totalPointageMinutes(pts: Pointage[]): number {
  return pts.reduce((sum, p) => {
    if (!TIME_RE.test(p.arrivee) || !TIME_RE.test(p.depart)) return sum;
    const [ah, am] = p.arrivee.split(":").map(Number);
    const [dh, dm] = p.depart.split(":").map(Number);
    const diff = dh * 60 + dm - (ah * 60 + am);
    return diff > 0 ? sum + diff : sum;
  }, 0);
}
