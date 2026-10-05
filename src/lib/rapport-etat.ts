/**
 * L'état du rapport de montage, lu au même endroit par tout le monde.
 *
 * La colonne Notion « Rapport de montage » est un champ STATUS, et ses seules
 * valeurs sont « En attente de montage », « A traiter » et « Rapport traité ».
 * Le code cherchait « clôturé » — un mot qui n'existe nulle part dans cette
 * colonne — et lisait en plus la propriété comme un select, donc toujours vide.
 * Résultat : aucun rapport n'était jamais considéré comme fait, et « Rapports
 * en attente » listait des chantiers terminés depuis des mois.
 */

/** Le rapport est fait : plus rien à saisir sur ce montage. */
export function rapportTermine(valeur?: string | null): boolean {
  const v = (valeur || "").trim().toLowerCase();
  if (!v) return false;
  // « clôt/clot » : tolérance si la colonne est renommée un jour dans Notion.
  return v === "rapport traité" || v.includes("clôt") || v.includes("clot");
}

/** États où le chantier n'attend plus rien : son rapport ne se réclame pas. */
const ETATS_MORTS = new Set(["Annulé", "Terminé"]);

/**
 * Le rapport de ce chantier reste à faire : le montage a eu lieu (date passée
 * ou du jour), le chantier est encore vivant, et le rapport n'est pas traité.
 */
export function rapportEnAttente(
  p: { dateMontage?: string | null; etatCMD?: string | null; rapportDeMontage?: string | null },
  aujourdhui: string,
): boolean {
  const date = (p.dateMontage || "").split("T")[0];
  if (!date || date > aujourdhui) return false;
  if (ETATS_MORTS.has(p.etatCMD || "")) return false;
  return !rapportTermine(p.rapportDeMontage);
}
