import { describe, it, expect } from "vitest";
import {
  estClos, jourPlus, materielNonReceptionne, chantierBloque,
  interventionNonTerminee, retardDeMontage, commandeEnRetard,
  devisEnAttente, facturesEchues, ageEnJours, OFFRE_EN_ATTENTE,
  type ChantierSignal,
} from "@/lib/signaux";

const AUJ = "2026-10-13";
const p = (x: Partial<ChantierSignal> = {}): ChantierSignal => ({ id: "p1", ...x });

describe("un chantier clos ne declenche plus rien", () => {
  it("terminé ou annulé, aucun signal", () => {
    expect(estClos(p({ etatCMD: "Terminé" }))).toBe(true);
    expect(estClos(p({ etatCMD: "Annulé" }))).toBe(true);
    expect(estClos(p({ etatCMD: "RDV - fixé" }))).toBe(false);
    for (const f of [materielNonReceptionne, retardDeMontage, commandeEnRetard]) {
      expect(f(p({ etatCMD: "Terminé", dateMontage: "2026-01-01", previsionLivraison: "2026-01-01" }), AUJ)).toBe(false);
    }
  });
});

describe("matériel non réceptionné", () => {
  const prochain = p({ etatCMD: "RDV - fixé", dateMontage: "2026-10-15", nbCabines: 2 });

  it("alerte quand la pose approche et que rien n'est au dépôt", () => {
    expect(materielNonReceptionne(prochain, AUJ)).toBe(true);
  });

  /* L'emplacement ne se renseigne qu'à la réception : rempli, la marchandise
     est là. */
  it("se tait dès que l'emplacement est renseigné", () => {
    expect(materielNonReceptionne({ ...prochain, emplacementCabine: "Dépôt TM" }, AUJ)).toBe(false);
  });

  /* Un chantier dans deux mois sans marchandise, c'est le cours normal des
     choses — pas une alerte. */
  it("ne regarde que les trois jours qui viennent", () => {
    expect(materielNonReceptionne({ ...prochain, dateMontage: "2026-12-01" }, AUJ)).toBe(false);
    expect(materielNonReceptionne({ ...prochain, dateMontage: "2026-10-16" }, AUJ)).toBe(true);
    expect(materielNonReceptionne({ ...prochain, dateMontage: "2026-10-17" }, AUJ)).toBe(false);
  });

  it("ignore le passé", () => {
    expect(materielNonReceptionne({ ...prochain, dateMontage: "2026-10-12" }, AUJ)).toBe(false);
  });

  it("se tait quand tout est déjà posé", () => {
    expect(materielNonReceptionne({ ...prochain, nbCabines: 2, nbCabinesInstallees: 2 }, AUJ)).toBe(false);
  });
});

describe("chantier bloqué", () => {
  it("une pièce manquante ouverte bloque la pose", () => {
    expect(chantierBloque(p({ etatCMD: "RDV - fixé" }), true)).toBe(true);
    expect(chantierBloque(p({ etatCMD: "RDV - fixé" }), false)).toBe(false);
  });
  it("le statut « Soucis montage » suffit, même sans signalement", () => {
    expect(chantierBloque(p({ etatCMD: "Soucis montage" }), false)).toBe(true);
  });
});

describe("intervention non terminée", () => {
  it("commencée et incomplète", () => {
    expect(interventionNonTerminee(p({ nbCabines: 4, nbCabinesInstallees: 2 }))).toBe(true);
  });
  it("rien de commencé, ou tout fini : ce n'est pas elle", () => {
    expect(interventionNonTerminee(p({ nbCabines: 4, nbCabinesInstallees: 0 }))).toBe(false);
    expect(interventionNonTerminee(p({ nbCabines: 4, nbCabinesInstallees: 4 }))).toBe(false);
    expect(interventionNonTerminee(p({ nbCabines: 0 }))).toBe(false);
  });
});

describe("retard de montage", () => {
  /* Les chantiers commencés sont ailleurs : un même chantier dans deux
     alertes ferait douter des deux. */
  it("date passée ET rien de posé", () => {
    expect(retardDeMontage(p({ dateMontage: "2026-10-09", nbCabines: 2 }), AUJ)).toBe(true);
    expect(retardDeMontage(p({ dateMontage: "2026-10-09", nbCabines: 2, nbCabinesInstallees: 1 }), AUJ)).toBe(false);
    expect(retardDeMontage(p({ dateMontage: "2026-10-20", nbCabines: 2 }), AUJ)).toBe(false);
    expect(retardDeMontage(p({ dateMontage: "" }), AUJ)).toBe(false);
  });
});

describe("commande en retard", () => {
  it("livraison annoncée dépassée, rien d'arrivé", () => {
    expect(commandeEnRetard(p({ previsionLivraison: "2026-10-01" }), AUJ)).toBe(true);
  });
  it("un arrivage vaut réception, même tardif", () => {
    expect(commandeEnRetard(p({ previsionLivraison: "2026-10-01", arrivageTM: "2026-10-10" }), AUJ)).toBe(false);
    expect(commandeEnRetard(p({ previsionLivraison: "2026-10-01", arrivageGrossiste: "2026-10-10" }), AUJ)).toBe(false);
  });
  it("sans date annoncée, rien à dire", () => {
    expect(commandeEnRetard(p({}), AUJ)).toBe(false);
  });
});

describe("devis sans réponse", () => {
  const o = (nr: string, date: string, statut: number) => ({ nr, titre: nr, total: 100, date, statut });

  it("ne retient que les offres en attente, et assez vieilles", () => {
    const l = devisEnAttente([
      o("A", "2026-10-01", OFFRE_EN_ATTENTE),  // 12 j
      o("B", "2026-10-11", OFFRE_EN_ATTENTE),  // 2 j — trop récent
      o("C", "2026-01-01", 3),                 // confirmée
      o("D", "2026-01-01", 4),                 // déclinée
    ], AUJ);
    expect(l.map((x) => x.nr)).toEqual(["A"]);
  });

  it("met la plus ancienne en premier", () => {
    const l = devisEnAttente([
      o("recent", "2026-09-01", OFFRE_EN_ATTENTE),
      o("vieux", "2026-02-01", OFFRE_EN_ATTENTE),
    ], AUJ);
    expect(l.map((x) => x.nr)).toEqual(["vieux", "recent"]);
  });

  it("compte les jours", () => {
    expect(ageEnJours("2026-10-06", AUJ)).toBe(7);
    expect(ageEnJours("2026-10-13", AUJ)).toBe(0);
  });
});

describe("factures échues", () => {
  const f = (nr: string, restant: number, echeance: string | null) =>
    ({ nr, titre: nr, total: 100, restant, echeance });

  it("échéance passée et solde restant", () => {
    const l = facturesEchues([
      f("due", 100, "2026-09-30"),
      f("payee", 0, "2026-09-30"),
      f("pasencore", 100, "2026-11-30"),
      f("sansecheance", 100, null),
    ], AUJ);
    expect(l.map((x) => x.nr)).toEqual(["due"]);
  });

  it("met la plus ancienne échéance en premier", () => {
    const l = facturesEchues([f("b", 10, "2026-09-30"), f("a", 10, "2026-05-01")], AUJ);
    expect(l.map((x) => x.nr)).toEqual(["a", "b"]);
  });
});

describe("décalage de jours", () => {
  it("franchit les mois", () => {
    expect(jourPlus("2026-10-30", 3)).toBe("2026-11-02");
    expect(jourPlus("2026-12-31", 1)).toBe("2027-01-01");
  });
});
