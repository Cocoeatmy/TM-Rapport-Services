import { describe, it, expect } from "vitest";
import { coutHoraire, coutHoraireDe, HEURES_MOIS_DEFAUT } from "@/lib/cout-horaire";

describe("du salaire mensuel au coût horaire", () => {
  it("divise par les heures du mois", () => {
    expect(coutHoraire(5460)).toBeCloseTo(5460 / HEURES_MOIS_DEFAUT, 4);
  });

  it("respecte un nombre d'heures choisi", () => {
    expect(coutHoraire(5000, { heuresMois: 100 })).toBe(50);
  });

  it("ajoute les charges patronales au brut", () => {
    expect(coutHoraire(5000, { heuresMois: 100, chargesPatronales: 20 })).toBe(60);
  });

  it("ne rend rien pour un salaire absent ou absurde", () => {
    expect(coutHoraire(null)).toBeNull();
    expect(coutHoraire(0)).toBeNull();
    expect(coutHoraire(-100)).toBeNull();
  });
});

describe("coût horaire d'un monteur", () => {
  const vals = {
    heuresMois: "100", chargesPatronales: "0",
    taux_Claudio: "5000", taux_Miguel: "7000", tauxHoraire: "42",
  };

  it("part du salaire du monteur", () => {
    expect(coutHoraireDe("Claudio", vals)).toBe(50);
  });

  it("fait la moyenne d'un binôme : c'est ce que coûte l'heure à deux", () => {
    expect(coutHoraireDe("Claudio & Miguel", vals)).toBe(60);
  });

  it("retombe sur le coût horaire par défaut quand le salaire manque", () => {
    expect(coutHoraireDe("Inconnu", vals)).toBe(42);
  });

  it("ne rend rien quand rien n'est renseigné", () => {
    expect(coutHoraireDe("Inconnu", {})).toBeNull();
  });
});
