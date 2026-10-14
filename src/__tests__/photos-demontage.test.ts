import { describe, it, expect } from "vitest";
import {
  chantierAvecDemontage,
  minimumRequis,
  BUCKETS_DECLARABLES_ABSENTS,
  LIBELLE_ABSENCE,
} from "@/lib/photo-buckets";

describe("chantierAvecDemontage", () => {
  it("lit la colonne « Type de services »", () => {
    expect(chantierAvecDemontage({ typeServices: ["Montages", "Démontage"] })).toBe(true);
    expect(chantierAvecDemontage({ typeServices: ["Montages"] })).toBe(false);
  });

  it("tolère l'accent et la casse de la saisie", () => {
    expect(chantierAvecDemontage({ typeServices: ["demontage"] })).toBe(true);
    expect(chantierAvecDemontage({ typeServices: ["DÉMONTAGE"] })).toBe(true);
  });

  it("répond non quand la colonne est vide ou absente", () => {
    expect(chantierAvecDemontage({ typeServices: [] })).toBe(false);
    expect(chantierAvecDemontage({})).toBe(false);
    expect(chantierAvecDemontage({ typeServices: null })).toBe(false);
  });
});

/**
 * Ce qui a remplacé le rappel « photos recommandées non ajoutées », retiré le
 * 14 octobre 2026. Les trois cas qu'il couvrait sont maintenant traités à la
 * source, et ces tests disent lesquels.
 */
describe("plus de rappel contournable", () => {
  it("le démontage ne bloque jamais : oublié dans Notion, il s'ajoute à la main", () => {
    /* La planche démontage n'apparaît que si le chantier en comporte un, et
       le bouton « + Ajouter démontage » de la planche « avant intervention »
       la fait apparaître quand la colonne Notion n'a pas été remplie. Rien
       n'est donc exigé de ce côté. */
    expect(minimumRequis(["DEMONTAGE"])).toBe(0);
  });

  it("le QR code, la garantie et la vidéo se déclarent absents", () => {
    expect(BUCKETS_DECLARABLES_ABSENTS).toEqual(["QR_CODE", "GARANTIE", "VIDEO_MONTAGE"]);
    expect(LIBELLE_ABSENCE.QR_CODE).toBe("Pas de QR Code");
    expect(LIBELLE_ABSENCE.GARANTIE).toBe("Pas de garantie");
    expect(LIBELLE_ABSENCE.VIDEO_MONTAGE).toBe("Pas de vidéo");
  });

  it("aucune de ces trois planches n'exige de photo", () => {
    for (const b of BUCKETS_DECLARABLES_ABSENTS) expect(minimumRequis([b])).toBe(0);
  });

  it("seules les trois planches du travail restent exigées", () => {
    expect(minimumRequis(["AVANT_INTERVENTION"])).toBe(2);
    expect(minimumRequis(["MONTAGE_GAUCHE", "MONTAGE_CENTRE", "MONTAGE_DROITE"])).toBe(3);
    expect(minimumRequis(["APRES_INTERVENTION"])).toBe(2);
  });
});
