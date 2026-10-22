/**
 * L'argent d'un projet, retiré de ce qui circule (22.10.2026).
 *
 * Montant de l'offre, état de facturation, fichiers d'offres et de factures :
 * seul le propriétaire les voit. Les listes de projets sont partagées (cache
 * du réseau Vercel, appareils des monteurs) : elles ne transportent donc
 * JAMAIS ces champs, pour personne. Le propriétaire les obtient à part, par
 * /api/argent/montants, et l'écran les recolle (`avecMontants`).
 */

export interface MontantsProjet {
  montantOFR: number | null;
  facturations: string;
}

/** Le projet sans son argent. Ne touche pas l'objet reçu. */
export function sansArgent<T extends object>(p: T): T {
  const r = { ...p } as Record<string, unknown>;
  if ("montantOFR" in r) r.montantOFR = null;
  if ("facturations" in r) r.facturations = "";
  if ("offresTM" in r) r.offresTM = [];
  delete r.offresTMNb;
  return r as T;
}

/** Recolle les montants (propriétaire seulement) sur une liste dépouillée. */
export function avecMontants<T extends { id?: string }>(liste: T[], montants: Map<string, MontantsProjet> | null): T[] {
  if (!montants || montants.size === 0) return liste;
  return liste.map((p) => {
    const m = p.id ? montants.get(p.id) : undefined;
    return m ? { ...p, ...m } : p;
  });
}
