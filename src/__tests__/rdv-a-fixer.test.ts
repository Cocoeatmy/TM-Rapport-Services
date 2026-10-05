import { describe, it, expect } from "vitest";
import { rdvMontageAFixer, rdvServicesAFixer, estProjetServices, ETATS_RDV_A_FIXER } from "@/lib/rdv-a-fixer";

describe("rendez-vous à fixer", () => {
  it("un montage dont la commande est passée attend un rendez-vous", () => {
    expect(rdvMontageAFixer({ etatCMD: "Cabines en CMD", typeServices: ["Montages"] })).toBe(true);
    expect(rdvMontageAFixer({ etatCMD: "Récéptionné - RDV à fixer" })).toBe(true);
  });

  it("un chantier déjà planifié ou terminé n'y figure plus", () => {
    expect(rdvMontageAFixer({ etatCMD: "RDV - fixé" })).toBe(false);
    expect(rdvMontageAFixer({ etatCMD: "Terminé" })).toBe(false);
    expect(rdvMontageAFixer({ etatCMD: "" })).toBe(false);
  });

  it("les Services sont comptés à part, jamais des deux côtés", () => {
    const p = { etatCMD: "Cabines en CMD", typeServices: ["Services"] };
    expect(rdvMontageAFixer(p)).toBe(false);
    expect(rdvServicesAFixer(p)).toBe(true);
    expect(estProjetServices(p)).toBe(true);
  });

  it("les deux tableaux de bord partagent la même liste d'états", () => {
    expect(ETATS_RDV_A_FIXER).toContain("Cabines à recevoir");
    expect(ETATS_RDV_A_FIXER).toHaveLength(7);
  });
});
