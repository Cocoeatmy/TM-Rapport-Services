import { describe, it, expect } from "vitest";
import { equipeApp } from "@/lib/equipe-app";

describe("équipe selon l'app (statistiques des collaborateurs)", () => {
  it("passages, heures sur plusieurs jours et monteur responsable — jamais Notion", () => {
    expect(equipeApp({ collaborateurs: "Claudio", interventionsMontageCabines: "Cab1:2026-10-12~Jean-Marc & Miguel~08:00~09:00" } as never))
      .toEqual(["Jean-Marc", "Miguel"]);
    expect(equipeApp({ heureArrivee: "2026-10-12 Jean-Marc & Miguel 08:00 | 2026-10-23 Javier 08:00" })).toEqual(["Jean-Marc", "Miguel", "Javier"]);
    expect(equipeApp({ attributionCabines: "Cab1:Claudio | Cab2:Jacobo" })).toEqual(["Claudio", "Jacobo"]);
    expect(equipeApp({ collaborateurs: "Claudio" } as never)).toEqual([]);
  });
});
