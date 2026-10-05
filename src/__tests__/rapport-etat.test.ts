import { describe, it, expect } from "vitest";
import { rapportTermine, rapportEnAttente } from "@/lib/rapport-etat";

describe("rapportTermine", () => {
  it("reconnaît la valeur réellement utilisée dans Notion", () => {
    expect(rapportTermine("Rapport traité")).toBe(true);
  });

  it("laisse en attente les deux autres états de la colonne", () => {
    expect(rapportTermine("A traiter")).toBe(false);
    expect(rapportTermine("En attente de montage")).toBe(false);
    expect(rapportTermine("")).toBe(false);
  });

  it("tolère un renommage en « clôturé »", () => {
    expect(rapportTermine("Rapport clôturé")).toBe(true);
  });
});

describe("rapportEnAttente", () => {
  const jour = "2026-10-05";

  it("un montage passé dont le rapport est traité ne se réclame plus", () => {
    expect(rapportEnAttente(
      { dateMontage: "2026-07-02", etatCMD: "RDV - fixé", rapportDeMontage: "Rapport traité" },
      jour,
    )).toBe(false);
  });

  it("un montage passé sans rapport se réclame", () => {
    expect(rapportEnAttente(
      { dateMontage: "2026-09-22", etatCMD: "Soucis montage", rapportDeMontage: "En attente de montage" },
      jour,
    )).toBe(true);
  });

  it("un chantier terminé ou annulé ne se réclame pas, même sans rapport", () => {
    expect(rapportEnAttente({ dateMontage: "2026-07-02", etatCMD: "Terminé", rapportDeMontage: "" }, jour)).toBe(false);
    expect(rapportEnAttente({ dateMontage: "2026-07-02", etatCMD: "Annulé", rapportDeMontage: "" }, jour)).toBe(false);
  });

  it("un montage à venir ne se réclame pas", () => {
    expect(rapportEnAttente({ dateMontage: "2026-10-06", etatCMD: "RDV - fixé", rapportDeMontage: "" }, jour)).toBe(false);
    expect(rapportEnAttente({ dateMontage: null, etatCMD: "RDV - fixé", rapportDeMontage: "" }, jour)).toBe(false);
  });
});
