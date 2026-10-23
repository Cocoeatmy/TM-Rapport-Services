import { describe, it, expect } from "vitest";
import { minutesParPersonne } from "@/lib/heures-hommes";

describe("heures de chaque personne", () => {
  it("deux monteurs pendant deux heures = deux fois deux heures", () => {
    expect(minutesParPersonne({ interventionsMontageCabines: "Cab1:2026-10-12~Jean-Marc & Miguel~08:00~10:00" }))
      .toEqual({ parPersonne: { "Jean-Marc": 120, Miguel: 120 }, sansNom: 0 });
  });
  it("lot sur plusieurs jours, et présence sans nom", () => {
    expect(minutesParPersonne({ heureArrivee: "2026-10-12 Javier 08:00 | 2026-10-13 Javier & Claudio 09:00", heureDepart: "2026-10-12 Javier 09:00 | 2026-10-13 Javier & Claudio 10:30" }))
      .toEqual({ parPersonne: { Javier: 150, Claudio: 90 }, sansNom: 0 });
    expect(minutesParPersonne({ heureArrivee: "08:00", heureDepart: "11:00" }).sansNom).toBe(180);
  });
});
