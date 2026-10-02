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
 * absent ou double, parfois un tiret. On lit ce qui est là plutôt que
 * d'exiger une forme.
 */

export type PrefixeService = "AS" | "MS" | "KS";

/** « MS2026/1687 », « MS - 2026 / 1687 »… → un seul motif. */
const MOTIF = /\b(AS|MS|KS)\s*[-–—:]?\s*(\d{2,6})\s*\/\s*(\d{1,6})/gi;

/**
 * Numéros d'un texte libre, limités aux préfixes demandés.
 *
 * Normalisés en « XX 2026/1687 », dédoublonnés, dans l'ordre de lecture —
 * celui de la saisie, qui suit en général celui de la facture.
 */
export function numerosServices(texte: string | null | undefined, prefixes: PrefixeService[]): string[] {
  const voulus = new Set(prefixes);
  const vus = new Set<string>();
  const sortie: string[] = [];
  for (const m of String(texte || "").matchAll(MOTIF)) {
    const prefixe = m[1].toUpperCase() as PrefixeService;
    if (!voulus.has(prefixe)) continue;
    const num = `${prefixe} ${m[2]}/${m[3]}`;
    if (vus.has(num)) continue;
    vus.add(num);
    sortie.push(num);
  }
  return sortie;
}
