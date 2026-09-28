/**
 * Conformité photo.
 *
 * Le risque d'un tel indicateur est de désigner un fautif à tort : une cabine
 * sous-traitée, un projet sans responsable identifié ou un QR code absent ne
 * doivent jamais compter contre un monteur. C'est ce que ces cas vérifient,
 * autant que l'exactitude des pourcentages.
 */
import { describe, it, expect } from "vitest";
import { conformitePhotos, totalPhotos, type ProjetPhotos } from "../lib/photos-stats";

/** Fabrique les photos d'une cabine : n avant, n montage, n après. */
function photos(cab: number | null, avant: number, montage: number, apres: number) {
  const suffixe = cab ? `.Cab${cab}.` : ".";
  const faire = (prefixe: string, n: number) =>
    Array.from({ length: n }, (_, i) => ({ name: `${prefixe}${suffixe}${i}.jpg` }));
  return {
    photosAvant: faire("Avant intervention", avant),
    photosMontage: [...faire("Montage centre", montage), ...faire("Apres intervention", apres)],
  };
}

const BASE: ProjetPhotos = {
  id: "p1", ofrTM: "TM-1", projet: "Duka - Lot A", etatCMD: "Terminé",
  nbCabines: 1, collaborateurs: "Miguel", attributionCabines: "",
  monteursSousTraitance: "", typeServices: [],
  photosAvant: [], photosMontage: [], photosDemontage: [], photosQRCode: [], photosGaranties: [],
};

const p = (o: Partial<ProjetPhotos>): ProjetPhotos => ({ ...BASE, ...o });

describe("comptage des photos", () => {
  it("une cabine complète ne manque de rien", () => {
    const [l] = conformitePhotos([p({ ...photos(null, 2, 3, 2) })], "monteur");
    expect(l.attendues).toBe(7);
    expect(l.manquantes).toBe(0);
    expect(l.tauxManquant).toBe(0);
    expect(l.projetsIncomplets).toEqual([]);
  });

  it("compte exactement ce qui manque", () => {
    // 1 avant sur 2, 1 montage sur 3, 0 après sur 2 → 5 manquantes sur 7.
    const [l] = conformitePhotos([p({ ...photos(null, 1, 1, 0) })], "monteur");
    expect(l.manquantes).toBe(5);
    expect(l.tauxManquant).toBe(71);
    expect(l.projetsIncomplets).toHaveLength(1);
  });

  it("ne compte ni le QR code ni la garantie", () => {
    const complet = p({ ...photos(null, 2, 3, 2) });
    const [avec] = conformitePhotos([{
      ...complet,
      photosQRCode: [{ name: "QR Code.1.jpg" }],
      photosGaranties: [{ name: "Garantie.1.jpg" }],
    }], "monteur");
    const [sans] = conformitePhotos([complet], "monteur");
    expect(avec.attendues).toBe(sans.attendues);
    expect(avec.manquantes).toBe(0);
  });

  it("ne récompense pas les photos en trop", () => {
    const [l] = conformitePhotos([p({ ...photos(null, 5, 5, 0) })], "monteur");
    // Les deux photos « après » manquent toujours, malgré l'excès ailleurs.
    expect(l.manquantes).toBe(2);
  });
});

describe("attribution", () => {
  it("impute chaque cabine à son propre monteur", () => {
    const projet = p({
      nbCabines: 2, collaborateurs: "Miguel & Claudio",
      attributionCabines: "Cab1:Miguel | Cab2:Claudio",
      ...(() => {
        const a = photos(1, 2, 3, 2), b = photos(2, 0, 0, 0);
        return {
          photosAvant: [...a.photosAvant, ...b.photosAvant],
          photosMontage: [...a.photosMontage, ...b.photosMontage],
        };
      })(),
    });
    const lignes = conformitePhotos([projet], "monteur");
    const miguel = lignes.find((l) => l.nom === "Miguel")!;
    const claudio = lignes.find((l) => l.nom === "Claudio")!;
    expect(miguel.manquantes).toBe(0);
    expect(claudio.manquantes).toBe(7);
    expect(claudio.projetsIncomplets).toHaveLength(1);
    expect(miguel.projetsIncomplets).toEqual([]);
  });

  it("engage les deux monteurs d'un binôme sur les mêmes cabines", () => {
    const lignes = conformitePhotos(
      [p({ collaborateurs: "Miguel & Claudio", ...photos(null, 1, 3, 2) })], "monteur");
    expect(lignes.map((l) => l.nom).sort()).toEqual(["Claudio", "Miguel"]);
    lignes.forEach((l) => {
      expect(l.attendues).toBe(7);
      expect(l.manquantes).toBe(1);
    });
  });

  it("regroupe le binôme en une seule ligne sur l'axe équipe", () => {
    const lignes = conformitePhotos(
      [p({ collaborateurs: "Miguel & Claudio", ...photos(null, 2, 3, 2) })], "equipe");
    expect(lignes).toHaveLength(1);
    expect(lignes[0].nom).toBe("Miguel & Claudio");
  });
});

describe("ce qui ne doit compter contre personne", () => {
  it("les cabines sous-traitées", () => {
    expect(conformitePhotos(
      [p({ monteursSousTraitance: "Sous-traitant X" })], "monteur")).toEqual([]);
  });

  it("les projets non terminés", () => {
    expect(conformitePhotos([p({ etatCMD: "RDV - fixé" })], "monteur")).toEqual([]);
  });

  it("les interventions de service pures", () => {
    expect(conformitePhotos([p({ typeServices: ["Services"] })], "monteur")).toEqual([]);
  });

  it("les projets sans responsable identifié", () => {
    expect(conformitePhotos(
      [p({ collaborateurs: "", attributionCabines: "" })], "monteur")).toEqual([]);
  });
});

describe("classement et totaux", () => {
  it("place le plus rigoureux en tête", () => {
    const lignes = conformitePhotos([
      p({ id: "a", collaborateurs: "Bon", ...photos(null, 2, 3, 2) }),
      p({ id: "b", collaborateurs: "Moins bon", ...photos(null, 0, 0, 0) }),
    ], "monteur");
    expect(lignes.map((l) => l.nom)).toEqual(["Bon", "Moins bon"]);
  });

  it("ne totalise que sur l'axe équipe, où chaque cabine ne compte qu'une fois", () => {
    const projets = [p({ collaborateurs: "Miguel & Claudio", ...photos(null, 1, 3, 2) })];
    expect(totalPhotos(conformitePhotos(projets, "monteur"), "monteur")).toBeNull();
    const t = totalPhotos(conformitePhotos(projets, "equipe"), "equipe")!;
    expect(t.attendues).toBe(7);
    expect(t.manquantes).toBe(1);
  });
});
