import { describe, it, expect } from "vitest";
import { minutesDuChantier } from "@/lib/heures-chantier";

describe("temps passé sur un chantier", () => {
  it("lit le format simple", () => {
    expect(minutesDuChantier("08:30", "11:45")).toBe(195);
  });

  /* Le piège qui faussait tous les chantiers multi-cabines : « Cab1:2026 »
     contient « 1:20 », que l'ancienne lecture prenait pour l'heure. */
  it("lit une heure par cabine sans se faire piéger par la date", () => {
    expect(minutesDuChantier("Cab1:2026-05-20:08:30", "Cab1:2026-05-20:17:00")).toBe(510);
  });

  it("additionne les cabines d'un même chantier", () => {
    expect(minutesDuChantier(
      "Cab1:2026-05-20:08:00 | Cab2:2026-05-21:09:00",
      "Cab1:2026-05-20:12:00 | Cab2:2026-05-21:11:30",
    )).toBe(240 + 150);
  });

  it("additionne les passages datés et nommés", () => {
    expect(minutesDuChantier(
      "2026-04-27 Jean-Marc 08:30 | 2026-05-02 Miguel 09:00",
      "2026-04-27 Jean-Marc 12:00 | 2026-05-02 Miguel 10:30",
    )).toBe(210 + 90);
  });

  it("ignore un passage dont le départ manque", () => {
    expect(minutesDuChantier("2026-04-27 Claudio 08:00 | 2026-05-02 Claudio 09:00",
      "2026-04-27 Claudio 12:00 | 2026-05-02 Claudio")).toBe(240);
  });

  it("ignore un départ antérieur à l'arrivée", () => {
    expect(minutesDuChantier("14:00", "09:00")).toBe(0);
  });

  it("rend zéro quand il n'y a rien", () => {
    expect(minutesDuChantier("", "")).toBe(0);
    expect(minutesDuChantier(null, undefined)).toBe(0);
  });

  it("refuse une heure impossible", () => {
    expect(minutesDuChantier("Cab1:2026-05-20", "Cab1:2026-05-25")).toBe(0);
  });
});
