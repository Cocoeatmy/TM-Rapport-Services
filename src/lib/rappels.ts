/**
 * Les briques communes à toutes les listes de rappels.
 *
 * Signalements, facturations, et ce qui suivra : même forme de fiche, même
 * façon de dire une date, même échelle d'urgence. Les règles de CHAQUE liste
 * — quoi montrer, quoi taire — vivent dans leur propre fichier ; ici ne
 * restent que les gestes qu'elles partagent.
 *
 * Tout cela se décide côté serveur, et non dans l'agent : celui-ci tourne en
 * JXA sur le Mac, hors de toute suite de tests, et ne doit donc rien décider.
 */

/** Ce que l'agent a besoin de savoir pour poser un rappel, et rien de plus. */
export interface Rappel {
  /** Marqueur stable écrit dans les notes : c'est lui qui relie les deux côtés. */
  cle: string;
  titre: string;
  notes: string;
  /** Champ URL du rappel : le geste à faire, pas la lecture. */
  url: string;
  /** Convention EventKit : 1 = haute, 5 = moyenne, 9 = basse. */
  priorite: number;
}

/** Date suisse lisible : « 29.05.2026 à 08:41 ». */
export function dateSuisse(ms: number | undefined): string {
  if (!ms || !Number.isFinite(ms)) return "";
  const d = new Date(ms);
  const p = new Intl.DateTimeFormat("fr-CH", {
    timeZone: "Europe/Zurich",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const v = (t: string) => p.find((x) => x.type === t)?.value || "";
  return `${v("day")}.${v("month")}.${v("year")} à ${v("hour")}:${v("minute")}`;
}

/** Une date ISO (AAAA-MM-JJ) rendue à la suisse : « 12.06.2026 ». */
export function jourSuisse(iso: string | null | undefined): string {
  const j = String(iso || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(j)) return "";
  const [a, m, d] = j.split("-");
  return `${d}.${m}.${a}`;
}

/** Jours écoulés depuis un instant. */
export function ageEnJours(ms: number | undefined, maintenant: number): number {
  if (!ms || !Number.isFinite(ms)) return 0;
  return Math.max(0, Math.floor((maintenant - ms) / 86400000));
}

/**
 * L'urgence se lit sur l'âge.
 *
 * Rien d'autre ne la porte : ni un défaut ni une facture oubliée ne portent
 * de niveau de gravité. Ce qui distingue vraiment deux lignes, c'est qu'on en
 * ait laissé une traîner quatre mois.
 */
export function prioriteSelonAge(jours: number): number {
  if (jours > 60) return 1;
  if (jours > 21) return 5;
  return 9;
}

/** Coupe sans trancher un mot au milieu. */
export function court(texte: string, max: number): string {
  const t = String(texte || "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const bout = t.slice(0, max);
  const esp = bout.lastIndexOf(" ");
  return (esp > max * 0.6 ? bout.slice(0, esp) : bout).replace(/[,;:.\s]+$/, "") + "…";
}

/** Le jeton public d'un projet — le même que /client/<token> et /sig/<token>. */
export function jetonProjet(projectId: string): string {
  return Buffer.from(projectId, "utf8").toString("base64url");
}

/** Montant en francs, sans centimes : « 3 200 ». */
export function francs(n: number): string {
  return Math.round(n || 0).toLocaleString("fr-CH").replace(/\u202f|\u00a0/g, " ");
}

export interface OptionsRappels {
  /** Racine publique de l'app, sans barre finale. */
  origine: string;
  /** Pour figer l'horloge dans les tests. */
  maintenant?: number;
}

/** La fiche d'un chantier, telle que les listes en ont besoin. */
export interface FicheProjet {
  /** N° OFR TM — c'est ainsi qu'il appelle ses chantiers. */
  ofrTM?: string;
  projet?: string;
}
