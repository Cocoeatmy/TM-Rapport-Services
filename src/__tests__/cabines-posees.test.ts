import { describe, it, expect } from "vitest";
import { cabinesPosees, cabinesRestantes } from "@/lib/cabines-posees";

describe("cabinesPosees", () => {
  it("compte les cabines photographiées", () => {
    expect(cabinesPosees({
      nbCabines: 3,
      photosMontage: [{ name: "Montage centre.Cab1.1.jpg" }, { name: "Montage droite.Cab2.1.jpg" }],
    })).toBe(2);
  });

  it("sur un chantier d'une cabine, les photos n'ont pas de préfixe — leur présence suffit", () => {
    expect(cabinesPosees({ nbCabines: 1, photosMontage: [{ name: "Montage centre.1.jpg" }] })).toBe(1);
  });

  it("retombe sur le compteur Notion quand les photos ne disent rien", () => {
    expect(cabinesPosees({ nbCabines: 4, nbCabinesInstallees: 3, photosMontage: [] })).toBe(3);
  });

  it("ne dépasse jamais le nombre de cabines du chantier", () => {
    expect(cabinesPosees({ nbCabines: 2, nbCabinesInstallees: 9 })).toBe(2);
  });

  it("rien de posé quand rien ne l'atteste", () => {
    expect(cabinesPosees({ nbCabines: 3 })).toBe(0);
    expect(cabinesPosees({ nbCabines: 3, photosMontage: [{ name: "Avant montage.1.jpg" }] })).toBe(0);
  });
});

describe("cabinesRestantes", () => {
  it("retranche ce qui est posé, sans jamais passer sous zéro", () => {
    expect(cabinesRestantes({ nbCabines: 3, nbCabinesInstallees: 1 })).toBe(2);
    expect(cabinesRestantes({ nbCabines: 2, nbCabinesInstallees: 5 })).toBe(0);
  });
});
