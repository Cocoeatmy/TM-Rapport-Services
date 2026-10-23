/**
 * Combien de temps chaque client met à payer (23.10.2026).
 *
 * D'après bexio : la date de chaque facture, son échéance, et la date de son
 * paiement (relevée chaque nuit, voir bexio-donnees). Pour chaque client :
 * délai médian entre la facture et le paiement, part des factures payées
 * après l'échéance, et ce qui est encore dû aujourd'hui — utile avant
 * d'accepter un gros chantier d'un client qui paie tard. Règles pures.
 */

import type { FactureBexio } from "@/lib/bexio-rapprochement";

export interface LigneDelaiClient {
  client: string;
  factures: number;
  total: number;
  /** Factures payées dont la date de paiement est connue. */
  payeesDatees: number;
  delaiMedian: number | null;
  /** Retard médian sur l'échéance, des seules factures payées en retard. */
  retardMedian: number | null;
  partEnRetard: number | null;
  restant: number;
  /** Dû ET échu aujourd'hui. */
  echu: number;
  /** Âge (jours depuis la facture) du plus vieil impayé. */
  plusVieuxImpaye: number | null;
}

const jours = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00") - Date.parse(a + "T12:00:00")) / 86_400_000);
const mediane = (v: number[]) => {
  if (!v.length) return null;
  const s = [...v].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

export function delaisParClient(
  factures: FactureBexio[],
  paiements: Record<string, string>,
  aujourdhui: string = new Date().toISOString().slice(0, 10),
): LigneDelaiClient[] {
  const groupes = new Map<string, FactureBexio[]>();
  for (const f of factures) {
    if (!(f.total > 0) || !f.date) continue;
    const cle = (f.client || "").trim() || (f.contactId ? `Contact ${f.contactId}` : "Sans client");
    const l = groupes.get(cle) || [];
    l.push(f);
    groupes.set(cle, l);
  }
  const out: LigneDelaiClient[] = [];
  for (const [client, l] of groupes) {
    const delais: number[] = [];
    const retards: number[] = [];
    let enRetard = 0, jugees = 0, restant = 0, echu = 0;
    let plusVieux: number | null = null;
    for (const f of l) {
      const paye = paiements[String(f.id)];
      if (f.restant <= 0.009 && paye) {
        delais.push(Math.max(0, jours(f.date, paye)));
        if (f.echeance) {
          jugees++;
          const r = jours(f.echeance, paye);
          if (r > 0) { enRetard++; retards.push(r); }
        }
      }
      if (f.restant > 0.009) {
        restant += f.restant;
        if (f.echeance && f.echeance < aujourdhui) echu += f.restant;
        const age = jours(f.date, aujourdhui);
        if (plusVieux === null || age > plusVieux) plusVieux = age;
      }
    }
    out.push({
      client,
      factures: l.length,
      total: l.reduce((s, f) => s + f.total, 0),
      payeesDatees: delais.length,
      delaiMedian: mediane(delais),
      retardMedian: mediane(retards),
      partEnRetard: jugees ? Math.round((enRetard / jugees) * 100) : null,
      restant, echu, plusVieuxImpaye: plusVieux,
    });
  }
  // Ce qui doit alerter d'abord : l'échu, puis les mauvais payeurs habituels.
  return out.sort((a, b) => (b.echu - a.echu) || ((b.delaiMedian ?? -1) - (a.delaiMedian ?? -1)) || (b.total - a.total));
}
