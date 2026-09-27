/**
 * Carnet de commandes.
 *
 * Le risque d'un tel chiffre n'est pas d'être faux de quelques heures, c'est
 * de compter deux fois, d'oublier une étape, ou d'inclure ce qui n'a pas à
 * l'être — un projet annulé, un service pur, une cabine déjà posée. C'est ce
 * que ces cas vérifient.
 */
import { describe, it, expect } from "vitest";
import type { Project } from "../lib/notion";
import { construireCarnet } from "../lib/carnet";

const MAINTENANT = new Date("2026-09-27T12:00:00Z");
const ilYA = (j: number) =>
  new Date(MAINTENANT.getTime() - j * 86400000).toISOString().slice(0, 10);

const BASE = {
  id: "p", ofrTM: "TM-1", projet: "Duka - Lot A, Rue du Test 1 à 1400 Yverdon",
  adresseChantier: "Rue du Test 1, 1400 Yverdon-les-Bains, Suisse",
  etatCMD: "Cabines à recevoir", etatMesures: "Terminé", typeServices: [],
  nbCabines: 1, nbCabinesInstallees: 0, fournisseurs: ["Duka"],
  cmdTM: "", cmdTMUsine: "", cmdGrossiste: "",
  dateMesuresRecue: ilYA(60), dateOffre: ilYA(50),
  dateCMDRecue: null, dateCMDUsine: null,
  arrivageTM: null, arrivageGrossiste: null, dateMontage: null,
  heureArrivee: "", heureDepart: "",
} as unknown as Project;

const p = (o: Record<string, unknown>) => ({ ...BASE, ...o } as unknown as Project);

/** Historique : deux heures par cabine, pour un barème prévisible. */
const histo = (n: number) => Array.from({ length: n }, (_, i) => p({
  id: `h${i}`, etatCMD: "Terminé", nbCabines: 1, nbCabinesInstallees: 1,
  dateMontage: ilYA(7 + i), heureArrivee: "08:00", heureDepart: "10:00",
}));

describe("carnet — ce qui compte", () => {
  it("additionne les cabines vendues et pas encore posées", () => {
    const c = construireCarnet([
      p({ id: "a", cmdTM: "CMD-1" }),
      p({ id: "b", nbCabines: 4 }),
    ], MAINTENANT);
    expect(c.cabines).toBe(5);
    expect(c.projets).toBe(2);
  });

  it("ne compte que les cabines restantes d'un projet partiellement posé", () => {
    const c = construireCarnet([p({ nbCabines: 6, nbCabinesInstallees: 4 })], MAINTENANT);
    expect(c.cabines).toBe(2);
  });

  it("écarte les projets terminés, annulés et les services purs", () => {
    const c = construireCarnet([
      p({ id: "ok" }),
      p({ id: "fini", etatCMD: "Terminé", nbCabinesInstallees: 1 }),
      p({ id: "annule", etatCMD: "Annulé" }),
      p({ id: "service", typeServices: ["Services"] }),
    ], MAINTENANT);
    expect(c.cabines).toBe(1);
  });

  it("convertit en jours-homme d'après les heures réellement pointées", () => {
    // Barème : 2 h par cabine. Dix cabines = 20 h = 2,4 journées de 8 h 30.
    const c = construireCarnet([...histo(5), p({ nbCabines: 10 })], MAINTENANT);
    expect(c.minutes).toBe(10 * 120);
    expect(c.jours).toBeCloseTo(2.4, 1);
  });
});

describe("carnet — étapes", () => {
  const etape = (o: Record<string, unknown>) =>
    construireCarnet([p(o)], MAINTENANT).parEtape[0].cle;

  it("classe chaque cabine dans une seule étape, la plus avancée", () => {
    expect(etape({ dateMontage: ilYA(-3), arrivageTM: ilYA(10), cmdTM: "C" })).toBe("Rendez-vous fixé");
    expect(etape({ arrivageTM: ilYA(10), cmdTM: "C" })).toBe("Livrée, rendez-vous à fixer");
    expect(etape({ cmdTM: "C" })).toBe("Commandée, en attente de livraison");
    expect(etape({ dateMesuresRecue: ilYA(20) })).toBe("Mesurée, pas encore commandée");
    expect(etape({ dateMesuresRecue: null, etatMesures: "" })).toBe("En attente de mesures");
  });

  it("ne répartit jamais plus de cabines qu'il n'en existe", () => {
    const c = construireCarnet([
      p({ id: "a", nbCabines: 3, cmdTM: "C" }),
      p({ id: "b", nbCabines: 2, arrivageTM: ilYA(5) }),
    ], MAINTENANT);
    const somme = c.parEtape.reduce((s, l) => s + l.cabines, 0);
    expect(somme).toBe(c.cabines);
    expect(c.parFournisseur.reduce((s, l) => s + l.cabines, 0)).toBe(c.cabines);
    expect(c.parRegion.reduce((s, l) => s + l.cabines, 0)).toBe(c.cabines);
  });
});

describe("carnet — rythme et alertes", () => {
  it("mesure le rythme sur les semaines récentes, sans supposer d'effectif", () => {
    // Seize cabines posées sur les huit dernières semaines = 2 par semaine.
    const poses = Array.from({ length: 16 }, (_, i) => p({
      id: `x${i}`, etatCMD: "Terminé", nbCabines: 1, nbCabinesInstallees: 1,
      dateMontage: ilYA(1 + i * 3), heureArrivee: "08:00", heureDepart: "10:00",
    }));
    const c = construireCarnet([...poses, p({ nbCabines: 10 })], MAINTENANT);
    expect(c.rythme.cabinesParSemaine).toBe(2);
    expect(c.rythme.semaines).toBe(5);
    expect(c.rythme.dateAbsorption).toBeTruthy();
  });

  it("ne promet aucune date quand rien n'a été posé récemment", () => {
    const c = construireCarnet([p({ nbCabines: 10 })], MAINTENANT);
    expect(c.rythme.semaines).toBeNull();
    expect(c.rythme.dateAbsorption).toBeNull();
  });

  it("repère le carnet qui dort : livré depuis longtemps, sans rendez-vous", () => {
    const c = construireCarnet([
      p({ id: "vieux", arrivageTM: ilYA(45) }),
      p({ id: "recent", arrivageTM: ilYA(5) }),
      p({ id: "planifie", arrivageTM: ilYA(45), dateMontage: ilYA(-2) }),
    ], MAINTENANT);
    expect(c.dormantes.projets).toBe(1);
    expect(c.dormantes.cabines).toBe(1);
  });
});
