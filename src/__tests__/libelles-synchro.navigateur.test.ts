/**
 * Les intitulés des opérations en attente : tirés des données réelles, jamais
 * inventés. Les exemples reprennent les noms que l'app donne vraiment aux
 * fichiers (« planche.numéro.horodatage[.pPriseDeVue].ext »).
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  premierNumeroTM, lireNomPhoto, natureDePhoto, natureDeSaisie, nomDuChamp,
  projetsConnus, referenceProjet, projetDeSaisie, _oublierProjets,
} from "@/lib/libelles-synchro";

const P = "3f91895b-9179-80f7-b6f7-cfe6290a1b2c";

beforeEach(() => { localStorage.clear(); _oublierProjets(); });

describe("le projet", () => {
  it("prend le premier numéro TM du champ OFR", () => {
    expect(premierNumeroTM("TM-2600825, TM-2600826")).toBe("TM-2600825");
    expect(premierNumeroTM("tm 2600825")).toBe("TM-2600825");
    expect(premierNumeroTM("")).toBe("");
  });

  it("retrouve le numéro dans les fiches gardées sur l'appareil, sans réseau", () => {
    localStorage.setItem("tm-projects-cache", JSON.stringify({
      cmd: [{ id: P, ofrTM: "TM-2600825", projet: "Immeuble des Tilleuls" }],
      mesures: [{ id: "autre", ofrTM: "", projet: "Villa du Lac" }],
    }));
    const projets = projetsConnus();
    expect(referenceProjet(P, projets)).toBe("TM-2600825");
    expect(referenceProjet("autre", projets)).toBe("Villa du Lac");
  });

  it("lit aussi une fiche ouverte depuis la recherche", () => {
    localStorage.setItem(`tm-project-${P}`, JSON.stringify({ id: P, ofrTM: "TM-TEST", projet: "Essai" }));
    expect(referenceProjet(P, projetsConnus())).toBe("TM-TEST"); // numéro d'essai, tel qu'il est écrit
  });

  it("sans fiche connue, montre le début de l'identifiant — rien d'inventé", () => {
    expect(referenceProjet(P, projetsConnus())).toBe("projet 3f91895b");
  });
});

describe("les photos", () => {
  it("lit la planche et le numéro dans le nom du fichier", () => {
    expect(lireNomPhoto("Montage gauche.2.1792346187038.p1792346180000.jpg")).toEqual({ planche: "Montage gauche", numero: "2" });
    expect(lireNomPhoto("Photos - Situations.11.1792346187038.jpg")).toEqual({ planche: "Situations", numero: "11" });
    expect(lireNomPhoto("carton-recu.3.1792346187038.jpg")).toEqual({ planche: "carton recu", numero: "3" });
    expect(lireNomPhoto("IMG_4412.HEIC").planche).toBe("IMG 4412");
  });

  it("distingue les photos d'un même projet par leur planche, leur numéro et leur lot", () => {
    expect(natureDePhoto({ projectId: P, category: "montage-cab2", notionField: "Photos montage terminé",
      files: [{ name: "Montage gauche.2.1792346187038.jpg" }] })).toBe("Photo montage gauche 2 · lot 2");
    expect(natureDePhoto({ projectId: P, category: "avant", notionField: "Photos avant montage",
      files: [{ name: "Avant intervention.1.1792346187038.jpg" }] })).toBe("Photo avant intervention 1");
  });

  it("nomme la signature et le défaut d'après leur contenu", () => {
    expect(natureDePhoto({ projectId: P, champTexte: "signatureUrl", files: [{ name: "signature-1792346187038.png" }] }))
      .toBe("Signature du client");
    expect(natureDePhoto({ projectId: P, category: "signalements-hors-ligne", signalement: { typesLabel: "Joint fendu" },
      files: [{ name: "defaut.1.1792346187038.jpg" }, { name: "defaut.2.1792346187039.jpg" }] }))
      .toBe("Défaut — Joint fendu (2 photos)");
  });
});

describe("les saisies", () => {
  it("dit ce qui part, avec les vrais noms de champs", () => {
    expect(natureDeSaisie({ url: `/api/projects/${P}`, body: { heureArrivee: "07:30", heureDepart: "16:00" } })).toBe("Heures d'intervention");
    expect(natureDeSaisie({ url: `/api/projects/${P}`, body: { rapportMonteur: "…", heureArrivee: "07:30" } })).toBe("Rapport de montage + heures");
    expect(natureDeSaisie({ url: `/api/projects/${P}`, body: { interventionsMontageCabines: "Cab1:…" } })).toBe("Interventions par lot");
    expect(natureDeSaisie({ url: `/api/projects/${P}`, body: { etatCMD: "Terminé" } })).toBe("Etat cmd");
    expect(natureDeSaisie({ url: `/api/pdf/${P}?send=1` })).toBe("Envoi du rapport (PDF)");
    expect(nomDuChamp("photosSituations")).toBe("Liste des photos");
  });

  it("retrouve le projet d'une saisie", () => {
    expect(projetDeSaisie({ url: `/api/projects/${P}` })).toBe(P);
    expect(projetDeSaisie({ url: "/api/defauts", body: { projectId: P } })).toBe(P);
  });
});
