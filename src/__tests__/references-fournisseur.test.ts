import { describe, it, expect } from "vitest";
import { referencesFournisseur, estClientFournisseur } from "@/lib/references-fournisseur";

describe("références fournisseur", () => {
  it("donne les deux numéros quand le client est un fournisseur", () => {
    expect(referencesFournisseur({
      typeClient: "Fournisseurs", cmdFournisseurs: "882108323", servCmdFournisseurs: "KS 2026/904",
    })).toEqual([
      { label: "N° CMD Fournisseur", valeur: "882108323" },
      { label: "N° Serv. CMD Fournisseur", valeur: "KS 2026/904" },
    ]);
  });

  it("ne donne rien pour un autre type de client", () => {
    expect(referencesFournisseur({ typeClient: "Grossistes", cmdFournisseurs: "882108323" })).toEqual([]);
    expect(referencesFournisseur({ cmdFournisseurs: "882108323" })).toEqual([]);
  });

  it("écarte les numéros non renseignés plutôt que d'afficher un tiret", () => {
    expect(referencesFournisseur({ typeClient: "Fournisseurs", cmdFournisseurs: "  ", servCmdFournisseurs: "KS 1" }))
      .toEqual([{ label: "N° Serv. CMD Fournisseur", valeur: "KS 1" }]);
    expect(referencesFournisseur({ typeClient: "Fournisseurs" })).toEqual([]);
  });

  it("tolère le singulier et la casse", () => {
    expect(estClientFournisseur({ typeClient: "fournisseur" })).toBe(true);
    expect(estClientFournisseur({ typeClient: "Fournisseurs" })).toBe(true);
    expect(estClientFournisseur({ typeClient: "Sanitaires" })).toBe(false);
  });
});
