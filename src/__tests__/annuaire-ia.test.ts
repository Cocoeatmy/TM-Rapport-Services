import { describe, it, expect } from "vitest";
import {
  cleTelephone, numerosDans, estQuestionArgent, sansMontants, ficheDePage, fichesParNumero, fichesParMots,
  numerosVoisins, colonneArgent, afficherCle,
} from "@/lib/annuaire-ia";

describe("numéros de téléphone", () => {
  it("rapproche toutes les écritures d'un même numéro suisse", () => {
    const cle = "798396817";
    expect(cleTelephone("0798396817")).toBe(cle);
    expect(cleTelephone("079 839 68 17")).toBe(cle);
    expect(cleTelephone("+41 79 839 68 17")).toBe(cle);
    expect(cleTelephone("0041 (0)79 839.68.17")).toBe(cle);
    expect(cleTelephone("12345")).toBeNull();
  });

  it("trouve le numéro dans une question, pas une date ni un dossier", () => {
    expect(numerosDans("qui est le 0798396817 ?")).toEqual(["798396817"]);
    expect(numerosDans("appel du +41 79 839 68 17 hier")).toEqual(["798396817"]);
    expect(numerosDans("dossier TM-2600825 du 2026-10-20")).toEqual([]);
    expect(numerosDans("M. Rossier 079 111 22 33, Mme 021 444 55 66").sort()).toEqual(["214445566", "791112233"]);
  });

  it("sépare deux numéros collés", () => {
    expect(numerosDans("0791112233 0214445566").sort()).toEqual(["214445566", "791112233"]);
  });
});

describe("questions d'argent", () => {
  it.each([
    "Quel est le CA de 2025 ?",
    "chiffre d'affaires du mois",
    "Combien ça coûte une cabine Duka ?",
    "le prix du projet Rossier",
    "est-ce que la facture est payée ?",
    "montant de l'offre TM-2600825",
    "quelle marge sur ce chantier",
    "combien en CHF",
  ])("refuse : %s", (q) => expect(estQuestionArgent(q)).toBe(true));

  it.each([
    "qui est le 0798396817 ?",
    "ça avance le montage à Lausanne ?",
    "quel est l'état de l'OFR TM-2600825 ?",
    "remise en état de la cabine 3",
    "le client est revenu vers nous ?",
    "combien de cabines installées en 2026",
  ])("répond : %s", (q) => expect(estQuestionArgent(q)).toBe(false));

  it("retire les montants des textes libres", () => {
    expect(sansMontants("Remise accordée CHF 1'250.– au client")).not.toMatch(/1'250/);
    expect(sansMontants("coût 300 francs, pose le 12")).not.toMatch(/300/);
    expect(sansMontants("pose le 12 à 8h, 3 cabines")).toBe("pose le 12 à 8h, 3 cabines");
  });
});

describe("annuaire", () => {
  const page = (id: string, props: Record<string, any>) => ({ id, properties: props });
  const titre = (t: string) => ({ type: "title", title: [{ plain_text: t }] });
  const texte = (t: string) => ({ type: "rich_text", rich_text: [{ plain_text: t }] });

  const jean = ficheDePage(page("c1", {
    Nom: titre("Jean Rossier"),
    Mobile: { type: "phone_number", phone_number: "+41 79 839 68 17" },
    "E-mail": { type: "email", email: "jean@exemple.ch" },
    Entreprise: { type: "relation", relation: [{ id: "e1" }] },
    Fonction: texte("Concierge"),
    "Prix négocié": texte("CHF 500"),
  }), "contact")!;
  const regie = ficheDePage(page("e1", { Nom: titre("Régie du Lac"), Téléphone: texte("021 444 55 66") }), "entreprise")!;

  it("lit une fiche sans connaître le nom des colonnes, sans l'argent", () => {
    expect(jean.telephones).toEqual(["+41 79 839 68 17"]);
    expect(jean.emails).toEqual(["jean@exemple.ch"]);
    expect(jean.entreprises).toEqual(["e1"]);
    expect(jean.role).toBe("Concierge");
    expect(JSON.stringify(jean)).not.toMatch(/500/);
  });

  it("retrouve la personne par son numéro, sous une autre écriture", () => {
    expect(fichesParNumero([jean, regie], numerosDans("qui est le 0798396817"))).toEqual([jean]);
    expect(fichesParNumero([jean, regie], numerosDans("0214445566"))).toEqual([regie]);
  });

  it("retrouve par le nom, le plus de mots l'emporte", () => {
    expect(fichesParMots([jean, regie], ["rossier"])).toEqual([jean]);
    expect(fichesParMots([jean, regie], ["regie", "lac"])).toEqual([regie]);
  });
});

describe("numéro à un chiffre près (Thierry Jacquaz, 20.10.2026)", () => {
  it("076 818 55 56 demandé, 078 818 55 56 dans Notion : voisins", () => {
    const demande = cleTelephone("076 818 55 56")!, fiche = cleTelephone("+41 78 818 55 56")!;
    expect(numerosVoisins(demande, fiche)).toBe(true);
    expect(afficherCle(fiche)).toBe("078 818 55 56");
  });
  it("deux chiffres d'écart, ou le même numéro : pas voisins", () => {
    expect(numerosVoisins("768185556", "788185557")).toBe(false);
    expect(numerosVoisins("768185556", "768185556")).toBe(false);
  });
});

describe("colonnes d'argent jamais lues", () => {
  it.each(["Rabais cabines", "Escompte", "Mail de facturations", "Montant OFR", "Coût soucis montage", "Rabais services"])("%s", (c) =>
    expect(colonneArgent(c)).toBe(true));
  it.each(["Poste", "Portable", "Étiquettes", "Adresse", "Nb. Projets"])("garde %s", (c) => expect(colonneArgent(c)).toBe(false));

  it("une fiche d'entreprise garde le reste, sans l'argent", () => {
    const f = ficheDePage({ id: "e9", properties: {
      Clients: { type: "title", title: [{ plain_text: "T. Jacquaz Sanitech" }] },
      "Rabais cabines": { type: "number", number: 12 },
      "Mail de facturations": { type: "email", email: "compta@exemple.ch" },
      "Nb. Projets": { type: "rollup", rollup: { type: "number", number: 22 } },
      "Contacts dans l’entreprise": { type: "relation", relation: [{ id: "c7" }] },
    } }, "entreprise")!;
    expect(f.details).toContain("Nb. Projets : 22");
    expect(f.liens).toEqual(["c7"]);
    expect(JSON.stringify(f)).not.toMatch(/compta@|Rabais|: 12/);
  });
});
