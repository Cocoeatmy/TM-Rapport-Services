import { describe, it, expect } from "vitest";
import {
  normaliserAnalyse, ajouterAuRapport, analyseDeSecours, consigneAnalyse, numeroParDefaut,
  type LotDictee,
} from "@/lib/rapport-dicte";

const OK = "L'installation s'est déroulée sans encombre.";
const DIFF = "Nous avons rencontré quelques difficultés à l'assemblage de la cabine.";
const LOTS: LotDictee[] = [
  { numero: 0, nom: "Général", options: [] },
  { numero: 3, nom: "Lot 3", options: [OK, DIFF] },
  { numero: 4, nom: "Lot 4 — 2e étage", options: [OK, DIFF] },
];

describe("normaliserAnalyse", () => {
  it("garde la répartition par lot et recopie la phrase toute faite exacte", () => {
    const a = normaliserAnalyse({
      parties: [
        { numero: 3, coches: ["l’installation s’est deroulee sans encombre."], texte: "" },
        { numero: 4, coches: [], texte: "Le joint de la porte est à reprendre." },
      ],
      noteInterne: "Client pressé.",
      signalements: [{ numero: 4, type: "piece", description: "Poignée manquante" }],
    }, LOTS, "transcription");
    expect(a.parties).toEqual([
      { numero: 3, coches: [OK], texte: "" },
      { numero: 4, coches: [], texte: "Le joint de la porte est à reprendre." },
    ]);
    expect(a.noteInterne).toBe("Client pressé.");
    expect(a.signalements).toEqual([{ numero: 4, type: "piece", description: "Poignée manquante" }]);
  });

  it("un lot inconnu retombe sur le général ; une phrase inventée passe dans le texte", () => {
    const a = normaliserAnalyse({
      parties: [{ numero: 99, coches: ["Tout est parfait."], texte: "Silicone refait." }],
      noteInterne: "", signalements: [{ numero: 42, type: "autre", description: "Vitre rayée" }],
    }, LOTS, "x");
    expect(a.parties).toEqual([{ numero: 0, coches: [], texte: "Tout est parfait. Silicone refait." }]);
    expect(a.signalements).toEqual([{ numero: 0, type: "defaut", description: "Vitre rayée" }]);
  });

  it("fusionne deux parties du même lot", () => {
    const a = normaliserAnalyse({
      parties: [{ numero: 3, coches: [OK], texte: "A." }, { numero: 3, coches: [OK, DIFF], texte: "B." }],
      noteInterne: "", signalements: [],
    }, LOTS, "x");
    expect(a.parties).toEqual([{ numero: 3, coches: [OK, DIFF], texte: "A. B." }]);
  });

  it("réponse vide ou illisible : toute la transcription, rien de perdu", () => {
    for (const brut of [null, "n'importe quoi", {}, { parties: [], noteInterne: "", signalements: [] }]) {
      expect(normaliserAnalyse(brut, LOTS, "  Tout dit ici.  ")).toEqual(analyseDeSecours(LOTS, "Tout dit ici."));
    }
    expect(analyseDeSecours(LOTS, "T").parties[0].numero).toBe(0);
  });

  it("chantier simple (pas de numéro 0) : le défaut est le seul lot", () => {
    const mono: LotDictee[] = [{ numero: 1, nom: "Chantier", options: [OK] }];
    expect(numeroParDefaut(mono)).toBe(1);
    expect(normaliserAnalyse({ parties: [{ numero: 0, coches: [OK], texte: "" }] }, mono, "x").parties)
      .toEqual([{ numero: 1, coches: [OK], texte: "" }]);
  });
});

describe("ajouterAuRapport", () => {
  it("ajoute les phrases manquantes puis le texte, sans rien retirer", () => {
    expect(ajouterAuRapport("Déjà écrit.", [OK], "Joint repris.")).toBe(`Déjà écrit.\n${OK}\nJoint repris.`);
  });
  it("ne double ni une phrase déjà cochée ni un texte déjà présent", () => {
    const r = `${OK}\nJoint repris.`;
    expect(ajouterAuRapport(r, [OK], "Joint repris.")).toBe(r);
  });
  it("rapport vide", () => {
    expect(ajouterAuRapport("", [], "Texte.")).toBe("Texte.");
    expect(ajouterAuRapport("", [], "  ")).toBe("");
  });
});

describe("consigneAnalyse", () => {
  it("liste chaque lot avec ses phrases et interdit les montants", () => {
    const c = consigneAnalyse(LOTS);
    expect(c).toContain("numéro 4 : Lot 4 — 2e étage");
    expect(c).toContain(`- ${DIFF}`);
    expect(c).toMatch(/jamais de prix/);
  });
});
