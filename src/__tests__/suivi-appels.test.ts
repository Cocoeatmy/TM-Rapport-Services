import { describe, it, expect } from "vitest";
import { resumerAppels, ligneJournal, heureAppelValide, rangAppel, type Appel } from "@/lib/suivi-appels";

const MAINTENANT = Date.parse("2026-10-22T14:00:00Z");
const a = (le: string, issue: Appel["issue"], extra: Partial<Appel> = {}): Appel => ({ id: le, le, issue, par: "Micael", ...extra });

describe("résumé des appels", () => {
  it("aucun appel", () => {
    expect(resumerAppels([], MAINTENANT).ton).toBe("aucun");
  });
  it("les tentatives se comptent depuis le dernier contact réussi", () => {
    const r = resumerAppels([
      a("2026-10-10T08:00:00Z", "joint"),
      a("2026-10-20T08:00:00Z", "sans-reponse"),
      a("2026-10-21T08:00:00Z", "sans-reponse"),
      a("2026-10-22T08:00:00Z", "sans-reponse"),
    ], MAINTENANT);
    expect(r).toMatchObject({ ton: "essai3", libelle: "3× sans réponse", tentatives: 3 });
  });
  it("à rappeler, puis en retard une fois le jour passé", () => {
    expect(resumerAppels([a("2026-10-21T08:00:00Z", "rappeler", { rappelLe: "2026-10-24" })], MAINTENANT).ton).toBe("rappel");
    expect(resumerAppels([a("2026-10-18T08:00:00Z", "rappeler", { rappelLe: "2026-10-20" })], MAINTENANT).ton).toBe("rappel-retard");
  });
  it("client joint", () => {
    expect(resumerAppels([a("2026-10-20T08:00:00Z", "sans-reponse"), a("2026-10-22T09:00:00Z", "joint")], MAINTENANT))
      .toMatchObject({ ton: "joint", tentatives: 0 });
  });
});

describe("ligne du journal Notion", () => {
  it("à l'heure suisse, même écrite par un serveur en UTC", () => {
    expect(ligneJournal(a("2026-10-22T14:31:00Z", "sans-reponse"))).toBe("22.10.26 - 16h31 : Appel sans réponse");
  });
  it("rappel daté et note", () => {
    expect(ligneJournal(a("2026-10-22T07:05:00Z", "rappeler", { rappelLe: "2026-10-24", note: "après 17h" })))
      .toBe("22.10.26 - 09h05 : À rappeler le 24.10 — après 17h");
  });
});

describe("appel noté après coup", () => {
  it("le journal garde l'heure de l'appel et dit quand il a été noté", () => {
    expect(ligneJournal(a("2026-10-22T09:00:00Z", "message", { saisiLe: "2026-10-22T14:02:00Z" })))
      .toBe("22.10.26 - 11h00 : Message laissé (combox)");
    expect(ligneJournal(a("2026-10-21T15:30:00Z", "sans-reponse", { saisiLe: "2026-10-22T06:10:00Z" })))
      .toBe("21.10.26 - 17h30 : Appel sans réponse");
  });
  it("noté tout de suite : rien de plus", () => {
    expect(ligneJournal(a("2026-10-22T09:00:00Z", "joint", { saisiLe: "2026-10-22T09:02:00Z" })))
      .toBe("22.10.26 - 11h00 : Client joint");
  });
  it("heure refusée dans le futur ou trop ancienne", () => {
    expect(heureAppelValide("2026-10-22T09:00:00Z", MAINTENANT)).toBe("2026-10-22T09:00:00.000Z");
    expect(heureAppelValide("2026-10-22T15:00:00Z", MAINTENANT)).toBeNull();
    expect(heureAppelValide("2026-10-07T10:00:00Z", MAINTENANT)).toBe("2026-10-07T10:00:00.000Z");
    expect(heureAppelValide("2026-06-01T09:00:00Z", MAINTENANT)).toBeNull();
    expect(heureAppelValide("n'importe quoi", MAINTENANT)).toBeNull();
  });
});

describe("numérotation dans le journal", () => {
  const hist = [
    a("2026-10-20T08:00:00Z", "message"),
    a("2026-10-20T09:00:00Z", "sans-reponse"),
    a("2026-10-21T08:00:00Z", "message"),
    a("2026-10-21T10:00:00Z", "joint"),
    a("2026-10-22T08:00:00Z", "sans-reponse"),
    a("2026-10-22T09:00:00Z", "message"),
    a("2026-10-22T10:00:00Z", "message"),
  ];
  it("chaque sorte compte à part, et repart à zéro après « joint »", () => {
    expect(rangAppel(hist, hist[2])).toBe(2);
    expect(rangAppel(hist, hist[1])).toBe(1);
    expect(rangAppel(hist, hist[6])).toBe(2);
    expect(rangAppel(hist, hist[4])).toBe(1);
    expect(rangAppel(hist, hist[3])).toBe(0);
  });
  it("un appel noté après coup prend sa place chronologique", () => {
    const tard = a("2026-10-20T07:00:00Z", "message", { id: "tard" });
    expect(rangAppel([...hist, tard], tard)).toBe(1);
  });
  it("la ligne porte le numéro", () => {
    expect(ligneJournal(hist[6], 2)).toBe("22.10.26 - 12h00 : 2e message laissé (combox)");
    expect(ligneJournal(hist[4], 1)).toBe("22.10.26 - 10h00 : 1er appel sans réponse");
    expect(ligneJournal(a("2026-10-22T09:00:00Z", "sans-reponse"), 9)).toBe("22.10.26 - 11h00 : 9e appel sans réponse");
    expect(ligneJournal(hist[3], 0)).toBe("21.10.26 - 12h00 : Client joint");
  });
});

describe("appel noté sans heure", () => {
  it("le journal n'indique que le jour", () => {
    expect(ligneJournal(a("2026-10-07T10:00:00Z", "message", { sansHeure: true }), 2))
      .toBe("07.10.26 : 2e message laissé (combox)");
  });
});

describe("heure tapée", () => {
  it("formats acceptés, vide, illisible", async () => {
    const { lireHeure } = await import("@/lib/suivi-appels");
    expect(lireHeure("")).toBe("");
    expect(lireHeure("  ")).toBe("");
    expect(lireHeure("9")).toBe("09:00");
    expect(lireHeure("930")).toBe("09:30");
    expect(lireHeure("1130")).toBe("11:30");
    expect(lireHeure("9h30")).toBe("09:30");
    expect(lireHeure("11:00")).toBe("11:00");
    expect(lireHeure("14.05")).toBe("14:05");
    expect(lireHeure("--:--")).toBeNull();
    expect(lireHeure("25:00")).toBeNull();
  });
});
