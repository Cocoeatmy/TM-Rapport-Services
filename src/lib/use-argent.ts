"use client";

/**
 * L'argent à l'écran : au propriétaire seul (22.10.2026).
 *
 * `useVoitArgent()` ne répond OUI qu'une fois les droits CONFIRMÉS
 * (`peut()` répond oui tant qu'ils ne sont pas chargés : ici, non). Le
 * serveur n'accorde `argent.voir` qu'au propriétaire.
 *
 * `useMontants()` : les montants des projets, que les listes ne transportent
 * plus (voir argent-projets) — chargés une fois pour tout l'écran, gardés une
 * minute, et seulement pour le propriétaire.
 */

import { useEffect, useState } from "react";
import { useDroits } from "@/lib/use-droits";
import type { MontantsProjet } from "@/lib/argent-projets";

export function useVoitArgent(): boolean {
  const { mes, peut } = useDroits();
  return !!mes && peut("argent.voir");
}

let memo: { t: number; p: Promise<Map<string, MontantsProjet>> } | null = null;
function charger(): Promise<Map<string, MontantsProjet>> {
  if (!memo || Date.now() - memo.t > 60_000) {
    memo = {
      t: Date.now(),
      p: fetch("/api/argent/montants", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : {}))
        .then((o: Record<string, MontantsProjet>) => new Map(Object.entries(o || {})))
        .catch(() => { memo = null; return new Map<string, MontantsProjet>(); }),
    };
  }
  return memo.p;
}

export function useMontants(): Map<string, MontantsProjet> | null {
  const voit = useVoitArgent();
  const [m, setM] = useState<Map<string, MontantsProjet> | null>(null);
  useEffect(() => {
    if (!voit) { setM(null); return; }
    let vivant = true;
    charger().then((x) => { if (vivant) setM(x); });
    return () => { vivant = false; };
  }, [voit]);
  return m;
}
