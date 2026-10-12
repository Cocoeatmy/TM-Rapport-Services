/**
 * Les absences, notées à la main.
 *
 * Le tableau de disponibilité déduit tout du planning : qui a des cabines ce
 * jour-là, et combien. Il ne peut pas savoir qu'un monteur est en vacances, en
 * formation ou chez le médecin — rien de tout cela n'existe dans Notion. Et
 * c'est précisément ce qu'il faut savoir avant de proposer une date.
 *
 * D'où une liste tenue à la main, d'un clic sur la pastille. Elle ne décide
 * rien : elle noircit une case, et le planning reste ce qu'il est. Un monteur
 * marqué absent ALORS QU'il a du travail prévu n'est pas corrigé en silence —
 * c'est le genre de contradiction qu'on veut voir, pas effacer.
 */

import { getData, setData } from "@/lib/kv-store";

export const CLE_ABSENCES = "absences";

export interface Absence {
  /** « Claudio|2026-10-14 » — un monteur, un jour. */
  cle: string;
  collaborateur: string;
  /** Jour au format AAAA-MM-JJ. */
  jour: string;
  /** Qui l'a notée, et quand : une case noire sans auteur ne s'explique plus. */
  par: string;
  le: string;
}

/** La clé d'une absence. Le nom est normalisé : « claudio » et « Claudio ». */
export function cleAbsence(collaborateur: string, jour: string): string {
  return `${String(collaborateur || "").trim().toLowerCase()}|${String(jour || "").slice(0, 10)}`;
}

/** Les absences enregistrées, indexées par clé. */
export async function lireAbsences(): Promise<Map<string, Absence>> {
  try {
    const lignes = await getData<Absence>(CLE_ABSENCES);
    const m = new Map<string, Absence>();
    for (const a of lignes) if (a?.cle) m.set(a.cle, a);
    return m;
  } catch {
    /* Magasin injoignable : aucune absence connue. Le tableau reste juste —
       il dira seulement « libre » là où il aurait dit « absent ». */
    return new Map();
  }
}

/**
 * Pose ou retire une absence, et rend l'état obtenu.
 *
 * Une seule opération pour les deux sens : la pastille est une bascule, et
 * deux routes pour un même geste laisseraient les deux côtés se contredire.
 */
export async function basculerAbsence(
  collaborateur: string,
  jour: string,
  par: string,
): Promise<{ absent: boolean }> {
  const cle = cleAbsence(collaborateur, jour);
  const toutes = await lireAbsences();
  if (toutes.has(cle)) {
    toutes.delete(cle);
    await setData(CLE_ABSENCES, [...toutes.values()]);
    return { absent: false };
  }
  toutes.set(cle, {
    cle,
    collaborateur: String(collaborateur || "").trim(),
    jour: String(jour || "").slice(0, 10),
    par,
    le: new Date().toISOString(),
  });
  await setData(CLE_ABSENCES, [...toutes.values()]);
  return { absent: true };
}

/**
 * Les absences d'une période, en clés brutes — ce dont l'écran a besoin.
 *
 * Bornes incluses. Au-delà de quelques semaines la liste ne sert plus à rien :
 * on ne consulte pas la disponibilité d'un mois passé.
 */
export function clesDeLaPeriode(
  absences: ReadonlyMap<string, Absence>,
  du: string,
  au: string,
): Set<string> {
  const out = new Set<string>();
  for (const a of absences.values()) {
    if (a.jour >= du && a.jour <= au) out.add(a.cle);
  }
  return out;
}
