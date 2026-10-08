"use client";

/**
 * Montants des offres bexio, côté navigateur.
 *
 * Chargés UNE fois par session et partagés par tous les écrans : le tableau
 * de bord, la charge de la semaine et l'aperçu latéral posent la même
 * question, il n'y a aucune raison de la poser trois fois.
 *
 * Le serveur refuse la requête à tout compte autre que le propriétaire des
 * accès bexio. Chez les autres, `actif` reste faux et rien ne s'affiche —
 * ce n'est pas un affichage masqué, c'est une donnée qui n'arrive jamais.
 */

import { useEffect, useState } from "react";

let cache: Record<string, number> | null = null;
let enCours: Promise<Record<string, number> | null> | null = null;
const abonnes = new Set<(m: Record<string, number> | null) => void>();

function charger(): Promise<Record<string, number> | null> {
  if (cache) return Promise.resolve(cache);
  if (enCours) return enCours;
  enCours = fetch("/api/bexio/montants", { credentials: "include" })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      cache = j?.montants && typeof j.montants === "object" ? j.montants : null;
      abonnes.forEach((f) => f(cache));
      return cache;
    })
    .catch(() => null)
    .finally(() => { enCours = null; });
  return enCours;
}

/** Les numéros TM d'un champ Notion, qui peut en contenir plusieurs. */
export function numerosTMClient(ofrTM: string | null | undefined): string[] {
  return [...String(ofrTM || "").toUpperCase().matchAll(/TM-?\d{6,}/g)]
    .map((m) => m[0].replace(/^TM-?/, "TM-"));
}

export interface MontantsOFR {
  /** Faux tant qu'on n'a pas les montants, ou si l'accès est refusé. */
  actif: boolean;
  /** Montant total des offres d'un chantier (plusieurs numéros = somme). */
  montant: (ofrTM: string | null | undefined) => number | null;
}

export function useMontantsOFR(): MontantsOFR {
  const [m, setM] = useState<Record<string, number> | null>(cache);
  useEffect(() => {
    let vivant = true;
    const maj = (v: Record<string, number> | null) => { if (vivant) setM(v); };
    abonnes.add(maj);
    charger().then(maj);
    return () => { vivant = false; abonnes.delete(maj); };
  }, []);

  return {
    actif: !!m,
    montant: (ofrTM) => {
      if (!m) return null;
      const nos = numerosTMClient(ofrTM).filter((n) => n in m);
      if (nos.length === 0) return null;
      return nos.reduce((s, n) => s + (m[n] || 0), 0);
    },
  };
}

/** Francs suisses, sans décimales inutiles dans un tableau de bord. */
export function francsCourts(n: number): string {
  return new Intl.NumberFormat("fr-CH", { maximumFractionDigits: 0 }).format(Math.round(n));
}
