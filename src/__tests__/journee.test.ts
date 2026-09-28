/**
 * La journée type.
 *
 * Le risque de cette analyse est de compter deux fois le même temps : la route
 * entre deux chantiers est DÉJÀ dans l'amplitude pointée, celle du dépôt ne
 * l'est pas. C'est ce que ces cas vérifient, avec la règle du binôme.
 */
import { describe, it, expect } from "vitest";
import type { Project } from "../lib/notion";
import { journeeType } from "../lib/journee";

const BASE = {
  id: "p", ofrTM: "TM-1", projet: "Duka - Lot A, Rue du Test 1 à 1400 Yverdon",
  adresseChantier: "Rue du Test 1, 1400 Yverdon-les-Bains, Suisse",
  etatCMD: "Terminé", typeServices: [], nbCabines: 1,
  dateMontage: "2026-06-01", collaborateurs: "Miguel",
  heureArrivee: "08:00", heureDepart: "12:00",
} as unknown as Project;

const p = (o: Record<string, unknown>) => ({ ...BASE, ...o } as unknown as Project);
/** N journées identiques, une par jour ouvré, pour dépasser le seuil. */
const jours = (n: number, o: Record<string, unknown> = {}) =>
  Array.from({ length: n }, (_, i) =>
    p({ id: `j${i}`, dateMontage: `2026-06-${String(i + 1).padStart(2, "0")}`, ...o }));

describe("journée type", () => {
  it("mesure la présence et encadre la journée par la route du dépôt", () => {
    const { ensemble } = journeeType(jours(6), {});
    expect(ensemble).not.toBeNull();
    expect(ensemble!.jours).toBe(6);
    expect(ensemble!.minutesChantier).toBe(240);          // 08:00 → 12:00
    // La journée dépasse l'amplitude : il faut aller au chantier et en revenir.
    expect(ensemble!.minutesJournee).toBeGreaterThan(240);
    expect(ensemble!.minutesRoute).toBeGreaterThan(0);
  });

  it("compte un binôme comme deux journées, sur la même amplitude", () => {
    const solo = journeeType(jours(6), {}).ensemble!;
    const duo = journeeType(jours(6, { collaborateurs: "Miguel & Claudio" }), {}).ensemble!;
    expect(duo.jours).toBe(solo.jours * 2);
    // La journée de CHACUN reste la même : on décrit une personne, pas un chantier.
    expect(duo.minutesJournee).toBe(solo.minutesJournee);
  });

  it("écarte « Team », dont on ignore l'effectif", () => {
    expect(journeeType(jours(6, { collaborateurs: "Team TM" }), {}).ensemble).toBeNull();
  });

  it("ne compte pas deux fois la liaison entre deux chantiers du même jour", () => {
    /* Deux chantiers le même jour, 4 h chacun, amplitude 08:00 → 17:00 :
       l'heure non pointée est de la route et des pauses, pas du chantier. */
    const deux = [
      p({ id: "a", heureArrivee: "08:00", heureDepart: "12:00" }),
      p({ id: "b", heureArrivee: "13:00", heureDepart: "17:00",
          adresseChantier: "Rue du Test 2, 1700 Fribourg, Suisse",
          projet: "Duka - Lot B, Rue du Test 2 à 1700 Fribourg" }),
    ];
    const { ensemble } = journeeType(
      deux.flatMap((x, k) => Array.from({ length: 3 }, (_, i) =>
        ({ ...x, id: `${k}-${i}`, dateMontage: `2026-06-0${i + 1}` } as Project))),
      {},
    );
    expect(ensemble!.jours).toBe(3);
    expect(ensemble!.minutesChantier).toBe(480);
    // Présence + route + reste ne dépassent jamais la journée reconstituée.
    expect(ensemble!.minutesChantier + ensemble!.minutesReste)
      .toBeLessThanOrEqual(ensemble!.minutesJournee);
  });

  it("n'affiche pas un monteur sous cinq journées", () => {
    const { parMonteur } = journeeType(jours(3), {});
    expect(parMonteur).toEqual([]);
    expect(journeeType(jours(5), {}).parMonteur.map((l) => l.nom)).toEqual(["Miguel"]);
  });
});
