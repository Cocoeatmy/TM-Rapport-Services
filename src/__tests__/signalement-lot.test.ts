import { describe, it, expect } from "vitest";
import { concerneLot, normCabineLabel } from "@/lib/signalement-lot";

/**
 * Le 16 octobre 2026, un constat posé sur la douche n° 6 s'est affiché sur
 * toutes les douches du chantier. Les trois dernières s'appelaient « SDD »,
 * et un signalement se reconnaissait à ce nom.
 */
describe("concerneLot", () => {
  it("s'en tient au numéro quand il existe", () => {
    const s = { cabineIdx: 6, cabineLabel: "SDD" };
    expect(concerneLot(s, 6, "SDD")).toBe(true);
    expect(concerneLot(s, 4, "SDD")).toBe(false);
    expect(concerneLot(s, 5, "SDD")).toBe(false);
  });

  it("ne se laisse pas tromper par un homonyme", () => {
    /* Trois lots « SDD » : seul celui qui porte le bon numéro répond. */
    const lots = [4, 5, 6].map((n) => ({ numero: n, nom: "SDD" }));
    const constat = { cabineIdx: 6, cabineLabel: "SDD" };
    expect(lots.filter((l) => concerneLot(constat, l.numero, l.nom))).toHaveLength(1);
  });

  it("retombe sur le nom pour les signalements d'avant", () => {
    const ancien = { cabineLabel: "Cabine 3" };
    expect(concerneLot(ancien, 3, "Cabine 3")).toBe(true);
    expect(concerneLot(ancien, 3, "Cabine 4")).toBe(false);
  });

  it("tolère la casse et la ponctuation dans les noms", () => {
    expect(concerneLot({ cabineLabel: "sdd-parentale" }, 1, "SDD Parentale")).toBe(true);
    expect(normCabineLabel("1er étage")).toBe(normCabineLabel("1ER ETAGE"));
  });

  it("un numéro qui ne correspond à aucun lot affiché ne s'affiche nulle part", () => {
    expect(concerneLot({ cabineIdx: 9, cabineLabel: "SDD" }, undefined, "SDD")).toBe(false);
  });

  it("un signalement sans lot du tout reste hors des lots nommés", () => {
    expect(concerneLot({}, 1, "SDD")).toBe(false);
    /* …mais il se retrouve dans la liste générale du chantier, qui ne filtre
       pas : c'est le comportement d'avant, et il ne change pas. */
    expect(concerneLot({}, undefined, undefined)).toBe(true);
  });
});
