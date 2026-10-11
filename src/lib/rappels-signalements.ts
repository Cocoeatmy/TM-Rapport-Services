/**
 * Les signalements ouverts, mis en forme pour l'app Rappels d'Apple.
 *
 * Pourquoi ce fichier existe plutôt qu'un peu de texte dans l'agent : l'agent
 * tourne en JXA sur le Mac, hors de toute suite de tests. Tout ce qui se
 * décide — quoi montrer, quoi taire, quel est l'ordre d'urgence — se décide
 * donc ICI, où ça se vérifie. Le script d'en face ne fait plus que poser dans
 * la liste ce qu'on lui donne.
 *
 * Deux règles tirées des données réelles (relevé du 11 octobre 2026, 25
 * pièces et 70 défauts) :
 *
 *  • un défaut de phase « avant-intervention » n'est PAS un problème à
 *    traiter : c'est un constat d'état des lieux, photographié avant de
 *    poser. Dix des quarante-deux défauts ouverts sont dans ce cas. Les
 *    verser dans une liste de tâches, c'est demander de réparer un mur qui
 *    était déjà abîmé à l'arrivée ;
 *
 *  • il reste une quarantaine de signalements réellement ouverts, dont la
 *    moitié a plus d'un mois. Aucune échéance n'est posée : quarante rappels
 *    en retard le premier jour, et la liste se fait couper au bout d'une
 *    semaine. L'ancienneté passe par la PRIORITÉ, qui trie sans sonner.
 */

export interface CommentaireBrut {
  user?: string;
  message?: string;
  timestamp?: number;
}

/** Un signalement tel que le magasin le range — pièces et défauts confondus. */
export interface SignalementBrut {
  id: string;
  projectId: string;
  projectName?: string;
  user?: string;
  description?: string;
  /** Pièces seulement. */
  reference?: string;
  /** Défauts seulement. */
  typesLabel?: string;
  types?: string[];
  /** Défauts : « avant-intervention » = constat d'état des lieux. */
  phase?: string;
  photoUrl?: string;
  photoUrls?: string[];
  status?: string;
  resolved?: boolean;
  timestamp?: number;
  cabineLabel?: string;
  comments?: CommentaireBrut[];
}

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

export interface FicheProjet {
  /** N° OFR TM — c'est ainsi qu'il appelle ses chantiers. */
  ofrTM?: string;
  projet?: string;
}

/** Statuts qui ferment un signalement, des deux familles. */
const CLOS = new Set(["recu", "resolu"]);

/** Un signalement encore à traiter ? */
export function estOuvert(s: SignalementBrut): boolean {
  if (s.resolved === true) return false;
  return !CLOS.has(String(s.status || "").toLowerCase());
}

/** Un constat d'avant-intervention documente, il ne demande rien. */
export function estConstat(s: SignalementBrut): boolean {
  return String(s.phase || "") === "avant-intervention";
}

const STATUTS: Record<string, string> = {
  demande: "demandée",
  commande: "commandée",
  recu: "reçue",
  signale: "signalé",
  "en-cours": "en cours",
  resolu: "résolu",
};

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

/** Jours écoulés depuis le signalement. */
export function ageEnJours(ms: number | undefined, maintenant: number): number {
  if (!ms || !Number.isFinite(ms)) return 0;
  return Math.max(0, Math.floor((maintenant - ms) / 86400000));
}

/**
 * L'urgence se lit sur l'âge.
 *
 * Rien d'autre ne la porte : un défaut n'a pas de niveau de gravité dans
 * l'app, et celui qui le signale n'en met pas. Ce qui distingue vraiment deux
 * signalements, c'est qu'on en ait laissé un traîner quatre mois.
 */
export function prioriteSelonAge(jours: number): number {
  if (jours > 60) return 1;
  if (jours > 21) return 5;
  return 9;
}

/** Coupe sans trancher un mot au milieu. */
function court(texte: string, max: number): string {
  const t = texte.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const bout = t.slice(0, max);
  const esp = bout.lastIndexOf(" ");
  return (esp > max * 0.6 ? bout.slice(0, esp) : bout).replace(/[,;:.\s]+$/, "") + "…";
}

/** Le jeton public d'un projet — le même que /client/<token> et /sig/<token>. */
export function jetonProjet(projectId: string): string {
  return Buffer.from(projectId, "utf8").toString("base64url");
}

/** Les photos d'un signalement, dédoublonnées, pièces et défauts confondus. */
export function photosDe(s: SignalementBrut): string[] {
  const brut = [s.photoUrl, ...(s.photoUrls || [])].filter(Boolean) as string[];
  return [...new Set(brut.map((u) => u.trim()).filter(Boolean))];
}

export interface OptionsRappels {
  /** Racine publique de l'app, sans barre finale. */
  origine: string;
  /** Pour figer l'horloge dans les tests. */
  maintenant?: number;
}

/**
 * Met un signalement en fiche de rappel.
 *
 * L'ordre des lignes suit la question qu'on se pose en ouvrant le rappel :
 * de quel chantier parle-t-on, quel lot, quoi, depuis quand, puis seulement
 * les pièces jointes.
 */
export function enRappel(
  s: SignalementBrut,
  famille: "piece" | "defaut",
  fiche: FicheProjet,
  o: OptionsRappels,
): Rappel {
  const maintenant = o.maintenant ?? Date.now();
  const origine = o.origine.replace(/\/+$/, "");
  const tm = (fiche.ofrTM || "").split(/[\n,;]+/)[0].trim();
  const chantier = fiche.projet || s.projectName || "Chantier inconnu";
  const genre = famille === "piece" ? "Pièce manquante" : (s.typesLabel || "Défaut");
  const description = String(s.description || "").trim();
  const jours = ageEnJours(s.timestamp, maintenant);

  // ── Titre : ce qu'on lit sur une montre, d'un coup d'œil. ──
  const tete = tm || court(chantier, 22);
  const titre = `${tete} · ${genre}${description ? ` — ${court(description, 58)}` : ""}`;

  // ── Notes : tout le reste, dans l'ordre où la question se pose. ──
  const l: string[] = [];
  l.push(`Chantier : ${chantier}`);
  if (tm) l.push(`N° OFR : ${tm}`);
  if (s.cabineLabel && s.cabineLabel.trim()) l.push(`Lot : ${s.cabineLabel.trim()}`);
  l.push(`Type : ${genre}`);
  if (famille === "piece" && s.reference && s.reference.trim()) {
    l.push(`Référence : ${s.reference.trim()}`);
  }
  const statut = STATUTS[String(s.status || "").toLowerCase()] || s.status || "";
  if (statut) l.push(`Statut : ${statut}`);

  const quand = dateSuisse(s.timestamp);
  const qui = String(s.user || "").trim();
  if (qui || quand) {
    const age = jours > 0 ? ` (il y a ${jours} jour${jours > 1 ? "s" : ""})` : " (aujourd'hui)";
    l.push(`Signalé${qui ? ` par ${qui}` : ""}${quand ? ` le ${quand}` : ""}${age}`);
  }

  if (description) { l.push(""); l.push(description); }

  /* Le dernier échange, et lui seul : c'est là qu'on apprend qu'une pièce a
     déjà été commandée. Tout l'historique rendrait le rappel illisible. */
  const echanges = (s.comments || []).filter((c) => String(c.message || "").trim());
  const dernier = echanges[echanges.length - 1];
  if (dernier) {
    const d = dateSuisse(dernier.timestamp).split(" à ")[0];
    l.push("");
    l.push(`Dernier échange — ${dernier.user || "?"}${d ? `, ${d}` : ""} : ${String(dernier.message).trim()}`);
  }

  /* Les photos ne peuvent PAS être jointes : EventKit rend `attachments` en
     lecture seule, aucune API publique n'en ajoute. On met les adresses, que
     Rappels rend cliquables, et le rapport PDF qui les rassemble — celui-là
     s'ouvre sans se connecter. */
  const photos = photosDe(s);
  if (photos.length > 0) {
    l.push("");
    l.push(`Photos (${photos.length}) :`);
    photos.forEach((u) => l.push(u));
  }
  const cab = s.cabineLabel && s.cabineLabel.trim()
    ? `?signalement=${encodeURIComponent(s.cabineLabel.trim())}`
    : "?signalement=1";
  const url = `${origine}/projet/${s.projectId}${cab}`;

  /* Le lien est aussi dans le champ URL du rappel, mais on le répète ici :
     c'est la note qu'on lit, et sur un téléphone le champ URL demande
     d'ouvrir le détail. */
  l.push("");
  l.push(`Traiter dans l'app : ${url}`);
  l.push(`Rapport signalements (PDF) : ${origine}/sig/${jetonProjet(s.projectId)}`);
  l.push("");
  const cle = `tm:${famille}:${s.id}`;
  l.push(`[${cle}]`);

  return { cle, titre, notes: l.join("\n"), url, priorite: prioriteSelonAge(jours) };
}

/**
 * Toute la liste, triée du plus ancien au plus récent.
 *
 * Le plus vieux en haut : c'est celui qu'on oublie, et l'app Rappels affiche
 * dans l'ordre reçu tant qu'on ne lui demande rien d'autre.
 */
export function listeDesRappels(
  pieces: SignalementBrut[],
  defauts: SignalementBrut[],
  fiches: Map<string, FicheProjet>,
  o: OptionsRappels,
): Rappel[] {
  const retenus: { s: SignalementBrut; f: "piece" | "defaut" }[] = [
    ...pieces.filter(estOuvert).map((s) => ({ s, f: "piece" as const })),
    ...defauts.filter((s) => estOuvert(s) && !estConstat(s)).map((s) => ({ s, f: "defaut" as const })),
  ];
  retenus.sort((a, b) => (a.s.timestamp || 0) - (b.s.timestamp || 0));
  return retenus.map(({ s, f }) => enRappel(s, f, fiches.get(s.projectId) || {}, o));
}
