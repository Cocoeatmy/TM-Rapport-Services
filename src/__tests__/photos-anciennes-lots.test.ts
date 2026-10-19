/**
 * Les anciennes photos d'un chantier passé à plusieurs lots.
 *
 * TEST 5 (19.10.2026) : créé avec un lot, porté ensuite à cinq. Ses photos du
 * premier lot, prises sans marque « .CabN. », n'étaient plus comptées pour le
 * lot 1 : « 0/2, 0/3, 0/2 », finalisation bloquée. Elles sont désormais au
 * lot 1 — à la lecture seulement, sans rien réécrire.
 */
import { describe, it, expect } from "vitest";
import { appartientAuLot, lotDeLaPhoto, filterByBucket, missingRequiredPhotos, comptePhotosGroupe } from "@/lib/photo-buckets";

const ph = (name: string) => ({ name, url: `https://c.test/${encodeURIComponent(name)}` });

/* Les noms exacts de TEST 5 : lot 1 sans marque, lots 2 et 3 marqués. */
const projet = {
  photosAvant: [
    ph("Avant intervention.1.1792000180081.jpg"), ph("Avant intervention.2.1792001831507.jpg"),
    ph("Avant intervention.Cab2.1.1792181063989.jpg"), ph("Avant intervention.Cab2.2.1792181084080.p1790105133000.jpg"),
  ],
  photosMontage: [
    ph("Montage gauche.1.1792001842048.jpg"), ph("Montage gauche.2.1792001852198.jpg"), ph("Montage gauche.3.1792001858734.jpg"),
    ph("Apres intervention.1.1792001866368.jpg"), ph("Apres intervention.2.1792001872184.jpg"),
    ph("Montage gauche.Cab2.1.1792181112026.jpg"), ph("Montage gauche.Cab2.2.1792181118704.jpg"), ph("Montage gauche.Cab2.3.1792181124483.jpg"),
    ph("Apres intervention.Cab2.1.1792181137579.jpg"), ph("Apres intervention.Cab2.2.1792181144916.jpg"),
  ],
};

describe("le lot d'une photo", () => {
  it("une photo marquée garde son lot ; une ancienne sans marque va au lot 1 sur un chantier à plusieurs lots", () => {
    expect(lotDeLaPhoto("Montage gauche.Cab3.2.1792355800334.jpg", true)).toBe(3);
    expect(lotDeLaPhoto("Montage gauche.1.1792001842048.jpg", true)).toBe(1);
    expect(lotDeLaPhoto("Montage gauche.1.1792001842048.jpg", false)).toBeNull(); // chantier à un lot : inchangé
  });

  it("une ancienne photo n'appartient qu'au lot 1, jamais à un autre", () => {
    const n = "Avant intervention.1.1792000180081.jpg";
    expect(appartientAuLot(n, 1)).toBe(true);
    expect(appartientAuLot(n, 2)).toBe(false);
    expect(appartientAuLot("Avant intervention.Cab2.1.1792181063989.jpg", 1)).toBe(false);
  });
});

describe("les photos obligatoires d'un chantier passé à plusieurs lots", () => {
  it("le lot 1 compte ses anciennes photos : plus de blocage pour lui", () => {
    expect(comptePhotosGroupe(projet, ["AVANT_INTERVENTION"], 1)).toBe(2);
    expect(comptePhotosGroupe(projet, ["MONTAGE_GAUCHE", "MONTAGE_CENTRE", "MONTAGE_DROITE"], 1)).toBe(3);
    expect(comptePhotosGroupe(projet, ["APRES_INTERVENTION"], 1)).toBe(2);
    const manque = missingRequiredPhotos(projet, { multiCabine: true, nbCabines: 2 });
    expect(manque.filter((m) => m.label.startsWith("Cabine 1"))).toEqual([]);
    expect(manque.filter((m) => m.label.startsWith("Cabine 2"))).toEqual([]);
  });

  it("aucune photo comptée deux fois : le lot 2 n'en hérite pas", () => {
    expect(comptePhotosGroupe(projet, ["AVANT_INTERVENTION"], 2)).toBe(2);
    expect(comptePhotosGroupe(projet, ["MONTAGE_GAUCHE", "MONTAGE_CENTRE", "MONTAGE_DROITE"], 2)).toBe(3);
  });

  it("un chantier à un seul lot est inchangé", () => {
    const mono = { photosAvant: [ph("Avant intervention.1.1.jpg")], photosMontage: [] };
    const manque = missingRequiredPhotos(mono, { multiCabine: false, nbCabines: 1 });
    expect(manque.some((m) => m.label.startsWith("Cabine"))).toBe(false);
    expect(manque.find((m) => /avant/i.test(m.label))?.have).toBe(1);
    expect(filterByBucket(mono.photosAvant, "AVANT_INTERVENTION")).toHaveLength(1);
  });
});

describe("réécrire la liste d'un lot ne dédouble ni ne perd rien", () => {
  /* Ce que fait la fiche à une suppression : garder ce qui n'est PAS au lot,
     puis remettre les photos restantes du lot. Même règle des deux côtés. */
  function apresSuppression(liste: { name: string; url: string }[], lot: number, aRetirer: string) {
    const duLot = liste.filter((f) => appartientAuLot(f.name, lot));
    const garde = liste.filter((f) => !appartientAuLot(f.name, lot));
    return [...garde, ...duLot.filter((f) => f.name !== aRetirer)];
  }

  it("supprimer une ancienne photo du lot 1 : elle seule part, aucune autre n'est dédoublée", () => {
    const avant = projet.photosAvant;
    const apres = apresSuppression(avant, 1, "Avant intervention.1.1792000180081.jpg");
    expect(apres).toHaveLength(avant.length - 1);
    expect(new Set(apres.map((f) => f.url)).size).toBe(apres.length);
    expect(apres.map((f) => f.name)).not.toContain("Avant intervention.1.1792000180081.jpg");
  });

  it("supprimer une photo du lot 2 ne touche pas aux anciennes du lot 1", () => {
    const apres = apresSuppression(projet.photosAvant, 2, "Avant intervention.Cab2.1.1792181063989.jpg");
    expect(apres.map((f) => f.name)).toContain("Avant intervention.1.1792000180081.jpg");
    expect(apres.map((f) => f.name)).toContain("Avant intervention.2.1792001831507.jpg");
    expect(apres).toHaveLength(projet.photosAvant.length - 1);
  });

  it("chaque photo appartient à exactement un lot", () => {
    for (const f of [...projet.photosAvant, ...projet.photosMontage]) {
      expect([1, 2, 3, 4, 5].filter((l) => appartientAuLot(f.name, l))).toHaveLength(1);
    }
  });
});
