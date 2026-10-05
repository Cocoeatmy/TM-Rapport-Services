/**
 * Qui attend un rendez-vous — la règle, écrite une seule fois.
 *
 * Elle existait en double : une copie pour le tableau de bord de
 * l'administrateur, une autre pour celui des monteurs. Les deux listes d'états
 * étaient identiques au caractère près… jusqu'à ce qu'on en corrige une. Les
 * monteurs voyaient alors d'autres chiffres, sans que personne ne sache
 * pourquoi — et chaque correction suivante risquait d'en oublier une.
 */

/**
 * États de commande qui demandent encore un rendez-vous.
 *
 * « Cabines en CMD » et « Cabines à recevoir » en font partie : la commande
 * est passée, la date reste à caler avec le client. Les écarter revenait à ne
 * voir ces chantiers qu'une fois la marchandise annoncée — trop tard.
 */
export const ETATS_RDV_A_FIXER = [
  "Cabine à aller chercher",
  "Récéptionné - RDV à fixer",
  "RDV - Attendre news",
  "Montage partiel",
  "Livraison partielle",
  "Cabines à recevoir",
  "Cabines en CMD",
] as const;

interface SourceRdv {
  etatCMD?: string | null;
  typeServices?: string[] | null;
}

/** Chantier de type Services : il a sa propre liste de rendez-vous. */
export function estProjetServices(p: SourceRdv): boolean {
  return (p.typeServices || []).some((t) => t === "Services" || t.includes("Services"));
}

/** Rendez-vous de MONTAGE à fixer (les Services sont comptés à part). */
export function rdvMontageAFixer(p: SourceRdv): boolean {
  return ETATS_RDV_A_FIXER.includes((p.etatCMD || "") as typeof ETATS_RDV_A_FIXER[number])
    && !estProjetServices(p);
}

/** Rendez-vous de SERVICES à fixer. */
export function rdvServicesAFixer(p: SourceRdv): boolean {
  return ETATS_RDV_A_FIXER.includes((p.etatCMD || "") as typeof ETATS_RDV_A_FIXER[number])
    && estProjetServices(p);
}
