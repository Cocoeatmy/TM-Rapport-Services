/**
 * Un SAV est-il encore ouvert sur ce projet ?
 *
 * Le montage peut être « Terminé » et le dossier ne pas l'être : une
 * réclamation arrive après coup, et le projet garde son état d'origine. Vu
 * d'une liste ou d'une recherche, il paraît alors réglé alors qu'il reste un
 * joint à changer et un déplacement à faire.
 *
 * L'état se lit sur les lots, pas sur le projet : les SAV sont encodés cabine
 * par cabine (« Cab1:… | Cab2:… ») et un lot clôturé n'empêche pas l'autre
 * d'attendre. La case « SAV » du projet ne sert que de repli, pour les
 * dossiers d'avant l'encodage par lot.
 */

/** Ce qu'il faut d'un projet pour juger — pas la fiche entière, pour tester. */
export interface SourceSav {
  commentairesSav?: string | null;
  causeSavCabines?: string | null;
  datesRdvSavCabines?: string | null;
  collaborateursSavCabines?: string | null;
  savRetouchesCabines?: string | null;
  interventionsSavCabines?: string | null;
  datesCmdPiecesSavCabines?: string | null;
  datesReceptionPiecesSavCabines?: string | null;
  datesSavClotureCabines?: string | null;
  documentsSavDemande?: { name?: string }[] | null;
  photosSavRetouches?: { name?: string }[] | null;
  sav?: boolean | null;
  savCloture?: boolean | null;
  etatSAV?: string | null;
}

/** Décode « Cab1:valeur | Cab2:valeur » ; les valeurs vides ne comptent pas. */
function parLot(brut?: string | null): Record<number, string> {
  const map: Record<number, string> = {};
  const re = /Cab(\d+)\s*:([^|]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(brut || ""))) {
    const v = m[2].trim();
    if (v) map[parseInt(m[1], 10)] = v;
  }
  return map;
}

/** Lots portant une trace de SAV, quelle qu'elle soit. */
export function lotsAvecSav(p: SourceSav): Set<number> {
  const lots = new Set<number>();
  for (const brut of [
    p.commentairesSav, p.causeSavCabines, p.datesRdvSavCabines, p.collaborateursSavCabines,
    p.savRetouchesCabines, p.interventionsSavCabines,
    p.datesCmdPiecesSavCabines, p.datesReceptionPiecesSavCabines,
  ]) {
    for (const n of Object.keys(parLot(brut))) lots.add(parseInt(n, 10));
  }
  for (const f of [...(p.documentsSavDemande || []), ...(p.photosSavRetouches || [])]) {
    const m = /\.Cab(\d+)\./.exec(f?.name || "");
    if (m) lots.add(parseInt(m[1], 10));
  }
  return lots;
}

/** Lots dont le SAV n'est pas clôturé. */
export function lotsSavOuverts(p: SourceSav): number[] {
  const cloture = parLot(p.datesSavClotureCabines);
  return [...lotsAvecSav(p)].filter((n) => !(cloture[n] || "").trim()).sort((a, b) => a - b);
}

/** États de l'ancienne base qui ne valent pas un SAV ouvert. */
const ETATS_CLOS = new Set(["", "Terminé", "Annulé", "Aucun SAV"]);

/**
 * Le dossier garde-t-il un SAV à traiter ?
 *
 * Trois sources, dans cet ordre : les lots, l'état de l'ancienne base, puis la
 * simple case « SAV » — cette dernière ne dit que « il y a eu un SAV », donc
 * elle ne compte que si rien de plus précis ne la contredit.
 */
export function savEnCours(p: SourceSav): boolean {
  if (lotsAvecSav(p).size > 0) return lotsSavOuverts(p).length > 0;
  const etat = String(p.etatSAV || "").trim();
  if (etat) return !ETATS_CLOS.has(etat);
  return p.sav === true && p.savCloture !== true;
}
