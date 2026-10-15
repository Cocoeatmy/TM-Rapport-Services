import { describe, it, expect } from "vitest";
import {
  etatSavProjet, controleCoherenceSav, type SourceSavProjet,
} from "@/lib/sav-cabines";

/**
 * AUCUN SAV NE DOIT DISPARAÎTRE.
 *
 * Un SAV qu'on ne voit pas n'est pas un SAV réglé : c'est un client qui
 * rappelle trois semaines plus tard. CANAsanitaire Lot 23 l'a montré — pièce
 * commandée le 15 octobre, jamais reçue, dossier évaporé de « RDV SAV à
 * fixer » parce qu'une règle, écrite pour une bonne raison, l'en écartait.
 *
 * Ces tests reprennent un à un les cas de figure du terrain. Ils disent la
 * même chose à chaque fois : tant qu'une intervention reste à faire, le
 * dossier est à l'écran.
 */

const projet = (p: Partial<SourceSavProjet>): SourceSavProjet => ({ id: "x", ...p });

describe("etatSavProjet — un SAV reste visible tant qu'il n'est pas réglé", () => {
  it("1. une seule cabine, SAV ouvert sans rendez-vous", () => {
    const e = etatSavProjet(projet({ nbCabines: 1, commentairesSav: "Cab1:porte qui frotte" }));
    expect(e.necessiteRdv).toBe(true);
    expect(e.ouvert).toBe(true);
  });

  it("2. plusieurs cabines, une seule en SAV", () => {
    const e = etatSavProjet(projet({ nbCabines: 30, commentairesSav: "Cab23:receveur fissuré" }));
    expect(e.necessiteRdv).toBe(true);
    expect(e.comptes.aFixer).toBe(1);
    expect(e.comptes.concernees).toBe(1);
  });

  it("3. toutes les autres cabines réglées, une seule encore ouverte", () => {
    const e = etatSavProjet(projet({
      commentairesSav: "Cab1:a | Cab2:b | Cab3:c",
      datesSavClotureCabines: "Cab1:2026-09-01 | Cab2:2026-09-02",
    }));
    expect(e.necessiteRdv).toBe(true);
    expect(e.comptes.regles).toBe(2);
    expect(e.comptes.aFixer).toBe(1);
  });

  it("4. LE CAS CANAsanitaire : pièce commandée, jamais reçue", () => {
    /* Lot 23, Rue de la Tour 27 à Ollon. Pièce commandée le 15 octobre et
       toujours attendue. Le dossier sortait de la liste ; il y reste
       désormais, avec sa raison écrite à côté. */
    const e = etatSavProjet(projet({
      id: "TM-2600511",
      commentairesSav: "Cab23:vitre rayée",
      datesCmdPiecesSavCabines: "Cab23:2026-10-15",
    }));
    expect(e.necessiteRdv).toBe(true);
    expect(e.comptes.enAttentePiece).toBe(1);
    expect(e.comptes.aFixer).toBe(0);
    expect(e.raison).toContain("attente de pièce");
  });

  it("5. pièce reçue après le passage : il faut repasser", () => {
    const e = etatSavProjet(projet({
      commentairesSav: "Cab4:joint",
      datesRdvSavCabines: "Cab4:2026-09-10",
      datesCmdPiecesSavCabines: "Cab4:2026-09-01",
      datesReceptionPiecesSavCabines: "Cab4:2026-09-20",
    }));
    expect(e.necessiteRdv).toBe(true);
    expect(e.comptes.aFixer).toBe(1);
  });

  it("6. rendez-vous déjà fixé : ouvert, mais rien à caler", () => {
    const e = etatSavProjet(projet({
      commentairesSav: "Cab2:silicone",
      datesRdvSavCabines: "Cab2:2026-11-05",
    }));
    expect(e.necessiteRdv).toBe(false);
    expect(e.ouvert).toBe(true);
    expect(e.comptes.planifies).toBe(1);
  });

  it("7. tout est clôturé : le dossier sort des deux listes", () => {
    const e = etatSavProjet(projet({
      commentairesSav: "Cab1:a | Cab2:b",
      datesSavClotureCabines: "Cab1:2026-08-01 | Cab2:2026-08-02",
    }));
    expect(e.necessiteRdv).toBe(false);
    expect(e.ouvert).toBe(false);
  });

  it("8. ancienne base seule, sans aucun détail par cabine", () => {
    const e = etatSavProjet(projet({ etatSAV: "A contacter" }));
    expect(e.necessiteRdv).toBe(true);
    expect(e.comptes.detaille).toBe(false);
  });

  it("9. « En cours de traitement » réclame encore un rendez-vous", () => {
    /* La tuile d'accueil le comptait déjà, la liste l'ignorait : un dossier
       qui existait dans le chiffre sans exister dans la liste. */
    const e = etatSavProjet(projet({ id: "TM-2500516", etatSAV: "En cours de traitement" }));
    expect(e.necessiteRdv).toBe(true);
  });

  it("10. « RDV Fixé » (casse et accents libres) : ouvert, pas à fixer", () => {
    for (const v of ["RDV fixé", "RDV Fixé", "rdv fixe"]) {
      const e = etatSavProjet(projet({ etatSAV: v }));
      expect(e.necessiteRdv, v).toBe(false);
      expect(e.ouvert, v).toBe(true);
    }
  });

  it("11. un état hors nomenclature est traité comme ouvert, et signalé", () => {
    /* Une valeur ajoutée dans Notion sans prévenir, une faute de frappe :
       on préfère un dossier de trop à l'écran à un dossier perdu. */
    const e = etatSavProjet(projet({ etatSAV: "Devis envoyé au client" }));
    expect(e.necessiteRdv).toBe(true);
    expect(e.raison).toContain("inconnu");
  });

  it("12. « Terminé » et « Aucun SAV » ne réveillent rien", () => {
    for (const v of ["Terminé", "Annulé", "Rapport clôturé", "Aucun SAV", "", null]) {
      const e = etatSavProjet(projet({ etatSAV: v }));
      expect(e.ouvert, String(v)).toBe(false);
    }
  });

  it("les deux bases se lisent ensemble : la plus alarmante l'emporte", () => {
    /* Projet clos côté ancienne base, mais une cabine rouverte depuis. */
    const e = etatSavProjet(projet({
      etatSAV: "Terminé",
      commentairesSav: "Cab7:fuite",
    }));
    expect(e.necessiteRdv).toBe(true);
  });

  it("un SAV repéré par ses seules photos compte aussi", () => {
    const e = etatSavProjet(projet({
      photosSavRetouches: [{ name: "SAV retouches.Cab9.1.1.jpg" }],
    }));
    expect(e.necessiteRdv).toBe(true);
    expect(e.comptes.concernees).toBe(1);
  });
});

/**
 * Le garde-fou. Il ne corrige rien : il refuse le silence.
 */
describe("controleCoherenceSav", () => {
  const base: SourceSavProjet[] = [
    projet({ id: "a", commentairesSav: "Cab1:x" }),
    projet({ id: "b", datesCmdPiecesSavCabines: "Cab2:2026-10-15", commentairesSav: "Cab2:y" }),
    projet({ id: "c", commentairesSav: "Cab1:z", datesRdvSavCabines: "Cab1:2026-12-01" }),
    projet({ id: "d", etatSAV: "Terminé" }),
  ];

  it("ne dit rien quand tout ce qui doit être vu l'est", () => {
    expect(controleCoherenceSav(base, ["a", "b"])).toEqual([]);
  });

  it("nomme le dossier manquant et la raison", () => {
    const m = controleCoherenceSav(base, ["a"]);
    expect(m).toHaveLength(1);
    expect(m[0].projet.id).toBe("b");
    expect(m[0].raison).toContain("attente de pièce");
  });

  it("ne réclame ni les dossiers planifiés ni les dossiers clos", () => {
    const m = controleCoherenceSav(base, ["a", "b"]);
    expect(m.map((x) => x.projet.id)).not.toContain("c");
    expect(m.map((x) => x.projet.id)).not.toContain("d");
  });

  it("ne compte un même projet qu'une fois, même listé deux fois", () => {
    /* Actifs et terminés sont concaténés en amont : un doublon ne doit pas
       produire deux avertissements pour le même chantier. */
    const m = controleCoherenceSav([...base, base[1]], []);
    expect(m.filter((x) => x.projet.id === "b")).toHaveLength(1);
  });

  it("supporte une liste vide sans rien inventer", () => {
    expect(controleCoherenceSav([], [])).toEqual([]);
  });
});
