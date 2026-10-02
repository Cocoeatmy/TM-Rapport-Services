/**
 * Numéros de service des fournisseurs, par préfixe.
 *
 * Duka numérote ses prestations « AS 2026/1687 » pour une prise de mesures,
 * « MS … » pour un montage, « KS … » pour un service. Les deux derniers vivent
 * dans la MÊME colonne Notion (« N° Serv. CMD Fournisseurs ») : pointer une
 * facture de montage demande donc d'en extraire les MS et d'ignorer les KS,
 * et l'inverse pour une facture de services. Montrer les deux ferait pointer
 * une ligne qui n'est pas sur la facture qu'on a sous les yeux.
 *
 * La saisie est humaine : séparateurs variables, espace après le préfixe
 * absent ou double, parfois un tiret — et très souvent PAS DE PRÉFIXE DU TOUT,
 * la colonne le sous-entendant. On lit ce qui est là plutôt que d'exiger une
 * forme, quitte à rendre un numéro nu quand rien ne permet de le qualifier.
 */

export type PrefixeService = "AS" | "MS" | "KS";

/** « MS2026/1687 », « MS - 2026 / 1687 »… → un seul motif. */
const AVEC_PREFIXE = /\b(AS|MS|KS)\s*[-–—:]?\s*(\d{2,6})\s*\/\s*(\d{1,6})/gi;
/** Ce qui reste une fois les numéros préfixés retirés : « 2026/1939 ». */
const SANS_PREFIXE = /\b(\d{2,6})\s*\/\s*(\d{1,6})\b/g;

/**
 * Numéros d'un texte libre, limités aux préfixes demandés.
 *
 * `sousEntendu` est le préfixe que la colonne garantit à elle seule — « AS »
 * pour la colonne des mesures. Un numéro nu y est alors qualifié sans risque.
 * Dans la colonne partagée des commandes, rien ne le permet : le numéro nu
 * est rendu tel quel, et l'affichage le signale plutôt que d'inventer un
 * préfixe qui ferait pointer la mauvaise facture.
 *
 * Un numéro nu n'est retenu que si le champ ne porte AUCUN numéro préfixé :
 * là où le préfixe est écrit, c'est lui qui fait foi.
 *
 * Résultat normalisé en « XX 2026/1687 », dédoublonné, dans l'ordre de
 * lecture — celui de la saisie, qui suit en général celui de la facture.
 */
export function numerosServices(
  texte: string | null | undefined,
  prefixes: PrefixeService[],
  sousEntendu?: PrefixeService,
): string[] {
  const brut = String(texte || "");
  const voulus = new Set(prefixes);
  const vus = new Set<string>();
  const sortie: string[] = [];

  let auMoinsUnPrefixe = false;
  for (const m of brut.matchAll(AVEC_PREFIXE)) {
    auMoinsUnPrefixe = true;
    const prefixe = m[1].toUpperCase() as PrefixeService;
    if (!voulus.has(prefixe)) continue;
    const num = `${prefixe} ${m[2]}/${m[3]}`;
    if (!vus.has(num)) { vus.add(num); sortie.push(num); }
  }
  if (auMoinsUnPrefixe) return sortie;

  if (sousEntendu && !voulus.has(sousEntendu)) return sortie;
  for (const m of brut.matchAll(SANS_PREFIXE)) {
    const num = sousEntendu ? `${sousEntendu} ${m[1]}/${m[2]}` : `${m[1]}/${m[2]}`;
    if (!vus.has(num)) { vus.add(num); sortie.push(num); }
  }
  return sortie;
}

/** Vrai pour un numéro rendu sans préfixe : Notion ne disait pas lequel. */
export function prefixeManquant(numero: string): boolean {
  return /^\d/.test(numero);
}
