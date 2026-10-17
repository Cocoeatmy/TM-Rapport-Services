/**
 * Les pastilles du Kanban : ce qui va bien, ce qui attend, ce qui dérape.
 *
 * Une règle de couleur qui se trompe ne se lit plus. Celles d'ici s'appuient
 * donc sur des faits déjà écrits dans Notion — une date passée, un statut
 * d'attente posé à la main, une offre sans commande — et jamais sur une
 * déduction confortable. En particulier : un dossier en attente n'est PAS un
 * dossier bloqué, et rien ici ne le prétendra.
 *
 * Les prédicats de retard et de blocage ne sont pas réécrits : ce sont ceux
 * du tableau de bord (`signaux.ts`), déjà éprouvés et testés. Deux définitions
 * du mot « bloqué » dans la même application, c'est une de trop.
 */
import type { Project } from "./notion";
import {
  chantierBloque, commandeEnRetard, estClos, jourDe, retardDeMontage,
  type ChantierSignal,
} from "./signaux";

export type Indicateur = "urgent" | "bloque" | "relancer" | "attente" | "nouveau" | "ajour";

export interface MetaIndicateur {
  libelle: string;
  /** Le rond de couleur, pour les écrans qui n'affichent pas de pastille. */
  point: string;
  trait: string;
  fond: string;
  texte: string;
}

/**
 * L'ordre est celui de l'affichage : une carte ne porte qu'une pastille, la
 * plus grave. Trois pastilles sur une carte, c'est une carte qu'on ne lit
 * plus. Les autres situations restent enregistrées et servent aux filtres —
 * un projet urgent ET bloqué se trouve dans les deux.
 */
export const ORDRE_INDICATEURS: Indicateur[] = [
  "urgent", "bloque", "relancer", "attente", "nouveau", "ajour",
];

export const META_INDICATEURS: Record<Indicateur, MetaIndicateur> = {
  urgent:   { libelle: "Urgent",      point: "🔴", trait: "#ef4444", fond: "#fef2f2", texte: "#b91c1c" },
  bloque:   { libelle: "Bloqué",      point: "🟣", trait: "#a855f7", fond: "#faf5ff", texte: "#7e22ce" },
  relancer: { libelle: "À relancer",  point: "🟠", trait: "#f59e0b", fond: "#fffbeb", texte: "#b45309" },
  attente:  { libelle: "En attente",  point: "🟡", trait: "#eab308", fond: "#fefce8", texte: "#a16207" },
  nouveau:  { libelle: "Nouveau",     point: "🔵", trait: "#3b82f6", fond: "#eff6ff", texte: "#1d4ed8" },
  ajour:    { libelle: "À jour",      point: "🟢", trait: "#22c55e", fond: "#f0fdf4", texte: "#15803d" },
};

/* ───────────────────────────────────────────────────────────────────────────
   Les réglages
   ─────────────────────────────────────────────────────────────────────────── */

export interface Regles {
  /** Un projet est « nouveau » pendant ce nombre d'heures après sa création. */
  nouveauHeures: number;
  /** Une offre sans commande devient « à relancer » après ce délai. */
  relanceOffreJours: number;
  /** Après une relance, on laisse ce délai avant d'en conseiller une autre. */
  relanceSuivanteJours: number;
  /** Les indicateurs qu'on ne veut pas voir du tout. */
  desactives: Indicateur[];
}

export const REGLES_PAR_DEFAUT: Regles = {
  nouveauHeures: 48,
  relanceOffreJours: 14,
  relanceSuivanteJours: 14,
  desactives: [],
};

/* ───────────────────────────────────────────────────────────────────────────
   Les règles, une par une
   ─────────────────────────────────────────────────────────────────────────── */

/** Les mots qui, dans un statut Notion, disent une attente. */
const MOTS_ATTENTE = ["attendre news", "attente news", "sans réponse", "en attente"];

/**
 * Un statut d'attente, reconnu au texte plutôt qu'à une liste figée.
 *
 * Les statuts changent de nom dans Notion ; une liste écrite ici se périmerait
 * sans bruit. « RDV - Attendre news » et « Mesures relevées - attente news »
 * se reconnaissent tous deux, et un statut futur formulé de même aussi.
 */
export function estEnAttente(p: Project): boolean {
  const t = `${p.etatMesures || ""} ${p.etatCMD || ""}`.toLowerCase();
  return MOTS_ATTENTE.some((m) => t.includes(m));
}

/** Créé il y a moins de `heures`. */
export function estNouveau(p: Project, maintenant: number, heures: number): boolean {
  const t = Date.parse(p.createdTime || "");
  if (Number.isNaN(t)) return false;
  return maintenant - t < heures * 3600_000;
}

/**
 * À RELANCER — une offre est partie, rien n'a été commandé, et le temps passe.
 *
 * Le point de départ est la dernière relance s'il y en a eu une, l'envoi de
 * l'offre sinon : relancer deux fois la même semaine fait perdre un client
 * plus sûrement que de ne pas relancer du tout.
 */
export function aRelancer(p: Project, aujourdhui: string, r: Regles): boolean {
  if (estClos(p as unknown as ChantierSignal)) return false;
  const offre = jourDe(p.dateOffre);
  if (!offre) return false;
  /* Une commande reçue clôt la question : il n'y a plus rien à relancer. */
  if (jourDe(p.dateCMDRecue)) return false;
  const relance = jourDe(p.relanceDossier);
  const depuis = relance || offre;
  const delai = relance ? r.relanceSuivanteJours : r.relanceOffreJours;
  return joursEntre(depuis, aujourdhui) >= delai;
}

/** Jours écoulés entre deux jours AAAA-MM-JJ (0 si l'un manque). */
export function joursEntre(debut: string, fin: string): number {
  const a = Date.parse(`${debut}T12:00:00Z`);
  const b = Date.parse(`${fin}T12:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86400000));
}

/**
 * URGENT — soit quelqu'un l'a décidé, soit une date est passée.
 *
 * La priorité posée dans Notion compte, mais pas « Normal » : une colonne
 * remplie partout à « Normal » rendrait tout le tableau rouge.
 */
export function estUrgent(p: Project, aujourdhui: string): boolean {
  const prio = (p.priorite || "").trim().toLowerCase();
  if (prio && prio !== "normal" && prio !== "normale" && prio !== "basse") return true;
  const s = p as unknown as ChantierSignal;
  return retardDeMontage(s, aujourdhui) || commandeEnRetard(s, aujourdhui);
}

/* ───────────────────────────────────────────────────────────────────────────
   Le calcul complet
   ─────────────────────────────────────────────────────────────────────────── */

export interface Situation {
  /** Celui qu'on affiche : le plus grave. */
  principal: Indicateur;
  /** Tous ceux qui s'appliquent — ce sont eux que les filtres interrogent. */
  tous: Indicateur[];
  /** Ce qu'on dit au survol de la pastille, en clair. */
  raisons: string[];
  /** Une priorité posée à la main, s'il y en a une. */
  manuelle?: Indicateur;
}

export interface Contexte {
  aujourdhui: string;
  maintenant: number;
  /** Les projets qui ont une pièce demandée et pas reçue. */
  piecesOuvertes: Set<string>;
  /** Les priorités posées à la main, par identifiant de projet. */
  manuelles: Record<string, Indicateur>;
  regles: Regles;
}

export function contexteVide(): Contexte {
  const d = new Date();
  return {
    aujourdhui: d.toISOString().slice(0, 10),
    maintenant: d.getTime(),
    piecesOuvertes: new Set(),
    manuelles: {},
    regles: REGLES_PAR_DEFAUT,
  };
}

/**
 * La situation d'un projet.
 *
 * Une priorité posée à la main passe devant pour l'affichage, mais
 * **n'efface jamais une alerte automatique** : un chantier réellement en
 * retard reste dans le filtre « Urgents » même si on l'a marqué « Normal ».
 * C'était la demande, et c'est aussi la seule version défendable — sinon il
 * suffirait de repeindre un problème en vert pour le faire disparaître.
 */
export function situationDe(p: Project, c: Contexte): Situation {
  const tous: Indicateur[] = [];
  const raisons: string[] = [];
  const s = p as unknown as ChantierSignal;

  if (estUrgent(p, c.aujourdhui)) {
    tous.push("urgent");
    const prio = (p.priorite || "").trim();
    if (prio && !["Normal", "Normale", "Basse"].includes(prio)) raisons.push(`Priorité « ${prio} » dans Notion`);
    if (retardDeMontage(s, c.aujourdhui)) {
      raisons.push(`Montage prévu le ${jourDe(p.dateMontage)}, rien de posé — ${joursEntre(jourDe(p.dateMontage), c.aujourdhui)} jour(s) de retard`);
    }
    if (commandeEnRetard(s, c.aujourdhui)) {
      raisons.push(`Livraison annoncée le ${jourDe(p.previsionLivraison)}, rien d'arrivé`);
    }
  }

  if (chantierBloque(s, c.piecesOuvertes.has(p.id))) {
    tous.push("bloque");
    raisons.push(
      c.piecesOuvertes.has(p.id)
        ? "Une pièce a été demandée et n'est pas arrivée"
        : "Statut « Soucis montage »",
    );
  }

  if (aRelancer(p, c.aujourdhui, c.regles)) {
    tous.push("relancer");
    const relance = jourDe(p.relanceDossier);
    raisons.push(
      relance
        ? `Relancé le ${relance}, toujours rien de commandé`
        : `Offre du ${jourDe(p.dateOffre)}, toujours rien de commandé`,
    );
  }

  if (estEnAttente(p)) {
    tous.push("attente");
    raisons.push("Le statut dit qu'on attend une réponse");
  }

  if (estNouveau(p, c.maintenant, c.regles.nouveauHeures)) {
    tous.push("nouveau");
    raisons.push("Créé il y a moins de 48 heures");
  }

  const actifs = tous.filter((i) => !c.regles.desactives.includes(i));
  if (actifs.length === 0) {
    actifs.push("ajour");
    raisons.push("Rien à signaler");
  }

  const manuelle = c.manuelles[p.id];
  const parGravite = ORDRE_INDICATEURS.filter((i) => actifs.includes(i));
  /* La main de l'administrateur décide de la couleur affichée ; les alertes
     calculées, elles, restent dans `tous` et continuent de répondre aux
     filtres. */
  const principal = manuelle ?? parGravite[0] ?? "ajour";

  return {
    principal,
    tous: [...new Set(manuelle ? [manuelle, ...actifs] : actifs)],
    raisons: manuelle
      ? [`Priorité posée à la main : ${META_INDICATEURS[manuelle].libelle}`, ...raisons]
      : raisons,
    manuelle,
  };
}

/** Les compteurs des boutons de filtrage rapide. */
export function comptesIndicateurs(
  projets: Project[],
  c: Contexte,
): Record<Indicateur, number> {
  const out = Object.fromEntries(ORDRE_INDICATEURS.map((i) => [i, 0])) as Record<Indicateur, number>;
  for (const p of projets) {
    for (const i of situationDe(p, c).tous) out[i] += 1;
  }
  return out;
}

/** Ce qui mérite d'être regardé aujourd'hui. */
export const INDICATEURS_PRIORITAIRES: Indicateur[] = ["urgent", "bloque", "relancer"];

export function estDansMesPriorites(p: Project, c: Contexte): boolean {
  const s = situationDe(p, c);
  if (s.tous.some((i) => INDICATEURS_PRIORITAIRES.includes(i))) return true;
  /* Un rendez-vous aujourd'hui, c'est aussi une affaire du jour. */
  return jourDe(p.dateMontage) === c.aujourdhui;
}

/* ───────────────────────────────────────────────────────────────────────────
   Le temps passé sans bouger
   ─────────────────────────────────────────────────────────────────────────── */

export interface LigneHistorique {
  projetId: string;
  vue: "mesures" | "cmd";
  avant: string;
  apres: string;
  quand: string;
  qui: string;
}

/**
 * Depuis combien de jours ce projet n'a-t-il pas changé de statut ?
 *
 * `null` quand on ne sait pas, et on le dira : l'historique ne commence qu'au
 * jour où l'application s'est mise à l'enregistrer. Déduire une ancienneté
 * de la date de création donnerait des « 240 jours sans évolution » sur des
 * dossiers suivis de près, et l'alerte ne vaudrait plus rien.
 */
export function joursSansEvolution(
  projetId: string,
  vue: "mesures" | "cmd",
  historique: LigneHistorique[],
  aujourdhui: string,
): number | null {
  const siennes = historique
    .filter((h) => h.projetId === projetId && h.vue === vue)
    .sort((a, b) => b.quand.localeCompare(a.quand));
  if (siennes.length === 0) return null;
  return joursEntre(siennes[0].quand.slice(0, 10), aujourdhui);
}
