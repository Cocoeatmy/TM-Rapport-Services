/**
 * Les heures de chaque PERSONNE sur un chantier (23.10.2026).
 *
 * Le coût de la main-d'œuvre comptait les heures de présence une seule fois,
 * au taux moyen de l'équipe : deux monteurs pendant deux heures coûtaient
 * deux heures. Ici, chaque passage compte ses minutes POUR CHAQUE personne
 * présente — selon l'app (passages, heures, monteur responsable), jamais
 * Notion. Une présence sans nom reste comptée, à part (`sansNom`).
 */

import { parseInterventions } from "@/lib/sav-interventions";
import { separerNoms } from "@/lib/equipe-app";
import { minutesDuChantier } from "@/lib/heures-chantier";

export interface SourceHeuresHommes {
  interventionsMontageCabines?: string | null;
  heureArrivee?: string | null;
  heureDepart?: string | null;
  attributionCabines?: string | null;
}

const enMin = (h?: string | null) => {
  const m = /(\d{1,2}):(\d{2})\s*$/.exec(String(h || "").trim());
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
};
const duree = (a?: string | null, d?: string | null) => {
  const x = enMin(a), y = enMin(d);
  return x !== null && y !== null && y > x ? y - x : 0;
};
function parLot(brut?: string | null): Map<number, string> {
  const m = new Map<number, string>();
  const re = /Cab(\d+)\s*:([^|]*)/g;
  let x: RegExpExecArray | null;
  while ((x = re.exec(String(brut || "")))) m.set(parseInt(x[1], 10), x[2].trim());
  return m;
}

export function minutesParPersonne(p: SourceHeuresHommes): { parPersonne: Record<string, number>; sansNom: number } {
  const parPersonne: Record<string, number> = {};
  let sansNom = 0;
  const compter = (noms: string[], min: number) => {
    if (min <= 0) return;
    if (noms.length === 0) { sansNom += min; return; }
    for (const n of noms) parPersonne[n] = (parPersonne[n] || 0) + min;
  };
  const attrib = parLot(p.attributionCabines);

  const passages = parLot(p.interventionsMontageCabines);
  if (passages.size > 0) {
    for (const [n, v] of passages) {
      for (const x of parseInterventions(v)) compter(separerNoms(x.collaborateurs || attrib.get(n)), duree(x.arrivee, x.depart));
    }
    return { parPersonne, sansNom };
  }
  const arr = String(p.heureArrivee || "");
  if (/Cab\d+\s*:/.test(arr)) {
    const dep = parLot(p.heureDepart);
    for (const [n, v] of parLot(arr)) compter(separerNoms(attrib.get(n)), duree(v, dep.get(n)));
    return { parPersonne, sansNom };
  }
  if (/\d{4}-\d{2}-\d{2}/.test(arr)) {
    const deps = String(p.heureDepart || "").split("|").map((s) => s.trim());
    arr.split("|").map((s) => s.trim()).filter(Boolean).forEach((seg, i) => {
      const jour = seg.match(/\d{4}-\d{2}-\d{2}/)?.[0] || "";
      const dep = deps.find((x) => x.includes(jour)) || deps[i] || "";
      const noms = separerNoms(seg.replace(/\d{4}-\d{2}-\d{2}/, "").replace(/\d{1,2}:\d{2}\s*$/, ""));
      compter(noms, duree(seg, dep));
    });
    return { parPersonne, sansNom };
  }
  // Format simple « 08:00 » / « 12:00 » : présence sans nom.
  sansNom += minutesDuChantier(p.heureArrivee, p.heureDepart);
  return { parPersonne, sansNom };
}
