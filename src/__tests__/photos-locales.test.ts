import { describe, it, expect } from "vitest";
import { compteLocalesGroupe, type PhotoLocale } from "@/lib/photos-locales";
import { comptePhotosGroupe, minimumRequis, missingRequiredPhotos } from "@/lib/photo-buckets";

/**
 * Une photo prise est une photo prise.
 *
 * Le 15 octobre 2026, deux monteurs sans réseau sont restés bloqués : leurs
 * photos étaient sur le téléphone, marquées « Sync », et le bouton
 * « Suivant » restait gris parce que le compte ne regardait que la liste
 * renvoyée par Notion. Ces tests fixent la règle inverse : ce qui est écrit
 * sur l'appareil compte, quel que soit l'état du réseau.
 */

const AVANT = ["AVANT_INTERVENTION"] as const;
const MONTAGE = ["MONTAGE_GAUCHE", "MONTAGE_CENTRE", "MONTAGE_DROITE"] as const;

const locale = (name: string, notionField: string): PhotoLocale => ({
  name, notionField, statut: "pending",
});

describe("compteLocalesGroupe", () => {
  it("compte les photos restées sur le téléphone", () => {
    const locales = [
      locale("Avant intervention.1.1.jpg", "photosAvant"),
      locale("Avant intervention.2.2.jpg", "photosAvant"),
    ];
    expect(compteLocalesGroupe(locales, AVANT)).toBe(2);
  });

  it("additionne les trois vues du montage, comme pour les photos déjà envoyées", () => {
    const locales = [
      locale("Montage gauche.1.1.jpg", "photosMontage"),
      locale("Montage centre.1.2.jpg", "photosMontage"),
      locale("Montage droite.1.3.jpg", "photosMontage"),
    ];
    expect(compteLocalesGroupe(locales, MONTAGE)).toBe(3);
  });

  it("n'attribue une photo qu'à SA planche", () => {
    const locales = [
      locale("Avant intervention.1.1.jpg", "photosAvant"),
      locale("Montage gauche.1.2.jpg", "photosMontage"),
    ];
    expect(compteLocalesGroupe(locales, AVANT)).toBe(1);
    expect(compteLocalesGroupe(locales, MONTAGE)).toBe(1);
    expect(compteLocalesGroupe(locales, ["QR_CODE"])).toBe(0);
  });

  it("respecte le lot sur un chantier multi-cabines", () => {
    const locales = [
      locale("Avant intervention.Cab1.1.1.jpg", "photosAvant"),
      locale("Avant intervention.Cab2.1.2.jpg", "photosAvant"),
    ];
    expect(compteLocalesGroupe(locales, AVANT, 1)).toBe(1);
    expect(compteLocalesGroupe(locales, AVANT, 2)).toBe(1);
    expect(compteLocalesGroupe(locales, AVANT, 3)).toBe(0);
  });

  it("une photo dont l'envoi a définitivement échoué compte quand même", () => {
    /* Ses octets sont toujours là. Seul un échec d'écriture LOCALE
       justifierait de ne pas la compter — et dans ce cas elle n'existe pas. */
    const locales: PhotoLocale[] = [
      { name: "Avant intervention.1.1.jpg", notionField: "photosAvant", statut: "permanently-failed" },
      locale("Avant intervention.2.2.jpg", "photosAvant"),
    ];
    expect(compteLocalesGroupe(locales, AVANT)).toBe(2);
  });

  it("ne compte rien quand la file est vide", () => {
    expect(compteLocalesGroupe([], AVANT)).toBe(0);
  });

  it("reconnaît le LIBELLÉ de la colonne Notion autant que sa clé", () => {
    /* La file enregistre « Photos avant montage », le projet porte
       `photosAvant` : ne connaître qu'une des deux écritures revenait à ne
       rien compter du tout — c'est exactement ce qui bloquait les monteurs. */
    const parLibelle: PhotoLocale[] = [
      { name: "Avant intervention.1.1.jpg", notionField: "Photos avant montage", statut: "pending" },
      { name: "Avant intervention.2.2.jpg", notionField: "Photos avant montage", statut: "pending" },
    ];
    expect(compteLocalesGroupe(parLibelle, AVANT)).toBe(2);
    const montageParLibelle: PhotoLocale[] = [
      { name: "Montage gauche.1.1.jpg", notionField: "Photos montage terminé", statut: "pending" },
    ];
    expect(compteLocalesGroupe(montageParLibelle, MONTAGE)).toBe(1);
  });
});

describe("le compte qui débloque le bouton « Suivant »", () => {
  /* Ce que fait l'assistant : photos chez Notion + photos sur l'appareil. */
  const total = (projet: Parameters<typeof comptePhotosGroupe>[0], locales: PhotoLocale[]) =>
    comptePhotosGroupe(projet, AVANT) + compteLocalesGroupe(locales, AVANT);

  it("hors ligne, trois photos locales suffisent à satisfaire l'exigence", () => {
    const locales = [
      locale("Avant intervention.1.1.jpg", "photosAvant"),
      locale("Avant intervention.2.2.jpg", "photosAvant"),
    ];
    expect(total({}, locales)).toBeGreaterThanOrEqual(minimumRequis(AVANT));
  });

  it("deux sur trois restent deux sur trois — rien n'est contourné", () => {
    const locales = [locale("Avant intervention.1.1.jpg", "photosAvant")];
    expect(total({}, locales)).toBeLessThan(minimumRequis(AVANT));
  });

  it("ne compte pas deux fois une photo arrivée chez Notion", () => {
    /* Dès que la file a confirmé l'envoi, elle retire la photo de l'appareil :
       les deux sources ne se recouvrent jamais. */
    const projet = { photosAvant: [{ name: "Avant intervention.1.1.jpg", url: "u" }] };
    expect(total(projet, [])).toBe(1);
  });
});

/**
 * Le contrôle qui BLOQUE l'envoi du rapport.
 *
 * Le 16 octobre 2026, un monteur a photographié tout un chantier sans
 * réseau, puis s'est vu refuser l'envoi : « Photos avant intervention 0/2,
 * Photos montage 0/3, Photos après intervention 0/2 » — alors que ses sept
 * photos étaient sur le téléphone, en train de partir. Le compteur de
 * l'assistant avait été corrigé la veille ; ce contrôle-ci, non.
 */
describe("missingRequiredPhotos — les photos du téléphone comptent", () => {
  const MONO = { multiCabine: false, nbCabines: 1 };
  const toutes: PhotoLocale[] = [
    { name: "Avant intervention.1.1.jpg", notionField: "Photos avant montage", statut: "pending" },
    { name: "Avant intervention.2.2.jpg", notionField: "Photos avant montage", statut: "pending" },
    { name: "Montage gauche.1.3.jpg", notionField: "Photos montage terminé", statut: "pending" },
    { name: "Montage centre.1.4.jpg", notionField: "Photos montage terminé", statut: "pending" },
    { name: "Montage droite.1.5.jpg", notionField: "Photos montage terminé", statut: "pending" },
    { name: "Apres intervention.1.6.jpg", notionField: "Photos montage terminé", statut: "pending" },
    { name: "Apres intervention.2.7.jpg", notionField: "Photos montage terminé", statut: "pending" },
  ];

  it("sans le téléphone, tout manque — c'est le bug d'origine", () => {
    const manquantes = missingRequiredPhotos({}, MONO);
    expect(manquantes.map((m) => m.label)).toEqual([
      "Photos avant intervention", "Photos montage", "Photos après intervention",
    ]);
  });

  it("avec le téléphone, plus rien ne manque et l'envoi passe", () => {
    expect(missingRequiredPhotos({}, { ...MONO, locales: toutes })).toEqual([]);
  });

  it("mais il manque toujours ce qui n'a pas été photographié", () => {
    const partiel = toutes.filter((l) => !l.name.startsWith("Montage"));
    const manquantes = missingRequiredPhotos({}, { ...MONO, locales: partiel });
    expect(manquantes.map((m) => m.label)).toEqual(["Photos montage"]);
    expect(manquantes[0]).toMatchObject({ have: 0, min: 3 });
  });

  it("additionne le téléphone et ce qui est déjà arrivé chez Notion", () => {
    const projet = { photosAvant: [{ name: "Avant intervention.1.1.jpg", url: "u" }] };
    const uneSeuleEnAttente: PhotoLocale[] = [
      { name: "Avant intervention.2.2.jpg", notionField: "Photos avant montage", statut: "pending" },
    ];
    const manquantes = missingRequiredPhotos(projet, { ...MONO, locales: uneSeuleEnAttente });
    expect(manquantes.map((m) => m.label)).not.toContain("Photos avant intervention");
  });

  it("vaut lot par lot sur un chantier multi-cabines", () => {
    const lot2: PhotoLocale[] = [
      { name: "Avant intervention.Cab2.1.1.jpg", notionField: "Photos avant montage", statut: "pending" },
      { name: "Avant intervention.Cab2.2.2.jpg", notionField: "Photos avant montage", statut: "pending" },
    ];
    const manquantes = missingRequiredPhotos({}, { multiCabine: true, nbCabines: 2, locales: lot2 });
    const libelles = manquantes.map((m) => m.label);
    expect(libelles).toContain("Cabine 1 — Photos avant intervention");
    expect(libelles).not.toContain("Cabine 2 — Photos avant intervention");
  });
});
