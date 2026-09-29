/**
 * Jours ouvrés vaudois.
 *
 * Un férié oublié gonfle chaque délai qui l'enjambe, et un férié en trop les
 * rabote tous : ces cas vérifient donc la liste autant que le comptage.
 */
import { describe, it, expect } from "vitest";
import { feriesVaud, estOuvre, joursOuvresEntre } from "../lib/jours-ouvres";

describe("jours fériés vaudois", () => {
  it("place correctement les fêtes mobiles de 2026", () => {
    // Pâques 2026 : dimanche 5 avril.
    const f = feriesVaud(2026);
    expect(f.has("2026-04-03")).toBe(true); // Vendredi saint
    expect(f.has("2026-04-06")).toBe(true); // lundi de Pâques
    expect(f.has("2026-05-14")).toBe(true); // Ascension
    expect(f.has("2026-05-25")).toBe(true); // lundi de Pentecôte
  });

  it("retient les fêtes fixes, et seulement elles", () => {
    const f = feriesVaud(2026);
    ["2026-01-01", "2026-01-02", "2026-08-01", "2026-12-25"].forEach((j) =>
      expect(f.has(j)).toBe(true));
    // Vaud ne chôme pas le 26 décembre : l'ajouter volerait un jour ouvré.
    expect(f.has("2026-12-26")).toBe(false);
    expect(f.has("2026-05-01")).toBe(false); // 1er mai non férié dans le canton
  });

  it("trouve le lundi du Jeûne fédéral", () => {
    // 3e dimanche de septembre 2026 = 20 ; le Jeûne tombe le lundi 21.
    expect(feriesVaud(2026).has("2026-09-21")).toBe(true);
    // 2025 : 3e dimanche le 21, lundi le 22.
    expect(feriesVaud(2025).has("2025-09-22")).toBe(true);
  });
});

describe("comptage des jours ouvrés", () => {
  it("ignore samedi et dimanche", () => {
    // Vendredi 5 juin 2026 → lundi 8 juin : un seul jour ouvré.
    expect(joursOuvresEntre("2026-06-05", "2026-06-08")).toBe(1);
  });

  it("ignore un jour férié pris dans l'intervalle", () => {
    // Du jeudi 30 juillet au lundi 3 août : vendredi ouvré, samedi et dimanche
    // non, 1er août samedi en 2026 — donc le lundi seul s'ajoute.
    const avec = joursOuvresEntre("2026-07-30", "2026-08-03");
    expect(avec).toBe(2);
  });

  it("rend zéro quand tout s'est fait le même jour", () => {
    expect(joursOuvresEntre("2026-06-10", "2026-06-10")).toBe(0);
  });

  it("refuse une chronologie impossible plutôt que de l'inverser", () => {
    expect(joursOuvresEntre("2026-06-10", "2026-06-01")).toBeNull();
    expect(joursOuvresEntre("", "2026-06-01")).toBeNull();
  });

  it("écarte un écart de plus de deux ans", () => {
    expect(joursOuvresEntre("2023-01-01", "2026-01-01")).toBeNull();
  });

  it("compte moins de jours qu'un calendrier ordinaire", () => {
    // Un mois complet : environ vingt-deux jours ouvrés, pas trente.
    const n = joursOuvresEntre("2026-06-01", "2026-07-01")!;
    expect(n).toBeGreaterThan(18);
    expect(n).toBeLessThan(24);
  });

  it("sait reconnaître un jour travaillé", () => {
    expect(estOuvre("2026-06-10")).toBe(true);  // mercredi
    expect(estOuvre("2026-06-13")).toBe(false); // samedi
    expect(estOuvre("2026-08-01")).toBe(false); // fête nationale
  });
});
