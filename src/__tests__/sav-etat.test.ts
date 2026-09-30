import { describe, it, expect } from "vitest";
import { lotsAvecSav, lotsSavOuverts, savEnCours } from "@/lib/sav-etat";

describe("lotsAvecSav", () => {
  it("rassemble les lots de toutes les colonnes SAV", () => {
    expect([...lotsAvecSav({
      commentairesSav: "Cab1:Joint cassé",
      interventionsSavCabines: "Cab3:2026-09-30~Claudio",
      documentsSavDemande: [{ name: "SAV demande.Cab2.1.jpg" }],
    })].sort()).toEqual([1, 2, 3]);
  });

  it("ignore une valeur vide — « Cab1: » ne fait pas un SAV", () => {
    expect(lotsAvecSav({ causeSavCabines: "Cab1:" }).size).toBe(0);
  });
});

describe("lotsSavOuverts", () => {
  it("écarte les lots clôturés et garde les autres", () => {
    expect(lotsSavOuverts({
      commentairesSav: "Cab1:Porte qui frotte | Cab2:Joint cassé",
      datesSavClotureCabines: "Cab1:2026-09-23",
    })).toEqual([2]);
  });
});

describe("savEnCours", () => {
  it("vrai quand un lot reste ouvert, même si un autre est clôturé", () => {
    expect(savEnCours({
      commentairesSav: "Cab1:Porte | Cab2:Joint",
      datesSavClotureCabines: "Cab1:2026-09-23",
    })).toBe(true);
  });

  it("faux quand tous les lots sont clôturés", () => {
    expect(savEnCours({
      commentairesSav: "Cab1:Porte",
      datesSavClotureCabines: "Cab1:2026-09-23",
    })).toBe(false);
  });

  it("les lots priment sur l'ancien état, qui peut être resté à « Aucun SAV »", () => {
    expect(savEnCours({ commentairesSav: "Cab2:Joint", etatSAV: "Aucun SAV" })).toBe(true);
  });

  it("retombe sur l'ancienne base quand aucun lot n'est encodé", () => {
    expect(savEnCours({ etatSAV: "A contacter" })).toBe(true);
    expect(savEnCours({ etatSAV: "Terminé" })).toBe(false);
    expect(savEnCours({ etatSAV: "Aucun SAV" })).toBe(false);
  });

  it("la case « SAV » seule vaut un SAV ouvert tant qu'elle n'est pas clôturée", () => {
    expect(savEnCours({ sav: true })).toBe(true);
    expect(savEnCours({ sav: true, savCloture: true })).toBe(false);
    expect(savEnCours({})).toBe(false);
  });
});
