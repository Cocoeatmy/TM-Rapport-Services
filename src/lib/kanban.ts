/**
 * Le Kanban : ranger des projets en colonnes, et rien d'autre.
 *
 * Tout ce qui décide — quelle colonne, quel ordre, quelles cartes restent
 * après un filtre — vit ici, en fonctions pures. L'écran ne fait que dessiner
 * le résultat. C'est ce qui permet de vérifier par des tests qu'un projet sans
 * statut n'est jamais perdu, qu'un déplacement dans une colonne ne change pas
 * l'état, et qu'un filtre n'escamote rien en silence.
 *
 * Les colonnes ne sont PAS écrites ici : elles viennent du schéma Notion, par
 * `/api/kanban/colonnes`. Une liste codée à la main se périmerait au premier
 * statut renommé, et le Kanban montrerait des colonnes qui n'existent plus en
 * laissant tomber celles qui existent.
 */
import type { Project } from "./notion";
import { correspond, foldSearch, indexDeProjet } from "./recherche-projets";
import {
  ORDRE_INDICATEURS, estDansMesPriorites, situationDe,
  type Contexte, type Indicateur,
} from "./kanban-indicateurs";
import { jourDe } from "./signaux";

/** Les deux propriétés Notion qu'on peut mettre en colonnes. */
export type Vue = "mesures" | "cmd";

export const PROPRIETE_DE_VUE: Record<Vue, "etatMesures" | "etatCMD"> = {
  mesures: "etatMesures",
  cmd: "etatCMD",
};

export const LIBELLE_DE_VUE: Record<Vue, string> = {
  mesures: "État des mesures",
  cmd: "État des commandes",
};

/**
 * La colonne des projets dont la propriété est vide.
 *
 * Elle existe toujours, même vide, parce que l'alternative est pire : un
 * projet sans statut qui n'apparaît dans aucune colonne disparaît de l'écran
 * sans que personne ne s'en aperçoive.
 */
export const SANS_STATUT = "__sans_statut__";
export const LIBELLE_SANS_STATUT = "Sans statut";

export interface OptionColonne {
  nom: string;
  /** Le nom de couleur Notion (« blue », « red »…), s'il existe. */
  couleur?: string;
}

export interface Colonne {
  /** La valeur du statut, ou SANS_STATUT. */
  id: string;
  titre: string;
  couleur?: string;
  projets: Project[];
}

/** L'état d'un projet pour la vue demandée, « » quand la propriété est vide. */
export function statutDe(p: Project, vue: Vue): string {
  const v = p[PROPRIETE_DE_VUE[vue]];
  return typeof v === "string" ? v.trim() : "";
}

/* ───────────────────────────────────────────────────────────────────────────
   Filtres
   ─────────────────────────────────────────────────────────────────────────── */

export interface Filtres {
  recherche: string;
  collaborateur: string | null;
  fournisseur: string | null;
  localite: string | null;
  /** Les projets terminés et annulés sont écartés tant qu'on ne les demande pas. */
  avecTermines: boolean;
  /** Les pastilles retenues. Plusieurs couleurs = l'une OU l'autre. */
  indicateurs: Indicateur[];
  /** Les dossiers que personne ne porte. */
  sansResponsable: boolean;
  /** Urgent, bloqué, à relancer, ou un rendez-vous aujourd'hui. */
  mesPriorites: boolean;
}

export const FILTRES_VIDES: Filtres = {
  recherche: "",
  collaborateur: null,
  fournisseur: null,
  localite: null,
  avecTermines: false,
  indicateurs: [],
  sansResponsable: false,
  mesPriorites: false,
};

export function filtresActifs(f: Filtres): number {
  return (
    (f.recherche.trim() ? 1 : 0) +
    (f.collaborateur ? 1 : 0) +
    (f.fournisseur ? 1 : 0) +
    (f.localite ? 1 : 0) +
    (f.avecTermines ? 1 : 0) +
    (f.indicateurs.length > 0 ? 1 : 0) +
    (f.sansResponsable ? 1 : 0) +
    (f.mesPriorites ? 1 : 0)
  );
}

/** Les états qui signent un dossier clos — écartés par défaut, jamais effacés. */
const ETATS_CLOS = new Set(["terminé", "termine", "annulé", "annule"]);

export function estClos(p: Project): boolean {
  return (
    ETATS_CLOS.has(foldSearch(p.etatCMD || "")) ||
    ETATS_CLOS.has(foldSearch(p.etatMesures || ""))
  );
}

/**
 * La localité, extraite de l'adresse du chantier.
 *
 * Les adresses suisses finissent par « 1720 Corminbœuf ». On lit donc le
 * dernier code postal rencontré et ce qui le suit. Quand rien ne ressemble à
 * une adresse, on ne devine pas : on rend une chaîne vide.
 */
export function localiteDe(p: Project): string {
  const texte = (p.adresseChantier || "").replace(/\s+/g, " ").trim();
  const m = texte.match(/\b(\d{4})\s+([^,;]+)$/);
  return m ? `${m[1]} ${m[2]}`.trim() : "";
}

/** Les collaborateurs d'un projet, un par un (« Claudio & Jacobo »). */
export function collaborateursDe(p: Project): string[] {
  return (p.collaborateurs || "")
    .split(/[&,/]|\bet\b/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface IndexProjet {
  projet: Project;
  index: string;
}

/** Pré-calcule le texte de recherche : la frappe doit rester instantanée. */
export function indexer(projets: Project[]): IndexProjet[] {
  return projets.map((projet) => ({ projet, index: indexDeProjet(projet) }));
}

export function filtrer(indexes: IndexProjet[], f: Filtres, c?: Contexte): Project[] {
  const collab = f.collaborateur ? foldSearch(f.collaborateur) : null;
  const fourn = f.fournisseur ? foldSearch(f.fournisseur) : null;
  const loc = f.localite ? foldSearch(f.localite) : null;
  /* Les filtres par couleur ont besoin du contexte (dates, pièces ouvertes,
     priorités). Sans lui, on ne devine pas : on laisse passer. */
  const parCouleur = c && f.indicateurs.length > 0;

  return indexes
    .filter(({ projet, index }) => {
      if (!f.avecTermines && estClos(projet)) return false;
      if (!correspond(projet, f.recherche, index)) return false;
      if (collab && !collaborateursDe(projet).some((x) => foldSearch(x).includes(collab))) return false;
      if (fourn) {
        const liste = [...(projet.fournisseurs || []), ...(projet.fournisseursNames || [])];
        if (!liste.some((x) => foldSearch(x).includes(fourn))) return false;
      }
      if (loc && !foldSearch(localiteDe(projet)).includes(loc)) return false;
      if (f.sansResponsable && collaborateursDe(projet).length > 0) return false;
      if (parCouleur) {
        const situation = situationDe(projet, c!);
        if (!situation.tous.some((i) => f.indicateurs.includes(i))) return false;
      }
      if (f.mesPriorites && c && !estDansMesPriorites(projet, c)) return false;
      return true;
    })
    .map((x) => x.projet);
}

/** Un rendez-vous de montage prévu aujourd'hui. */
export function estDuJour(p: Project, aujourdhui: string): boolean {
  return jourDe(p.dateMontage) === aujourdhui;
}

/* ───────────────────────────────────────────────────────────────────────────
   Tri
   ─────────────────────────────────────────────────────────────────────────── */

export type Tri = "manuel" | "priorite" | "recent" | "ancien" | "modifie" | "numero" | "client" | "localite";

export const TRIS: { id: Tri; libelle: string }[] = [
  { id: "manuel", libelle: "Ordre manuel" },
  { id: "priorite", libelle: "Priorité automatique" },
  { id: "recent", libelle: "Plus récent" },
  { id: "ancien", libelle: "Plus ancien" },
  { id: "modifie", libelle: "Dernière modification" },
  { id: "numero", libelle: "Numéro de projet" },
  { id: "client", libelle: "Nom du client" },
  { id: "localite", libelle: "Localité" },
];

const date = (s?: string | null) => (s ? new Date(s).getTime() : 0);

/**
 * Trie une colonne.
 *
 * `ordreManuel` est la liste des identifiants rangés à la main : les projets
 * qu'elle nomme viennent en tête, dans son ordre, les autres suivent. Ainsi
 * un projet nouvellement arrivé dans la colonne ne se cache pas tout en bas
 * d'un ordre établi il y a trois semaines.
 */
export function trier(
  projets: Project[],
  tri: Tri,
  ordreManuel: string[] = [],
  contexte?: Contexte,
): Project[] {
  const liste = [...projets];
  if (tri === "priorite") {
    /* Ce qui demande une action remonte. Sans contexte on ne devine pas la
       gravité : on retombe alors sur le plus récent, qui ne ment pas. */
    if (!contexte) return liste.sort((a, b) => date(b.createdTime) - date(a.createdTime));
    const rang = (p: Project) => ORDRE_INDICATEURS.indexOf(situationDe(p, contexte).principal);
    return liste.sort((a, b) => rang(a) - rang(b) || date(b.createdTime) - date(a.createdTime));
  }
  if (tri === "manuel") {
    const rang = new Map(ordreManuel.map((id, i) => [id, i]));
    return liste.sort((a, b) => {
      const ra = rang.get(a.id);
      const rb = rang.get(b.id);
      if (ra !== undefined && rb !== undefined) return ra - rb;
      if (ra !== undefined) return -1;
      if (rb !== undefined) return 1;
      return date(b.createdTime) - date(a.createdTime);
    });
  }
  switch (tri) {
    case "recent":
      return liste.sort((a, b) => date(b.createdTime) - date(a.createdTime));
    case "ancien":
      return liste.sort((a, b) => date(a.createdTime) - date(b.createdTime));
    case "modifie":
      return liste.sort((a, b) => date(b.lastEditedTime) - date(a.lastEditedTime));
    case "numero":
      return liste.sort((a, b) => (b.ofrTM || "").localeCompare(a.ofrTM || "", "fr"));
    case "client":
      return liste.sort((a, b) => (a.projet || "").localeCompare(b.projet || "", "fr"));
    case "localite":
      return liste.sort((a, b) => localiteDe(a).localeCompare(localiteDe(b), "fr"));
    default:
      return liste;
  }
}

/* ───────────────────────────────────────────────────────────────────────────
   Colonnes
   ─────────────────────────────────────────────────────────────────────────── */

export interface ReglagesColonnes {
  masquees: string[];
  /** Ne montrer que les colonnes qui contiennent au moins un projet. */
  masquerVides: boolean;
  tri: Tri;
  ordreManuel: Record<string, string[]>;
}

export const REGLAGES_COLONNES_PAR_DEFAUT: ReglagesColonnes = {
  masquees: [],
  masquerVides: false,
  tri: "manuel",
  ordreManuel: {},
};

/**
 * Range les projets en colonnes.
 *
 * L'ordre des colonnes est celui de Notion, parce que c'est l'ordre que vous
 * voyez dans la base. Un statut porté par un projet mais absent du schéma —
 * une option renommée depuis la dernière synchronisation — reçoit malgré tout
 * sa colonne, en fin de liste : mieux vaut une colonne inattendue qu'un
 * projet escamoté.
 */
export function construireColonnes(
  projets: Project[],
  vue: Vue,
  options: OptionColonne[],
  reglages: ReglagesColonnes = REGLAGES_COLONNES_PAR_DEFAUT,
  contexte?: Contexte,
): Colonne[] {
  const parStatut = new Map<string, Project[]>();
  for (const p of projets) {
    const s = statutDe(p, vue) || SANS_STATUT;
    const l = parStatut.get(s);
    if (l) l.push(p);
    else parStatut.set(s, [p]);
  }

  const connues = new Set(options.map((o) => o.nom));
  const inattendues = [...parStatut.keys()]
    .filter((s) => s !== SANS_STATUT && !connues.has(s))
    .sort((a, b) => a.localeCompare(b, "fr"));

  const toutes: OptionColonne[] = [
    ...options,
    ...inattendues.map((nom) => ({ nom })),
    { nom: SANS_STATUT },
  ];

  const masquees = new Set(reglages.masquees);

  return toutes
    .map((o) => ({
      id: o.nom,
      titre: o.nom === SANS_STATUT ? LIBELLE_SANS_STATUT : o.nom,
      couleur: o.couleur,
      projets: trier(parStatut.get(o.nom) || [], reglages.tri, reglages.ordreManuel[o.nom] || [], contexte),
    }))
    .filter((c) => {
      if (masquees.has(c.id)) return false;
      /* La colonne « Sans statut » ne se cache que si elle est vide : c'est
         un signal, pas une étape du travail. */
      if (c.id === SANS_STATUT) return c.projets.length > 0;
      if (reglages.masquerVides && c.projets.length === 0) return false;
      return true;
    });
}

/** Le compte par colonne, colonnes masquées comprises — pour les réglages. */
export function comptesParColonne(projets: Project[], vue: Vue): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of projets) {
    const s = statutDe(p, vue) || SANS_STATUT;
    out[s] = (out[s] || 0) + 1;
  }
  return out;
}

/**
 * Les valeurs proposées dans les filtres, tirées des projets eux-mêmes.
 *
 * On ne propose jamais un filtre qui ne ramènerait rien : la liste vient des
 * données affichées, pas d'une énumération écrite d'avance.
 */
export function valeursDeFiltres(projets: Project[]): {
  collaborateurs: string[];
  fournisseurs: string[];
  localites: string[];
} {
  const c = new Set<string>();
  const f = new Set<string>();
  const l = new Set<string>();
  for (const p of projets) {
    for (const x of collaborateursDe(p)) c.add(x);
    for (const x of [...(p.fournisseurs || []), ...(p.fournisseursNames || [])]) if (x) f.add(x);
    const loc = localiteDe(p);
    if (loc) l.add(loc);
  }
  const tri = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b, "fr"));
  return { collaborateurs: tri(c), fournisseurs: tri(f), localites: tri(l) };
}

/* ───────────────────────────────────────────────────────────────────────────
   Couleurs

   Notion nomme ses couleurs ; l'écran a besoin de teintes. On traduit ici, une
   fois, en restant volontairement pâle : une colonne doit se reconnaître d'un
   coup d'œil sans crier plus fort que les cartes qu'elle contient.
   ─────────────────────────────────────────────────────────────────────────── */

export interface Teinte {
  /** Le trait de couleur en tête de colonne et au bord de la carte. */
  trait: string;
  /** Le fond très pâle de la colonne. */
  fond: string;
}

const TEINTES: Record<string, Teinte> = {
  default: { trait: "#94a3b8", fond: "#f1f5f9" },
  gray:    { trait: "#94a3b8", fond: "#f1f5f9" },
  brown:   { trait: "#a98467", fond: "#f6f1ec" },
  orange:  { trait: "#f59e0b", fond: "#fef6e7" },
  yellow:  { trait: "#eab308", fond: "#fefae8" },
  green:   { trait: "#22c55e", fond: "#edfaf1" },
  blue:    { trait: "#3b82f6", fond: "#eff5ff" },
  purple:  { trait: "#a855f7", fond: "#f8f1fe" },
  pink:    { trait: "#ec4899", fond: "#fdf0f6" },
  red:     { trait: "#ef4444", fond: "#fef1f1" },
};

export function teinteDe(couleur?: string): Teinte {
  return TEINTES[couleur || "default"] || TEINTES.default;
}
