import { describe, it, expect } from "vitest";
import {
  etatSavProjet, controleCoherenceSav, comptesSavParCabine, type SourceSavProjet,
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

/**
 * UNE DATE D'INTERVENTION VAUT UN RENDEZ-VOUS PRIS.
 *
 * Micael cale les passages SAV dans « Interventions SAV » — une ligne par
 * passage, avec sa date et son monteur. L'écran de saisie recopie bien le
 * dernier passage dans la colonne « Dates RDV SAV cabines », mais ce n'est
 * qu'un miroir : ajouter une ligne vide l'efface, et le dossier reparaît
 * dans « RDV SAV à fixer » alors que la date est toujours là, sous les
 * yeux. On lit donc les passages eux-mêmes.
 *
 * Relevé réel du 16 octobre 2026, TM-2600634 — Dubat SA / Timpanaro,
 * cabine 2 : passage au 19 octobre avec Miguel.
 */
describe("la date saisie dans « Interventions SAV » compte", () => {
  it("un passage daté suffit, même sans la colonne miroir", () => {
    const c = comptesSavParCabine({
      causeSavCabines: "Cab2:Erreur TM",
      interventionsSavCabines: "Cab2:2026-10-19~Miguel",
    });
    expect(c.aFixer).toBe(0);
    expect(c.planifies).toBe(1);
  });

  it("LE CAS RÉEL de TM-2600634, miroir compris", () => {
    const c = comptesSavParCabine({
      causeSavCabines: "Cab2:Erreur TM",
      datesRdvSavCabines: "Cab2:2026-10-19",
      collaborateursSavCabines: "Cab2:Miguel",
      interventionsSavCabines: "Cab2:2026-10-19~Miguel",
    });
    expect(c.aFixer).toBe(0);
    expect(c.planifies).toBe(1);
  });

  it("on retient la date la PLUS LOINTAINE des deux sources", () => {
    /* Un second passage calé plus tard est le rendez-vous qui compte ; le
       miroir, lui, peut encore annoncer le premier. */
    const c = comptesSavParCabine({
      causeSavCabines: "Cab1:joint",
      datesRdvSavCabines: "Cab1:2026-09-01",
      datesCmdPiecesSavCabines: "Cab1:2026-08-20",
      datesReceptionPiecesSavCabines: "Cab1:2026-09-15",
      interventionsSavCabines: "Cab1:2026-09-01~Miguel;2026-09-20~Claudio",
    });
    /* Pièce reçue le 15, second passage calé le 20 : rien à fixer. */
    expect(c.aFixer).toBe(0);
    expect(c.planifies).toBe(1);
  });

  it("une pièce arrivée APRÈS le dernier passage rouvre le rendez-vous", () => {
    const c = comptesSavParCabine({
      causeSavCabines: "Cab1:joint",
      datesCmdPiecesSavCabines: "Cab1:2026-08-20",
      datesReceptionPiecesSavCabines: "Cab1:2026-09-25",
      interventionsSavCabines: "Cab1:2026-09-01~Miguel;2026-09-20~Claudio",
    });
    expect(c.aFixer).toBe(1);
  });

  it("une ligne de passage sans date ne fait pas disparaître le rendez-vous", () => {
    /* C'est le piège du miroir : l'écran y recopie le DERNIER passage, et
       une ligne vide l'effaçait. La date du premier passage tient. */
    const c = comptesSavParCabine({
      causeSavCabines: "Cab1:joint",
      datesRdvSavCabines: "",
      interventionsSavCabines: "Cab1:2026-10-19~Miguel;~Claudio",
    });
    expect(c.aFixer).toBe(0);
    expect(c.planifies).toBe(1);
  });

  it("un passage sans aucune date laisse le lot à fixer", () => {
    const c = comptesSavParCabine({
      causeSavCabines: "Cab1:joint",
      interventionsSavCabines: "Cab1:~Miguel",
    });
    expect(c.aFixer).toBe(1);
  });
});
