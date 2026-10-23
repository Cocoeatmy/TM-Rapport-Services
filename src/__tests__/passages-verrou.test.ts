import { describe, it, expect } from "vitest";
import { protegerPassages, limitePassages } from "@/lib/passages-verrou";

const LIMITE = "2026-10-23";

describe("les passages d'un jour écoulé ne se réécrivent pas", () => {
  it("TM-2600933 : le démontage du 12.10 garde ses heures, le montage du jour passe", () => {
    const base = "2026-10-12 Jean-Marc & Miguel 07:30";
    const entrant = "2026-10-12 Jean-Marc & Miguel 08:00 | 2026-10-23 Jean-Marc & Miguel 08:00";
    const r = protegerPassages("heureArrivee", base, entrant, LIMITE);
    expect(r.valeur).toBe("2026-10-12 Jean-Marc & Miguel 07:30 | 2026-10-23 Jean-Marc & Miguel 08:00");
    expect(r.touches).toBeGreaterThan(0);
  });

  it("un passage ancien supprimé est rétabli", () => {
    const r = protegerPassages("interventionsMontageCabines",
      "Cab1:2026-10-12~JM~08:00~09:31;2026-10-23~JM~08:00", "Cab1:2026-10-23~JM~08:00~11:00", LIMITE);
    expect(r.valeur).toBe("Cab1:2026-10-12~JM~08:00~09:31;2026-10-23~JM~08:00~11:00");
  });

  it("multi-cabines : la case d'un lot daté d'avant reste, les autres lots passent", () => {
    const r = protegerPassages("heureArrivee",
      "Cab1:2026-10-12:08:00 | Cab2:2026-10-23:08:00", "Cab1:2026-10-23:10:00 | Cab2:2026-10-23:08:15 | Cab3:2026-10-23:09:00", LIMITE);
    expect(r.valeur).toBe("Cab1:2026-10-12:08:00 | Cab2:2026-10-23:08:15 | Cab3:2026-10-23:09:00");
  });

  it("rien d'ancien touché : aucune intervention", () => {
    const base = "2026-10-12 JM 08:00 | 2026-10-23 JM 08:00";
    const r = protegerPassages("heureArrivee", base, "2026-10-12 JM 08:00 | 2026-10-23 JM 08:30", LIMITE);
    expect(r.touches).toBe(0);
  });

  it("saisie hors ligne d'hier rejouée aujourd'hui : la limite est le jour de la saisie", () => {
    const maintenant = new Date("2026-10-23T08:00:00+02:00");
    const hier = new Date("2026-10-22T19:00:00+02:00").getTime();
    expect(limitePassages(String(hier), maintenant)).toBe("2026-10-22");
    expect(limitePassages(null, maintenant)).toBe("2026-10-23");
  });
});
