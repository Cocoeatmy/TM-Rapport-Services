import { describe, it, expect } from "vitest";
import { cleAbsence, clesDeLaPeriode, type Absence } from "@/lib/absences";

const a = (collaborateur: string, jour: string): Absence => ({
  cle: cleAbsence(collaborateur, jour), collaborateur, jour, par: "Micael", le: "2026-10-12T20:00:00Z",
});

describe("clé d'une absence", () => {
  it("normalise le prénom et ne garde que le jour", () => {
    expect(cleAbsence("Claudio", "2026-10-14")).toBe("claudio|2026-10-14");
    expect(cleAbsence(" CLAUDIO ", "2026-10-14T08:00:00Z")).toBe("claudio|2026-10-14");
    expect(cleAbsence("Jean-Marc", "2026-10-14")).toBe("jean-marc|2026-10-14");
  });
});

describe("absences d'une période", () => {
  const toutes = new Map([
    a("Claudio", "2026-10-08"),
    a("Claudio", "2026-10-14"),
    a("Miguel", "2026-10-16"),
    a("Miguel", "2026-10-20"),
  ].map((x) => [x.cle, x]));

  it("retient les bornes incluses, et rien d'autre", () => {
    const cles = clesDeLaPeriode(toutes, "2026-10-12", "2026-10-16");
    expect([...cles].sort()).toEqual(["claudio|2026-10-14", "miguel|2026-10-16"]);
  });

  it("rend un ensemble vide quand la période ne contient rien", () => {
    expect(clesDeLaPeriode(toutes, "2026-11-01", "2026-11-07").size).toBe(0);
  });
});
