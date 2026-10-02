import { describe, it, expect } from "vitest";
import { numerosServices } from "@/lib/numeros-services";

describe("numerosServices", () => {
  it("ne rend que le préfixe demandé — un MS n'est pas sur la facture des services", () => {
    const champ = "MS 2026/1687\nKS 2026/970";
    expect(numerosServices(champ, ["MS"])).toEqual(["MS 2026/1687"]);
    expect(numerosServices(champ, ["KS"])).toEqual(["KS 2026/970"]);
    expect(numerosServices(champ, ["MS", "KS"])).toEqual(["MS 2026/1687", "KS 2026/970"]);
  });

  it("tolère les écarts de saisie", () => {
    expect(numerosServices("ms2026/1687", ["MS"])).toEqual(["MS 2026/1687"]);
    expect(numerosServices("MS - 2026 / 1687", ["MS"])).toEqual(["MS 2026/1687"]);
    expect(numerosServices("AS: 2026/44", ["AS"])).toEqual(["AS 2026/44"]);
  });

  it("dédoublonne et garde l'ordre de lecture", () => {
    expect(numerosServices("KS 2026/1, MS 2026/2, KS 2026/1", ["MS", "KS"]))
      .toEqual(["KS 2026/1", "MS 2026/2"]);
  });

  it("ne rend rien quand le champ ne porte aucun numéro de ce genre", () => {
    expect(numerosServices("601/3184", ["MS", "KS"])).toEqual([]);
    expect(numerosServices("", ["AS"])).toEqual([]);
    expect(numerosServices(null, ["AS"])).toEqual([]);
  });
});
