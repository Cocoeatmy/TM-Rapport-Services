import { describe, it, expect } from "vitest";
import { cabinesDuJour, joursDuChantier } from "@/lib/cabines-du-jour";

describe("cabinesDuJour", () => {
  it("un chantier d'un seul jour compte toutes ses cabines ce jour-là", () => {
    expect(cabinesDuJour({ nbCabines: 3, dateMontage: "2026-10-09" }, "2026-10-09")).toBe(3);
    expect(cabinesDuJour({ nbCabines: 3, dateMontage: "2026-10-09" }, "2026-10-08")).toBe(0);
  });

  it("le cas réel du 9 octobre : 7 cabines dont 5 posées d'autres jours", () => {
    // 5 cabines relevées les jours précédents, 2 sans relevé, un seul jour prévu.
    const p = {
      nbCabines: 7,
      dateMontage: "2026-10-09",
      heureArrivee: "Cab1:2026-10-05:08:00 | Cab2:2026-10-06:08:00 | Cab3:2026-10-06:09:00 | Cab4:2026-10-07:08:00 | Cab5:2026-10-08:08:00",
    };
    expect(cabinesDuJour(p, "2026-10-09")).toBe(2); // au lieu des 7 du chantier
    expect(cabinesDuJour(p, "2026-10-06")).toBe(2); // les deux cabines pointées ce jour-là
  });

  it("répartit les cabines sans relevé sur les jours prévus, sans en perdre", () => {
    const p = { nbCabines: 7, dateMontage: "2026-10-05", dateMontageEnd: "2026-10-07" };
    const jours = ["2026-10-05", "2026-10-06", "2026-10-07"];
    expect(jours.map((j) => cabinesDuJour(p, j))).toEqual([3, 2, 2]);
    expect(jours.reduce((s, j) => s + cabinesDuJour(p, j), 0)).toBe(7);
  });

  it("une cabine posée hors des jours prévus compte le jour où elle l'a été", () => {
    const p = { nbCabines: 2, dateMontage: "2026-10-09", heureArrivee: "Cab1:2026-08-11:14:04" };
    expect(cabinesDuJour(p, "2026-08-11")).toBe(1);
    expect(cabinesDuJour(p, "2026-10-09")).toBe(1);
    expect(joursDuChantier(p)).toContain("2026-08-11");
  });

  it("le week-end ne porte aucune cabine", () => {
    const p = { nbCabines: 4, dateMontage: "2026-10-09", dateMontageEnd: "2026-10-12" };
    expect(cabinesDuJour(p, "2026-10-10")).toBe(0); // samedi
    expect(cabinesDuJour(p, "2026-10-11")).toBe(0); // dimanche
  });
});
