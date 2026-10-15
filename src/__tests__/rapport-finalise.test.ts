import { describe, it, expect } from "vitest";
import { etatRapport, LIBELLE_ETAT_RAPPORT, type Finalisation } from "@/lib/rapport-finalise";

const clos = (envoye: boolean): Finalisation => ({ quand: 1_792_000_000_000, client: true, envoye });

/**
 * « Rapport synchronisé » est une affirmation, pas une impression.
 *
 * Elle engage : si elle s'affiche alors qu'une photo dort encore sur le
 * téléphone, personne ne la cherchera, et elle manquera au dossier le jour
 * où il faudra prouver l'état d'un receveur. D'où une règle sans exception —
 * tout doit être parti.
 */
describe("etatRapport", () => {
  it("ne dit rien tant que le monteur n'a pas clos le rapport", () => {
    expect(etatRapport({ finalise: null, photosEnAttente: 0, requetesEnAttente: 0 })).toBe("aucun");
    expect(etatRapport({ finalise: null, photosEnAttente: 5, requetesEnAttente: 2 })).toBe("aucun");
  });

  it("dit « en attente » dès la clôture hors ligne", () => {
    expect(etatRapport({ finalise: clos(false), photosEnAttente: 3, requetesEnAttente: 1 })).toBe("en-attente");
  });

  it("reste « en attente » tant que le serveur n'a pas produit le rapport", () => {
    /* Toutes les photos sont parties, mais le PDF et le mail n'ont pas
       encore été faits : le dossier n'est pas clos de notre côté. */
    expect(etatRapport({ finalise: clos(false), photosEnAttente: 0, requetesEnAttente: 0 })).toBe("en-attente");
  });

  it("reste « en attente » pour UNE SEULE photo qui traîne", () => {
    expect(etatRapport({ finalise: clos(true), photosEnAttente: 1, requetesEnAttente: 0 })).toBe("en-attente");
  });

  it("reste « en attente » pour une seule écriture en file", () => {
    expect(etatRapport({ finalise: clos(true), photosEnAttente: 0, requetesEnAttente: 1 })).toBe("en-attente");
  });

  it("ne dit « synchronisé » que lorsque tout est arrivé", () => {
    expect(etatRapport({ finalise: clos(true), photosEnAttente: 0, requetesEnAttente: 0 })).toBe("synchronise");
  });

  it("annonce les deux états dans les termes demandés", () => {
    expect(LIBELLE_ETAT_RAPPORT["en-attente"]).toBe("Rapport finalisé — Synchronisation en attente");
    expect(LIBELLE_ETAT_RAPPORT.synchronise).toBe("Rapport synchronisé");
  });
});
