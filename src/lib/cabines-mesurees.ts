/**
 * Combien de cabines d'un chantier sont réellement mesurées.
 *
 * Même raisonnement que pour les cabines posées : la preuve la plus sûre est
 * la photo, nommée « … .CabN. … », prise au moment du relevé. À défaut, l'état
 * du relevé dans Notion tranche — mais seulement quand il dit que tout est fait.
 * « Mesures partielles » ne dit pas combien : sans photo nommée, on préfère ne
 * rien affirmer plutôt que d'annoncer un chiffre faux.
 *
 * Le résultat est borné au nombre de cabines du chantier.
 */

export interface SourceMesure {
  nbCabines?: number | null;
  photosMesures?: { name?: string }[] | null;
  etatMesures?: string | null;
}

/** États qui disent que le relevé est fait pour tout le chantier. */
const ETATS_RELEVES = new Set(["Mesures relevées - attente news", "Terminé"]);

export function cabinesMesurees(p: SourceMesure): number {
  const total = p.nbCabines || 0;
  const photos = p.photosMesures || [];

  const parPhoto = new Set<number>();
  for (const f of photos) {
    const m = /\.Cab(\d+)\./.exec(f?.name || "");
    if (m) parPhoto.add(parseInt(m[1], 10));
  }
  if (parPhoto.size > 0) return total > 0 ? Math.min(parPhoto.size, total) : parPhoto.size;

  if (ETATS_RELEVES.has((p.etatMesures || "").trim())) return total;

  // Chantier d'une seule cabine : les photos ne portent pas de préfixe.
  return total === 1 && photos.length > 0 ? 1 : 0;
}

/** Ce qu'il reste à mesurer — jamais négatif. */
export function cabinesAMesurer(p: SourceMesure): number {
  return Math.max((p.nbCabines || 0) - cabinesMesurees(p), 0);
}
