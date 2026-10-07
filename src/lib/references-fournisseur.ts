/**
 * Les références de commande à faire figurer sur les rapports d'un chantier
 * dont le client EST un fournisseur.
 *
 * Quand Duka ou Duscholux commande chez nous, ce sont leurs numéros à eux qui
 * permettent de rapprocher le chantier de leur propre dossier — le numéro TM
 * ne leur dit rien. Deux rapports les montraient déjà, trois les ignoraient.
 * La règle vit ici pour qu'ils disent tous la même chose.
 */

interface SourceReferences {
  typeClient?: string | null;
  /** Colonne Notion « n° CMD Fournisseurs ». */
  cmdFournisseurs?: string | null;
  /** Colonne Notion « N° Serv. CMD Fournisseurs ». */
  servCmdFournisseurs?: string | null;
}

/** Le client de ce chantier est un fournisseur. */
export function estClientFournisseur(p: SourceReferences): boolean {
  const t = (p.typeClient || "").trim().toLowerCase();
  return t === "fournisseurs" || t === "fournisseur";
}

/**
 * Les références à afficher, dans l'ordre. Vide si le client n'est pas un
 * fournisseur — et une référence non renseignée n'apparaît pas : une étiquette
 * en face d'un tiret laisse croire qu'on attend un numéro qui n'existe pas.
 */
export function referencesFournisseur(p: SourceReferences): { label: string; valeur: string }[] {
  if (!estClientFournisseur(p)) return [];
  return [
    { label: "N° CMD Fournisseur", valeur: (p.cmdFournisseurs || "").trim() },
    { label: "N° Serv. CMD Fournisseur", valeur: (p.servCmdFournisseurs || "").trim() },
  ].filter((r) => r.valeur.length > 0);
}
