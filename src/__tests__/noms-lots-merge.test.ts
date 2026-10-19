import { describe, it, expect } from "vitest";
import { mergeCabineNoms } from "@/lib/fusion-cabines";

/**
 * Qui gagne quand deux téléphones envoient les noms des lots.
 *
 * Le client envoie TOUS les slots à chaque fois, y compris ceux dont sa copie
 * est périmée. Le serveur arbitre : un « Cabine 3 » entrant ne vaut rien par
 * lui-même, sauf si le monteur vient précisément de renommer ce lot-là.
 */
describe("mergeCabineNoms", () => {
  const existant = "Cab1:SDD parentale | Cab2:Cabine 2";

  it("un nom choisi l'emporte sur l'existant", () => {
    expect(mergeCabineNoms(existant, "Cab1:Lot 1 | Cab2:Cabine 2"))
      .toBe("Cab1:Lot 1 | Cab2:Cabine 2");
  });

  it("un défaut entrant n'écrase pas un nom choisi — copie périmée", () => {
    expect(mergeCabineNoms(existant, "Cab1:Cabine 1 | Cab2:Cabine 2"))
      .toBe("Cab1:SDD parentale | Cab2:Cabine 2");
  });

  it("mais il passe quand le monteur vient de renommer CE lot", () => {
    expect(mergeCabineNoms(existant, "Cab1:Cabine 1 | Cab2:Cabine 2", "Cab1"))
      .toBe("Cab1:Cabine 1 | Cab2:Cabine 2");
  });

  it("le forçage ne vaut que pour les lots nommés dans la demande", () => {
    const ex = "Cab1:SDD | Cab2:SDB";
    expect(mergeCabineNoms(ex, "Cab1:Cabine 1 | Cab2:Cabine 2", "Cab1"))
      .toBe("Cab1:Cabine 1 | Cab2:SDB");
  });

  it("un titre ne s'efface jamais, même forcé", () => {
    expect(mergeCabineNoms(existant, "Cab1: | Cab2:Cabine 2", "Cab1"))
      .toBe("Cab1:SDD parentale | Cab2:Cabine 2");
  });

  it("un lot inconnu de l'existant prend ce qui arrive", () => {
    expect(mergeCabineNoms("Cab1:SDD", "Cab1:SDD | Cab3:Comble"))
      .toBe("Cab1:SDD | Cab3:Comble");
  });

  it("un lot vide et inconnu reçoit son nom par défaut", () => {
    expect(mergeCabineNoms("Cab1:SDD", "Cab1:SDD | Cab2:")).toBe("Cab1:SDD | Cab2:Cabine 2");
  });

  it("une valeur mono-cabine (sans « Cab ») passe telle quelle", () => {
    expect(mergeCabineNoms(existant, "Salle de bain")).toBe("Salle de bain");
  });
});
