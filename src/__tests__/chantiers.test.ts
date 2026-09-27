/**
 * Regroupement des chantiers PPE.
 *
 * Chaque cas ci-dessous correspond à un défaut CONSTATÉ en production, pas à
 * une hypothèse : le pays pris pour une rue, le nom coupé au milieu d'un mot,
 * le « à » en Unicode décomposé, le lot remplacé par « Cabine 1 ». Les garder
 * ici évite de les réintroduire au prochain réglage du découpage des titres.
 */
import { describe, it, expect } from "vitest";
import {
  construireChantiers, signatureChantier, lotsDeLOffre, grouperParLot, adresseDe,
  type ProjetChantier,
} from "../lib/chantiers";

const BASE: ProjetChantier = {
  id: "x", projet: "", ofrTM: "TM-1", adresseChantier: "",
  nbCabines: 1, nbCabinesInstallees: 0, nomsCabines: "", etatMontage: "",
  etatCMD: "Cabines mesurées", etatMesures: "", fournisseurs: [], seriesCabines: [],
  grossistesNames: [], sanitaireNames: [], ofrGrossiste: "",
  cmdTM: "", cmdTMUsine: "", cmdGrossiste: "",
  dateMesuresRecue: null, dateOffre: null, dateCMDRecue: null, dateCMDUsine: null,
  arrivageTM: null, arrivageGrossiste: null, dateMontage: null,
  diversInfosChantier: "", emplacementCabine: "", typeServices: [], lastEditedTime: "2026-09-01",
};

const p = (o: Partial<ProjetChantier>): ProjetChantier => ({ ...BASE, ...o });

/** Immeuble vendu lot par lot, à une adresse écrite comme Notion la renvoie. */
function immeuble(n: number, rue = "Rue de Corcelles 12, 2034 Neuchâtel, Suisse") {
  return Array.from({ length: n }, (_, i) =>
    p({
      id: `l${i}`, ofrTM: `TM-${2600800 + i}`,
      projet: `duka - Lot ${String.fromCharCode(65 + i)}, Rue de Corcelles 12 à 2034 Neuchâtel`,
      adresseChantier: rue,
    }));
}

describe("adresse et signature", () => {
  it("ne prend pas le pays pour une rue", () => {
    const a = adresseDe(p({ adresseChantier: "Chemin des Tourterelles 12, 2034 Peseux, Suisse" }));
    expect(a.rue).toBe("Chemin des Tourterelles 12");
    expect(a.npa).toBe("2034");
    expect(a.ville).toBe("Peseux");
  });

  it("sépare deux rues d'un même NPA", () => {
    const a = signatureChantier(p({ adresseChantier: "Route de Berne 40, 1008 Prilly, Suisse" }));
    const b = signatureChantier(p({ adresseChantier: "Avenue des Cerisiers 2, 1008 Prilly, Suisse" }));
    expect(a).not.toBe(b);
  });

  it("regroupe malgré le numéro de police et l'abréviation", () => {
    const a = signatureChantier(p({ adresseChantier: "Rte. de Vandoeuvres 77, 1253 Vandoeuvres" }));
    const b = signatureChantier(p({ adresseChantier: "Route de Vandoeuvres 81, 1253 Vandoeuvres" }));
    expect(a).toBe(b);
  });

  it("refuse de regrouper une adresse réduite à la localité", () => {
    expect(signatureChantier(p({ adresseChantier: "1400 Yverdon-les-Bains, Suisse" }))).toBe("");
  });

  it("se rabat sur le titre quand l'adresse est vide", () => {
    const s = signatureChantier(p({
      projet: "Ronal - Bât. S, Prairie 5 - Allée Charles-Edouard-Guillaume à 1723 Marly",
    }));
    expect(s).toBe("1723|allee charles edouard guillaume");
  });
});

describe("nom du chantier", () => {
  it("n'est pas coupé au milieu d'un mot quand la casse varie", () => {
    const offres = immeuble(12);
    offres[3].projet = offres[3].projet.replace("Rue de Corcelles", "rue de Corcelles");
    const [c] = construireChantiers(offres);
    expect(c.nom).toBe("Rue de Corcelles 12");
  });

  it("retire le « à » même en Unicode décomposé", () => {
    // « a » + accent combinant : la forme que Notion renvoie parfois. Écrite
    // par code, elle survit à une normalisation du fichier source.
    const aDecompose = `a${String.fromCharCode(0x300)}`;
    const offres = immeuble(12, `Ch. de Pernessy ${aDecompose} 1052 Le Mont-sur-Lausanne`)
      .map((o, i) => ({
        ...o,
        projet: `Duka - Lot ${i + 1}, Ch. de Pernessy ${aDecompose} 1052 Le Mont-sur-Lausanne`,
      }));
    const [c] = construireChantiers(offres);
    expect(c.nom).toBe("Ch. de Pernessy");
    expect(c.nom).not.toMatch(/\u00e0|\u0300/);
  });

  it("garde un « A » majuscule, qui est une lettre de bâtiment", () => {
    const offres = immeuble(12, "Ch. du Stade A à 1252 Meinier")
      .map((o) => ({ ...o, projet: "Nelo - Bât. B, Ch. du Stade A à 1252 Meinier" }));
    const [c] = construireChantiers(offres);
    expect(c.rue).toBe("Ch. du Stade A");
  });
});

describe("libellé du lot", () => {
  const pernessy = (projet: string, o: Partial<ProjetChantier> = {}) =>
    lotsDeLOffre(p({
      projet, adresseChantier: "Chemin de Pernessy, 1052 Le Mont-sur-Lausanne, Suisse",
      fournisseurs: ["Duka.ch"], grossistesNames: ["Gétaz-Miauton SA - Bulle"],
      sanitaireNames: ["Milliquet SA"], ...o,
    }));

  it("lit le lot dans le titre plutôt que « Cabine 1 »", () => {
    const lots = pernessy("Duka - Getaz Bulle - Symbiose Lot A1.1-101, Ch. de Pernessy à 1052 Le Mont",
      { nbCabines: 2, nomsCabines: "Cab1:Cabine 1 | Cab2:Cabine 2" });
    expect(lots.map((l) => l.nom)).toEqual(["Lot A1.1-101", "Lot A1.1-101"]);
    expect(lots.map((l) => l.cab)).toEqual([1, 2]);
  });

  it("écarte le grossiste du libellé, même abrégé dans le titre", () => {
    const [lot] = pernessy("Duka - Getaz Bulle - Symbiose Fitness Aire A1, Ch. de Pernessy à 1052 Le Mont");
    expect(lot.nom).toBe("Symbiose Fitness Aire A1");
  });

  it("garde la pièce équipée en information secondaire", () => {
    const lots = pernessy("Duka - Getaz Bulle - Symbiose Lot N, Ch. de Pernessy à 1052 Le Mont",
      { nbCabines: 2, nomsCabines: "Cab1:Cabine 1 SDD PARENTALE | Cab2:SDD Master" });
    expect(lots[0]).toMatchObject({ nom: "Lot N", piece: "SDD PARENTALE" });
    expect(lots[1]).toMatchObject({ nom: "Lot N", piece: "SDD Master" });
  });

  it("prend le nom de cabine quand c'est lui qui porte l'appartement", () => {
    const lots = lotsDeLOffre(p({
      projet: "Ronal - Les Gruvatiez, Rte d'Orny à 1350 Orbe",
      nbCabines: 3, nomsCabines: "Cab1:App. 1.01 | Cab2:App. 1.02 | Cab3:App. 2.01",
    }));
    expect(lots.map((l) => l.nom)).toEqual(["App. 1.01", "App. 1.02", "App. 2.01"]);
  });
});

describe("sélection des chantiers", () => {
  it("retient un immeuble de dix lots vendus séparément", () => {
    expect(construireChantiers(immeuble(10))).toHaveLength(1);
  });

  it("écarte trois offres d'une cabine : ce n'est pas une PPE", () => {
    expect(construireChantiers(immeuble(3))).toHaveLength(0);
  });

  it("retient une offre unique qui porte assez de cabines", () => {
    const seul = [p({
      id: "gros", projet: "Ronal - Les Gruvatiez, Rte d'Orny à 1350 Orbe",
      adresseChantier: "Rte d'Orny, 1350 Orbe", nbCabines: 14,
    })];
    expect(construireChantiers(seul)[0].nbLots).toBe(14);
  });

  it("n'inclut ni les offres annulées ni les services purs", () => {
    const offres = immeuble(12);
    offres[0].etatCMD = "Annulé";
    offres[1].typeServices = ["Services"];
    expect(construireChantiers(offres)[0].nbLots).toBe(10);
  });

  it("marque le chantier terminé quand toutes ses offres le sont", () => {
    const offres = immeuble(12).map((o) => ({ ...o, etatCMD: "Terminé" }));
    expect(construireChantiers(offres)[0].termine).toBe(true);
    offres[5].etatCMD = "RDV - fixé";
    expect(construireChantiers(offres)[0].termine).toBe(false);
  });
});

describe("regroupement des cabines d'un lot", () => {
  it("réunit les cabines d'un même lot et compte les posées", () => {
    const lots = lotsDeLOffre(p({
      projet: "Duka - Lot Q, Rue de Corcelles 12 à 2034 Neuchâtel",
      nbCabines: 2, nbCabinesInstallees: 1,
    }));
    const [ligne] = grouperParLot(lots);
    expect(ligne.qte).toBe(2);
    expect(ligne.poses).toBe(1);
  });

  it("ne réunit pas deux lots distincts de la même offre", () => {
    const lots = lotsDeLOffre(p({
      projet: "Ronal - Les Gruvatiez, Rte d'Orny à 1350 Orbe",
      nbCabines: 2, nomsCabines: "Cab1:App. 1.01 | Cab2:App. 1.02",
    }));
    expect(grouperParLot(lots)).toHaveLength(2);
  });
});
