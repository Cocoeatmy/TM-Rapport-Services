import { describe, it, expect } from "vitest";
import {
  indexerFacturation, rapprocher, numerosTM, clientsAuForfait,
  type OffreBexio, type FactureBexio,
} from "@/lib/bexio-rapprochement";

const offre = (p: Partial<OffreBexio>): OffreBexio => ({
  id: 1, nr: "TM-2600001", titre: "Client, Rue du Test 1 à 1000 Lausanne",
  total: 500, contactId: 10, date: "2026-03-01", ...p,
});
const facture = (p: Partial<FactureBexio>): FactureBexio => ({
  id: 1, nr: "2600001", titre: "Client, Rue du Test 1 à 1000 Lausanne",
  total: 500, restant: 0, contactId: 10, date: "2026-03-10", reference: null, ...p,
});

describe("numéros TM", () => {
  it("lit un numéro, avec ou sans tiret", () => {
    expect(numerosTM("TM-2600862")).toEqual(["TM-2600862"]);
    expect(numerosTM("tm2600862")).toEqual(["TM-2600862"]);
  });
  it("lit les projets qui en portent plusieurs", () => {
    expect(numerosTM("TM-2600786 (Mesures)\nTM-2600878 (Montage)"))
      .toEqual(["TM-2600786", "TM-2600878"]);
  });
  it("ne renvoie rien quand il n'y en a pas", () => {
    expect(numerosTM("")).toEqual([]);
    expect(numerosTM(null)).toEqual([]);
  });
});

describe("rapprochement chantier ↔ facture", () => {
  it("reconnaît une facture au titre identique", () => {
    const idx = indexerFacturation([offre({})], [facture({})]);
    const r = rapprocher("TM-2600001", idx);
    expect(r.etat).toBe("facturee");
    expect(r.facture).toBe(500);
  });

  it("ignore accents et ponctuation dans le titre", () => {
    const idx = indexerFacturation(
      [offre({ titre: "Dupond, Rue de l'Église 3 à 1000 Lausanne" })],
      [facture({ titre: "Dupond, Rue de l Eglise 3 a 1000 Lausanne" })],
    );
    expect(rapprocher("TM-2600001", idx).etat).toBe("facturee");
  });

  /* Cas réel TM-2600026 : l'adresse avait été complétée au moment de
     facturer, le titre ne correspondait plus — le montant, si. */
  it("retrouve la facture par le montant quand le titre a été retouché", () => {
    const idx = indexerFacturation(
      [offre({ titre: "Constantin SA - UBS App. Témoin L311 à Plan-les-Ouates", total: 434.55 })],
      [facture({ titre: "Constantin SA - UBS App. L311 Rte. de Base 37 à Plan", total: 434.55 })],
    );
    const r = rapprocher("TM-2600001", idx);
    expect(r.etat).toBe("retrouvee");
  });

  it("ne confond pas deux chantiers du même client à des montants différents", () => {
    const idx = indexerFacturation(
      [offre({ titre: "Client, Rue A 1 à 1000 Lausanne", total: 500 })],
      [facture({ titre: "Client, Chemin Z 9 à 2000 Neuchatel", total: 900 })],
    );
    expect(rapprocher("TM-2600001", idx).etat).toBe("sans");
  });

  it("accepte une adresse concordante chez le même client", () => {
    const idx = indexerFacturation(
      [offre({ titre: "Lot 4, Rue de la Bergerie 4 à 1530 Payerne", total: 500 })],
      [facture({ titre: "Bergerie Payerne — lots groupés", total: 1800 })],
    );
    expect(rapprocher("TM-2600001", idx).etat).toBe("probable");
  });

  /* Cas réel Malley Phare : client facturé « Services – <mois> ». */
  it("n'accuse pas un client facturé au forfait mensuel", () => {
    const factures = [
      facture({ id: 1, titre: "Services - Juillet 2026", total: 18479, contactId: 7 }),
      facture({ id: 2, titre: "Services - Août 2026", total: 6329, contactId: 7 }),
    ];
    const idx = indexerFacturation([offre({ titre: "Malley Phare, Ch. du Viaduc 1", contactId: 7, total: 7264 })], factures);
    expect(rapprocher("TM-2600001", idx).etat).toBe("mensuel");
  });

  it("ne classe pas au forfait un client qui n'a qu'une facture « Services »", () => {
    const f = [facture({ titre: "Services - Juillet 2026", contactId: 7 })];
    expect(clientsAuForfait(f).has(7)).toBe(false);
  });

  it("signale un oubli quand rien ne correspond", () => {
    const idx = indexerFacturation([offre({ total: 540.5 })], []);
    const r = rapprocher("TM-2600001", idx);
    expect(r.etat).toBe("sans");
    expect(r.offre?.total).toBe(540.5);
  });

  it("se tait quand le numéro n'existe pas chez bexio", () => {
    const idx = indexerFacturation([], []);
    expect(rapprocher("TM-9999999", idx).etat).toBe("inconnue");
    expect(rapprocher("", idx).etat).toBe("inconnue");
  });

  it("additionne plusieurs factures et ce qu'il reste à encaisser", () => {
    const idx = indexerFacturation([offre({})], [
      facture({ id: 1, total: 300, restant: 0 }),
      facture({ id: 2, total: 200, restant: 200 }),
    ]);
    const r = rapprocher("TM-2600001", idx);
    expect(r.facture).toBe(500);
    expect(r.restant).toBe(200);
  });
});
