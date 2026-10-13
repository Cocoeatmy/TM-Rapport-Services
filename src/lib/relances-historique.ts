/**
 * L'historique des relances — ce que Notion ne garde pas.
 *
 * Le champ Notion « Relance dossier » est une DATE, pas une liste : il retient
 * la dernière relance et oublie les précédentes. Or « relancé une fois » et
 * « relancé trois fois sans réponse » n'appellent pas le même geste — le
 * second, c'est un téléphone, pas un quatrième courrier.
 *
 * On garde donc la suite des relances ici, dans le magasin de l'application,
 * sans rien ajouter au schéma Notion. Les deux restent cohérents : la date
 * Notion est toujours la dernière de cette liste, et c'est elle qui alimente
 * la formule « Etat de relance ».
 */

import { getData, setData } from "@/lib/kv-store";

export const CLE_RELANCES = "relances-historique";

export interface EvenementRelance {
  /** Identifiant de la page Notion du projet. */
  projet: string;
  /** Jour de la relance, AAAA-MM-JJ. */
  le: string;
  /** Qui l'a déclenchée. */
  par: string;
}

/** Les relances par projet, de la plus ancienne à la plus récente. */
export type Historique = Record<string, string[]>;

function regrouper(lignes: EvenementRelance[]): Historique {
  const out: Historique = {};
  for (const e of lignes) {
    if (!e?.projet || !e?.le) continue;
    (out[e.projet] = out[e.projet] || []).push(e.le);
  }
  for (const k of Object.keys(out)) out[k].sort();
  return out;
}

export async function lireHistorique(): Promise<Historique> {
  try {
    return regrouper(await getData<EvenementRelance>(CLE_RELANCES));
  } catch {
    /* Magasin injoignable : aucune relance connue. L'écran reste juste, il
       dira seulement « jamais relancé » là où il aurait compté. La date
       Notion, elle, reste la source de vérité du « déjà relancé ». */
    return {};
  }
}

/**
 * Inscrit une relance pour chacun de ces projets, et rend l'historique à jour.
 *
 * Deux relances le MÊME JOUR pour le même dossier ne comptent que pour une :
 * un double clic, ou un courrier rouvert parce que la première fenêtre s'est
 * fermée, ne sont pas deux relances.
 */
export async function noterRelances(
  ids: readonly string[],
  par: string,
  jour: string,
): Promise<Historique> {
  const lignes = await getData<EvenementRelance>(CLE_RELANCES).catch(() => [] as EvenementRelance[]);
  const deja = new Set(lignes.map((e) => `${e.projet}|${e.le}`));
  const ajouts: EvenementRelance[] = [];
  for (const projet of new Set(ids)) {
    if (!projet || deja.has(`${projet}|${jour}`)) continue;
    ajouts.push({ projet, le: jour, par });
  }
  if (ajouts.length > 0) await setData(CLE_RELANCES, [...lignes, ...ajouts]);
  return regrouper([...lignes, ...ajouts]);
}
