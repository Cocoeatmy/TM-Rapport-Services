/**
 * Transformation, coût de trajet, coût du SAV.
 *
 * Ces chiffres servent à décider — privilégier un client, tarifer une région,
 * négocier avec un fournisseur. Un dénominateur oublié suffit à inverser une
 * conclusion, c'est donc surtout cela que ces cas vérifient.
 */
import { describe, it, expect } from "vitest";
import type { Project } from "../lib/notion";
import { transformation, coutRoute, coutSav } from "../lib/analyses";

const MAINTENANT = new Date("2026-09-27T12:00:00Z");
const ilYA = (j: number) =>
  new Date(MAINTENANT.getTime() - j * 86400000).toISOString().slice(0, 10);

const BASE = {
  id: "p", ofrTM: "TM-1", projet: "Duka - Lot A, Rue du Test 1 à 1400 Yverdon",
  adresseChantier: "Rue du Test 1, 1400 Yverdon-les-Bains, Suisse",
  etatCMD: "Cabines mesurées", typeServices: [],
  nbCabines: 1, nbCabinesInstallees: 1,
  fournisseurs: ["Duka"], seriesCabines: ["ProCasa"],
  sanitaireNames: ["Milliquet SA"], grossistesNames: ["Gétaz Nyon"],
  cmdTM: "", cmdTMUsine: "", cmdGrossiste: "",
  dateMesuresRecue: ilYA(100), dateOffre: ilYA(95),
  dateCMDRecue: null, dateCMDUsine: null, dateMontage: null,
  heureArriveeSav: "", heureDepartSav: "", causeSavCabines: "", causeSAV: "",
  dateSAVRecu: null, dateRDVSAV: null,
} as unknown as Project;

const p = (o: Record<string, unknown>) => ({ ...BASE, ...o } as unknown as Project);
const lot = (n: number, o: Record<string, unknown>) =>
  Array.from({ length: n }, (_, i) => p({ id: `${JSON.stringify(o).length}-${i}`, ...o }));

describe("taux de transformation", () => {
  it("compte par mesure, et rapporte les commandes aux mesures", () => {
    const [l] = transformation([
      ...lot(6, { cmdTM: "C" }),
      ...lot(4, {}),
    ], "sanitaire", undefined, undefined, MAINTENANT);
    expect(l.mesures).toBe(10);
    expect(l.commandes).toBe(6);
    expect(l.taux).toBe(60);
  });

  it("ne compte comme perdue qu'une mesure ancienne restée sans commande", () => {
    const [l] = transformation([
      ...lot(3, { dateMesuresRecue: ilYA(100) }),
      ...lot(2, { dateMesuresRecue: ilYA(5) }),
    ], "sanitaire", undefined, undefined, MAINTENANT);
    expect(l.perdues).toBe(3);
  });

  it("respecte la fenêtre de période", () => {
    const lignes = transformation([
      ...lot(5, { dateMesuresRecue: "2026-03-15" }),
      ...lot(5, { dateMesuresRecue: "2025-03-15" }),
    ], "sanitaire", "2026-01-01", "2026-12-31", MAINTENANT);
    expect(lignes[0].mesures).toBe(5);
  });

  it("écarte un client trop peu fourni, dont le taux ne voudrait rien dire", () => {
    const lignes = transformation([
      ...lot(5, { sanitaireNames: ["Gros client"] }),
      ...lot(2, { sanitaireNames: ["Petit client"] }),
    ], "sanitaire", undefined, undefined, MAINTENANT);
    expect(lignes.map((l) => l.client)).toEqual(["Gros client"]);
  });

  it("sépare les deux axes, sanitaire et grossiste", () => {
    const projets = lot(4, { sanitaireNames: ["S1"], grossistesNames: ["G1"] });
    expect(transformation(projets, "sanitaire")[0].client).toBe("S1");
    expect(transformation(projets, "grossiste")[0].client).toBe("G1");
  });
});

describe("coût de trajet", () => {
  const terminé = (npa: string, ville: string, n = 1) => ({
    etatCMD: "Terminé", dateMontage: ilYA(30), nbCabines: n, nbCabinesInstallees: n,
    adresseChantier: `Rue du Test 1, ${npa} ${ville}, Suisse`,
    projet: `Duka - Lot A, Rue du Test 1 à ${npa} ${ville}`,
  });

  it("classe les régions éloignées devant les proches", () => {
    const lignes = coutRoute([
      ...lot(3, terminé("1400", "Yverdon-les-Bains")),
      ...lot(3, terminé("1950", "Sion")),
    ], {});
    expect(lignes.length).toBe(2);
    expect(lignes[0].minutesParCabine).toBeGreaterThan(lignes[1].minutesParCabine);
  });

  it("rapporte le trajet à la cabine, pas au projet", () => {
    const une = coutRoute(lot(3, terminé("1950", "Sion", 1)), {});
    const quatre = coutRoute(lot(3, terminé("1950", "Sion", 4)), {});
    expect(quatre[0].minutesParCabine).toBeLessThan(une[0].minutesParCabine);
  });

  it("ignore ce qui n'est pas un montage terminé et daté", () => {
    expect(coutRoute(lot(3, { ...terminé("1950", "Sion"), etatCMD: "RDV - fixé" }), {})).toEqual([]);
  });
});

describe("coût du SAV", () => {
  const pose = (marque: string, n: number) => lot(n, {
    etatCMD: "Terminé", dateMontage: ilYA(60), fournisseurs: [marque],
    nbCabines: 1, nbCabinesInstallees: 1,
  });
  const sav = (marque: string, n: number, minutes = 120) => lot(n, {
    etatCMD: "Terminé", dateMontage: ilYA(50), fournisseurs: [marque],
    dateSAVRecu: ilYA(40), heureArriveeSav: "08:00",
    heureDepartSav: `${8 + Math.floor(minutes / 60)}:00`,
    causeSavCabines: "Cab1:Erreur TM",
  });

  it("rapporte les heures aux cabines posées de la même origine", () => {
    /* 100 cabines Duka posées, plus 5 montages qui ont ensuite connu un SAV de
       deux heures. Le dénominateur vaut 105 et non 100 : une cabine qui a eu un
       SAV reste une cabine posée, et l'exclure gonflerait artificiellement le
       ratio des marques qui en génèrent le plus. 10 h / 105 → 9,5 h. */
    const lignes = coutSav([...pose("Duka", 100), ...sav("Duka", 5)], "marque");
    expect(lignes[0].cle).toBe("Duka");
    expect(lignes[0].cabinesPosees).toBe(105);
    expect(lignes[0].interventions).toBe(5);
    expect(lignes[0].heuresPour100).toBeCloseTo(9.5, 1);
  });

  it("ne laisse pas un gros fournisseur paraître le pire par son seul volume", () => {
    const lignes = coutSav([
      ...pose("Gros", 200), ...sav("Gros", 6),
      ...pose("Petit", 20), ...sav("Petit", 4),
    ], "marque");
    expect(lignes[0].cle).toBe("Petit");
  });

  it("compte les cabines dont la cause nous est imputée", () => {
    const lignes = coutSav([...pose("Duka", 50), ...sav("Duka", 3)], "marque");
    expect(lignes[0].erreursTM).toBe(3);
  });

  it("écarte une origine trop peu posée pour être comparée", () => {
    const lignes = coutSav([...pose("Rare", 4), ...sav("Rare", 2)], "marque");
    expect(lignes).toEqual([]);
  });
});
