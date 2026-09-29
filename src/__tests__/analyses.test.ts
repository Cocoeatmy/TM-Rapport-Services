/**
 * Transformation, coût de trajet, coût du SAV.
 *
 * Ces chiffres servent à décider — privilégier un client, tarifer une région,
 * négocier avec un fournisseur. Un dénominateur oublié suffit à inverser une
 * conclusion, c'est donc surtout cela que ces cas vérifient.
 */
import { describe, it, expect } from "vitest";
import type { Project } from "../lib/notion";
import {
  transformation, coutRoute, coutSav, rendement, clientsEnRecul,
  degatsLivraison, soloOuBinome, devenirMesures, clientFacture,
  delaisEtapes, reprises,
} from "../lib/analyses";
import { chiffreAffaires, prestation, cleClient } from "../lib/ca";

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
  fournisseursNames: ["Duka"], typeClient: "Sanitaire",
  cmdTM: "", cmdTMUsine: "", cmdGrossiste: "",
  dateMesuresRecue: ilYA(100), dateOffre: ilYA(95),
  dateCMDRecue: null, dateCMDUsine: null, dateMontage: null,
  heureArrivee: "", heureDepart: "", attributionCabines: "", collaborateurs: "",
  mesuresTraiteePar: "", etatMesures: "Terminé",
  photosCartons: [], photosCartonsRecus: [],
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

  it("retient le client FACTURÉ, pas les entreprises qui l'entourent", () => {
    /* Le cas réel : un chantier chez MMT, commandé et payé par Duka. Compter
       MMT comme client attribuait des mesures à une entreprise qui ne nous a
       jamais rien commandé. */
    const projets = lot(4, {
      typeClient: "Fournisseur",
      fournisseursNames: ["Duka"],
      grossistesNames: ["Dubat Yverdon"],
      sanitaireNames: ["MMT SA"],
    });
    expect(transformation(projets, "tous")[0].client).toBe("Duka");
  });

  it("filtre sur la famille du client facturé", () => {
    const projets = [
      ...lot(4, { id: "f", typeClient: "Fournisseur", fournisseursNames: ["Duka"] }),
      ...lot(4, { id: "g", typeClient: "Grossiste", grossistesNames: ["Gétaz Nyon"] }),
    ];
    expect(transformation(projets, "tous").map((l) => l.client).sort())
      .toEqual(["Duka", "Gétaz Nyon"]);
    expect(transformation(projets, "Fournisseur").map((l) => l.client)).toEqual(["Duka"]);
    expect(transformation(projets, "Grossiste").map((l) => l.client)).toEqual(["Gétaz Nyon"]);
  });
});

describe("qui est le client d'un projet", () => {
  it("suit « Type de client », quelles que soient les autres entreprises", () => {
    const base = {
      fournisseursNames: ["Duka"],
      grossistesNames: ["Dubat Yverdon"],
      sanitaireNames: ["Milliquet SA"],
    };
    expect(clientFacture(p({ ...base, typeClient: "Fournisseur" })).nom).toBe("Duka");
    expect(clientFacture(p({ ...base, typeClient: "Grossistes" })).nom).toBe("Dubat Yverdon");
    expect(clientFacture(p({ ...base, typeClient: "Sanitaires" })).nom).toBe("Milliquet SA");
  });

  it("accepte le pluriel et les accents de Notion", () => {
    expect(clientFacture(p({ typeClient: "Fournisseurs", fournisseursNames: ["Duka"] })).type)
      .toBe("Fournisseur");
  });

  it("garde en segment les familles sans entreprise en relation", () => {
    const c = clientFacture(p({ typeClient: "Client final" }));
    expect(c.nom).toBe("Client final");
    expect(c.approximatif).toBe(false);
  });

  it("se rabat en le signalant quand la relation désignée est vide", () => {
    const c = clientFacture(p({
      typeClient: "Fournisseur", fournisseursNames: [], grossistesNames: ["Gétaz Nyon"],
    }));
    expect(c.nom).toBe("Gétaz Nyon");
    expect(c.approximatif).toBe(true);
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

describe("temps consommé par cabine", () => {
  const pose = (serie: string, n: number, minutes: number) => lot(n, {
    etatCMD: "Terminé", dateMontage: ilYA(30), seriesCabines: [serie],
    nbCabines: 1, nbCabinesInstallees: 1,
    heureArrivee: "08:00", heureDepart: `${8 + minutes / 60}:00`,
  });

  it("classe du plus rapide au plus lent, SAV compris", () => {
    const lignes = rendement([
      ...pose("Rapide", 12, 120),
      ...pose("Lente", 12, 240),
    ], "serie");
    expect(lignes.map((l) => l.cle)).toEqual(["Rapide", "Lente"]);
    expect(lignes[0].minutesParCabine).toBe(120);
  });

  it("ajoute les heures de SAV au temps consommé", () => {
    const sansSav = rendement(pose("S", 12, 120), "serie")[0];
    const avecSav = rendement([
      ...pose("S", 12, 120),
      ...lot(1, {
        etatCMD: "Terminé", dateMontage: ilYA(30), seriesCabines: ["S"],
        nbCabines: 1, nbCabinesInstallees: 1,
        heureArrivee: "08:00", heureDepart: "10:00",
        dateSAVRecu: ilYA(20), heureArriveeSav: "08:00", heureDepartSav: "12:00",
      }),
    ], "serie")[0];
    expect(avecSav.minutesSav).toBe(240);
    expect(avecSav.minutesParCabine).toBeGreaterThan(sansSav.minutesParCabine);
  });

  it("écarte une série trop peu posée pour être comparée", () => {
    expect(rendement(pose("Rare", 4, 120), "serie")).toEqual([]);
  });
});

describe("clients qui décrochent", () => {
  const commandes = (client: string, n: number, jours: number) => lot(n, {
    etatCMD: "Terminé", dateMontage: ilYA(jours), sanitaireNames: [client],
    nbCabines: 1, nbCabinesInstallees: 1,
  });

  it("repère une chute d'une année sur l'autre", () => {
    const lignes = clientsEnRecul([
      ...commandes("Décroche", 20, 400),
      ...commandes("Décroche", 3, 100),
    ], "tous", MAINTENANT);
    expect(lignes[0].client).toBe("Décroche");
    expect(lignes[0].avant).toBe(20);
    expect(lignes[0].recent).toBe(3);
    expect(lignes[0].variation).toBe(-85);
  });

  it("laisse tranquille un client stable ou en hausse", () => {
    const lignes = clientsEnRecul([
      ...commandes("Stable", 10, 400),
      ...commandes("Stable", 11, 100),
    ], "tous", MAINTENANT);
    expect(lignes).toEqual([]);
  });

  it("ignore un client qui n'a jamais décollé", () => {
    const lignes = clientsEnRecul([
      ...commandes("Minuscule", 3, 400),
    ], "tous", MAINTENANT);
    expect(lignes).toEqual([]);
  });
});

describe("livraisons abîmées", () => {
  const livraison = (marque: string, n: number, degats: boolean) => lot(n, {
    arrivageTM: ilYA(20), fournisseurs: [marque],
    photosCartonsRecus: [{ name: "c", url: "u" }],
    photosCartons: degats ? [{ name: "d", url: "u" }] : [],
  });

  it("calcule le taux sur les livraisons documentées, pas sur toutes", () => {
    const lignes = degatsLivraison([
      ...livraison("Duka", 2, true),
      ...livraison("Duka", 8, false),
      ...lot(10, { arrivageTM: ilYA(20), fournisseurs: ["Duka"], photosCartonsRecus: [], photosCartons: [] }),
    ], "marque");
    expect(lignes[0].documentees).toBe(10);
    expect(lignes[0].taux).toBe(20);
    expect(lignes[0].couverture).toBe(50);
  });

  it("n'affiche pas un fournisseur trop peu documenté", () => {
    expect(degatsLivraison(livraison("Rare", 3, true), "marque")).toEqual([]);
  });
});

describe("seul ou à deux", () => {
  const chantier = (personnes: string, n: number, minutes: number) => lot(n, {
    etatCMD: "Terminé", dateMontage: ilYA(30), nbCabines: 1, nbCabinesInstallees: 1,
    attributionCabines: `Cab1:${personnes}`,
    heureArrivee: "08:00", heureDepart: `${8 + minutes / 60}:00`,
  });

  it("distingue présence et temps-homme", () => {
    const lignes = soloOuBinome([
      ...chantier("Claudio", 6, 240),
      ...chantier("Claudio & Jacobo", 6, 120),
    ]);
    const seul = lignes.find((l) => l.forme === "Seul")!;
    const deux = lignes.find((l) => l.forme === "À deux")!;
    // Deux fois plus vite en présence, mais exactement le même temps-homme.
    expect(deux.minutesParCabine).toBe(seul.minutesParCabine / 2);
    expect(deux.minutesHommeParCabine).toBe(seul.minutesHommeParCabine);
  });

  it("écarte les montages « Team », dont on ignore l'effectif", () => {
    const lignes = soloOuBinome(chantier("Team TM", 8, 120));
    expect(lignes).toEqual([]);
  });
});

describe("devenir des mesures", () => {
  const mesure = (par: string, n: number, o: Record<string, unknown>) => lot(n, {
    mesuresTraiteePar: par, etatMesures: "Terminé", dateMesuresRecue: ilYA(80), ...o,
  });

  it("répartit chaque mesure entre commandée, ouverte et annulée", () => {
    const [l] = devenirMesures([
      ...mesure("Natalia", 5, { cmdTM: "C" }),
      ...mesure("Natalia", 3, {}),
      ...mesure("Natalia", 2, { etatCMD: "Annulé" }),
    ]);
    expect(l.prises).toBe(10);
    expect(l.commandees).toBe(5);
    expect(l.ouvertes).toBe(3);
    expect(l.annulees).toBe(2);
    expect(l.taux).toBe(50);
  });

  it("compte un relevé fait à deux pour chacun", () => {
    const lignes = devenirMesures(mesure("Natalia & Micael", 6, { cmdTM: "C" }));
    expect(lignes).toHaveLength(2);
    expect(lignes.every((l) => l.prises === 6)).toBe(true);
  });

  it("n'affiche personne sous cinq relevés", () => {
    expect(devenirMesures(mesure("Rare", 3, {}))).toEqual([]);
  });
});

describe("le temps que ça prend", () => {
  const chaine = (o: Record<string, unknown> = {}) => p({
    etatCMD: "Terminé",
    dateMesuresRecue: "2026-01-01", dateMesures: "2026-01-06",
    dateOffre: "2026-01-10", dateCMDRecue: "2026-01-20", dateCMDUsine: "2026-01-20",
    arrivageTM: "2026-02-20", dateMontage: "2026-03-02",
    ...o,
  });

  it("donne les jours médians de chaque étape", () => {
    const [ens] = delaisEtapes(lot(6, chaine()), undefined, undefined, MAINTENANT);
    expect(ens.cle).toBe("Ensemble");
    const par = Object.fromEntries(ens.etapes.map((e) => [e.nom, e.jours]));
    expect(par["Demande → mesure"]).toBe(5);
    expect(par["Commande → arrivage"]).toBe(31);
    expect(ens.total).toBe(60);
  });

  it("écarte une chronologie impossible plutôt que de la moyenner", () => {
    /* Arrivage AVANT la commande : c'est une saisie fautive, pas un délai
       négatif. L'étape doit disparaître faute de cas, pas être faussée. */
    const [ens] = delaisEtapes(
      lot(6, chaine({ arrivageTM: "2026-01-05" })), undefined, undefined, MAINTENANT);
    expect(ens.etapes.find((e) => e.nom === "Commande → arrivage")).toBeUndefined();
  });

  it("n'affiche pas un fournisseur trop peu fourni", () => {
    const lignes = delaisEtapes([
      ...lot(6, chaine({ fournisseurs: ["Duka"] })),
      ...lot(2, chaine({ fournisseurs: ["Rare"] })),
    ], undefined, undefined, MAINTENANT);
    expect(lignes.map((l) => l.cle)).toEqual(["Ensemble", "Duka"]);
  });
});

describe("ce que coûte de repasser", () => {
  const pose = (o: Record<string, unknown> = {}) => p({
    etatCMD: "Terminé", dateMontage: ilYA(30), nbCabines: 1, nbCabinesInstallees: 1,
    ...o,
  });

  it("ne compte que les reprises prouvées par des heures pointées", () => {
    const lignes = reprises([
      ...lot(3, pose({ fournisseurs: ["Duka"] })),
      ...lot(1, pose({ fournisseurs: ["Duka"], heureArriveeSav: "08:00", heureDepartSav: "10:00" })),
      // SAV ouvert mais jamais pointé : aucun déplacement prouvé.
      ...lot(2, pose({ fournisseurs: ["Duka"], causeSAV: "Erreur TM" })),
    ], "fournisseur", {}, undefined, undefined);
    const duka = lignes.find((l) => l.cle === "Duka")!;
    expect(duka.reprises).toBe(1);
    expect(duka.heuresSurPlace).toBe(2);
    expect(duka.heuresTotal).toBeGreaterThan(duka.heuresSurPlace); // la route s'ajoute
  });

  it("compte un montage partiel comme une reprise", () => {
    const lignes = reprises(
      lot(2, pose({ fournisseurs: ["Duka"], etatMontage: "Montage partiel" })),
      "fournisseur", {}, undefined, undefined);
    expect(lignes[0].reprises).toBe(2);
  });

  it("rapporte les reprises aux chantiers posés", () => {
    const lignes = reprises([
      ...lot(9, pose({ fournisseurs: ["Duka"] })),
      ...lot(1, pose({ fournisseurs: ["Duka"], heureArriveeSav: "08:00", heureDepartSav: "09:00" })),
    ], "fournisseur", {}, undefined, undefined);
    expect(lignes[0].chantiers).toBe(10);
    expect(lignes[0].taux).toBe(10);
  });
});

describe("chiffre d'affaires", () => {
  const vendu = (o: Record<string, unknown> = {}) => p({
    etatCMD: "Terminé", dateMontage: "2026-06-15", nbCabines: 2, nbCabinesInstallees: 2,
    montantOFR: 1000, typeClient: "Fournisseur", fournisseursNames: ["Duka"],
    fournisseurs: ["Duka"], cmdTM: "", cmdTMUsine: "",
    ...o,
  });

  it("sépare le service du clé en main d'après la commande TM", () => {
    expect(prestation(vendu())).toBe("service");
    expect(prestation(vendu({ cmdTM: "CMD-1" }))).toBe("cle-en-main");
    expect(prestation(vendu({ cmdTMUsine: "U-9" }))).toBe("cle-en-main");
  });

  it("ne mêle pas le prix d'une cabine à celui d'une pose", () => {
    /* Trois poses à 500 la cabine, et un clé en main à 4000 la cabine. Le prix
       par cabine doit rester celui du service — sinon la marchandise revendue
       passerait pour une prestation. */
    const ca = chiffreAffaires([
      ...lot(3, vendu({ montantOFR: 1000 })),
      vendu({ id: "clé", montantOFR: 8000, cmdTM: "CMD-1" }),
    ]);
    expect(ca.service).toBe(3000);
    expect(ca.cleEnMain).toBe(8000);
    expect(ca.total).toBe(11000);
    expect(ca.medianeParCabine).toBe(500);
  });

  it("compte les montages terminés sans montant, pour ne pas laisser croire à un total complet", () => {
    const ca = chiffreAffaires([...lot(2, vendu()), vendu({ id: "vide", montantOFR: null })]);
    expect(ca.chiffres).toBe(2);
    expect(ca.sansMontant).toBe(1);
  });

  it("n'attribue rien à un projet non terminé", () => {
    expect(chiffreAffaires([vendu({ etatCMD: "RDV - fixé" })]).total).toBe(0);
  });

  it("répartit par client FACTURÉ, pas par sanitaire", () => {
    const ca = chiffreAffaires(lot(3, vendu({
      typeClient: "Fournisseur", fournisseursNames: ["Duka"], sanitaireNames: ["MMT SA"],
    })));
    expect(ca.parClient.map((l) => l.cle)).toEqual(["Duka"]);
  });

  it("respecte la fenêtre de dates", () => {
    const ca = chiffreAffaires([
      ...lot(2, vendu({ dateMontage: "2026-06-15" })),
      ...lot(2, vendu({ dateMontage: "2025-06-15" })),
    ], "2026-01-01", "2026-12-31");
    expect(ca.chiffres).toBe(2);
  });
});

describe("offre contre facturé", () => {
  const vendu = (o: Record<string, unknown> = {}) => p({
    etatCMD: "Terminé", dateMontage: "2026-06-15", nbCabines: 1, nbCabinesInstallees: 1,
    montantOFR: 1000, typeClient: "Fournisseur", fournisseursNames: ["Duka"],
    fournisseurs: ["Duka"], cmdTM: "", cmdTMUsine: "", ...o,
  });
  const f = (o: Record<string, unknown> = {}) =>
    ({ num: "1", client: "Duka ch AG", date: "2026-06-20", ht: 900, ...o }) as never;

  it("rapproche « Duka » et « Duka ch AG » sous une même clé", () => {
    expect(cleClient("Duka ch AG")).toBe(cleClient("Duka ch"));
    expect(cleClient("Nelo GmbH")).toBe(cleClient("Nelo"));
    expect(cleClient("Gétaz Miauton")).not.toBe(cleClient("Getaz Nyon"));
  });

  it("compte le facturé à part, sur SA propre date", () => {
    const ca = chiffreAffaires([vendu()], undefined, undefined, [f(), f({ num: "2", ht: 500 })]);
    expect(ca.total).toBe(1000);
    expect(ca.facture!.total).toBe(1400);
    expect(ca.facture!.nombre).toBe(2);
  });

  it("montre un mois où l'on a facturé sans avoir posé", () => {
    /* Le décalage est l'information : une facture de juillet sur un chantier
       de juin ne doit pas disparaître de la courbe. */
    const ca = chiffreAffaires([vendu()], undefined, undefined, [f({ date: "2026-07-05" })]);
    const mois = ca.parMois.map((m) => m.mois);
    expect(mois).toContain("2026-06");
    expect(mois).toContain("2026-07");
    expect(ca.parMois.find((m) => m.mois === "2026-07")!.total).toBe(0);
  });

  it("ne rend aucune ligne facturée quand rien n'a été poussé", () => {
    expect(chiffreAffaires([vendu()]).facture).toBeNull();
  });

  it("respecte la fenêtre pour les factures aussi", () => {
    const ca = chiffreAffaires([vendu()], "2026-06-01", "2026-06-30",
      [f({ date: "2026-06-20" }), f({ num: "3", date: "2026-08-01", ht: 7777 })]);
    expect(ca.facture!.total).toBe(900);
  });
});

describe("indicateurs déduits", () => {
  const fait = (o: Record<string, unknown> = {}) => p({
    etatCMD: "Terminé", dateMontage: "2026-06-15", nbCabines: 1, nbCabinesInstallees: 1,
    montantOFR: 1000, typeClient: "Fournisseur", fournisseursNames: ["Duka"],
    fournisseurs: ["Duka"], cmdTM: "", cmdTMUsine: "", facturations: "Facturé", ...o,
  });

  it("compte les clients distincts, forme juridique neutralisée", () => {
    /* « Nelo » et « Nelo GmbH » sont le même client : seule la forme juridique
       est ôtée. Un mot de plus dans le nom — « Duka ch » — reste distinctif,
       et c'est voulu : Gétaz Nyon n'est pas Gétaz Miauton. */
    const ca = chiffreAffaires([
      fait({ id: "a", fournisseursNames: ["Nelo"] }),
      fait({ id: "b", fournisseursNames: ["Nelo GmbH"] }),
      fait({ id: "c", fournisseursNames: ["Duka ch AG"] }),
    ]);
    expect(ca.indicateurs.clientsActifs).toBe(2);
    expect(cleClient("Getaz Nyon")).not.toBe(cleClient("Gétaz Miauton"));
  });

  it("ne dit nouveau qu'un client dont c'est le premier chantier", () => {
    /* Duka travaille avec nous depuis 2025 : sur l'exercice 2026 il est actif,
       pas nouveau. Nelo, lui, arrive en 2026. */
    const projets = [
      fait({ id: "vieux", fournisseursNames: ["Duka"], dateMontage: "2025-03-01" }),
      fait({ id: "suite", fournisseursNames: ["Duka"], dateMontage: "2026-06-15" }),
      fait({ id: "neuf", fournisseursNames: ["Nelo"], dateMontage: "2026-06-15" }),
    ];
    const ca = chiffreAffaires(projets, "2026-01-01", "2026-12-31");
    expect(ca.indicateurs.clientsActifs).toBe(2);
    expect(ca.indicateurs.nouveauxClients).toBe(1);
  });

  it("compte ce qui est fait mais pas encore facturé", () => {
    const ca = chiffreAffaires([
      fait({ id: "ok" }),
      fait({ id: "retard", facturations: "A facturer", montantOFR: 2500 }),
      fait({ id: "rapport", facturations: "En attente de rapport", montantOFR: 700 }),
    ]);
    expect(ca.indicateurs.aFacturer).toBe(3200);
    expect(ca.indicateurs.aFacturerChantiers).toBe(2);
  });
});
