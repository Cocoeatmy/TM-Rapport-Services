/**
 * Ce que les pièces manquantes font attendre.
 *
 * Le piège de cette analyse est de fabriquer un délai là où la donnée n'existe
 * pas : les pièces réglées avant l'horodatage du règlement n'ont pas de date
 * de clôture. Mieux vaut une colonne vide qu'un chiffre inventé.
 */
import { describe, it, expect } from "vitest";
import { attentePieces, type Signalement } from "../lib/pieces-attente";

const MAINTENANT = new Date("2026-09-28T12:00:00Z");
const ilYA = (j: number) => MAINTENANT.getTime() - j * 86400000;

const s = (o: Partial<Signalement>): Signalement => ({
  id: "s", projectId: "p1", projectName: "Duka - Lot A",
  description: "Joint", timestamp: ilYA(10), ...o,
});

describe("pièces en attente", () => {
  it("classe les fournisseurs par la pièce qui attend depuis le plus longtemps", () => {
    const lignes = attentePieces([
      s({ id: "a", projectId: "p1", timestamp: ilYA(5) }),
      s({ id: "b", projectId: "p2", timestamp: ilYA(40) }),
    ], (id) => (id === "p1" ? "Duka" : "Duscholux"), MAINTENANT);
    expect(lignes.map((l) => l.cle)).toEqual(["Duscholux", "Duka"]);
    expect(lignes[0].plusAncienne).toBe(40);
  });

  it("compte les chantiers bloqués, pas seulement les pièces", () => {
    const [l] = attentePieces([
      s({ id: "a", projectId: "p1" }),
      s({ id: "b", projectId: "p1" }),
      s({ id: "c", projectId: "p2" }),
    ], () => "Duka", MAINTENANT);
    expect(l.ouvertes).toBe(3);
    expect(l.chantiers).toBe(2);
  });

  it("ne compte pas comme ouverte une pièce reçue ou réglée", () => {
    const lignes = attentePieces([
      s({ id: "a", status: "recu", resolvedAt: ilYA(1) }),
      s({ id: "b", resolved: true, resolvedAt: ilYA(1) }),
      s({ id: "c" }),
    ], () => "Duka", MAINTENANT);
    expect(lignes[0].ouvertes).toBe(1);
  });

  it("n'invente aucun délai pour les pièces réglées sans horodatage", () => {
    const [l] = attentePieces([
      s({ id: "a", status: "recu" }),
      s({ id: "b", status: "recu" }),
      s({ id: "c", status: "recu" }),
      s({ id: "d" }),
    ], () => "Duka", MAINTENANT);
    expect(l.regleesMesurees).toBe(0);
    expect(l.delaiMedian).toBeNull();
  });

  it("donne le délai médian dès qu'assez de pièces sont horodatées", () => {
    const reglee = (id: string, jours: number) =>
      s({ id, status: "recu", timestamp: ilYA(60), resolvedAt: ilYA(60 - jours) });
    const [l] = attentePieces(
      [reglee("a", 5), reglee("b", 10), reglee("c", 30)],
      () => "Duka", MAINTENANT);
    expect(l.regleesMesurees).toBe(3);
    expect(l.delaiMedian).toBe(10);
  });
});
