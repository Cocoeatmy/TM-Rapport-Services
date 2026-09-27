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
  appliquer, compterFiches, joursDepuis, estServicePur,
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
