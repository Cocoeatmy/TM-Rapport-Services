/**
 * Les sauvegardes, les vraies.
 *
 * Ce qui portait ce nom jusqu'au 17 octobre 2026 relisait une clé et la
 * réécrivait AU MÊME ENDROIT. Ce n'était pas une copie : c'était un
 * aller-retour, et le jour où la lecture échouait, l'aller-retour écrivait une
 * liste vide par-dessus les vraies données. Une sauvegarde qui peut détruire
 * ce qu'elle sauvegarde est pire que pas de sauvegarde.
 *
 * Ici, une sauvegarde est une COPIE :
 *   — dans une clé distincte, jamais celle d'origine ;
 *   — datée, par un emplacement hebdomadaire tournant ;
 *   — relue après écriture pour être déclarée bonne ;
 *   — jamais écrite si la lecture de l'original a échoué.
 *
 * Sept emplacements, un par jour de la semaine, réécrits en rotation : on
 * garde toujours une semaine d'historique sans jamais rien supprimer et sans
 * que le volume grandisse indéfiniment.
 */
import { getDataFresh, setBlob, getBlob } from "./kv-store";

/** Les listes qu'on sauvegarde. Ce sont les données vivantes de l'app. */
export const CLES_SAUVEGARDEES = ["pieces", "defauts", "logs", "stocks", "notifications"] as const;
export type CleSauvegardee = (typeof CLES_SAUVEGARDEES)[number];

const JOURS = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"] as const;

/** L'emplacement d'une sauvegarde : une clé par donnée et par jour. */
export function cleDeSauvegarde(cle: string, quand: Date = new Date()): string {
  return `sauvegarde-${cle}-${JOURS[quand.getDay()]}`;
}

/** Les sept emplacements d'une donnée, pour l'inspection et la restauration. */
export function emplacementsDe(cle: string): string[] {
  return JOURS.map((j) => `sauvegarde-${cle}-${j}`);
}

export interface ResultatSauvegarde {
  cle: string;
  emplacement: string;
  /** Combien de lignes ont été copiées. */
  lignes: number;
  /** Combien de lignes la relecture a retrouvées. */
  verifiees: number;
  etat: "ok" | "lecture-impossible" | "ecriture-impossible" | "verification-echouee";
  message?: string;
}

/**
 * Copie UNE liste vers son emplacement du jour.
 *
 * Ne touche jamais à l'original : la seule écriture va vers la clé de
 * sauvegarde. Si la lecture échoue, on s'arrête là et on le dit — c'est
 * exactement le cas qui faisait des dégâts auparavant.
 */
export async function sauvegarderUne(
  cle: string,
  quand: Date = new Date(),
): Promise<ResultatSauvegarde> {
  const emplacement = cleDeSauvegarde(cle, quand);

  let donnees: unknown[];
  try {
    /* `getDataFresh` LÈVE en cas d'erreur Notion, contrairement à `getData`
       qui rend une liste vide. C'est toute la différence entre « il n'y a
       rien » et « je n'ai pas pu lire ». */
    donnees = await getDataFresh<unknown>(cle);
  } catch (e) {
    return {
      cle, emplacement, lignes: 0, verifiees: 0,
      etat: "lecture-impossible",
      message: e instanceof Error ? e.message : String(e),
    };
  }

  try {
    await setBlob(emplacement, donnees);
  } catch (e) {
    return {
      cle, emplacement, lignes: donnees.length, verifiees: 0,
      etat: "ecriture-impossible",
      message: e instanceof Error ? e.message : String(e),
    };
  }

  /* Une sauvegarde qu'on n'a pas relue n'est pas une sauvegarde : on ne sait
     pas si elle est lisible, et on ne le découvrirait que le jour où on en a
     besoin. */
  try {
    const relu = await getBlob<unknown>(emplacement);
    if (relu.length !== donnees.length) {
      return {
        cle, emplacement, lignes: donnees.length, verifiees: relu.length,
        etat: "verification-echouee",
        message: `relu ${relu.length} lignes au lieu de ${donnees.length}`,
      };
    }
    return { cle, emplacement, lignes: donnees.length, verifiees: relu.length, etat: "ok" };
  } catch (e) {
    return {
      cle, emplacement, lignes: donnees.length, verifiees: 0,
      etat: "verification-echouee",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

/** Copie toutes les listes. Une panne sur l'une n'empêche pas les autres. */
export async function sauvegarderTout(
  quand: Date = new Date(),
  cles: readonly string[] = CLES_SAUVEGARDEES,
): Promise<ResultatSauvegarde[]> {
  const out: ResultatSauvegarde[] = [];
  for (const cle of cles) {
    /* En série : Notion accepte environ trois requêtes par seconde, et une
       sauvegarde n'est jamais pressée. */
    out.push(await sauvegarderUne(cle, quand));
  }
  return out;
}

export interface EtatSauvegarde {
  emplacement: string;
  jour: string;
  lignes: number | null;
  lisible: boolean;
}

/** Ce qu'on a sous la main pour une donnée, sans rien modifier. */
export async function inventaireDe(cle: string): Promise<EtatSauvegarde[]> {
  const out: EtatSauvegarde[] = [];
  for (const emplacement of emplacementsDe(cle)) {
    try {
      const d = await getBlob<unknown>(emplacement);
      out.push({ emplacement, jour: emplacement.split("-").pop() || "", lignes: d.length, lisible: true });
    } catch {
      out.push({ emplacement, jour: emplacement.split("-").pop() || "", lignes: null, lisible: false });
    }
  }
  return out;
}

export interface ApercuRestauration {
  cle: string;
  emplacement: string;
  actuel: number | null;
  sauvegarde: number | null;
  /** Ce qu'une restauration changerait. Négatif = on perdrait des lignes. */
  delta: number | null;
  /** Vrai quand la restauration ferait perdre des données : à refuser. */
  perteNette: boolean;
  message?: string;
}

/**
 * Ce qu'une restauration ferait — sans la faire.
 *
 * On ne restaure jamais à l'aveugle : revenir à hier efface ce qui a été
 * saisi aujourd'hui. Cet aperçu existe pour qu'un humain décide en sachant
 * exactement ce qu'il échange.
 */
export async function apercuRestauration(cle: string, emplacement: string): Promise<ApercuRestauration> {
  let actuel: number | null = null;
  let sauvegarde: number | null = null;
  let message: string | undefined;
  try {
    actuel = (await getDataFresh<unknown>(cle)).length;
  } catch (e) {
    message = `état actuel illisible : ${e instanceof Error ? e.message : String(e)}`;
  }
  try {
    sauvegarde = (await getBlob<unknown>(emplacement)).length;
  } catch (e) {
    message = `${message ? message + " · " : ""}sauvegarde illisible : ${e instanceof Error ? e.message : String(e)}`;
  }
  const delta = actuel !== null && sauvegarde !== null ? sauvegarde - actuel : null;
  return {
    cle, emplacement, actuel, sauvegarde, delta,
    perteNette: delta !== null && delta < 0,
    message,
  };
}

/**
 * Lit toutes les listes sauvegardables, en disant ce qui a manqué.
 *
 * Sert à l'export manuel comme à la copie hebdomadaire par courriel : une
 * seule définition de « ce qu'on sauvegarde », pour que les deux ne puissent
 * pas diverger.
 */
export async function rassemblerLesListes(
  cles: readonly string[] = CLES_SAUVEGARDEES,
): Promise<{ listes: Record<string, unknown[]>; manquantes: Record<string, string> }> {
  const listes: Record<string, unknown[]> = {};
  const manquantes: Record<string, string> = {};
  for (const cle of cles) {
    try {
      listes[cle] = await getDataFresh<unknown>(cle);
    } catch (e) {
      /* Une liste illisible est SIGNALÉE, jamais remplacée par un tableau
         vide : une archive qui ment est pire qu'une archive incomplète. */
      manquantes[cle] = e instanceof Error ? e.message : String(e);
    }
  }
  return { listes, manquantes };
}
