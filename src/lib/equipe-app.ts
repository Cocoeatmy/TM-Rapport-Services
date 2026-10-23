/**
 * L'équipe d'un chantier selon l'APP, et elle seule (23.10.2026).
 *
 * Micael continue de remplir « Collaborateurs montages » dans Notion, à
 * l'avance et parfois de travers ; ce champ dit qui était PRÉVU. Les
 * statistiques des collaborateurs doivent dire qui a TRAVAILLÉ : on ne lit
 * donc que ce qui est choisi dans l'app —
 *   1. les passages (« Cab1:2026-10-09~Jean-Marc & Miguel~… ») ;
 *   2. les heures d'un lot sur plusieurs jours (« 2026-10-12 JM & Miguel 08:00 ») ;
 *   3. le monteur responsable de chaque lot (« Cab2:Claudio »).
 * Aucun de ces trois : équipe inconnue (liste vide), jamais Notion.
 */

import { parseInterventions } from "@/lib/sav-interventions";

export interface SourceEquipeApp {
  interventionsMontageCabines?: string | null;
  heureArrivee?: string | null;
  attributionCabines?: string | null;
}

const ISO = /\d{4}-\d{2}-\d{2}/;

export function separerNoms(brut?: string | null): string[] {
  return String(brut || "").split(/\s*(?:,|&|\+|\bet\b)\s*/).map((x) => x.trim()).filter(Boolean);
}

export function equipeApp(p: SourceEquipeApp): string[] {
  const vus = new Map<string, string>();
  const ajouter = (l: string[]) => l.forEach((n) => { if (!vus.has(n.toLowerCase())) vus.set(n.toLowerCase(), n); });

  const re = /Cab(\d+)\s*:([^|]*)/g;
  let m: RegExpExecArray | null;
  const passages = String(p.interventionsMontageCabines || "");
  while ((m = re.exec(passages))) parseInterventions(m[2]).forEach((x) => ajouter(separerNoms(x.collaborateurs)));

  const arr = String(p.heureArrivee || "");
  if (arr && !/Cab\d+\s*:/.test(arr)) {
    for (const seg of arr.split("|")) {
      if (!ISO.test(seg)) continue;
      ajouter(separerNoms(seg.replace(ISO, "").replace(/\d{1,2}:\d{2}\s*$/, "")));
    }
  }

  const attr = String(p.attributionCabines || "");
  const re2 = /Cab(\d+)\s*:([^|]*)/g;
  while ((m = re2.exec(attr))) ajouter(separerNoms(m[2]));

  return [...vus.values()];
}
