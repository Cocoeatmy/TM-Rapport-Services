import { describe, it, expect } from "vitest";
import { numerosServices, prefixeManquant } from "@/lib/numeros-services";

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

  it("ne rend rien quand le champ est vide ou sans numéro", () => {
    expect(numerosServices("", ["AS"])).toEqual([]);
    expect(numerosServices(null, ["AS"])).toEqual([]);
    expect(numerosServices("à commander", ["MS", "KS"])).toEqual([]);
  });
});

describe("numéros sans préfixe dans Notion", () => {
  it("qualifie un numéro nu quand la colonne garantit le préfixe", () => {
    expect(numerosServices("2026/1939", ["AS"], "AS")).toEqual(["AS 2026/1939"]);
  });

  it("rend le numéro nu tel quel dans la colonne partagée — rien ne dit MS ou KS", () => {
    expect(numerosServices("2026/1939", ["MS"])).toEqual(["2026/1939"]);
    expect(prefixeManquant("2026/1939")).toBe(true);
    expect(prefixeManquant("MS 2026/1939")).toBe(false);
  });

  it("le préfixe écrit fait foi : un numéro nu à côté d'un MS n'est pas repris", () => {
    expect(numerosServices("MS 2026/1692\n601/3778", ["MS"])).toEqual(["MS 2026/1692"]);
    expect(numerosServices("MS 2026/1692\n601/3778", ["KS"])).toEqual([]);
  });
});
