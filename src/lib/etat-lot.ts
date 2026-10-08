/**
 * L'état d'un lot, résumé en un mot — celui que l'icône illustre.
 *
 * L'ordre compte, et c'est tout l'intérêt de l'écrire ici : ce qui attend
 * encore passe devant ce qui est réglé, et ce qui est réglé passe devant le
 * simple avancement de pose. Un signalement réglé garde son icône, en vert :
 * l'effacer rendait un chantier traité indiscernable d'un chantier qui n'a
 * jamais rien eu, et effaçait le travail de celui qui s'en est occupé.
 */

import { cabinesPosees, type SourcePose } from "./cabines-posees";

export type EtatLot = "souci" | "signale" | "souci-regle" | "signale-regle" | "pose" | "encours";

export interface SourceEtatLot extends SourcePose {
  etatCMD?: string | null;
  soucisMontage?: boolean | null;
  soucisMontageCloture?: boolean | null;
}

export function etatLot(
  p: SourceEtatLot,
  signaleOuvert: boolean,
  signaleRegle = false,
): EtatLot | null {
  const souci = p.etatCMD === "Soucis montage" || p.soucisMontage === true;
  if (souci && !p.soucisMontageCloture) return "souci";
  if (signaleOuvert) return "signale";
  if (souci && p.soucisMontageCloture) return "souci-regle";
  if (signaleRegle) return "signale-regle";
  const total = p.nbCabines || 0;
  const posees = cabinesPosees(p);
  if (total > 0 && posees >= total) return "pose";
  if (posees > 0) return "encours";
  return null;
}
