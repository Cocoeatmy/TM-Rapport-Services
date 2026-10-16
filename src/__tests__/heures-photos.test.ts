import { describe, it, expect } from "vitest";
import { heuresPhotosDuJour, horodatageDuNom, lotDuNom } from "@/lib/heures-photos";

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
