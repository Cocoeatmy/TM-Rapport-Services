import { describe, it, expect } from "vitest";
import {
  heuresPhotosDuJour, horodatageDuNom, lotDuNom,
  heuresPhotosSourcees, suffixePriseDeVue, priseDeVueDuNom,
} from "@/lib/heures-photos";

/**
 * L'heure que disent les photos.
 *
 * Elle se met à côté des heures saisies, sans les remplacer. Ce n'est PAS
 * l'EXIF : vérifié chez Cloudinary le 16 octobre 2026, nos images n'en
 * ont plus — la compression qui rend les envois fiables ré-encode le
 * fichier et détruit la date de prise de vue. C'est l'horodatage que
 * l'application inscrit dans le nom au moment où la photo entre dans la
 * file.
 */

/* Relevé réel sur TM-2600870, montage du 16 octobre 2026. */
const PROJET = {
  photosAvant: [
    { name: "Avant intervention.1.1792134148223.jpg" },   // 09:02
    { name: "Avant intervention.2.1792134148223.jpg" },
  ],
  photosMontage: [
    { name: "Montage gauche.1.1792134182687.jpg" },       // 09:03
    { name: "Apres intervention.1.1792134198676.jpg" },   // 09:03
  ],
  photosGaranties: [{ name: "Garantie.1.1792134345797.jpg" }], // 09:05
  photosQRCode: [{ name: "QR Code.1.1792134212994.jpg" }],
};

describe("horodatageDuNom", () => {
  it("lit les treize chiffres du nom", () => {
    expect(horodatageDuNom("Montage gauche.1.1792134182687.jpg")).toBe(1792134182687);
  });

  it("ne confond pas un numéro de commande avec une date", () => {
    expect(horodatageDuNom("601:3778.jpeg")).toBeNull();
    expect(horodatageDuNom("CMD Dubat n°01034212.pdf")).toBeNull();
    expect(horodatageDuNom("")).toBeNull();
  });

  it("refuse un horodatage hors du temps raisonnable", () => {
    expect(horodatageDuNom("photo.1.0000000000001.jpg")).toBeNull();
  });
});

describe("lotDuNom", () => {
  it("reconnaît le lot quand le nom le porte", () => {
    expect(lotDuNom("SAV demande.Cab12.1.1792134182687.jpeg")).toBe(12);
    expect(lotDuNom("Montage gauche.1.1792134182687.jpg")).toBeNull();
  });
});

describe("heuresPhotosDuJour", () => {
  it("LE CAS RÉEL : première et dernière photo du 16 octobre", () => {
    const h = heuresPhotosDuJour(PROJET, "2026-10-16");
    expect(h?.premiere).toBe("09:02");
    expect(h?.derniere).toBe("09:05");
    expect(h?.nombre).toBe(6);
  });

  it("IGNORE les photos de dépôt — cartons, bon de livraison, mesures", () => {
    /* Les cartons se photographient au dépôt, parfois le matin même :
       les compter avancerait l'heure d'arrivée sans raison visible. */
    const avec = {
      ...PROJET,
      photosCartonsRecus: [{ name: "Cartons.1.1792108800000.jpg" }],  // 02h du matin
      photosEtiquetteCarton: [{ name: "Etiquette.1.1792108800000.jpg" }],
      photosMesures: [{ name: "Mesures.1.1792108800000.jpg" }],
    };
    expect(heuresPhotosDuJour(avec, "2026-10-16")?.premiere).toBe("09:02");
  });

  it("ne retient QUE le jour demandé", () => {
    /* Sans ce filtre, une photo ajoutée la semaine d'avant ferait
       commencer la journée le lundi précédent. */
    const avec = {
      ...PROJET,
      photosMontage: [...PROJET.photosMontage, { name: "Montage.9.1791529382687.jpg" }],
    };
    const h = heuresPhotosDuJour(avec, "2026-10-16");
    expect(h?.premiere).toBe("09:02");
    expect(heuresPhotosDuJour(avec, "2026-10-09")?.nombre).toBe(1);
  });

  it("sépare les lots sur un chantier multi-cabines", () => {
    /* Mélanger les photos de la douche 1 et de la douche 7 donnerait une
       amplitude qui n'appartient à personne. */
    const multi = {
      photosMontage: [
        { name: "Montage.Cab1.1.1792134148223.jpg" },   // 09:02
        { name: "Montage.Cab7.1.1792145000000.jpg" },   // 12:03
      ],
    };
    expect(heuresPhotosDuJour(multi, "2026-10-16", { lot: 1 })?.derniere).toBe("09:02");
    expect(heuresPhotosDuJour(multi, "2026-10-16", { lot: 7 })?.premiere).toBe("12:03");
  });

  it("garde les photos sans numéro de lot quel que soit le lot demandé", () => {
    /* Un chantier mono-cabine devenu multi : les anciennes photos n'ont
       pas de préfixe, les écarter les ferait disparaître du calcul. */
    expect(heuresPhotosDuJour(PROJET, "2026-10-16", { lot: 1 })?.nombre).toBe(6);
  });

  it("ne rend rien plutôt que de deviner", () => {
    expect(heuresPhotosDuJour(PROJET, "")).toBeNull();
    expect(heuresPhotosDuJour(PROJET, "2026-10-17")).toBeNull();
    expect(heuresPhotosDuJour({}, "2026-10-16")).toBeNull();
  });
});

/**
 * Deux horloges, et il ne faut jamais les confondre.
 *
 * « Je doute que la première photo ait été prise à 9 h 02, si c'est une
 * photo d'avant montage et que ce montage prend minimum 45 minutes. »
 * L'heure affichée était celle de l'ajout dans la file. La vraie est
 * désormais lue dans l'EXIF, avant compression, et inscrite dans le nom.
 */
describe("prise de vue contre heure d'ajout", () => {
  it("écrit le suffixe seulement quand l'EXIF a parlé", () => {
    expect(suffixePriseDeVue(1792107600000)).toBe(".p1792107600000");
    expect(suffixePriseDeVue(null)).toBe("");
    expect(suffixePriseDeVue(undefined)).toBe("");
  });

  it("relit la prise de vue sans se tromper avec l'heure d'ajout", () => {
    const nom = "Montage gauche.1.1792134182687.p1792107600000.jpg";
    expect(priseDeVueDuNom(nom)).toBe(1792107600000);
    expect(horodatageDuNom(nom)).toBe(1792134182687);   // l'ajout, intact
    expect(lotDuNom("Montage.Cab3.1.1792134182687.p1792107600000.jpg")).toBe(3);
  });

  it("LE CAS DU RAPPORT REMPLI LE SOIR : photos prises a 08h, ajoutées à 21h", () => {
    /* C'est tout l'objet de la demande. Le monteur déclare 08:00–17:00 et
       remplit son rapport à la maison le soir : l'heure d'ajout dirait
       21 h, la prise de vue dit la vérité. */
    const projet = {
      photosAvant: [{ name: "Avant.1.1792177200000.p1792130400000.jpg" }],   // ajout 21:00, prise 08:00
      photosMontage: [{ name: "Montage.1.1792177260000.p1792152000000.jpg" }], // ajout 21:01, prise 14:00
    };
    const h = heuresPhotosSourcees(projet, "2026-10-16");
    expect(h?.source).toBe("prise");
    expect(h?.premiere).toBe("08:00");
    expect(h?.derniere).toBe("14:00");
  });

  it("des photos d'un AUTRE jour sont montrées, pas effacées", () => {
    /* Relevé réel sur TEST 5 : deux photos reprises de la galerie,
       datées du 22 septembre et du 12 octobre, sur un montage du 16. Les
       écarter laissait l'écran afficher l'heure d'ajout — précisément le
       chiffre trompeur qu'on voulait remplacer. */
    const projet = {
      photosAvant: [{ name: "Avant.Cab2.2.1792181084080.p1790105133000.jpg" }],
    };
    const h = heuresPhotosSourcees(projet, "2026-10-16", { lot: 2 });
    expect(h?.source).toBe("prise-autre");
    expect(h?.jourReel).toBe("2026-09-22");
  });

  it("le jour déclaré l'emporte sur un autre jour", () => {
    /* Une photo reprise de la galerie ne doit pas masquer celles,
       datées, qui ont bien été prises ce jour-là. */
    const projet = {
      photosAvant: [
        { name: "Avant.1.1792181084080.p1790105133000.jpg" },  // 22.09
        { name: "Avant.2.1792181084081.p1792130400000.jpg" },  // 16.10 08:00
      ],
    };
    const h = heuresPhotosSourcees(projet, "2026-10-16");
    expect(h?.source).toBe("prise");
    expect(h?.premiere).toBe("08:00");
  });

  it("PRÉFÈRE la prise de vue dès qu'une seule photo la porte", () => {
    /* 08:20 (prise) plutôt que 09:02 (ajout) : c'est toute la question. */
    const projet = {
      photosAvant: [{ name: "Avant.1.1792134148223.p1792131600000.jpg" }],
      photosMontage: [{ name: "Montage.1.1792134182687.p1792138800000.jpg" }],
    };
    const h = heuresPhotosSourcees(projet, "2026-10-16");
    expect(h?.source).toBe("prise");
    expect(h?.premiere).toBe("08:20");
    expect(h?.derniere).toBe("10:20");
  });

  it("NE MÉLANGE PAS les deux horloges", () => {
    /* Une photo avec EXIF, une sans : on ne travaille que sur celles qui
       en ont. Mélanger donnerait une amplitude qui n'appartient à aucune
       des deux horloges. */
    const projet = {
      photosAvant: [{ name: "Avant.1.1792134148223.p1792131600000.jpg" }],  // prise 08:20
      photosMontage: [{ name: "Montage.1.1792145000000.jpg" }],             // ajout 12:03
    };
    const h = heuresPhotosSourcees(projet, "2026-10-16");
    expect(h?.source).toBe("prise");
    expect(h?.derniere).toBe("08:20");
  });

  it("retombe sur l'heure d'ajout en le DISANT", () => {
    /* Toutes les photos d'avant le 16 octobre 2026 sont dans ce cas :
       leur EXIF a été détruit par la compression, il est perdu. */
    const h = heuresPhotosSourcees(PROJET, "2026-10-16");
    expect(h?.source).toBe("ajout");
    expect(h?.premiere).toBe("09:02");
  });

  it("ne rend rien plutôt que de deviner", () => {
    expect(heuresPhotosSourcees({}, "2026-10-16")).toBeNull();
  });
});

describe("plusieurs jours parmi les photos datées", () => {
  it("retient le jour MAJORITAIRE au lieu de renoncer", () => {
    /* Exiger un jour unique paraissait prudent : deux photos reprises de
       la galerie, de deux mois différents, suffisaient à faire échouer la
       règle — et l'écran retombait sur l'heure d'ajout. */
    const projet = {
      photosAvant: [
        { name: "A.1.1792181084080.p1790105133000.jpg" },  // 22.09
        { name: "A.2.1792181084081.p1791794392000.jpg" },  // 12.10
        { name: "A.3.1792181084082.p1791797000000.jpg" },  // 12.10
      ],
    };
    const h = heuresPhotosSourcees(projet, "2026-10-16");
    expect(h?.source).toBe("prise-autre");
    expect(h?.jourReel).toBe("2026-10-12");
  });

  it("à égalité, le jour le plus récent", () => {
    const projet = {
      photosAvant: [
        { name: "A.1.1792181084080.p1790105133000.jpg" },  // 22.09
        { name: "A.2.1792181084081.p1791794392000.jpg" },  // 12.10
      ],
    };
    expect(heuresPhotosSourcees(projet, "2026-10-16")?.jourReel).toBe("2026-10-12");
  });
});
