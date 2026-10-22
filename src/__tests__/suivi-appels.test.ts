import { describe, it, expect } from "vitest";
import { resumerAppels, ligneJournal, type Appel } from "@/lib/suivi-appels";

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
    expect(ligneJournal(a("2026-10-22T14:31:00Z", "sans-reponse"))).toBe("22.10.26 - 16h31 : Appel sans réponse (Micael)");
  });
  it("rappel daté et note", () => {
    expect(ligneJournal(a("2026-10-22T07:05:00Z", "rappeler", { rappelLe: "2026-10-24", note: "après 17h" })))
      .toBe("22.10.26 - 09h05 : À rappeler le 24.10 — après 17h (Micael)");
  });
});
