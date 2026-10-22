import { describe, it, expect } from "vitest";
import { resumerAppels, ligneJournal, heureAppelValide, type Appel } from "@/lib/suivi-appels";

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

describe("appel noté après coup", () => {
  it("le journal garde l'heure de l'appel et dit quand il a été noté", () => {
    expect(ligneJournal(a("2026-10-22T09:00:00Z", "message", { saisiLe: "2026-10-22T14:02:00Z" })))
      .toBe("22.10.26 - 11h00 : Message laissé (combox) (Micael, noté à 16h02)");
    expect(ligneJournal(a("2026-10-21T15:30:00Z", "sans-reponse", { saisiLe: "2026-10-22T06:10:00Z" })))
      .toBe("21.10.26 - 17h30 : Appel sans réponse (Micael, noté le 22.10 à 08h10)");
  });
  it("noté tout de suite : rien de plus", () => {
    expect(ligneJournal(a("2026-10-22T09:00:00Z", "joint", { saisiLe: "2026-10-22T09:02:00Z" })))
      .toBe("22.10.26 - 11h00 : Client joint (Micael)");
  });
  it("heure refusée dans le futur ou trop ancienne", () => {
    expect(heureAppelValide("2026-10-22T09:00:00Z", MAINTENANT)).toBe("2026-10-22T09:00:00.000Z");
    expect(heureAppelValide("2026-10-22T15:00:00Z", MAINTENANT)).toBeNull();
    expect(heureAppelValide("2026-09-01T09:00:00Z", MAINTENANT)).toBeNull();
    expect(heureAppelValide("n'importe quoi", MAINTENANT)).toBeNull();
  });
});
