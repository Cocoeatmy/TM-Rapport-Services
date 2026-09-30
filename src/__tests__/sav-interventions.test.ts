import { describe, it, expect } from "vitest";
import {
  parseInterventions,
  encodeInterventions,
  interventionsDuLot,
  dernierPassage,
} from "@/lib/sav-interventions";

describe("parseInterventions", () => {
  it("lit plusieurs passages avec leur collaborateur", () => {
    expect(parseInterventions("2026-06-23~Claudio & Micael ; 2026-09-30~Claudio")).toEqual([
      { date: "2026-06-23", collaborateurs: "Claudio & Micael" },
      { date: "2026-09-30", collaborateurs: "Claudio" },
    ]);
  });

  it("lit une date seule — la forme de l'ancienne colonne", () => {
    expect(parseInterventions("2026-06-23")).toEqual([
      { date: "2026-06-23", collaborateurs: "" },
    ]);
  });

  it("ne rend rien pour une valeur vide", () => {
    expect(parseInterventions("")).toEqual([]);
    expect(parseInterventions(null)).toEqual([]);
    expect(parseInterventions("  ;  ")).toEqual([]);
  });
});

describe("encodeInterventions", () => {
  it("fait l'aller-retour", () => {
    const liste = [
      { date: "2026-06-23", collaborateurs: "Claudio & Micael" },
      { date: "2026-09-30", collaborateurs: "Claudio" },
    ];
    expect(parseInterventions(encodeInterventions(liste))).toEqual(liste);
  });

  it("écarte les passages entièrement vides", () => {
    expect(encodeInterventions([{ date: "", collaborateurs: "" }])).toBe("");
  });

  it("neutralise les séparateurs qui couperaient la valeur", () => {
    const enc = encodeInterventions([{ date: "2026-06-23", collaborateurs: "Clau;dio | Mi~cael" }]);
    expect(enc).toBe("2026-06-23~Clau dio Mi cael");
    expect(parseInterventions(enc)).toHaveLength(1);
  });
});

describe("interventionsDuLot", () => {
  it("replie sur les anciennes colonnes quand la liste est vide", () => {
    expect(interventionsDuLot("", "2026-06-23", "Claudio")).toEqual([
      { date: "2026-06-23", collaborateurs: "Claudio" },
    ]);
  });

  it("ignore l'héritage dès que la liste existe", () => {
    expect(interventionsDuLot("2026-09-30~Miguel", "2026-06-23", "Claudio")).toEqual([
      { date: "2026-09-30", collaborateurs: "Miguel" },
    ]);
  });

  it("ne rend rien quand il n'y a ni liste ni héritage", () => {
    expect(interventionsDuLot("", "", "")).toEqual([]);
  });
});

describe("dernierPassage", () => {
  it("prend la date la plus récente, pas le dernier saisi", () => {
    expect(dernierPassage([
      { date: "2026-09-30", collaborateurs: "Claudio" },
      { date: "2026-06-23", collaborateurs: "Micael" },
    ])).toEqual({ date: "2026-09-30", collaborateurs: "Claudio" });
  });

  it("ignore les passages sans date", () => {
    expect(dernierPassage([{ date: "", collaborateurs: "Loïc" }])).toBeNull();
  });
});
