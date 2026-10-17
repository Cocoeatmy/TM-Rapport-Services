/**
 * L'archive : une copie des données qui ne dépend de personne.
 *
 * ── Pourquoi elle existe ──────────────────────────────────────────────────
 *
 * Les sauvegardes nocturnes vivent dans des pages Notion `[DATA] …` : même
 * base, même espace de travail, même jeton d'intégration que les données
 * d'origine. Elles protègent très bien du cas probable — une écriture fautive
 * de l'application — et de rien d'autre. Si Notion lui-même est en cause
 * (espace supprimé, jeton révoqué, base vidée par une fausse manœuvre), les
 * deux copies partent ensemble.
 *
 * Une archive est un simple fichier. On la télécharge, on la range où l'on
 * veut, on la renvoie par courriel. Aucun service tiers, aucun abonnement.
 *
 * Et surtout : elle se RELIT. Une sauvegarde qu'on ne sait pas restaurer
 * n'est pas une sauvegarde, c'est un fichier.
 */

export const FORMAT_ARCHIVE = "tm-rapport-export";
export const VERSION_ARCHIVE = 1;

export interface Archive {
  format: typeof FORMAT_ARCHIVE;
  version: number;
  genereLe: string;
  par: string;
  listes: Record<string, unknown[]>;
  /** Ce qui n'a PAS pu être lu, et pourquoi. Une archive ne ment pas. */
  manquantes: Record<string, string>;
  empreintes: Record<string, { lignes: number; octets: number }>;
}

export function construireArchive(
  listes: Record<string, unknown[]>,
  manquantes: Record<string, string>,
  par: string,
  quand: Date = new Date(),
): Archive {
  const empreintes: Record<string, { lignes: number; octets: number }> = {};
  for (const [cle, d] of Object.entries(listes)) {
    empreintes[cle] = { lignes: d.length, octets: JSON.stringify(d).length };
  }
  return {
    format: FORMAT_ARCHIVE,
    version: VERSION_ARCHIVE,
    genereLe: quand.toISOString(),
    par,
    listes,
    manquantes,
    empreintes,
  };
}

export type Verdict =
  | { valide: true; archive: Archive }
  | { valide: false; motif: string };

/**
 * L'archive est-elle lisible et cohérente ?
 *
 * On vérifie aussi les empreintes : une archive tronquée en cours de
 * téléchargement se repère ici, et non au moment où l'on en a besoin.
 */
export function validerArchive(brut: unknown): Verdict {
  if (!brut || typeof brut !== "object" || Array.isArray(brut)) {
    return { valide: false, motif: "Ce n'est pas une archive." };
  }
  const a = brut as Partial<Archive>;
  if (a.format !== FORMAT_ARCHIVE) {
    return { valide: false, motif: `Format inconnu : « ${String(a.format)} ».` };
  }
  if (typeof a.version !== "number" || a.version > VERSION_ARCHIVE) {
    return { valide: false, motif: `Version ${String(a.version)} non prise en charge.` };
  }
  if (!a.listes || typeof a.listes !== "object") {
    return { valide: false, motif: "L'archive ne contient aucune liste." };
  }
  for (const [cle, d] of Object.entries(a.listes)) {
    if (!Array.isArray(d)) return { valide: false, motif: `« ${cle} » n'est pas une liste.` };
    const e = a.empreintes?.[cle];
    if (e && e.lignes !== d.length) {
      return {
        valide: false,
        motif: `« ${cle} » est incomplète : ${d.length} lignes pour ${e.lignes} annoncées.`,
      };
    }
  }
  return {
    valide: true,
    archive: {
      format: FORMAT_ARCHIVE,
      version: a.version,
      genereLe: String(a.genereLe || ""),
      par: String(a.par || ""),
      listes: a.listes as Record<string, unknown[]>,
      manquantes: (a.manquantes as Record<string, string>) || {},
      empreintes: (a.empreintes as Archive["empreintes"]) || {},
    },
  };
}

export interface LigneComparaison {
  cle: string;
  actuel: number | null;
  archive: number;
  delta: number | null;
  perteNette: boolean;
}

/** Ce qu'une restauration changerait, clé par clé — avant de rien faire. */
export function comparerArchive(
  archive: Archive,
  actuels: Record<string, number | null>,
): LigneComparaison[] {
  return Object.entries(archive.listes).map(([cle, d]) => {
    const actuel = actuels[cle] ?? null;
    const delta = actuel === null ? null : d.length - actuel;
    return { cle, actuel, archive: d.length, delta, perteNette: delta !== null && delta < 0 };
  });
}

/** Le nom du fichier, lisible et triable. */
export function nomDeFichier(quand: Date = new Date(), complet = true): string {
  return `tm-rapport-export-${quand.toISOString().slice(0, 10)}${complet ? "" : "-PARTIEL"}.json`;
}
