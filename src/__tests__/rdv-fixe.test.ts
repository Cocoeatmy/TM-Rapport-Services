import { describe, it, expect } from "vitest";
import {
  rdvMontageFixe, rdvMesuresFixe, rdvServicesFixe,
  rdvMontageAFixer, rdvServicesAFixer,
} from "@/lib/rdv-a-fixer";
import { prochaineDateSavPlanifiee, comptesSavParCabine, resumeSav } from "@/lib/sav-cabines";

/**
 * Les rendez-vous déjà calés, comptés par métier.
 *
 * Une seule tuile les réunissait tous : trente-six projets dans un
 * chiffre, où un montage de la semaine et une prise de mesures du mois
 * prochain pesaient pareil. On ne prépare pourtant pas une journée de
 * montage comme une tournée de mesures.
 *
 * La règle doit être le MIROIR exact de celle des « à fixer » — même
 * partage entre Montage et Services — sinon un chantier se retrouverait
 * dans « Montage à fixer » puis dans « Services fixés », et les deux
 * lignes de tuiles ne se répondraient plus.
 */

const projet = (p: Record<string, unknown>) => p as never;

describe("rendez-vous fixés, par métier", () => {
  it("un montage fixé n'est pas un service fixé", () => {
    const p = projet({ etatCMD: "RDV - fixé", typeServices: ["Montages"] });
    expect(rdvMontageFixe(p)).toBe(true);
    expect(rdvServicesFixe(p)).toBe(false);
  });

  it("un service fixé n'est pas un montage fixé", () => {
    const p = projet({ etatCMD: "RDV - fixé", typeServices: ["Services"] });
    expect(rdvServicesFixe(p)).toBe(true);
    expect(rdvMontageFixe(p)).toBe(false);
  });

  it("le partage Montage / Services est le MÊME que pour « à fixer »", () => {
    /* Sinon un chantier passerait de « Montage à fixer » à « Services
       fixés » en changeant seulement d'état, et le compte deviendrait
       incompréhensible. */
    for (const types of [["Montages"], ["Services"], ["Montages", "Services"], []]) {
      const aFixer = projet({ etatCMD: "Récéptionné - RDV à fixer", typeServices: types });
      const fixe = projet({ etatCMD: "RDV - fixé", typeServices: types });
      expect(rdvMontageAFixer(aFixer), JSON.stringify(types)).toBe(rdvMontageFixe(fixe));
      expect(rdvServicesAFixer(aFixer), JSON.stringify(types)).toBe(rdvServicesFixe(fixe));
    }
  });

  it("« RDV - Fixé » et « RDV - fixé » sont le même état", () => {
    /* Les mesures l'écrivent avec une majuscule, les commandes sans :
       deux mains, un seul état. */
    expect(rdvMesuresFixe(projet({ etatMesures: "RDV - Fixé" }))).toBe(true);
    expect(rdvMesuresFixe(projet({ etatMesures: "RDV - fixé" }))).toBe(true);
    expect(rdvMontageFixe(projet({ etatCMD: "RDV - Fixé" }))).toBe(true);
  });

  it("un état qui n'est pas « fixé » ne compte pas", () => {
    for (const e of ["Récéptionné - RDV à fixer", "Terminé", "", null]) {
      expect(rdvMontageFixe(projet({ etatCMD: e })), String(e)).toBe(false);
      expect(rdvMesuresFixe(projet({ etatMesures: e })), String(e)).toBe(false);
    }
  });
});

describe("date du prochain passage SAV", () => {
  it("retient la plus PROCHE parmi les lots ouverts", () => {
    /* C'est elle qui dit quand l'équipe repasse. */
    expect(prochaineDateSavPlanifiee({
      causeSavCabines: "Cab1:a | Cab2:b",
      datesRdvSavCabines: "Cab1:2026-11-20",
      interventionsSavCabines: "Cab2:2026-10-19~Miguel",
    })).toBe("2026-10-19");
  });

  it("ignore les lots clôturés", () => {
    expect(prochaineDateSavPlanifiee({
      causeSavCabines: "Cab1:a | Cab2:b",
      datesRdvSavCabines: "Cab1:2026-10-01 | Cab2:2026-11-20",
      datesSavClotureCabines: "Cab1:2026-10-02",
    })).toBe("2026-11-20");
  });

  it("ne rend rien quand aucune date n'est posée", () => {
    expect(prochaineDateSavPlanifiee({ causeSavCabines: "Cab1:a" })).toBe("");
    expect(prochaineDateSavPlanifiee({})).toBe("");
  });

  it("une date de passage rend le lot planifié, donc « fixé »", () => {
    /* Les deux listes SAV lisent la même source : un lot ne peut pas être
       à la fois « à fixer » et « fixé ». */
    const p = { causeSavCabines: "Cab2:Erreur TM", interventionsSavCabines: "Cab2:2026-10-19~Miguel" };
    expect(comptesSavParCabine(p).planifies).toBe(1);
    expect(comptesSavParCabine(p).aFixer).toBe(0);
    expect(prochaineDateSavPlanifiee(p)).toBe("2026-10-19");
  });
});

/**
 * Le résumé en tête de liste.
 *
 * « 0 cabine à fixer » en tête d'une liste de rendez-vous DÉJÀ fixés ne
 * veut rien dire : on n'annonce que ce qui est là.
 */
describe("résumé d'une liste SAV", () => {
  const c = (p: Partial<ReturnType<typeof comptesSavParCabine>>) =>
    ({ concernees: 0, aFixer: 0, planifies: 0, enAttentePiece: 0, regles: 0, detaille: true, ...p });

  it("ne parle pas de ce qui vaut zéro", () => {
    expect(resumeSav([c({ planifies: 1 })])).toBe("1 cabine planifiée");
    expect(resumeSav([c({ aFixer: 3 })])).toBe("3 cabines à fixer");
  });

  it("cite tout ce qui est présent, du plus urgent au plus calme", () => {
    expect(resumeSav([c({ aFixer: 2, enAttentePiece: 1, planifies: 1, regles: 4 })]))
      .toBe("2 cabines à fixer · 1 pièce attendue · 1 cabine planifiée · 4 cabines réglées");
  });

  it("additionne les projets d'une liste", () => {
    expect(resumeSav([c({ aFixer: 1 }), c({ aFixer: 2 }), c({ regles: 1 })]))
      .toBe("3 cabines à fixer · 1 cabine réglée");
  });

  it("signale ce qu'on ne sait pas trancher", () => {
    expect(resumeSav([c({ detaille: false })])).toBe("1 à vérifier");
  });

  it("le dit quand il n'y a rien", () => {
    expect(resumeSav([])).toBe("aucune cabine en SAV");
  });
});
