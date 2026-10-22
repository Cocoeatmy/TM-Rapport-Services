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

/**
 * Le relevé est-il FAIT ? (22.10.2026)
 *
 * Une date de mesures n'en dit rien : c'est souvent celle du rendez-vous À
 * VENIR (« RDV - Fixé » pour le 27 alors qu'on est le 22). La date de demande
 * de mesures non plus : elle dit qu'on nous a demandé de mesurer. Seuls
 * comptent l'état du relevé (« Mesures relevées », « Terminé ») et les photos
 * de relevé — la même règle que le compte des cabines mesurées.
 */
export function mesuresFaites(p: SourceMesure): boolean {
  if (ETATS_RELEVES.has((p.etatMesures || "").trim())) return true;
  return cabinesMesurees({ ...p, nbCabines: Math.max(p.nbCabines || 0, 1) }) > 0;
}

/** Avancement du relevé en %, borné à 100 : par cabine quand on le sait. */
export function pourcentMesures(p: SourceMesure): number {
  const total = p.nbCabines || 0;
  if (total > 1) return Math.min(100, Math.round((cabinesMesurees(p) / total) * 100));
  return mesuresFaites(p) ? 100 : 0;
}
