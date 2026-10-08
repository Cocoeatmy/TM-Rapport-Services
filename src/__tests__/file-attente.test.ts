import { describe, it, expect } from "vitest";
import { suiteApresEchec } from "@/lib/offline";

/**
 * La garantie attendue : une écriture d'un monteur n'est JAMAIS supprimée.
 * Au pire elle est mise de côté — gardée et relancée toute seule.
 */
describe("que faire d'une écriture qui échoue", () => {
  it("réessaie après un échec réseau, avec un délai croissant", () => {
    const a = suiteApresEchec(1);
    const b = suiteApresEchec(3);
    expect(a).toEqual({ action: "reessayer", dansMs: 60_000 });
    expect(b.action).toBe("reessayer");
    if (b.action === "reessayer") expect(b.dansMs).toBeGreaterThan(60_000);
  });

  it("plafonne le délai à trente minutes", () => {
    const s = suiteApresEchec(7);
    expect(s).toEqual({ action: "reessayer", dansMs: 30 * 60_000 });
  });

  it("réessaie sur une erreur serveur (5xx)", () => {
    expect(suiteApresEchec(1, 503).action).toBe("reessayer");
  });

  it("réessaie sur un rate-limit (429) et un timeout (408)", () => {
    expect(suiteApresEchec(1, 429).action).toBe("reessayer");
    expect(suiteApresEchec(1, 408).action).toBe("reessayer");
  });

  it("met de côté — sans supprimer — sur un refus du serveur", () => {
    expect(suiteApresEchec(1, 400)).toEqual({ action: "mettre-de-cote", motif: "refus-serveur" });
    expect(suiteApresEchec(1, 404)).toEqual({ action: "mettre-de-cote", motif: "refus-serveur" });
  });

  it("met de côté après trop d'essais, jamais à la poubelle", () => {
    expect(suiteApresEchec(8)).toEqual({ action: "mettre-de-cote", motif: "trop-d-essais" });
    expect(suiteApresEchec(50)).toEqual({ action: "mettre-de-cote", motif: "trop-d-essais" });
  });
});
