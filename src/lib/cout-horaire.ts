/**
 * Du salaire mensuel au coût d'une heure travaillée.
 *
 * Les coûts des chantiers se calculent à l'heure — c'est l'heure qui est
 * pointée sur place. Mais personne ne connaît son coût horaire par cœur : on
 * connaît le salaire qu'on verse. La saisie se fait donc au mois, et la
 * conversion est faite ici, au même endroit pour tous les écrans qui s'en
 * servent (rentabilité par chantier, coût d'un lot).
 *
 * Deux paramètres rendent la conversion explicite plutôt que devinée :
 * le nombre d'heures travaillées par mois, et les charges patronales. Un
 * salaire BRUT ne coûte pas ce qu'il affiche ; inventer un coefficient en
 * silence donnerait des marges fausses que personne ne pourrait vérifier.
 */

/** 42 h par semaine, 52 semaines, douze mois : l'usage dans le bâtiment. */
export const HEURES_MOIS_DEFAUT = 182;

export interface ReglagesCout {
  /** Heures travaillées par mois (défaut : 182). */
  heuresMois?: number | null;
  /** Charges patronales en pourcentage du brut (défaut : 0). */
  chargesPatronales?: number | null;
}

/** Coût d'une heure pour un salaire mensuel BRUT donné. */
export function coutHoraire(salaireMensuel: number | null | undefined, r: ReglagesCout = {}): number | null {
  const s = Number(salaireMensuel);
  if (!Number.isFinite(s) || s <= 0) return null;
  const h = Number(r.heuresMois);
  const heures = Number.isFinite(h) && h > 0 ? h : HEURES_MOIS_DEFAUT;
  const c = Number(r.chargesPatronales);
  const charges = Number.isFinite(c) && c > 0 ? c : 0;
  return (s * (1 + charges / 100)) / heures;
}

/**
 * Coût horaire d'un monteur — ou d'un binôme, dont on prend la moyenne :
 * c'est ce que coûte réellement l'heure passée à deux.
 *
 * `valeurs` porte les réglages tels qu'ils sont saisis : `taux_<nom>` est un
 * salaire MENSUEL brut, `tauxHoraire` reste un coût horaire de repli pour qui
 * n'a pas de salaire renseigné.
 */
export function coutHoraireDe(
  monteur: string,
  valeurs: Record<string, unknown>,
): number | null {
  const nombre = (v: unknown): number | null => {
    const x = typeof v === "string" ? parseFloat(v.replace(",", ".")) : Number(v);
    return Number.isFinite(x) && x > 0 ? x : null;
  };
  const reglages: ReglagesCout = {
    heuresMois: nombre(valeurs.heuresMois),
    chargesPatronales: nombre(valeurs.chargesPatronales),
  };
  const noms = String(monteur || "").split("&").map((x) => x.trim()).filter(Boolean);
  const taux = noms
    .map((nom) => coutHoraire(nombre(valeurs[`taux_${nom}`]), reglages))
    .filter((v): v is number => v !== null);
  if (taux.length > 0) return taux.reduce((a, b) => a + b, 0) / taux.length;
  return nombre(valeurs.tauxHoraire);
}
