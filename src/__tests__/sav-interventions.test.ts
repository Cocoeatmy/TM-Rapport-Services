import { describe, it, expect } from "vitest";
import {
  parseInterventions,
  encodeInterventions,
  interventionsDuLot,
  dernierPassage,
  minutesInterventions,
} from "@/lib/sav-interventions";

describe("parseInterventions", () => {
  it("lit plusieurs passages avec leur collaborateur", () => {
    expect(parseInterventions("2026-06-23~Claudio & Micael~08:30~11:45 ; 2026-09-30~Claudio")).toEqual([
      { date: "2026-06-23", collaborateurs: "Claudio & Micael", arrivee: "08:30", depart: "11:45" },
      { date: "2026-09-30", collaborateurs: "Claudio", arrivee: "", depart: "" },
    ]);
  });

  it("lit une date seule — la forme de l'ancienne colonne", () => {
    expect(parseInterventions("2026-06-23")).toEqual([
      { date: "2026-06-23", collaborateurs: "", arrivee: "", depart: "" },
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
      { date: "2026-06-23", collaborateurs: "Claudio & Micael", arrivee: "08:30", depart: "11:45" },
      { date: "2026-09-30", collaborateurs: "Claudio", arrivee: "", depart: "" },
    ];
    expect(parseInterventions(encodeInterventions(liste))).toEqual(liste);
  });

  it("écarte les passages entièrement vides", () => {
    expect(encodeInterventions([{ date: "", collaborateurs: "", arrivee: "", depart: "" }])).toBe("");
  });

  it("neutralise les séparateurs qui couperaient la valeur", () => {
    const enc = encodeInterventions([{ date: "2026-06-23", collaborateurs: "Clau;dio | Mi~cael", arrivee: "", depart: "" }]);
    expect(enc).toBe("2026-06-23~Clau dio Mi cael");
    expect(parseInterventions(enc)).toHaveLength(1);
  });
});

describe("interventionsDuLot", () => {
  it("replie sur les anciennes colonnes quand la liste est vide", () => {
    expect(interventionsDuLot("", "2026-06-23", "Claudio", "08:00", "09:30")).toEqual([
      { date: "2026-06-23", collaborateurs: "Claudio", arrivee: "08:00", depart: "09:30" },
    ]);
  });

  it("ignore l'héritage dès que la liste existe", () => {
    expect(interventionsDuLot("2026-09-30~Miguel", "2026-06-23", "Claudio")).toEqual([
      { date: "2026-09-30", collaborateurs: "Miguel", arrivee: "", depart: "" },
    ]);
  });

  it("ne rend rien quand il n'y a ni liste ni héritage", () => {
    expect(interventionsDuLot("", "", "")).toEqual([]);
  });
});

describe("dernierPassage", () => {
  it("prend la date la plus récente, pas le dernier saisi", () => {
    expect(dernierPassage([
      { date: "2026-09-30", collaborateurs: "Claudio", arrivee: "", depart: "" },
      { date: "2026-06-23", collaborateurs: "Micael", arrivee: "", depart: "" },
    ])).toEqual({ date: "2026-09-30", collaborateurs: "Claudio", arrivee: "", depart: "" });
  });

  it("ignore les passages sans date", () => {
    expect(dernierPassage([{ date: "", collaborateurs: "Loïc", arrivee: "", depart: "" }])).toBeNull();
  });
});

describe("minutesInterventions", () => {
  it("additionne les passages — revenir coûte une seconde fois", () => {
    expect(minutesInterventions([
      { date: "2026-06-23", collaborateurs: "", arrivee: "08:30", depart: "11:45" },
      { date: "2026-09-30", collaborateurs: "", arrivee: "09:00", depart: "10:00" },
    ])).toBe(195 + 60);
  });

  it("ignore un horaire incomplet ou inversé plutôt que d'inventer une durée", () => {
    expect(minutesInterventions([
      { date: "2026-06-23", collaborateurs: "", arrivee: "08:30", depart: "" },
      { date: "2026-06-24", collaborateurs: "", arrivee: "11:00", depart: "09:00" },
    ])).toBe(0);
  });
});
