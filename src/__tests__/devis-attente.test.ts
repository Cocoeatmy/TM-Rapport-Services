import { describe, it, expect } from "vitest";
import {
  numerosOffre, indexerParOffre, enrichirDevis, correspondMesures,
  dossierClos, etatDuDossier, devisRelancable, cleRelanceDevis,
  type DossierLie, type OffreAttente,
} from "@/lib/devis-attente";

const dossiers: DossierLie[] = [
  { id: "a", projet: "Dutoit - Cherbe Sandy", ofrTM: "TM-2500471", dateMesures: "2025-09-24T00:00:00.000+02:00", etatCMD: "Cabines mesurées", typeClient: "Grossistes" },
  { id: "b", projet: "CANAsanitaire - Ilir", ofrTM: "TM-2500473", dateMesures: null, etatCMD: "Annulé", typeClient: "Sanitaires" },
  { id: "c", projet: "Deux lots", ofrTM: "TM-2600783, TM-2600784", dateMesures: null, etatCMD: "À commander" },
];

const offres: OffreAttente[] = [
  { nr: "TM-2500471", titre: "Cherbe", total: 1611, date: "2025-09-24", jours: 384 },
  { nr: "TM-2500473", titre: "Ilir", total: 2336, date: "2025-09-25", jours: 383 },
  { nr: "TM-2600784", titre: "Lot 2", total: 900, date: "2026-09-01", jours: 42 },
  { nr: "TM-9999999", titre: "Sans dossier", total: 500, date: "2026-08-01", jours: 73 },
];

describe("numerosOffre", () => {
  it("accepte les séparateurs qu'on rencontre à la saisie", () => {
    expect(numerosOffre("TM-1, TM-2; TM-3 / TM-4\nTM-5"))
      .toEqual(["TM-1", "TM-2", "TM-3", "TM-4", "TM-5"]);
  });
  it("normalise la casse et supporte le vide", () => {
    expect(numerosOffre("tm-2500471")).toEqual(["TM-2500471"]);
    expect(numerosOffre(null)).toEqual([]);
  });
});

describe("indexerParOffre", () => {
  it("indexe chaque numéro d'un dossier qui en porte plusieurs", () => {
    const idx = indexerParOffre(dossiers);
    expect(idx.get("TM-2600783")?.id).toBe("c");
    expect(idx.get("TM-2600784")?.id).toBe("c");
  });

  it("garde le PREMIER dossier d'un numéro en double", () => {
    /* La liste arrive du plus récent au plus ancien : c'est le dossier
       vivant qu'on veut, pas son doublon archivé. */
    const idx = indexerParOffre([
      { id: "vivant", projet: "A", ofrTM: "TM-1" },
      { id: "doublon", projet: "B", ofrTM: "TM-1" },
    ]);
    expect(idx.get("TM-1")?.id).toBe("vivant");
  });
});

describe("enrichirDevis", () => {
  const lignes = enrichirDevis(offres, indexerParOffre(dossiers), {
    [cleRelanceDevis("TM-2500471")]: ["2026-09-01", "2026-10-01"],
  });

  it("rattache le dossier et sa date de relevé", () => {
    expect(lignes[0].projetId).toBe("a");
    expect(lignes[0].dateMesures).toBe("2025-09-24");
  });

  it("laisse sans dossier ce qui n'en a pas", () => {
    expect(lignes[3].projetId).toBeUndefined();
    expect(lignes[3].dateMesures).toBeUndefined();
  });

  it("retrouve un dossier par son deuxième numéro d'offre", () => {
    expect(lignes[2].projetId).toBe("c");
  });

  it("compte les relances du devis, et d'aucun autre", () => {
    expect(lignes[0].relance.nombre).toBe(2);
    expect(lignes[0].relance.derniere).toBe("2026-10-01");
    expect(lignes[1].relance.nombre).toBe(0);
  });

  it("garde intactes les données bexio", () => {
    expect(lignes[0].total).toBe(1611);
    expect(lignes[0].jours).toBe(384);
  });
});

describe("correspondMesures", () => {
  const lignes = enrichirDevis(offres, indexerParOffre(dossiers));
  const [avecReleve, annule, sansReleve, orphelin] = lignes;

  it("sans filtre, tout passe", () => {
    for (const l of lignes) expect(correspondMesures(l, "")).toBe(true);
  });

  it("sépare le relevé fait du relevé à faire", () => {
    expect(correspondMesures(avecReleve, "avec")).toBe(true);
    expect(correspondMesures(sansReleve, "avec")).toBe(false);
    expect(correspondMesures(sansReleve, "sans")).toBe(true);
    expect(correspondMesures(avecReleve, "sans")).toBe(false);
  });

  it("n'appelle pas « sans relevé » un devis dont on ignore tout", () => {
    /* Sans dossier Notion, on ne SAIT pas si le relevé a eu lieu. Le ranger
       dans « pas encore de relevé » ferait passer l'ignorance pour une
       information. Il a sa propre case. */
    expect(correspondMesures(orphelin, "sans")).toBe(false);
    expect(correspondMesures(orphelin, "orphelin")).toBe(true);
    expect(correspondMesures(avecReleve, "orphelin")).toBe(false);
  });

  it("le dossier annulé reste visible — c'est justement ce qu'on veut voir", () => {
    expect(correspondMesures(annule, "")).toBe(true);
  });
});

describe("etatDuDossier", () => {
  const ligne = (etatCMD: string | null, avecDossier = true) =>
    enrichirDevis(
      [{ nr: "TM-1", titre: "x", total: 0, date: "2026-01-01", jours: 1 }],
      avecDossier ? indexerParOffre([{ id: "z", projet: "P", ofrTM: "TM-1", etatCMD }]) : new Map(),
    )[0];

  it("suit les groupes que Notion porte sur « État - CMD »", () => {
    /* À faire → le devis attend encore. En cours → la commande existe.
       Terminé → le chantier est clos. C'est le classement de l'entreprise,
       pas le nôtre. */
    expect(etatDuDossier(ligne("Cabines mesurées"))).toBe("ouvert");
    expect(etatDuDossier(ligne("OFR envoyées sans mesures"))).toBe("ouvert");
    expect(etatDuDossier(ligne("En attente de mesures"))).toBe("ouvert");

    for (const e of ["RDV - fixé", "Cabines en CMD", "Récéptionné - RDV à fixer",
                     "Livraison partielle", "Montage partiel", "Soucis montage",
                     "RDV - Attendre news", "Cabines à recevoir", "Soucis livraison",
                     "Cabine à aller chercher"]) {
      expect(etatDuDossier(ligne(e)), e).toBe("engage");
    }

    expect(etatDuDossier(ligne("Annulé"))).toBe("clos");
    expect(etatDuDossier(ligne("Terminé"))).toBe("clos");
  });

  it("distingue « on ne sait pas » de « c'est ouvert »", () => {
    expect(etatDuDossier(ligne(null, false))).toBe("inconnu");
    expect(etatDuDossier(ligne(""))).toBe("ouvert");
  });

  it("laisse relançable un état que Notion aurait ajouté depuis", () => {
    /* Une relance de trop s'écarte d'un coup d'œil ; un dossier qui
       disparaît sans le dire ne se retrouve pas. */
    expect(etatDuDossier(ligne("Nouvel état inventé"))).toBe("ouvert");
    expect(devisRelancable(ligne("Nouvel état inventé"))).toBe(true);
  });

  it("n'autorise la relance que sur un devis qui attend vraiment", () => {
    expect(devisRelancable(ligne("Cabines mesurées"))).toBe(true);
    expect(devisRelancable(ligne(null, false))).toBe(true);
    expect(devisRelancable(ligne("RDV - fixé"))).toBe(false);
    expect(devisRelancable(ligne("Annulé"))).toBe(false);
  });

  it("dossierClos ne vise que les chantiers annulés ou terminés", () => {
    expect(dossierClos(ligne("Annulé"))).toBe(true);
    expect(dossierClos(ligne("RDV - fixé"))).toBe(false);
  });
});
