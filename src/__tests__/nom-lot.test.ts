import { describe, it, expect } from "vitest";
import {
  SUGGESTIONS_NOM_CABINE,
  nomDeLotParDefaut,
  nomContientMot,
  basculerMotDuNom,
} from "@/lib/nom-lot";

describe("nomDeLotParDefaut", () => {
  it("reconnaît le nom que personne n'a choisi", () => {
    expect(nomDeLotParDefaut("Cabine 3")).toBe(true);
    expect(nomDeLotParDefaut("cabine12")).toBe(true);
    expect(nomDeLotParDefaut("  ")).toBe(true);
    expect(nomDeLotParDefaut("")).toBe(true);
  });

  it("laisse tranquille un nom choisi", () => {
    expect(nomDeLotParDefaut("SDD")).toBe(false);
    expect(nomDeLotParDefaut("Lot 1")).toBe(false);
    expect(nomDeLotParDefaut("Cabine du fond")).toBe(false);
  });
});

describe("basculerMotDuNom", () => {
  it("remplace le nom par défaut au lieu de s'y ajouter", () => {
    /* « Cabine 3 SDD » serait illisible sur le rapport. */
    expect(basculerMotDuNom("Cabine 3", "SDD")).toBe("SDD");
    expect(basculerMotDuNom("", "SDB")).toBe("SDB");
  });

  it("cumule les mots : une pièce se décrit souvent à deux", () => {
    expect(basculerMotDuNom("SDD", "1er étage")).toBe("SDD 1er étage");
  });

  it("retire un mot déjà coché, sans laisser de double espace", () => {
    expect(basculerMotDuNom("SDD 1er étage", "SDD")).toBe("1er étage");
    expect(basculerMotDuNom("SDD Comble SDB", "Comble")).toBe("SDD SDB");
  });

  it("garde ce que le monteur a écrit à la main", () => {
    expect(basculerMotDuNom("Appartement de Mme Roth", "SDB")).toBe("Appartement de Mme Roth SDB");
  });

  it("décocher le dernier mot laisse un nom vide, pas « Cabine 3 »", () => {
    /* L'assistant exige alors un nom avant de continuer : c'est à l'humain
       de dire comment s'appelle la pièce, pas au code de le deviner. */
    expect(basculerMotDuNom("SDD", "SDD")).toBe("");
  });
});

describe("nomContientMot", () => {
  it("ne confond pas un mot avec un morceau d'un autre", () => {
    expect(nomContientMot("SDD", "SDD")).toBe(true);
    expect(nomContientMot("SDDouche", "SDD")).toBe(false);
    expect(nomContientMot("Sous-sol droite", "Sous-sol")).toBe(true);
  });

  it("ignore la casse", () => {
    expect(nomContientMot("sdd parentale", "SDD")).toBe(true);
  });

  it("couvre chaque suggestion proposée", () => {
    for (const mot of SUGGESTIONS_NOM_CABINE) {
      expect(nomContientMot(basculerMotDuNom("", mot), mot)).toBe(true);
    }
  });
});
