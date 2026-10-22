/**
 * Partenaire Notion → contact(s) bexio.
 *
 * Ce qu'on fige : le contact du partenaire est PROPOSÉ quand ses chantiers
 * passent par lui (ou que son nom correspond), un client final croisé une
 * fois ne l'est pas, et une correspondance confirmée fait foi.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/kv-store", () => ({ getData: async () => [], getDataFresh: async () => [], setData: async () => {} }));

import { calculerPartenaire } from "@/lib/bexio-partenaires";
import type { CopieBexio } from "@/lib/bexio-donnees";

const auj = new Date();
const ilYa = (j: number) => new Date(auj.getTime() - j * 86_400_000).toISOString().slice(0, 10);

function copie(): CopieBexio {
  const offres = [
    { id: 1, nr: "TM-2600001", titre: "Dubat, Rue A 1", total: 5000, contactId: 10, date: ilYa(60), client: "DUBAT SA", statut: 3 },
    { id: 2, nr: "TM-2600002", titre: "Dubat, Rue B 2", total: 3000, contactId: 10, date: ilYa(50), client: "DUBAT SA", statut: 3 },
    { id: 3, nr: "TM-2600003", titre: "Dubat, Rue C 3", total: 4000, contactId: 10, date: ilYa(40), client: "DUBAT SA", statut: 4 },
    /* Un chantier du partenaire facturé, pour une fois, au client final. */
    { id: 4, nr: "TM-2600004", titre: "Villa Martin", total: 2000, contactId: 99, date: ilYa(30), client: "M. Martin", statut: 3 },
  ];
  const factures = [
    { id: 11, nr: "RE-1", titre: "Dubat, Rue A 1", total: 5000, restant: 0, contactId: 10, date: ilYa(20), reference: null, client: "DUBAT SA", echeance: ilYa(-10) },
    { id: 12, nr: "RE-2", titre: "Dubat, Rue B 2", total: 3000, restant: 3000, contactId: 10, date: ilYa(45), reference: null, client: "DUBAT SA", echeance: ilYa(15) },
    { id: 13, nr: "RE-3", titre: "Villa Martin", total: 2000, restant: 0, contactId: 99, date: ilYa(10), reference: null, client: "M. Martin", echeance: ilYa(-20) },
  ];
  return { offres, factures, achats: [], comptes: [], le: ilYa(0) } as unknown as CopieBexio;
}

const demande = { cle: "grossistes:Dubat", mots: ["Dubat"], numeros: ["TM-2600001", "TM-2600002", "TM-2600003", "TM-2600004"] };

describe("correspondance partenaire → bexio", () => {
  it("propose le contact du partenaire, pas le client final croisé une fois", () => {
    const r = calculerPartenaire(copie(), demande);
    expect(r.statut).toBe("proposee");
    expect(r.retenus.map((x) => x.id)).toEqual([10]);
    expect(r.candidats.map((c) => c.id)).toContain(99);
  });

  it("compte facturé, encaissé, dû et échu sur les seuls contacts retenus", () => {
    const r = calculerPartenaire(copie(), demande);
    expect(r.facture).toBe(8000);
    expect(r.encaisse).toBe(5000);
    expect(r.restant).toBe(3000);
    expect(r.echues).toEqual({ nb: 1, total: 3000 });
    expect(r.offres.tauxAcceptation).toBe(67);
  });

  it("le facturé sur ses chantiers inclut le client final", () => {
    const r = calculerPartenaire(copie(), demande);
    expect(r.surSesChantiers.total).toBe(10000);
  });

  it("une correspondance confirmée fait foi", () => {
    const r = calculerPartenaire(copie(), demande, { cle: demande.cle, contacts: [99], par: "x", le: ilYa(0) });
    expect(r.statut).toBe("confirmee");
    expect(r.retenus.map((x) => x.id)).toEqual([99]);
    expect(r.facture).toBe(2000);
  });
});
