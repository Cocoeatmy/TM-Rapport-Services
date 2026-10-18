/**
 * La fenêtre de préparation automatique : lundi-vendredi, 6 h 30 – 7 h 30.
 *
 * Une règle horaire ne se vérifie pas « à l'œil » : il faudrait déplacer
 * l'horloge de la machine, et on ne le fait qu'une fois. Ici l'heure est un
 * paramètre, et chaque bord de la fenêtre a son cas — 6 h 29, 6 h 30,
 * 7 h 29, 7 h 30. Ce sont les quatre minutes qui décident de tout.
 */
import { describe, it, expect } from "vitest";
import { doitPreparerAutomatiquement, jourDe, type ContexteAuto } from "@/lib/preparation-auto";

/** Un lundi. 2026-10-19 est bien un lundi. */
const lundi = (h: number, m: number) => new Date(2026, 9, 19, h, m, 0);
const samedi = (h: number, m: number) => new Date(2026, 9, 24, h, m, 0);
const dimanche = (h: number, m: number) => new Date(2026, 9, 25, h, m, 0);
const vendredi = (h: number, m: number) => new Date(2026, 9, 23, h, m, 0);

const base = (o: Partial<ContexteAuto> = {}): ContexteAuto => ({
  maintenant: lundi(6, 45),
  enLigne: true,
  quandPrepare: 0,
  dejaFaitLe: null,
  projetsConnus: 12,
  ...o,
});

const motif = (c: Partial<ContexteAuto>) => {
  const v = doitPreparerAutomatiquement(base(c));
  return v.preparer ? null : v.motif;
};

describe("La fenêtre horaire", () => {
  it("s'ouvre à 6 h 30 pile", () => {
    expect(motif({ maintenant: lundi(6, 29) })).toBe("avant 6 h 30");
    expect(doitPreparerAutomatiquement(base({ maintenant: lundi(6, 30) })).preparer).toBe(true);
  });

  it("se ferme à 7 h 30 pile", () => {
    expect(doitPreparerAutomatiquement(base({ maintenant: lundi(7, 29) })).preparer).toBe(true);
    expect(motif({ maintenant: lundi(7, 30) })).toBe("après 7 h 30");
  });

  it("ne fait rien le reste de la journée", () => {
    for (const [h, m] of [[0, 0], [5, 59], [8, 0], [12, 30], [18, 0], [23, 59]] as const) {
      expect(motif({ maintenant: lundi(h, m) }), `${h}h${m}`).toBeTruthy();
    }
  });
});

describe("Les jours", () => {
  it("tourne du lundi au vendredi", () => {
    for (const jour of [19, 20, 21, 22, 23]) {
      const d = new Date(2026, 9, jour, 6, 45, 0);
      expect(doitPreparerAutomatiquement(base({ maintenant: d })).preparer, `le ${jour}`).toBe(true);
    }
  });

  it("se tait le week-end, même dans la bonne tranche horaire", () => {
    expect(motif({ maintenant: samedi(6, 45) })).toBe("ni samedi ni dimanche");
    expect(motif({ maintenant: dimanche(6, 45) })).toBe("ni samedi ni dimanche");
  });
});

describe("Les autres garde-fous", () => {
  it("ne tente rien sans réseau", () => {
    /* Télécharger exige d'être en ligne : sans cela on marquerait la
       journée faite avec une préparation vide. */
    expect(motif({ enLigne: false })).toContain("hors réseau");
  });

  it("attend que la liste des chantiers soit là", () => {
    expect(motif({ projetsConnus: 0 })).toContain("pas encore là");
  });

  it("ne recommence pas deux fois le même jour", () => {
    expect(motif({ dejaFaitLe: "2026-10-19" })).toContain("déjà fait");
    /* …mais le lendemain, si. */
    expect(doitPreparerAutomatiquement(base({
      maintenant: new Date(2026, 9, 20, 6, 45), dejaFaitLe: "2026-10-19",
    })).preparer).toBe(true);
  });

  it("ne refait pas une préparation encore fraîche", () => {
    /* Quelqu'un qui a appuyé sur le bouton à 6 h 25 n'a pas besoin qu'on
       recommence à 6 h 45. */
    const ilYAVingtMinutes = lundi(6, 25).getTime();
    expect(motif({ quandPrepare: ilYAVingtMinutes })).toContain("moins de douze heures");
  });

  it("refait une préparation de la veille", () => {
    const hierSoir = new Date(2026, 9, 18, 17, 0).getTime();
    expect(doitPreparerAutomatiquement(base({ quandPrepare: hierSoir })).preparer).toBe(true);
  });

  it("le vendredi à 7 h 29, avec tout en règle : oui", () => {
    expect(doitPreparerAutomatiquement(base({ maintenant: vendredi(7, 29) })).preparer).toBe(true);
  });
});

describe("La clé du jour", () => {
  it("se lit, et distingue bien deux jours", () => {
    expect(jourDe(new Date(2026, 9, 5))).toBe("2026-10-05");
    expect(jourDe(new Date(2026, 9, 19))).toBe("2026-10-19");
    expect(jourDe(new Date(2026, 0, 1))).toBe("2026-01-01");
  });
});
