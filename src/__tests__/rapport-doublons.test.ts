import { describe, it, expect } from "vitest";
import { normalizeRapportMonteur, clePhrase, accorderPhrase } from "@/lib/rapport";

const CLIENT_SING = "Client présent lors du montage, travaux validés par client.";
const CLIENT_PLUR = "Client présent lors des montages, travaux validés par client.";
const SANS_ENC_SING = "L'installation s'est déroulée sans encombre.";
const SANS_ENC_PLUR = "Les installations se sont déroulées sans encombre.";

describe("clePhrase", () => {
  it("apparie le singulier et le pluriel d'une phrase type", () => {
    /* Le rapport général propose le pluriel, le rapport par cabine le
       singulier, et les deux écrivent dans le même champ. */
    expect(clePhrase(CLIENT_SING)).toBe(clePhrase(CLIENT_PLUR));
    expect(clePhrase(SANS_ENC_SING)).toBe(clePhrase(SANS_ENC_PLUR));
  });

  it("ignore casse, accents, ponctuation et espaces en trop", () => {
    expect(clePhrase("  CLIENT  PRESENT lors du montage, travaux valides par client  "))
      .toBe(clePhrase(CLIENT_SING));
  });

  it("ne confond pas deux phrases différentes", () => {
    expect(clePhrase(CLIENT_SING)).not.toBe(clePhrase(SANS_ENC_SING));
    expect(clePhrase("Personne sur site lors du montage."))
      .not.toBe(clePhrase(CLIENT_SING));
  });
});

describe("accorderPhrase", () => {
  it("met la phrase au nombre du chantier", () => {
    expect(accorderPhrase(CLIENT_PLUR, 1)).toBe(CLIENT_SING);
    expect(accorderPhrase(CLIENT_SING, 3)).toBe(CLIENT_PLUR);
    expect(accorderPhrase(SANS_ENC_PLUR, 1)).toBe(SANS_ENC_SING);
  });

  it("laisse la ligne telle quelle quand le nombre est inconnu", () => {
    expect(accorderPhrase(CLIENT_PLUR, null)).toBe(CLIENT_PLUR);
    expect(accorderPhrase(CLIENT_PLUR, 0)).toBe(CLIENT_PLUR);
  });

  it("ne touche pas à une phrase libre", () => {
    expect(accorderPhrase("Joint silicone refait côté mur.", 3))
      .toBe("Joint silicone refait côté mur.");
  });
});

describe("normalizeRapportMonteur — doublons", () => {
  it("ne garde qu'une fois la même indication, singulier ou pluriel", () => {
    /* Le cas vu sur le rapport du 14 octobre 2026, projet TM-2600825 :
       « Client présent lors des montages… » puis, deux lignes plus bas,
       « Client présent lors du montage… ». Le client lisait deux fois la
       même chose. */
    const brut = [
      CLIENT_PLUR,
      SANS_ENC_SING,
      CLIENT_SING,
    ].join("\n");
    const sortie = normalizeRapportMonteur(brut, { nbCabines: 1 });
    expect(sortie.split("\n")).toEqual([CLIENT_SING, SANS_ENC_SING]);
  });

  it("accorde la phrase retenue au nombre de cabines", () => {
    const brut = [CLIENT_SING, CLIENT_PLUR].join("\n");
    expect(normalizeRapportMonteur(brut, { nbCabines: 4 })).toBe(CLIENT_PLUR);
    expect(normalizeRapportMonteur(brut, { nbCabines: 1 })).toBe(CLIENT_SING);
  });

  it("écarte un doublon qui ne diffère que par la casse ou les espaces", () => {
    const brut = "Joint silicone refait.\njoint  silicone  refait";
    expect(normalizeRapportMonteur(brut)).toBe("Joint silicone refait.");
  });

  it("garde les phrases qui disent des choses différentes", () => {
    const brut = [SANS_ENC_SING, "Personne sur site lors du montage.", CLIENT_SING].join("\n");
    expect(normalizeRapportMonteur(brut, { nbCabines: 1 }).split("\n")).toHaveLength(3);
  });

  it("laisse la même phrase sous deux lots différents", () => {
    /* Deux cabines peuvent s'être bien passées toutes les deux : ce n'est
       pas un doublon, c'est deux constats. */
    const brut = `A01 : ${SANS_ENC_SING}\n\nA02 : ${SANS_ENC_SING}`;
    const sortie = normalizeRapportMonteur(brut, { nbCabines: 2 });
    expect(sortie).toContain("A01 :");
    expect(sortie).toContain("A02 :");
  });

  it("écarte du général ce qu'un lot dit déjà, pluriel compris", () => {
    const brut = `${CLIENT_PLUR}\n\nA01 : ${CLIENT_SING}`;
    const sortie = normalizeRapportMonteur(brut, { nbCabines: 1 });
    expect(sortie).toBe(`A01 : ${CLIENT_SING}`);
  });

  it("supporte un rapport vide", () => {
    expect(normalizeRapportMonteur("")).toBe("");
    expect(normalizeRapportMonteur(null)).toBe("");
  });
});
