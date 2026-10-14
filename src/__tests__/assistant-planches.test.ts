import { describe, it, expect } from "vitest";
import {
  minimumRequis,
  comptePhotosGroupe,
  missingRequiredPhotos,
  BUCKET_HINT,
} from "@/lib/photo-buckets";

/**
 * Ce que l'assistant exige planche par planche.
 *
 * Le même chiffre sert à deux endroits — le bouton « Suivant » et le contrôle
 * d'envoi. S'ils divergeaient, un monteur franchirait une planche pour se
 * faire refuser le rapport à la fin, sans comprendre lequel des deux a
 * raison. Ces tests tiennent les deux ensemble.
 */

const AVANT = ["AVANT_INTERVENTION"] as const;
const MONTAGE = ["MONTAGE_GAUCHE", "MONTAGE_CENTRE", "MONTAGE_DROITE"] as const;
const APRES = ["APRES_INTERVENTION"] as const;

describe("minimumRequis", () => {
  it("reprend les minimums qui bloquent déjà l'envoi", () => {
    expect(minimumRequis(AVANT)).toBe(2);
    expect(minimumRequis(MONTAGE)).toBe(3);
    expect(minimumRequis(APRES)).toBe(2);
  });

  it("ne bloque pas sur ce qui reste facultatif", () => {
    expect(minimumRequis(["QR_CODE"])).toBe(0);
    expect(minimumRequis(["GARANTIE"])).toBe(0);
    expect(minimumRequis(["VIDEO_MONTAGE"])).toBe(0);
    expect(minimumRequis(["DEMONTAGE"])).toBe(0);
  });

  it("ne confond pas une partie du montage avec le montage entier", () => {
    expect(minimumRequis(["MONTAGE_GAUCHE"])).toBe(0);
  });

  it("dit la même chose que l'instruction affichée sous le titre", () => {
    /* « 1 photo des lieux + 1 photo de l'état du receveur » = 2. */
    const compterPhotos = (hint: string) =>
      [...hint.matchAll(/(\d+)\s+photos?/gi)].reduce((s, m) => s + Number(m[1]), 0);
    expect(compterPhotos(BUCKET_HINT.AVANT_INTERVENTION || "")).toBe(minimumRequis(AVANT));
    expect(compterPhotos(BUCKET_HINT.APRES_INTERVENTION || "")).toBe(minimumRequis(APRES));
  });
});

describe("comptePhotosGroupe", () => {
  const projet = {
    photosAvant: [
      { name: "Avant intervention.1.1.jpg", url: "u1" },
      { name: "Avant intervention.2.2.jpg", url: "u2" },
    ],
    photosMontage: [
      { name: "Montage gauche.1.3.jpg", url: "u3" },
      { name: "Montage centre.1.4.jpg", url: "u4" },
    ],
  };

  it("additionne les trois vues du montage en un seul compte", () => {
    expect(comptePhotosGroupe(projet, MONTAGE)).toBe(2);
    expect(comptePhotosGroupe(projet, AVANT)).toBe(2);
    expect(comptePhotosGroupe(projet, APRES)).toBe(0);
  });

  it("franchir une planche, c'est ne plus la voir manquer à l'envoi", () => {
    const manquantes = missingRequiredPhotos(projet, { multiCabine: false, nbCabines: 1 });
    const libelles = manquantes.map((m) => m.label);
    /* L'avant est complet (2/2) : il a passé le bouton, il ne revient pas. */
    expect(comptePhotosGroupe(projet, AVANT)).toBeGreaterThanOrEqual(minimumRequis(AVANT));
    expect(libelles).not.toContain("Photos avant intervention");
    /* Le montage est à 2/3 : l'assistant le retient, l'envoi aussi. */
    expect(comptePhotosGroupe(projet, MONTAGE)).toBeLessThan(minimumRequis(MONTAGE));
    expect(libelles).toContain("Photos montage");
  });
});
