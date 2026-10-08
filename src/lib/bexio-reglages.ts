/**
 * Ce que l'automatisme ne peut pas savoir.
 *
 * Le rapprochement voit ce qui est écrit dans bexio ; il ne voit pas qu'un
 * chantier a été refacturé au client final, payé de la main à la main, ou
 * offert. Sur les cinq premiers cas signalés par l'app, les cinq avaient une
 * explication de ce genre — et sans moyen de la consigner, la même liste
 * serait réapparue chaque matin jusqu'à ce qu'on cesse de la lire.
 *
 * Une décision prise ici vaut donc preuve, au même titre qu'une facture
 * retrouvée : elle sort le chantier des alertes, en gardant la trace de QUI
 * a décidé QUOI et QUAND.
 */

import { getData, setData } from "@/lib/kv-store";

const CLE = "bexio-facturation-reglee";

export const MOTIFS = {
  "client-final": "Facturé au client final",
  "main-propre": "Payé en main propre",
  "autre-facture": "Inclus dans une autre facture",
  offert: "Offert, pas de facture",
  autre: "Autre",
} as const;

export type MotifReglage = keyof typeof MOTIFS;

export function estMotif(v: unknown): v is MotifReglage {
  return typeof v === "string" && v in MOTIFS;
}

export interface Reglage {
  /** Identifiant du projet Notion. */
  projetId: string;
  motif: MotifReglage;
  /** Précision libre : n° de facture, nom du client final… */
  detail?: string;
  par: string;
  le: string;
}

export async function lireReglages(): Promise<Map<string, Reglage>> {
  try {
    const lignes = await getData<Reglage>(CLE);
    const m = new Map<string, Reglage>();
    for (const r of lignes) if (r?.projetId && estMotif(r.motif)) m.set(r.projetId, r);
    return m;
  } catch {
    return new Map();
  }
}

export async function poserReglage(r: Reglage): Promise<void> {
  const tous = await lireReglages();
  tous.set(r.projetId, r);
  await setData(CLE, [...tous.values()]);
}

export async function retirerReglage(projetId: string): Promise<void> {
  const tous = await lireReglages();
  if (!tous.delete(projetId)) return;
  await setData(CLE, [...tous.values()]);
}
