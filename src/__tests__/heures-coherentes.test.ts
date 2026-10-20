import { describe, it, expect } from "vitest";
import {
  minutesDeLHeure, departAvantArrivee, incoherencesHeures, messageIncoherence,
  verifierHeuresEntrantes, toucheDesHeures, incoherencesPassages,
} from "@/lib/heures-coherentes";

/**
 * « Arrivée 09:00, départ 08:52 » — le même jour.
 *
 * C'est parti chez le client le 16 octobre 2026. Six chantiers portaient
 * la même incohérence, dont un écart de trois heures.
 *
 * Le garde-fou existait, mais sur le champ DÉPART uniquement : rien
 * n'empêchait de poser ensuite une arrivée plus tardive, ni d'appuyer sur
 * « Arrêter » avant l'heure d'arrivée saisie. Il suffisait de remplir les
 * deux champs dans l'autre ordre.
 */

describe("minutesDeLHeure", () => {
  it("lit l'heure à la fin d'un passage daté", () => {
    /* « 2026-10-16 Claudio & Jean-Marc 09:00 » — la date vient d'abord et
       ne doit pas être prise pour une heure. */
    expect(minutesDeLHeure("2026-10-16 Claudio & Jean-Marc 09:00")).toBe(540);
    expect(minutesDeLHeure("09:00")).toBe(540);
    expect(minutesDeLHeure("2026-07-16:12:44")).toBe(764);
  });

  it("ne rend rien quand il n'y a pas d'heure", () => {
    expect(minutesDeLHeure("")).toBeNull();
    expect(minutesDeLHeure("2026-10-16")).toBeNull();
    expect(minutesDeLHeure(null)).toBeNull();
  });

  it("refuse une heure impossible", () => {
    expect(minutesDeLHeure("99:99")).toBeNull();
  });
});

describe("departAvantArrivee", () => {
  it("LE CAS RÉEL de TM-2600870", () => {
    expect(departAvantArrivee(
      "2026-10-16 Claudio & Jean-Marc 09:00",
      "2026-10-16 Claudio & Jean-Marc 08:52",
    )).toBe(true);
  });

  it("laisse passer l'ordre normal", () => {
    expect(departAvantArrivee("09:00", "17:30")).toBe(false);
    expect(departAvantArrivee("09:00", "09:00")).toBe(false);
  });

  it("ne juge rien quand une heure manque", () => {
    /* Un chantier en cours n'a pas encore d'heure de départ : ce n'est
       pas une erreur, c'est une journée qui n'est pas finie. */
    expect(departAvantArrivee("09:00", "")).toBe(false);
    expect(departAvantArrivee("", "08:52")).toBe(false);
  });

  it("accepte un passage à cheval sur deux jours", () => {
    /* Rare mais légitime — une intervention de nuit. On ne transforme pas
       une règle d'ordre en interdiction de travailler tard. */
    expect(departAvantArrivee("2026-10-16 Claudio 23:00", "2026-10-17 Claudio 01:30")).toBe(false);
  });
});

describe("incoherencesHeures — les trois formes de la base", () => {
  it("un couple simple", () => {
    const x = incoherencesHeures("13:07", "11:00");
    expect(x).toHaveLength(1);
    expect(x[0].ou).toBe("");
  });

  it("une valeur par cabine", () => {
    /* TM-2600566 : « Cab1:2026-07-16:12:44 » contre « …:10:40 ». */
    const x = incoherencesHeures("Cab1:2026-07-16:12:44 | Cab2:08:00", "Cab1:2026-07-16:10:40 | Cab2:17:00");
    expect(x).toHaveLength(1);
    expect(x[0].ou).toBe("Cabine 1");
  });

  it("une liste de passages", () => {
    const x = incoherencesHeures(
      "2026-07-10 Jacobo 13:29 | 2026-07-11 Jacobo 08:00",
      "2026-07-10 Jacobo 10:27 | 2026-07-11 Jacobo 16:00",
    );
    expect(x).toHaveLength(1);
    expect(x[0].ou).toBe("passage 1");
  });

  it("ne signale rien quand tout est en ordre", () => {
    expect(incoherencesHeures("08:00", "17:00")).toEqual([]);
    expect(incoherencesHeures("Cab1:08:00", "Cab1:17:00")).toEqual([]);
    expect(incoherencesHeures("", "")).toEqual([]);
  });

  it("nomme l'endroit fautif dans le message", () => {
    const m = messageIncoherence(incoherencesHeures("Cab3:09:00", "Cab3:08:52"));
    expect(m).toContain("Cabine 3");
    expect(m).toContain("08:52");
    expect(m).toContain("09:00");
  });
});

/**
 * Le contrôle côté serveur — le seul que TOUS les chemins traversent.
 *
 * Les trois éditeurs et le minuteur ont chacun leur garde-fou, mais la
 * file d'attente hors ligne rejoue des saisies faites sans écran, et une
 * écriture peut n'envoyer qu'un seul des deux champs. C'est le résultat
 * qu'il faut juger, pas la seule valeur entrante.
 */
describe("refus côté serveur", () => {
  it("refuse un couple inversé envoyé d'un bloc", () => {
    expect(verifierHeuresEntrantes({ heureArrivee: "09:00", heureDepart: "08:52" }, null))
      .toMatch(/départ 08:52 avant l'arrivée 09:00/);
  });

  it("LA FAILLE : une arrivée envoyée SEULE, après un départ déjà en base", () => {
    /* C'est exactement ainsi que l'incohérence s'est installée. */
    expect(verifierHeuresEntrantes({ heureArrivee: "09:00" }, { heureDepart: "08:52" }))
      .toBeTruthy();
  });

  it("refuse un départ envoyé seul, avant une arrivée déjà en base", () => {
    expect(verifierHeuresEntrantes({ heureDepart: "07:00" }, { heureArrivee: "09:00" }))
      .toBeTruthy();
  });

  it("laisse passer ce qui est cohérent", () => {
    expect(verifierHeuresEntrantes({ heureArrivee: "08:00", heureDepart: "17:00" }, null)).toBeNull();
    expect(verifierHeuresEntrantes({ heureArrivee: "08:00" }, { heureDepart: "17:00" })).toBeNull();
    /* Une journée commencée, pas encore finie. */
    expect(verifierHeuresEntrantes({ heureArrivee: "08:00" }, {})).toBeNull();
  });

  it("couvre AUSSI les heures SAV, pas seulement le montage", () => {
    expect(verifierHeuresEntrantes({ heureArriveeSav: "14:00", heureDepartSav: "13:00" }, null)).toBeTruthy();
  });

  it("ne juge rien quand l'écriture ne touche pas aux heures", () => {
    expect(toucheDesHeures({ etatCMD: "Terminé" })).toBe(false);
    expect(verifierHeuresEntrantes({ etatCMD: "Terminé" }, { heureArrivee: "09:00", heureDepart: "08:00" })).toBeNull();
  });
});

describe("listes de passages (celles que lit le PDF)", () => {
  const existant = "Cab1:2026-10-20~Jean-Marc & Miguel~08:34~11:31 | Cab2:2026-10-20~Miguel~08:12~11:33";

  it("refuse un passage arrivé après son départ (TM-2600797, 20.10.2026)", () => {
    const corps = { interventionsMontageCabines: "Cab1:2026-10-20~Jean-Marc & Miguel~08:34~11:31 | Cab2:2026-10-20~Miguel~13:12~11:33" };
    expect(toucheDesHeures(corps)).toBe(true);
    expect(verifierHeuresEntrantes(corps, { interventionsMontageCabines: existant })).toMatch(/Cabine 2.*départ 11:33 avant l'arrivée 13:12/);
  });

  it("vaut aussi pour les passages SAV, plusieurs par lot", () => {
    expect(incoherencesPassages("Cab3:2026-10-01~Claudio~09:00~10:00 ; 2026-10-09~Claudio~15:00~14:00", "")).toHaveLength(1);
  });

  it("laisse passer un passage juste, ou incomplet", () => {
    expect(verifierHeuresEntrantes({ interventionsMontageCabines: existant }, { interventionsMontageCabines: "" })).toBeNull();
    expect(incoherencesPassages("Cab2:2026-10-20~Miguel~13:12", "")).toHaveLength(0);
  });

  it("ne bloque pas un lot à cause d'une erreur ANCIENNE sur un autre lot", () => {
    const ancien = "Cab1:2026-10-01~Loïc~10:00~09:00";
    const corps = { interventionsMontageCabines: `${ancien} | Cab2:2026-10-20~Miguel~08:12~11:33` };
    expect(verifierHeuresEntrantes(corps, { interventionsMontageCabines: ancien })).toBeNull();
  });
});
