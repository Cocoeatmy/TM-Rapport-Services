/**
 * Combien de cabines d'un chantier sont réellement posées.
 *
 * Trois sources, parce qu'aucune ne suffit seule :
 *
 *   • les photos de montage nommées « … .CabN. … » : c'est la preuve la plus
 *     sûre, un monteur photographie ce qu'il vient de poser ;
 *   • le compteur Notion « Nb. Cabines installées », souvent laissé vide —
 *     s'y fier seul faisait passer pour « à faire » des chantiers terminés ;
 *   • sur un chantier d'UNE cabine, les photos ne portent pas de préfixe
 *     « .Cab1. » : leur simple présence dit que la cabine est posée.
 *
 * Le résultat est borné au nombre de cabines du chantier : une saisie trop
 * haute ne doit pas produire un avancement supérieur à son propre maximum.
 */

export interface SourcePose {
  nbCabines?: number | null;
  nbCabinesInstallees?: number | null;
  photosMontage?: { name?: string }[] | null;
}

export function cabinesPosees(p: SourcePose): number {
  const total = p.nbCabines || 0;
  const photos = p.photosMontage || [];

  const parPhoto = new Set<number>();
  for (const f of photos) {
    const m = /\.Cab(\d+)\./.exec(f?.name || "");
    if (m) parPhoto.add(parseInt(m[1], 10));
  }
  if (parPhoto.size > 0) return total > 0 ? Math.min(parPhoto.size, total) : parPhoto.size;

  const compteur = p.nbCabinesInstallees || 0;
  if (compteur > 0) return total > 0 ? Math.min(compteur, total) : compteur;

  return total === 1 && photos.length > 0 ? 1 : 0;
}

/** Ce qu'il reste à poser — jamais négatif. */
export function cabinesRestantes(p: SourcePose): number {
  return Math.max((p.nbCabines || 0) - cabinesPosees(p), 0);
}
