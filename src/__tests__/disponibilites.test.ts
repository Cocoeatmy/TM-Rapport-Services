import { describe, it, expect } from "vitest";
import {
  capaciteDuJour, etatDuJour, journeeDe, tableauDisponibilites,
  CAPACITE, type SegmentJour,
} from "@/lib/disponibilites";

describe("plafond du jour", () => {
  it("suit la taille de l'équipe", () => {
    expect(capaciteDuJour(1)).toBe(CAPACITE.solo);   // 3
    expect(capaciteDuJour(2)).toBe(CAPACITE.binome); // 4
    expect(capaciteDuJour(3)).toBe(CAPACITE.groupe); // 5
    expect(capaciteDuJour(4)).toBe(CAPACITE.groupe);
    expect(capaciteDuJour(0)).toBe(CAPACITE.solo);
  });
});

describe("état d'une journée", () => {
  it("vide, entamée, pleine", () => {
    expect(etatDuJour({ cabines: 0, capacite: 3 })).toBe("libre");
    expect(etatDuJour({ cabines: 1, capacite: 3 })).toBe("partiel");
    expect(etatDuJour({ cabines: 2, capacite: 3 })).toBe("partiel");
    expect(etatDuJour({ cabines: 3, capacite: 3 })).toBe("plein");
    /* Au-delà du plafond, toujours « plein » : la pastille ne crie pas. Le
       détail au survol dit s'il y a excès. */
    expect(etatDuJour({ cabines: 7, capacite: 4 })).toBe("plein");
  });
});

describe("journée d'un collaborateur", () => {
  const jour: SegmentJour[] = [
    { label: "Jean-Marc & Miguel", cab: 4, chantiers: 1 },
    { label: "Claudio", cab: 2, chantiers: 2 },
    { label: "Non attribué", cab: 1, chantiers: 1 },
  ];

  it("additionne ce qui le concerne, et rien d'autre", () => {
    expect(journeeDe("Miguel", jour).cabines).toBe(4);
    expect(journeeDe("Claudio", jour).cabines).toBe(2);
    expect(journeeDe("Jacobo", jour).cabines).toBe(0);
  });

  it("applique le plafond du binôme à ses deux membres", () => {
    expect(journeeDe("Jean-Marc", jour).capacite).toBe(CAPACITE.binome);
    expect(journeeDe("Jean-Marc", jour).etat).toBe("plein");
    expect(journeeDe("Claudio", jour).capacite).toBe(CAPACITE.solo);
    expect(journeeDe("Claudio", jour).etat).toBe("partiel");
  });

  it("laisse libre celui qui n'apparaît nulle part", () => {
    const j = journeeDe("Javier", jour);
    expect(j.etat).toBe("libre");
    expect(j.equipes).toEqual([]);
  });

  /* Le libellé d'équipe vient de Notion et contient parfois deux fois le même
     nom (« Claudio & Claudio & Jacobo ») : c'est un binôme, pas un trio. */
  it("ne compte pas deux fois un nom répété dans le libellé", () => {
    const seg: SegmentJour[] = [{ label: "Claudio & Claudio & Jacobo", cab: 4 }];
    expect(journeeDe("Claudio", seg).capacite).toBe(CAPACITE.binome);
  });

  it("ignore la casse des prénoms", () => {
    expect(journeeDe("jean-marc", jour).cabines).toBe(4);
  });

  it("retient les équipes et le nombre de chantiers, pour l'infobulle", () => {
    const j = journeeDe("Miguel", jour);
    expect(j.equipes).toEqual(["Jean-Marc & Miguel"]);
    expect(j.chantiers).toBe(1);
  });

  it("cumule quand quelqu'un figure dans deux groupes le même jour", () => {
    const deux: SegmentJour[] = [
      { label: "Claudio", cab: 2, chantiers: 1 },
      { label: "Claudio & Jacobo", cab: 2, chantiers: 1 },
    ];
    const j = journeeDe("Claudio", deux);
    expect(j.cabines).toBe(4);
    expect(j.capacite).toBe(CAPACITE.binome);
    expect(j.etat).toBe("plein");
  });
});

describe("tableau de la semaine", () => {
  const semaine: SegmentJour[][] = [
    [{ label: "Claudio", cab: 3 }],
    [],
    [{ label: "Claudio & Jacobo", cab: 2 }],
    [],
    [],
  ];
  const DATES = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"];

  it("garde l'ordre des collaborateurs qu'on lui donne", () => {
    const t = tableauDisponibilites(semaine, ["Claudio", "Jacobo", "Miguel"]);
    expect(t.map((l) => l.nom)).toEqual(["Claudio", "Jacobo", "Miguel"]);
    expect(t[0].jours.map((j) => j.etat)).toEqual(["plein", "libre", "partiel", "libre", "libre"]);
    expect(t[0].total).toBe(5);
    expect(t[2].total).toBe(0);
    expect(t[2].jours.every((j) => j.etat === "libre")).toBe(true);
  });

  /* Le plafond suit les équipes réelles : Claudio est seul le lundi (3) et en
     binôme le mercredi (4), seul les trois autres jours — 3+3+4+3+3 = 16, et
     non un forfait de quinze. */
  it("compte le plafond de la semaine équipe par équipe", () => {
    const t = tableauDisponibilites(semaine, ["Claudio"]);
    expect(t[0].plafond).toBe(16);
    expect(t[0].total).toBe(5);
    expect(t[0].pourcent).toBe(31);
  });

  it("rend zéro pour celui qui n'a rien, sans diviser par zéro", () => {
    const t = tableauDisponibilites([[], [], [], [], []], ["Javier"]);
    expect(t[0].plafond).toBe(15);
    expect(t[0].pourcent).toBe(0);
  });

  /* Une absence est notée à la main : rien dans les données ne permet de la
     deviner. Elle noircit la case SANS retirer le travail qui s'y trouve. */
  it("noircit les journées marquées absentes", () => {
    const absents = new Set(["claudio|2026-10-14"]);
    const t = tableauDisponibilites(semaine, ["Claudio"], { jours: DATES, absents });
    expect(t[0].jours[2].etat).toBe("absent");
    expect(t[0].jours[2].cabines).toBe(2);
    expect(t[0].jours[0].etat).toBe("plein");
    expect(t[0].total).toBe(5);
  });

  it("ignore la casse du prénom dans la clé d'absence", () => {
    const t = tableauDisponibilites(semaine, ["Claudio"], {
      jours: DATES,
      absents: new Set(["claudio|2026-10-12"]),
    });
    expect(t[0].jours[0].etat).toBe("absent");
  });

  it("sans dates, aucune absence n'est appliquée", () => {
    const t = tableauDisponibilites(semaine, ["Claudio"], {
      absents: new Set(["claudio|2026-10-12"]),
    });
    expect(t[0].jours[0].etat).toBe("plein");
  });
});
