import { describe, it, expect } from "vitest";
import { comptesSavParCabine, cabinesAvecSav } from "@/lib/sav-cabines";

/**
 * « 75 cabines » en face d'un projet qui en avait trois à reprendre.
 *
 * Ces tests fixent ce qu'on compte : des CABINES concernées, jamais le
 * nombre de cabines du chantier, jamais le nombre de signalements.
 */
describe("comptesSavParCabine", () => {
  it("ne compte que les cabines concernées, pas celles du chantier", () => {
    /* 75 cabines posées, trois seulement portent un SAV. */
    const c = comptesSavParCabine({
      nbCabines: 75,
      commentairesSav: "Cab12:porte qui frotte | Cab25:joint | Cab43:receveur",
    });
    expect(c.concernees).toBe(3);
    expect(c.aFixer).toBe(3);
    expect(c.detaille).toBe(true);
  });

  it("compte UNE cabine même quand elle porte plusieurs signalements", () => {
    /* La même cabine apparaît dans la réclamation, la cause et les photos. */
    const c = comptesSavParCabine({
      commentairesSav: "Cab12:deux soucis",
      causeSavCabines: "Cab12:Erreur TM",
      documentsSavDemande: [{ name: "SAV demande.Cab12.1.1.jpg" }, { name: "SAV demande.Cab12.2.2.jpg" }],
    });
    expect(c.concernees).toBe(1);
    expect(c.aFixer).toBe(1);
  });

  it("sort une cabine des « à fixer » dès qu'elle est clôturée", () => {
    const c = comptesSavParCabine({
      commentairesSav: "Cab1:a | Cab2:b | Cab3:c",
      datesSavClotureCabines: "Cab2:2026-10-01 | Cab3:2026-10-02",
    });
    expect(c.aFixer).toBe(1);
    expect(c.regles).toBe(2);
    expect(c.concernees).toBe(3);
  });

  it("distingue planifié de à fixer", () => {
    const c = comptesSavParCabine({
      commentairesSav: "Cab1:a | Cab2:b",
      datesRdvSavCabines: "Cab2:2026-11-05",
    });
    expect(c.aFixer).toBe(1);
    expect(c.planifies).toBe(1);
    expect(c.regles).toBe(0);
  });

  it("un rendez-vous fixé ne vaut pas réglé", () => {
    const c = comptesSavParCabine({ commentairesSav: "Cab1:a", datesRdvSavCabines: "Cab1:2026-11-05" });
    expect(c.regles).toBe(0);
    expect(c.planifies).toBe(1);
  });

  it("une pièce commandée et pas reçue met la cabine en attente, pas à fixer", () => {
    /* Fixer un rendez-vous ferait revenir l'équipe sans la pièce. */
    const c = comptesSavParCabine({
      commentairesSav: "Cab1:a",
      datesCmdPiecesSavCabines: "Cab1:2026-10-01",
    });
    expect(c.aFixer).toBe(0);
    expect(c.enAttentePiece).toBe(1);
  });

  it("la pièce arrivée après le passage remet la cabine à fixer", () => {
    const c = comptesSavParCabine({
      commentairesSav: "Cab1:a",
      datesRdvSavCabines: "Cab1:2026-10-01",
      datesCmdPiecesSavCabines: "Cab1:2026-09-20",
      datesReceptionPiecesSavCabines: "Cab1:2026-10-03",
    });
    expect(c.aFixer).toBe(1);
    expect(c.planifies).toBe(0);
  });

  it("avoue son ignorance sur un SAV sans détail par cabine", () => {
    /* Ancienne base : le SAV est suivi au niveau du projet. On ne sait pas
       combien de cabines sont touchées — et on ne l'invente pas. */
    const c = comptesSavParCabine({ nbCabines: 75 });
    expect(c.detaille).toBe(false);
    expect(c.concernees).toBe(0);
    expect(c.aFixer).toBe(0);
  });

  it("additionne les quatre états jusqu'au total des cabines concernées", () => {
    const c = comptesSavParCabine({
      commentairesSav: "Cab1:a | Cab2:b | Cab3:c | Cab4:d",
      datesSavClotureCabines: "Cab1:2026-10-01",
      datesRdvSavCabines: "Cab2:2026-11-01",
      datesCmdPiecesSavCabines: "Cab3:2026-10-01",
    });
    expect(c.aFixer + c.planifies + c.enAttentePiece + c.regles).toBe(c.concernees);
    expect(c).toMatchObject({ concernees: 4, regles: 1, planifies: 1, enAttentePiece: 1, aFixer: 1 });
  });
});

describe("cabinesAvecSav", () => {
  it("reconnaît un lot par n'importe quelle trace laissée", () => {
    expect([...cabinesAvecSav({ savRetouchesCabines: "Cab7:remplacé" })]).toEqual([7]);
    expect([...cabinesAvecSav({ photosSavRetouches: [{ name: "SAV.Cab9.1.1.jpg" }] })]).toEqual([9]);
    expect([...cabinesAvecSav({ datesSavClotureCabines: "Cab3:2026-10-01" })]).toEqual([3]);
  });

  it("ne voit aucun lot quand rien n'est encodé par cabine", () => {
    expect(cabinesAvecSav({ nbCabines: 12 }).size).toBe(0);
  });
});
