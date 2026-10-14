/**
 * Ce que les rapports PDF ont le droit de montrer.
 *
 * Le bloc « Contact » liste le grossiste, l'installateur, l'architecte, la
 * direction des travaux, le client final et les locataires — avec leurs
 * adresses et leurs numéros. C'est précieux quand le rapport reste dans
 * l'entreprise ; c'est le carnet d'adresses du patron quand il part chez un
 * client ou un fournisseur.
 *
 * D'où un interrupteur, et un seul : cinq rapports l'affichent (signalements,
 * arrivage, fiche de travail, SAV, synthèse), et devoir y penser cinq fois
 * reviendrait à ne jamais y penser.
 */

import { getData, getDataFresh, setData } from "@/lib/kv-store";

export const CLE_REGLAGES_RAPPORTS = "reglages-rapports";

export interface ReglagesRapports {
  /** Le bloc « Contact » figure-t-il sur les rapports ? */
  contacts: boolean;
}

/** Les contacts s'affichaient depuis toujours : ne rien régler ne change rien. */
export const REGLAGES_PAR_DEFAUT: ReglagesRapports = { contacts: true };

/**
 * Lit la valeur stockée, en se repliant sur le défaut.
 *
 * Pure, pour que la règle se teste sans magasin : un enregistrement absent,
 * vide ou abîmé doit donner le comportement d'avant, pas une page sans
 * contacts qu'on mettrait des semaines à remarquer.
 */
export function interpreterReglages(lignes: unknown): ReglagesRapports {
  const premier = Array.isArray(lignes) ? lignes[0] : lignes;
  if (!premier || typeof premier !== "object") return REGLAGES_PAR_DEFAUT;
  const brut = (premier as { contacts?: unknown }).contacts;
  return { contacts: typeof brut === "boolean" ? brut : REGLAGES_PAR_DEFAUT.contacts };
}

/**
 * Le paramètre d'adresse l'emporte sur le réglage.
 *
 * `?contacts=0` ou `?contacts=1` permet de trancher pour UN envoi sans
 * toucher au réglage général — utile pour le rapport qu'on adresse une fois
 * à un architecte.
 */
export function contactsVisibles(
  reglages: ReglagesRapports,
  parametre: string | null,
): boolean {
  if (parametre === "0" || parametre === "false") return false;
  if (parametre === "1" || parametre === "true") return true;
  return reglages.contacts;
}

export async function lireReglagesRapports(): Promise<ReglagesRapports> {
  try {
    return interpreterReglages(await getData<ReglagesRapports>(CLE_REGLAGES_RAPPORTS));
  } catch {
    /* Magasin injoignable : on garde le comportement d'avant plutôt que de
       priver un rapport de ses contacts sans l'avoir demandé. */
    return REGLAGES_PAR_DEFAUT;
  }
}

export async function ecrireReglagesRapports(r: ReglagesRapports): Promise<void> {
  /* Lecture fraîche avant écriture, comme partout où l'on réécrit une clé
     entière du magasin (voir l'incident du 14 octobre 2026). */
  await getDataFresh<ReglagesRapports>(CLE_REGLAGES_RAPPORTS).catch(() => []);
  await setData(CLE_REGLAGES_RAPPORTS, [{ contacts: !!r.contacts }]);
}
