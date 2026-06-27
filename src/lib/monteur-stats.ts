// Statistiques de cabines installées PAR MONTEUR, avec distinction
// « seul » (1 seul monteur sur la cabine) / « en équipe » (2+ monteurs).
//
// Source de vérité : l'attribution PAR CABINE (`attributionCabines`, format
// "Cab1:Micael | Cab2:Claudio & Jacobo | ..."). Chaque monteur sélectionne son
// nom pour la cabine qu'il a installée ; plusieurs participants possibles.
// Repli mono-cabine sans attribution : champ `collaborateurs`.
// (Même logique d'attribution que la carte « Montage par monteur » de /admin.)

export interface MonteurCabStat {
  name: string;
  solo: number; // cabines installées seul
  team: number; // cabines installées en équipe (≥ 2 monteurs sur la cabine)
  total: number; // solo + team
}

/** Forme minimale d'un projet nécessaire au calcul (Project la satisfait). */
export interface MonteurStatInput {
  attributionCabines?: string | null;
  collaborateurs?: string | null;
  nbCabines?: number | string | null;
}

function parseCabMap(raw: string): Map<number, string> {
  const map = new Map<number, string>();
  if (!raw) return map;
  const re = /Cab(\d+)\s*:([^|]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const val = m[2].trim();
    if (val) map.set(parseInt(m[1], 10), val);
  }
  return map;
}

const splitMonteurs = (raw: string): string[] =>
  raw.split(/\s*&\s*/).map((s) => s.trim()).filter(Boolean);

export function computeMonteurCabStats(projects: MonteurStatInput[]): MonteurCabStat[] {
  const agg: Record<string, { solo: number; team: number }> = {};
  const credit = (mt: string, isTeam: boolean) => {
    if (!agg[mt]) agg[mt] = { solo: 0, team: 0 };
    if (isTeam) agg[mt].team += 1;
    else agg[mt].solo += 1;
  };

  for (const p of projects) {
    const attrMap = parseCabMap(p.attributionCabines || "");
    if (attrMap.size > 0) {
      // Attribution par cabine (multi-cabine, ou mono avec responsable).
      attrMap.forEach((raw) => {
        const monteurs = splitMonteurs(raw);
        if (monteurs.length === 0) return;
        const isTeam = monteurs.length > 1;
        monteurs.forEach((mt) => credit(mt, isTeam));
      });
      continue;
    }
    // Repli mono-cabine sans attribution → collaborateurs (binôme = équipe).
    const nb = typeof p.nbCabines === "string" ? parseInt(p.nbCabines, 10) : p.nbCabines;
    const isMono = !nb || nb <= 1;
    if (!isMono) continue; // multi-cabine sans attribution → exclu (peu fiable)
    const collabs = splitMonteurs(p.collaborateurs || "");
    if (collabs.length === 0) continue;
    const isTeam = collabs.length > 1;
    collabs.forEach((mt) => credit(mt, isTeam));
  }

  return Object.entries(agg)
    .map(([name, v]) => ({ name, solo: v.solo, team: v.team, total: v.solo + v.team }))
    .sort((a, b) => b.total - a.total);
}
