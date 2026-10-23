import { describe, it, expect } from "vitest";
import { lignesAlerte, resumeLigne } from "@/lib/alerte-envois";

const H = 3_600_000;
const NOW = Date.parse("2026-10-24T05:00:00Z");
const app = (o: Record<string, unknown>) => ({
  appareil: "a", email: "x", nom: "Claudio Zanutto", role: "monteur", navigateur: "Safari", enLigne: true,
  photosEnAttente: 0, photosEnEchec: 0, requetesEnAttente: 0, rapportsNonEnvoyes: [], preparesHorsLigne: 0, preparesQuand: 0,
  build: "", vu: NOW - 2 * H, ...o,
}) as never;

describe("alerte du matin : envois bloqués", () => {
  it("rien en attente : aucune ligne (donc aucun e-mail)", () => {
    expect(lignesAlerte([app({})])).toEqual([]);
  });
  it("décrit qui, quel appareil, quoi et depuis quand — le plus ancien d'abord", () => {
    const l = lignesAlerte([
      app({ appareil: "b", nom: "Miguel Roberto", photosEnEchec: 2, vu: NOW - 3 * H }),
      app({ appareil: "a", requetesEnAttente: 3, rapportsNonEnvoyes: [{ projectId: "p", depuis: NOW - 30 * H, client: true, retenuPar: 0 }] }),
    ], { a: "iPhone de Claudio" });
    expect(l.map((x) => x.nom)).toEqual(["Claudio Zanutto", "Miguel Roberto"]);
    expect(resumeLigne(l[0], NOW)).toBe("Claudio Zanutto (iPhone de Claudio) : 3 saisies en file, 1 rapport non envoyé — depuis 30 h");
  });
});
