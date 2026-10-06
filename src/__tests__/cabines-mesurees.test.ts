import { describe, it, expect } from "vitest";
import { cabinesMesurees, cabinesAMesurer } from "@/lib/cabines-mesurees";

describe("cabinesMesurees", () => {
  it("compte les lots d'après les photos nommées", () => {
    expect(cabinesMesurees({
      nbCabines: 4,
      photosMesures: [{ name: "Mesures.Cab1.1.jpg" }, { name: "Mesures.Cab1.2.jpg" }, { name: "Mesures.Cab3.1.jpg" }],
    })).toBe(2);
  });

  it("ne dépasse jamais le nombre de cabines du chantier", () => {
    expect(cabinesMesurees({
      nbCabines: 1,
      photosMesures: [{ name: "x.Cab1.jpg" }, { name: "x.Cab2.jpg" }],
    })).toBe(1);
  });

  it("un relevé annoncé terminé vaut pour tout le chantier", () => {
    expect(cabinesMesurees({ nbCabines: 6, etatMesures: "Terminé" })).toBe(6);
    expect(cabinesMesurees({ nbCabines: 6, etatMesures: "Mesures relevées - attente news" })).toBe(6);
  });

  it("« Mesures partielles » sans photo n'affirme rien", () => {
    expect(cabinesMesurees({ nbCabines: 6, etatMesures: "Mesures partielles" })).toBe(0);
  });

  it("une cabine seule : la photo suffit, elle ne porte pas de préfixe", () => {
    expect(cabinesMesurees({ nbCabines: 1, photosMesures: [{ name: "photo.jpg" }] })).toBe(1);
    expect(cabinesMesurees({ nbCabines: 1, photosMesures: [] })).toBe(0);
  });

  it("le reste à mesurer n'est jamais négatif", () => {
    expect(cabinesAMesurer({ nbCabines: 3, etatMesures: "Terminé" })).toBe(0);
    expect(cabinesAMesurer({ nbCabines: 3 })).toBe(3);
  });
});
