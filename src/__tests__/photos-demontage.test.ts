import { describe, it, expect } from "vitest";
import {
  missingOptionalPhotoLabels, chantierAvecDemontage,
  type ProjectPhotoSources,
} from "@/lib/photo-buckets";

const MONO = { multiCabine: false, nbCabines: 1 };
/** Un chantier sans la moindre photo : tous les rappels possibles se lèvent. */
const vide: ProjectPhotoSources = {};

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

describe("missingOptionalPhotoLabels — rappel démontage", () => {
  it("se tait sur un chantier SANS démontage", () => {
    /* Le rappel se levait à chaque enregistrement, même sur un montage
       simple. Un rappel qui sort toujours finit par se cliquer sans être
       lu — y compris les fois où il avait raison. */
    const labels = missingOptionalPhotoLabels({ ...vide, typeServices: ["Montages"] }, MONO);
    expect(labels).not.toContain("Photos démontage");
  });

  it("le réclame quand le chantier comporte un démontage", () => {
    const labels = missingOptionalPhotoLabels({ ...vide, typeServices: ["Montages", "Démontage"] }, MONO);
    expect(labels).toContain("Photos démontage");
  });

  it("se tait aussi quand les photos de démontage sont là", () => {
    const labels = missingOptionalPhotoLabels(
      { typeServices: ["Démontage"], photosDemontage: [{ name: "demontage-1.jpg" }] },
      MONO,
    );
    expect(labels).not.toContain("Photos démontage");
  });

  it("ne touche pas aux autres rappels", () => {
    /* QR Code et Garantie ne dépendent pas du type de services. */
    const labels = missingOptionalPhotoLabels({ ...vide, typeServices: ["Montages"] }, MONO);
    expect(labels).toContain("Photos QR Code");
    expect(labels).toContain("Photos Garantie");
  });

  it("vaut cabine par cabine en multi-cabine", () => {
    const labels = missingOptionalPhotoLabels(
      { ...vide, typeServices: ["Montages"] },
      { multiCabine: true, nbCabines: 2 },
    );
    expect(labels.some((l) => l.includes("démontage"))).toBe(false);
    expect(labels).toContain("Cabine 1 — Photos QR Code");
    expect(labels).toContain("Cabine 2 — Photos QR Code");
  });
});
