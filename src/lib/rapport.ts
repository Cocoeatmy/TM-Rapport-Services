/**
 * Normalisation du « Rapport du monteur » assemblé, avant affichage (PDF) et
 * avant sauvegarde (app). Objectifs :
 *  - supprimer les lignes vides (plus de gros blocs de retours à la ligne) ;
 *  - trier les blocs par titre de cabine / n° de lot en tri naturel
 *    (B33-203 avant B33-303, 5.9 avant 5.10) ;
 *  - conserver le rapport général (texte sans identifiant) en tête, dans
 *    l'ordre de saisie ;
 *  - garder les lignes de continuation rattachées à leur cabine lors du tri.
 *
 * Un « titre de cabine » est une ligne du type « B33-403 : … » ou « 5.101 : … »,
 * c.-à-d. un identifiant contenant au moins un chiffre, suivi de « : ».
 */
const HEADER_RE = /^([A-Za-z0-9.\-]*\d[A-Za-z0-9.\-]*)\s*:\s+.*$/;

export function normalizeRapportMonteur(raw: string | null | undefined): string {
  if (!raw) return "";

  type Block = { id: string; lines: string[] };
  const general: string[] = [];
  const blocks: Block[] = [];
  let current: Block | null = null;

  for (const rawLine of raw.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue; // on saute les lignes vides
    const m = line.match(HEADER_RE);
    if (m) {
      current = { id: m[1], lines: [line] };
      blocks.push(current);
    } else if (current) {
      current.lines.push(line); // continuation de la cabine courante
    } else {
      general.push(line); // rapport général (avant tout titre de cabine)
    }
  }

  // Tri naturel des cabines par identifiant (Array.sort est stable : les
  // doublons restent dans l'ordre de saisie, les continuations suivent leur
  // bloc puisqu'elles vivent dans `lines`).
  blocks.sort((a, b) => a.id.localeCompare(b.id, "fr", { numeric: true }));

  return [...general, ...blocks.flatMap((b) => b.lines)].join("\n");
}
