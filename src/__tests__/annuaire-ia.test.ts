import { describe, it, expect } from "vitest";
import { estQuestionArgent, sansMontants, colonneArgent } from "@/lib/annuaire-ia";

describe("questions d'argent", () => {
  it.each([
    "Quel est le CA de 2025 ?",
    "chiffre d'affaires du mois",
    "Combien ça coûte une cabine Duka ?",
    "le prix du projet Rossier",
    "est-ce que la facture est payée ?",
    "montant de l'offre TM-2600825",
    "quelle marge sur ce chantier",
    "combien en CHF",
    "quel salaire pour Miguel ?",
  ])("refuse : %s", (q) => expect(estQuestionArgent(q)).toBe(true));

  it.each([
    "qui est le 0798396817 ?",
    "ça avance le montage à Lausanne ?",
    "quel est l'état de l'OFR TM-2600825 ?",
    "remise en état de la cabine 3",
    "le client est revenu vers nous ?",
    "combien de cabines installées en 2026",
    "quels SAV sont encore ouverts sur ce chantier ?",
  ])("répond : %s", (q) => expect(estQuestionArgent(q)).toBe(false));

  it("retire les montants des textes libres", () => {
    expect(sansMontants("Remise accordée CHF 1'250.– au client")).not.toMatch(/1'250/);
    expect(sansMontants("coût 300 francs, pose le 12")).not.toMatch(/300/);
    expect(sansMontants("pose le 12 à 8h, 3 cabines")).toBe("pose le 12 à 8h, 3 cabines");
  });
});

describe("colonnes d'argent jamais lues", () => {
  it.each(["Rabais cabines", "Escompte", "Mail de facturations", "Montant OFR", "Coût soucis montage",
    "Rabais services", "CA", "IBAN", "Revenus", "Soucis montage facturé"])("%s", (c) => expect(colonneArgent(c)).toBe(true));
  it.each(["Poste", "Portable", "Étiquettes", "Adresse", "Nb. Projets", "Contacts dans l’entreprise", "Carnet"])("garde %s", (c) =>
    expect(colonneArgent(c)).toBe(false));
});
