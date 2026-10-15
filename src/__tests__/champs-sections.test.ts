import { describe, it, expect } from "vitest";
import { placerChamp, poidsChamp, estTexteLong, SECTIONS } from "@/lib/champs-sections";
import { TYPES_MODIFIABLES } from "@/lib/notion-schema";
import inventaire from "./fixtures-schema-notion.json";

/**
 * Le classement des 142 propriétés, vérifié sur la vraie base.
 *
 * Deux dangers, et ce sont les seuls qui comptent ici.
 *
 * LE PREMIER : ouvrir à la saisie libre une colonne que le système de
 * rapports écrit dans son propre format. Un relevé du 16 octobre 2026 sur
 * 600 chantiers a montré que « Commentaires SAV » et « Date - SAV reçu
 * le » contiennent « Cab1:… » sans que leur nom le laisse deviner. Y taper
 * du texte à la main effacerait le suivi SAV douche par douche.
 *
 * LE SECOND, à l'inverse : verrouiller par excès. « Nb. Cabines » et
 * « Séries Cabines » finissent par « Cabines » sans rien avoir d'encodé —
 * les interdire à la saisie reviendrait à redemander d'ouvrir Notion.
 */

type Champ = { nom: string; type: string };
const CHAMPS = inventaire as Champ[];
const placer = (nom: string, type: string) =>
  placerChamp(nom, type, TYPES_MODIFIABLES.has(type));

/** Colonnes où « CabN: » a réellement été observé en production. */
const ENCODEES_MESUREES = [
  "Heure arrivée", "Heure départ", "Monteur responsable", "Lot (nom de cabine)",
  "Interventions montage cabines", "Commentaires SAV", "Date - SAV reçu le",
  "Cause SAV cabines", "Dates SAV clôturé cabines", "SAV / Retouches cabines",
  "Collaborateurs SAV cabines", "Dates RDV SAV cabines", "Monteurs sous-traitance",
  "État du montage", "Dates CMD pièces SAV cabines",
  "Dates réception pièces SAV cabines", "Interventions SAV cabines",
];

/** Colonnes de texte libre observées, qui doivent rester saisissables. */
const LIBRES_MESUREES = [
  "Commentaires Livraisons", "Commentaires Mesures", "Commentaires Montages",
  "Commentaires Soucis montages", "Contacts pour RDV", "Divers infos chantier",
  "Journal des échanges", "Nom chantier", "N° CMD Grossiste", "N° CMD TM - Usine",
  "N° CMD TM", "N° OFR Fournisseurs", "N° OFR Grossiste", "N° OFR TM",
  "N° Serv. CMD Fournisseurs", "N° Serv. Mesures Fournisseurs", "n° CMD Fournisseurs",
];

describe("protection du système de rapports", () => {
  for (const nom of ENCODEES_MESUREES) {
    it(`« ${nom} » ne peut pas être saisi à la main`, () => {
      const p = placer(nom, "rich_text");
      expect(p.lectureSeule, nom).toBe(true);
      expect(p.motif, nom).toMatch(/rapport/i);
    });
  }

  it("toutes les colonnes verrouillées sont rangées ensemble", () => {
    for (const nom of ENCODEES_MESUREES) {
      expect(placer(nom, "rich_text").section, nom).toBe("rapport");
    }
  });

  it("la signature et le rapport PDF ne se modifient pas depuis un formulaire", () => {
    expect(placer("Signature clients", "url").lectureSeule).toBe(true);
    expect(placer("Rapport PDF", "files").lectureSeule).toBe(true);
    expect(placer("Rapport de montage", "status").lectureSeule).toBe(true);
  });
});

describe("ne pas verrouiller par excès", () => {
  for (const nom of LIBRES_MESUREES) {
    it(`« ${nom} » reste saisissable`, () => {
      expect(placer(nom, "rich_text").lectureSeule, nom).toBe(false);
    });
  }

  it("« Nb. Cabines » et « Séries Cabines » ne sont pas pris pour des colonnes par lot", () => {
    /* Elles finissent par « Cabines » sans rien avoir d'encodé. Les
       verrouiller reviendrait à redemander d'ouvrir Notion. */
    expect(placer("Nb. Cabines", "number").lectureSeule).toBe(false);
    expect(placer("Nb. Cabines", "number").section).toBe("montage");
    expect(placer("Séries Cabines", "relation").lectureSeule).toBe(false);
    expect(placer("Séries Cabines", "relation").section).toBe("fournisseurs");
  });
});

describe("classement de la base entière", () => {
  it("chaque propriété tombe dans une section connue", () => {
    const connues = new Set(SECTIONS.map((s) => s.id));
    for (const c of CHAMPS) {
      expect(connues.has(placer(c.nom, c.type).section), `${c.nom} (${c.type})`).toBe(true);
    }
  });

  it("aucune propriété n'est oubliée", () => {
    expect(CHAMPS.length).toBeGreaterThanOrEqual(142);
    const places = CHAMPS.map((c) => placer(c.nom, c.type));
    expect(places).toHaveLength(CHAMPS.length);
  });

  it("ce que l'API ne sait pas écrire est montré, jamais saisissable", () => {
    for (const c of CHAMPS.filter((c) => ["formula", "button"].includes(c.type))) {
      const p = placer(c.nom, c.type);
      expect(p.lectureSeule, c.nom).toBe(true);
    }
  });

  it("une propriété inconnue de demain atterrit dans « Autres informations »", () => {
    /* Le but de toute l'affaire : ajouter une colonne dans Notion sans
       toucher au code, et la voir apparaître quelque part. */
    expect(placer("Taux de TVA appliqué", "number").section).toBe("autres");
    expect(placer("Taux de TVA appliqué", "number").lectureSeule).toBe(false);
  });

  it("une pièce jointe sans famille va aux documents", () => {
    expect(placer("Plan de pose", "files").section).toBe("documents");
  });

  it("les colonnes techniques n8n restent hors de l'écran", () => {
    for (const nom of ["n8n Fournisseurs", "n8n - Adresse chantier"]) {
      expect(placer(nom, "multi_select").masque, nom).toBe(true);
    }
  });
});

describe("ordre à l'intérieur d'une section", () => {
  it("le nom du projet passe avant tout", () => {
    expect(poidsChamp("Projet", "title", false)).toBeLessThan(poidsChamp("N° OFR TM", "rich_text", false));
  });

  it("les références passent avant les dates et les textes longs", () => {
    expect(poidsChamp("N° CMD TM", "rich_text", false)).toBeLessThan(poidsChamp("Date Montage", "date", false));
    expect(poidsChamp("Date Montage", "date", false)).toBeLessThan(poidsChamp("Commentaires Montages", "rich_text", false));
  });

  it("les pièces jointes ferment la marche", () => {
    expect(poidsChamp("Photos mesures", "files", false)).toBeGreaterThan(poidsChamp("Commentaires Mesures", "rich_text", false));
  });

  it("ce qu'on ne peut pas remplir descend, sans changer de section", () => {
    expect(poidsChamp("Jours Montage", "formula", true)).toBeGreaterThan(poidsChamp("Date Montage", "date", false));
  });
});

/**
 * Un « texte » Notion peut être un numéro ou trois paragraphes.
 *
 * Le type ne le dit pas. Les afficher tous en grande zone de texte donnait
 * un formulaire où « N° OFR TM » occupait quatre lignes et toute la
 * largeur — et où il fallait faire défiler pour atteindre le champ
 * suivant.
 */
describe("ligne ou zone de texte", () => {
  it("les commentaires et les textes longs ont une zone", () => {
    for (const n of [
      "Commentaires Montages", "Commentaires interne", "Journal des échanges",
      "Divers infos chantier", "Infos - Défauts signalé", "Explications travaux exécuté",
      "Rapport monteur", "Contacts pour RDV",
    ]) expect(estTexteLong(n), n).toBe(true);
  });

  it("les références tiennent sur une ligne", () => {
    for (const n of [
      "N° OFR TM", "N° CMD TM", "N° CMD TM - Usine", "N° OFR Grossiste",
      "N° Serv. CMD Fournisseurs", "Nom chantier", "Heure arrivée",
    ]) expect(estTexteLong(n), n).toBe(false);
  });

  it("un champ ajouté demain et nommé « Description … » a une zone", () => {
    expect(estTexteLong("Description de l'accès au chantier")).toBe(true);
  });
});
