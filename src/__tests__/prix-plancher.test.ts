import { describe, it, expect } from "vitest";
import { calculerPrixPlancher, ajuster, passagesDe, verdictOffre, type ChantierHistorique } from "@/lib/prix-plancher";

/** Un chantier posé : n cabines, `heures` sur place à deux, un jour. */
function chantier(ofr: string, n: number, heures: number, o: Partial<ChantierHistorique> = {}): ChantierHistorique {
  const fin = 8 * 60 + Math.round(heures * 60);
  const hh = `${String(Math.floor(fin / 60)).padStart(2, "0")}:${String(fin % 60).padStart(2, "0")}`;
  return {
    ofrTM: ofr, nbCabines: n, seriesCabines: ["Duka 3000"], fournisseurs: ["Duka"],
    heureArrivee: `2026-05-20 Jacobo & Miguel 08:00`, heureDepart: `2026-05-20 Jacobo & Miguel ${hh}`,
    ...o,
  };
}

const REGLAGES = { tauxHoraire: "50", achatCabine: "800", accessoires: "50", consommables: "20", margeCible: "30", coutKm: "0.7" };

describe("ajuster", () => {
  it("retrouve une partie fixe et un temps par cabine", () => {
    const pts = [1, 2, 3, 4, 5].map((c) => ({ cabines: c, minutes: 60 + 100 * c }));
    const d = ajuster(pts);
    expect(Math.round(d.fixe)).toBe(60);
    expect(Math.round(d.parCabine)).toBe(100);
  });
  it("trop peu de points : médiane par cabine, sans partie fixe", () => {
    expect(ajuster([{ cabines: 2, minutes: 300 }, { cabines: 1, minutes: 120 }])).toEqual({ fixe: 0, parCabine: 135 });
  });
});

describe("passagesDe", () => {
  it("compte les jours distincts", () => {
    expect(passagesDe({ heureArrivee: "2026-05-20 A 08:00 | 2026-05-21 A 08:00 | 2026-05-21 B 13:00" })).toBe(2);
    expect(passagesDe({ heureArrivee: "08:00" })).toBe(1);
  });
});

describe("calculerPrixPlancher", () => {
  const histo = [
    chantier("TM-1", 1, 2), chantier("TM-2", 2, 3), chantier("TM-3", 3, 4), chantier("TM-4", 4, 5),
    chantier("TM-9", 2, 6, { seriesCabines: ["Koralle S"], fournisseurs: ["Koralle"] }),
  ];

  it("chaque poste est détaillé et le plancher intègre la marge", () => {
    const p = calculerPrixPlancher({ serie: "Duka 3000", fournisseur: "Duka", cabines: 2, trajet: { minutes: 30, km: 25 } }, histo, REGLAGES);
    expect(p.fiabilite).toEqual({ base: "serie", chantiers: 4 });
    expect(p.detail.personnes).toBe(2);
    expect(p.detail.passages).toBe(1);
    // Heures-hommes : 2 personnes × (1 h + 1 h/cabine) → 4 + 4×... = droite 2 h + 2 h × cabines.
    expect(p.detail.heuresPose).toBe(6);
    expect(p.detail.coutPose).toBe(300);
    expect(p.detail.heuresRoute).toBe(2);       // 1 passage × aller-retour 60 min × 2 personnes
    expect(p.detail.coutRoute).toBe(100);
    expect(p.detail.coutVehicule).toBe(35);     // 50 km × 0,70
    expect(p.detail.achats).toBe(1740);         // 2 × (800 + 50 + 20)
    expect(p.cout).toBe(2175);
    expect(p.plancher).toBe(3110);              // 2175 / 0,7 = 3107 → arrondi à 10
    expect(p.manques).toEqual([]);
  });

  it("trop peu de chantiers de la série : élargit au fournisseur puis à tous, et le dit", () => {
    const p = calculerPrixPlancher({ serie: "Koralle S", fournisseur: "Koralle", cabines: 1, trajet: null }, histo, REGLAGES);
    expect(p.fiabilite.base).toBe("tous");
    expect(p.manques.some((m) => m.includes("adresse non localisée"))).toBe(true);
  });

  it("prix d'achat du fournisseur prioritaire sur la moyenne", () => {
    const p = calculerPrixPlancher({ fournisseur: "Duka", cabines: 1, trajet: { minutes: 0, km: 0 } }, histo, { ...REGLAGES, achat_Duka: "1000" });
    expect(p.detail.achats).toBe(1070);
  });

  it("prix habituel : ce que bexio a facturé, par cabine, hors estimations", () => {
    const recettes = { "TM-1": { ht: 1500, estime: false }, "TM-2": { ht: 3000, estime: false }, "TM-3": { ht: 9999, estime: true } };
    const p = calculerPrixPlancher({ serie: "Duka 3000", cabines: 2, trajet: { minutes: 30, km: 25 } }, histo, REGLAGES, recettes);
    expect(p.habituel).toEqual({ median: 3000, bas: 3000, haut: 3000, n: 2 });
  });

  it("sans réglages : le dit au lieu d'inventer", () => {
    const p = calculerPrixPlancher({ cabines: 1, trajet: null }, histo, {});
    expect(p.manques.length).toBeGreaterThanOrEqual(3);
    expect(p.margeCible).toBeNull();
  });
});

describe("verdictOffre", () => {
  const p = calculerPrixPlancher({ serie: "Duka 3000", cabines: 2, trajet: { minutes: 30, km: 25 } }, [
    chantier("TM-1", 1, 2), chantier("TM-2", 2, 3), chantier("TM-3", 3, 4), chantier("TM-4", 4, 5),
  ], REGLAGES, { "TM-1": { ht: 2500, estime: false }, "TM-2": { ht: 5000, estime: false } });
  it("sous le plancher, sous l'habituel, ou correct", () => {
    expect(verdictOffre(p.plancher - 1, p)).toBe("sous-plancher");
    expect(verdictOffre(p.plancher + 1, p)).toBe("sous-habituel");
    expect(verdictOffre(10_000, p)).toBe("ok");
  });
});
