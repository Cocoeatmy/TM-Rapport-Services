/**
 * À quel lot appartient un signalement.
 *
 * Les signalements — défauts, pièces manquantes — étaient rattachés au NOM
 * du lot. Cela tenait tant que les lots s'appelaient « Cabine 1 »,
 * « Cabine 2 »… Depuis qu'on les nomme vraiment, un chantier compte trois
 * « SDD » : le constat posé sur l'un s'affichait sur tous ses homonymes
 * (16 octobre 2026, immeuble Defferard).
 *
 * Un lot se désigne donc par son NUMÉRO. Le nom reste pour l'affichage et
 * pour les signalements d'avant, qui n'ont pas de numéro : pour ceux-là on
 * continue de comparer les noms, faute de mieux.
 */

/**
 * Compare deux noms de lot sans se soucier de la casse, des accents ni des
 * séparateurs.
 *
 * Les accents étaient simplement SUPPRIMÉS avec le reste de la ponctuation :
 * « 1er étage » devenait « 1ertage », et ne correspondait donc plus à
 * « 1er etage » tapé sans accent. Sur un chantier on écrit les deux.
 */
export function normCabineLabel(s: string | undefined | null): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export interface SignalementDeLot {
  /** Numéro du lot (1, 2, 3…). Absent sur les signalements d'avant. */
  cabineIdx?: number;
  cabineLabel?: string;
}

/** Ce signalement concerne-t-il CE lot ? */
export function concerneLot(
  s: SignalementDeLot,
  numero: number | undefined,
  nom: string | undefined,
): boolean {
  if (typeof s.cabineIdx === "number" && s.cabineIdx > 0) return s.cabineIdx === numero;
  return normCabineLabel(s.cabineLabel) === normCabineLabel(nom);
}
