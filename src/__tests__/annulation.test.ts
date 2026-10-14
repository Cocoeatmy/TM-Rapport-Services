import { describe, it, expect } from "vitest";
import { decisionAnnulation, MESURES_SANS_DEPLACEMENT } from "@/lib/annulation";

describe("decisionAnnulation", () => {
  it("annule les mesures quand personne ne s'est déplacé", () => {
    /* Ni rendez-vous ni relevé : rien à facturer, rien à demander. */
    for (const e of MESURES_SANS_DEPLACEMENT) {
      const d = decisionAnnulation(e);
      expect(d.mesuresVers, e).toBe("Annulé");
      expect(d.avertissement, e).toBeNull();
    }
  });

  it("ne touche à rien et AVERTIT dès qu'un relevé a été engagé", () => {
    /* C'est tout l'enjeu : clore en silence ferait perdre la facture du
       déplacement. */
    for (const e of ["RDV - Fixé", "RDV - Attendre news", "Mesures partielles",
                     "Mesures relevées - attente news", "Mesures non relevées - attendre news",
                     "Terminé"]) {
      const d = decisionAnnulation(e);
      expect(d.mesuresVers, e).toBeNull();
      expect(d.avertissement, e).toContain(e);
      expect(d.avertissement, e).toContain("facturer");
    }
  });

  it("se tait sur un dossier déjà annulé — il n'y a rien à y changer", () => {
    expect(decisionAnnulation("Annulé")).toEqual({ mesuresVers: null, avertissement: null });
  });

  it("se tait sur un état vide : aucun travail de mesure n'existe", () => {
    expect(decisionAnnulation("")).toEqual({ mesuresVers: null, avertissement: null });
    expect(decisionAnnulation(null)).toEqual({ mesuresVers: null, avertissement: null });
  });

  it("avertit plutôt que de deviner devant un état inconnu", () => {
    /* Un état ajouté dans Notion depuis : le taire pourrait coûter une
       facture, le signaler ne coûte qu'un coup d'œil. */
    const d = decisionAnnulation("Nouvel état");
    expect(d.mesuresVers).toBeNull();
    expect(d.avertissement).toContain("Nouvel état");
  });
});
