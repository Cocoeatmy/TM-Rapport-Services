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
 *  • TOUS les signalements ouverts y vont, constats d'avant-intervention
 *    compris — c'est la demande, et elle se tient : un constat est un
 *    engagement vis-à-vis du client, pas un déchet. Il porte seulement un
 *    type qui le distingue, « Constat avant intervention », pour qu'on ne
 *    le confonde pas avec un défaut à réparer ;
 *
 *  • il y a une cinquantaine de signalements ouverts, dont la moitié a plus
 *    d'un mois. Aucune échéance n'est posée : cinquante rappels en retard le
 *    premier jour, et la liste se fait couper au bout d'une semaine.
 *    L'ancienneté passe par la PRIORITÉ, qui trie sans sonner.
 */

import {
  type Rappel, type OptionsRappels, type FicheProjet,
  dateSuisse, ageEnJours, prioriteSelonAge, court, jetonProjet,
} from "@/lib/rappels";

/* Réexportés : l'agent et les tests parlent de « rappels de signalements »,
   pas de la boîte à outils qu'il y a dessous. */
export type { Rappel, FicheProjet, OptionsRappels };
export { dateSuisse, ageEnJours, prioriteSelonAge, jetonProjet };

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


/** Les photos d'un signalement, dédoublonnées, pièces et défauts confondus. */
export function photosDe(s: SignalementBrut): string[] {
  const brut = [s.photoUrl, ...(s.photoUrls || [])].filter(Boolean) as string[];
  return [...new Set(brut.map((u) => u.trim()).filter(Boolean))];
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
  const genre = famille === "piece"
    ? "Pièce manquante"
    : estConstat(s)
      ? `Constat avant intervention${s.typesLabel ? ` — ${s.typesLabel}` : ""}`
      : (s.typesLabel || "Défaut");
  const description = String(s.description || "").trim();
  const jours = ageEnJours(s.timestamp, maintenant);

  // ── Titre : ce qu'on lit sur une montre, d'un coup d'œil. ──
  const tete = tm || court(chantier, 22);
  const titre = `${tete} · ${genre}${description ? ` — ${court(description, 58)}` : ""}`;

  const cab = s.cabineLabel && s.cabineLabel.trim()
    ? `?signalement=${encodeURIComponent(s.cabineLabel.trim())}`
    : "?signalement=1";
  const url = `${origine}/projet/${s.projectId}${cab}`;

  // ── Notes : tout le reste, dans l'ordre où la question se pose. ──
  const l: string[] = [];
  /* Le lien EN PREMIER, avant tout le reste. Le champ « URL » de l'app
     Rappels n'est accessible ni à EventKit ni à AppleScript — on l'a cherché.
     La note, elle, s'affiche sous le titre dans la liste, et Rappels y rend
     les adresses cliquables : le chantier s'ouvre d'un geste, sans dépiauter
     la fiche. */
  l.push(`→ Ouvrir le chantier : ${url}`);
  l.push("");
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
  l.push("");
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
    /* Constats d'avant-intervention compris : ils sont demandés, et leur
       type suffit à les distinguer d'un défaut à réparer. */
    ...defauts.filter(estOuvert).map((s) => ({ s, f: "defaut" as const })),
  ];
  retenus.sort((a, b) => (a.s.timestamp || 0) - (b.s.timestamp || 0));
  return retenus.map(({ s, f }) => enRappel(s, f, fiches.get(s.projectId) || {}, o));
}
