/**
 * Règles d'anomalie et de relance.
 *
 * Une règle trop bavarde est pire que pas de règle : la page devient un mur
 * qu'on cesse de lire. Chaque cas vérifie donc les DEUX sens — la fiche fautive
 * est bien vue, et la fiche saine, ou légitimement incomplète, est laissée
 * tranquille (mesures pas encore prises, cabine sous-traitée, projet annulé).
 */
import { describe, it, expect } from "vitest";
import type { Project } from "../lib/notion";
import {
  appliquer, compterFiches, compterFichesVives, joursDepuis, estServicePur,
  derniereActivite, prioriteDe, heuresAberrantes, DORMANT_JOURS,
  REGLES_ANOMALIES, REGLES_RELANCES,
} from "../lib/regles";

const MAINTENANT = new Date("2026-09-27T12:00:00Z");

/** Date ISO située à N jours avant la date de référence des tests. */
function ilYA(jours: number): string {
  return new Date(MAINTENANT.getTime() - jours * 86400000).toISOString().slice(0, 10);
}

const BASE = {
  id: "p1", ofrTM: "TM-2600001", projet: "Duka - Lot A, Rue du Test 1 à 1400 Yverdon",
  adresseChantier: "Rue du Test 1, 1400 Yverdon-les-Bains, Suisse",
  etatCMD: "Terminé", etatMesures: "Terminé", etatSAV: "",
  nbCabines: 1, nbCabinesInstallees: 1, nomsCabines: "", etatMontage: "",
  fournisseurs: ["Duka.ch"], seriesCabines: ["ProCasa UNO"], typeServices: [],
  grossistesNames: [], sanitaireNames: [],
  cmdTM: "CMD-1", cmdTMUsine: "", cmdGrossiste: "",
  dateMesuresRecue: ilYA(120), dateOffre: ilYA(110),
  dateCMDRecue: ilYA(100), dateCMDUsine: null,
  arrivageTM: ilYA(40), arrivageGrossiste: null, dateMontage: ilYA(30),
  heureArrivee: "08:00", heureDepart: "12:00",
  collaborateurs: "Claudio", attributionCabines: "", monteursSousTraitance: "",
  rapportDeMontage: "Rapport traité", facturations: "Facturé",
  soucisMontage: false, soucisMontageCloture: false, dateSoucisMontage: null,
  savCloture: false, dateSAVRecu: null, dateSavClotureLe: null,
} as unknown as Project;

const p = (o: Record<string, unknown>) => ({ ...BASE, ...o } as unknown as Project);

/** Détail renvoyé par une règle donnée, ou null si elle ne dit rien. */
function detail(id: string, projet: Project, jeu = REGLES_ANOMALIES): string | null {
  const regle = jeu.find((r) => r.id === id);
  if (!regle) throw new Error(`règle inconnue : ${id}`);
  return regle.verifier(projet, MAINTENANT);
}

describe("outils", () => {
  it("compte les jours écoulés, jamais les jours à venir", () => {
    expect(joursDepuis(ilYA(10), MAINTENANT)).toBe(10);
    expect(joursDepuis(null, MAINTENANT)).toBeNull();
    const demain = new Date(MAINTENANT.getTime() + 86400000).toISOString().slice(0, 10);
    expect(joursDepuis(demain, MAINTENANT)).toBeNull();
  });

  it("reconnaît une intervention de service pure", () => {
    expect(estServicePur(p({ typeServices: ["Services"] }))).toBe(true);
    expect(estServicePur(p({ typeServices: ["Services", "Montage"] }))).toBe(false);
    expect(estServicePur(p({ typeServices: [] }))).toBe(false);
  });
});

describe("anomalies — ce qui est signalé", () => {
  it("adresse vide", () => {
    expect(detail("adresse-vide", p({ adresseChantier: "" }))).toBeTruthy();
    expect(detail("adresse-vide", p({}))).toBeNull();
  });

  it("adresse sans code postal", () => {
    expect(detail("npa-absent", p({ adresseChantier: "Chemin sans numéro", projet: "Duka - Lot A" }))).toBeTruthy();
    expect(detail("npa-absent", p({}))).toBeNull();
  });

  it("cabines non comptées, mais seulement à un statut qui les suppose connues", () => {
    expect(detail("cabines-absentes", p({ nbCabines: null }))).toBeTruthy();
    // Avant les mesures, le nombre est légitimement inconnu.
    expect(detail("cabines-absentes", p({ nbCabines: null, etatCMD: "En attente de mesures" }))).toBeNull();
    expect(detail("cabines-absentes", p({ nbCabines: null, typeServices: ["Services"] }))).toBeNull();
  });

  it("lots non nommés sur un multi-cabines", () => {
    expect(detail("lots-non-nommes", p({ nbCabines: 3 }))).toBeTruthy();
    expect(detail("lots-non-nommes", p({ nbCabines: 3, nomsCabines: "Cab1:Cabine 1 | Cab2:Cabine 2" }))).toBeTruthy();
    expect(detail("lots-non-nommes", p({ nbCabines: 3, nomsCabines: "Cab1:App. 12 | Cab2:Cabine 2" }))).toBeNull();
    expect(detail("lots-non-nommes", p({ nbCabines: 1 }))).toBeNull();
  });

  it("marque et série manquantes sur un montage clos", () => {
    expect(detail("marque-absente", p({ fournisseurs: [] }))).toBeTruthy();
    expect(detail("marque-absente", p({ fournisseurs: [], typeServices: ["Services"] }))).toBeNull();
    expect(detail("serie-absente", p({ seriesCabines: [] }))).toBeTruthy();
    // Sans marque, inutile de réclamer aussi la série : une anomalie suffit.
    expect(detail("serie-absente", p({ fournisseurs: [], seriesCabines: [] }))).toBeNull();
  });

  it("heures non pointées, sauf sous-traitance", () => {
    expect(detail("heures-absentes", p({ heureDepart: "" }))).toBeTruthy();
    expect(detail("heures-absentes", p({ heureDepart: "", monteursSousTraitance: "Sous-traitant X" }))).toBeNull();
  });

  it("montage terminé sans date", () => {
    expect(detail("montage-sans-date", p({ dateMontage: null }))).toBeTruthy();
    expect(detail("montage-sans-date", p({}))).toBeNull();
  });

  it("date passée sur un projet resté ouvert", () => {
    expect(detail("date-passee-active", p({ etatCMD: "RDV - fixé" }))).toBeTruthy();
    expect(detail("date-passee-active", p({ etatCMD: "RDV - fixé", dateMontage: ilYA(1) }))).toBeNull();
    expect(detail("date-passee-active", p({ etatCMD: "Soucis montage" }))).toBeNull();
    expect(detail("date-passee-active", p({ etatCMD: "Annulé" }))).toBeNull();
  });

  it("arrivage enregistré mais statut resté en commande", () => {
    expect(detail("livre-statut-cmd", p({ etatCMD: "Cabines en CMD" }))).toBeTruthy();
    expect(detail("livre-statut-cmd", p({ etatCMD: "Cabines en CMD", arrivageTM: null }))).toBeNull();
  });

  it("laisse tranquille une fiche complète", () => {
    const groupes = appliquer(REGLES_ANOMALIES, [p({})], MAINTENANT);
    expect(groupes).toHaveLength(0);
  });
});

describe("relances — ce qui traîne", () => {
  const vivant = { etatCMD: "Récéptionné - RDV à fixer", dateMontage: null };

  it("cabines livrées sans rendez-vous", () => {
    expect(detail("livre-sans-rdv", p({ ...vivant, arrivageTM: ilYA(20) }), REGLES_RELANCES)).toBeTruthy();
    expect(detail("livre-sans-rdv", p({ ...vivant, arrivageTM: ilYA(3) }), REGLES_RELANCES)).toBeNull();
    // Rendez-vous fixé : plus rien à relancer.
    expect(detail("livre-sans-rdv", p({ etatCMD: "RDV - fixé", arrivageTM: ilYA(20) }), REGLES_RELANCES)).toBeNull();
  });

  it("mesures prises sans offre", () => {
    const sansOffre = { ...vivant, dateOffre: null, dateMesuresRecue: ilYA(40) };
    expect(detail("mesures-sans-offre", p(sansOffre), REGLES_RELANCES)).toBeTruthy();
    expect(detail("mesures-sans-offre", p({ ...sansOffre, dateOffre: ilYA(5) }), REGLES_RELANCES)).toBeNull();
  });

  it("offre sans commande, sous toutes ses formes", () => {
    const sansCmd = {
      ...vivant, dateOffre: ilYA(45),
      cmdTM: "", cmdTMUsine: "", cmdGrossiste: "", dateCMDRecue: null, dateCMDUsine: null,
    };
    expect(detail("offre-sans-commande", p(sansCmd), REGLES_RELANCES)).toBeTruthy();
    expect(detail("offre-sans-commande", p({ ...sansCmd, cmdGrossiste: "G-42" }), REGLES_RELANCES)).toBeNull();
    expect(detail("offre-sans-commande", p({ ...sansCmd, dateCMDUsine: ilYA(2) }), REGLES_RELANCES)).toBeNull();
  });

  it("SAV ouvert trop longtemps", () => {
    expect(detail("sav-ouvert", p({ dateSAVRecu: ilYA(30) }), REGLES_RELANCES)).toBeTruthy();
    expect(detail("sav-ouvert", p({ dateSAVRecu: ilYA(30), savCloture: true }), REGLES_RELANCES)).toBeNull();
    expect(detail("sav-ouvert", p({ dateSAVRecu: ilYA(30), etatSAV: "Terminé" }), REGLES_RELANCES)).toBeNull();
  });

  it("souci de montage non clôturé", () => {
    const souci = { soucisMontage: true, dateSoucisMontage: ilYA(20) };
    expect(detail("souci-ouvert", p(souci), REGLES_RELANCES)).toBeTruthy();
    expect(detail("souci-ouvert", p({ ...souci, soucisMontageCloture: true }), REGLES_RELANCES)).toBeNull();
  });

  it("rapport de montage non traité", () => {
    expect(detail("rapport-attente", p({ rapportDeMontage: "" }), REGLES_RELANCES)).toBeTruthy();
    expect(detail("rapport-attente", p({}), REGLES_RELANCES)).toBeNull();
  });

  it("facture qui dort", () => {
    expect(detail("a-facturer-ancien", p({ facturations: "A facturer" }), REGLES_RELANCES)).toBeTruthy();
    // Rapport pas encore traité : ce n'est pas encore facturable.
    expect(detail("a-facturer-ancien", p({ facturations: "A facturer", rapportDeMontage: "" }), REGLES_RELANCES)).toBeNull();
  });
});

describe("assemblage", () => {
  it("classe les groupes par gravité puis par volume", () => {
    const projets = [
      p({ id: "a", adresseChantier: "" }),
      p({ id: "b", adresseChantier: "" }),
      p({ id: "c", seriesCabines: [] }),
    ];
    const groupes = appliquer(REGLES_ANOMALIES, projets, MAINTENANT);
    expect(groupes[0].regle.gravite).toBe("bloquant");
    expect(groupes[0].projets).toHaveLength(2);
  });

  it("ne compte qu'une fois une fiche qui cumule les anomalies", () => {
    const groupes = appliquer(
      REGLES_ANOMALIES,
      [p({ id: "z", adresseChantier: "", fournisseurs: [], seriesCabines: [] })],
      MAINTENANT,
    );
    expect(groupes.length).toBeGreaterThan(1);
    expect(compterFiches(groupes)).toBe(1);
  });
});

describe("relances — le déplacement évité", () => {
  it("signale un rendez-vous proche dont les cabines ne sont pas arrivées", () => {
    const dans = (j: number) =>
      new Date(MAINTENANT.getTime() + j * 86400000).toISOString().slice(0, 10);
    const ouvert = { etatCMD: "RDV - fixé", arrivageTM: null, arrivageGrossiste: null };
    expect(detail("rdv-sans-cabines", p({ ...ouvert, dateMontage: dans(5) }), REGLES_RELANCES)).toBeTruthy();
    expect(detail("rdv-sans-cabines", p({ ...ouvert, dateMontage: dans(0) }), REGLES_RELANCES)).toMatch(/AUJOURD/);
    // Cabines arrivées : le déplacement est sûr.
    expect(detail("rdv-sans-cabines", p({ etatCMD: "RDV - fixé", dateMontage: dans(5) }), REGLES_RELANCES)).toBeNull();
    // Trop loin pour agir, ou déjà passé : ce n'est plus une relance.
    expect(detail("rdv-sans-cabines", p({ ...ouvert, dateMontage: dans(40) }), REGLES_RELANCES)).toBeNull();
    expect(detail("rdv-sans-cabines", p({ ...ouvert, dateMontage: ilYA(3) }), REGLES_RELANCES)).toBeNull();
  });
});


describe("priorité — par quoi commencer", () => {
  const regle = (id: string) => {
    const r = [...REGLES_RELANCES, ...REGLES_ANOMALIES].find((x) => x.id === id);
    if (!r) throw new Error(id);
    return r;
  };
  const dans = (j: number) =>
    new Date(MAINTENANT.getTime() + j * 86400000).toISOString().slice(0, 10);

  it("retient la date la plus récente du dossier", () => {
    expect(derniereActivite(p({}), MAINTENANT)).toBe(30); // le montage
    expect(derniereActivite(
      p({ dateMesuresRecue: null, dateOffre: null, dateCMDRecue: null,
          arrivageTM: null, dateMontage: null }), MAINTENANT)).toBeNull();
  });

  it("fait passer devant une intervention imminente", () => {
    const proche = prioriteDe(regle("rdv-sans-cabines"),
      p({ dateMontage: dans(1), arrivageTM: null }), MAINTENANT);
    const lointain = prioriteDe(regle("rdv-sans-cabines"),
      p({ dateMontage: dans(12), arrivageTM: null }), MAINTENANT);
    expect(proche.score).toBeGreaterThan(lointain.score);
    expect(proche.raisons.join(" ")).toMatch(/montage dans 1 j/);
  });

  it("pèse le nombre de cabines", () => {
    const gros = prioriteDe(regle("livre-sans-rdv"), p({ nbCabines: 12, dateMontage: null }), MAINTENANT);
    const petit = prioriteDe(regle("livre-sans-rdv"), p({ nbCabines: 1, dateMontage: null }), MAINTENANT);
    expect(gros.score).toBeGreaterThan(petit.score);
  });

  it("écarte un dossier que plus rien n'a fait bouger depuis des mois", () => {
    const vieux = ilYA(DORMANT_JOURS + 60);
    const dormant = prioriteDe(regle("offre-sans-commande"), p({
      dateMesuresRecue: vieux, dateMesures: vieux, dateOffre: vieux,
      dateCMDRecue: null, dateCMDUsine: null,
      arrivageTM: null, arrivageGrossiste: null, dateMontage: null,
    }), MAINTENANT);
    expect(dormant.dormant).toBe(true);

    const recent = prioriteDe(regle("offre-sans-commande"), p({
      dateOffre: ilYA(40), dateMesuresRecue: ilYA(45), dateMesures: ilYA(45),
      dateCMDRecue: null, dateCMDUsine: null,
      arrivageTM: null, arrivageGrossiste: null, dateMontage: null,
    }), MAINTENANT);
    expect(recent.dormant).toBe(false);
    expect(recent.score).toBeGreaterThan(dormant.score);
  });

  it("compte séparément les dossiers vivants et l'arriéré à classer", () => {
    const vieux = ilYA(DORMANT_JOURS + 60);
    const groupes = appliquer(REGLES_RELANCES, [
      p({ id: "vif", etatCMD: "RDV - fixé", arrivageTM: null, dateMontage: dans(3) }),
      p({ id: "vieux", etatCMD: "Cabines mesurées", dateOffre: vieux,
          dateMesuresRecue: vieux, dateMesures: vieux, cmdTM: "", cmdTMUsine: "",
          cmdGrossiste: "", dateCMDRecue: null, dateCMDUsine: null,
          arrivageTM: null, arrivageGrossiste: null, dateMontage: null }),
    ], MAINTENANT);
    expect(compterFiches(groupes)).toBe(2);
    expect(compterFichesVives(groupes)).toBe(1);
  });

  it("classe le plus prioritaire en tête de son groupe", () => {
    const groupes = appliquer(REGLES_RELANCES, [
      p({ id: "loin", etatCMD: "RDV - fixé", arrivageTM: null, dateMontage: dans(9), nbCabines: 1 }),
      p({ id: "proche", etatCMD: "RDV - fixé", arrivageTM: null, dateMontage: dans(1), nbCabines: 6 }),
    ], MAINTENANT);
    const g = groupes.find((x) => x.regle.id === "rdv-sans-cabines")!;
    expect(g.projets[0].projet.id).toBe("proche");
  });
});


describe("heures invraisemblables", () => {
  it("laisse passer une journée normale, même longue", () => {
    expect(heuresAberrantes(p({ heureArrivee: "07:00", heureDepart: "18:30" }))).toEqual([]);
  });

  it("signale un départ avant l'arrivée", () => {
    expect(heuresAberrantes(p({ heureArrivee: "14:00", heureDepart: "09:00" }))[0])
      .toMatch(/avant ou égal/);
  });

  it("signale une présence impossible, trop longue ou trop courte", () => {
    expect(heuresAberrantes(p({ heureArrivee: "06:00", heureDepart: "23:00" }))).toHaveLength(1);
    expect(heuresAberrantes(p({ heureArrivee: "08:00", heureDepart: "08:05" }))).toHaveLength(1);
  });

  it("vérifie chaque cabine séparément, et la nomme", () => {
    const out = heuresAberrantes(p({
      heureArrivee: "Cab1:08:00 | Cab2:09:00",
      heureDepart: "Cab1:12:00 | Cab2:08:00",
    }));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatch(/^Cabine 2/);
  });

  it("ne dit rien quand les heures sont absentes — c'est une autre règle", () => {
    expect(heuresAberrantes(p({ heureArrivee: "", heureDepart: "" }))).toEqual([]);
  });
});
