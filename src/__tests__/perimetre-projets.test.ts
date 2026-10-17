/**
 * TEST I — un collaborateur ne doit voir que ce qu'il a le droit de voir.
 *
 * Et le revers, tout aussi important : la restriction ne doit pas lui cacher
 * le travail qui n'appartient à personne. Au 17 octobre 2026, 216 chantiers
 * en cours sur 235 n'ont aucun collaborateur attribué — une lecture
 * littérale de « ses projets » aurait vidé l'application.
 */
import { describe, it, expect } from "vitest";
import {
  estSien, filtrerPerimetre, compterMasques, prenomsDuProjet, prenomDe,
} from "../lib/perimetre-projets";

const JACOBO = "Jacobo Fontan Cassas";
const MIGUEL = "Miguel Roberto";

const p = (collaborateurs: string, id = collaborateurs) => ({ id, collaborateurs });

describe("lire le champ « collaborateurs »", () => {
  it("sépare un binôme", () => {
    expect(prenomsDuProjet(p("Claudio & Jacobo"))).toEqual(["Claudio", "Jacobo"]);
  });

  it("garde les prénoms composés entiers", () => {
    expect(prenomsDuProjet(p("Jean-Marc & Miguel"))).toEqual(["Jean-Marc", "Miguel"]);
  });

  it("encaisse une équipe de quatre", () => {
    expect(prenomsDuProjet(p("Claudio & Jacobo & Jean-Marc & Miguel"))).toHaveLength(4);
  });

  it("rend une liste vide quand personne n'est inscrit", () => {
    expect(prenomsDuProjet(p(""))).toEqual([]);
  });

  it("extrait le prénom d'un compte", () => {
    expect(prenomDe(JACOBO)).toBe("Jacobo");
    expect(prenomDe("Micael Ferreira")).toBe("Micael");
  });
});

describe("à qui est ce chantier", () => {
  it("reconnaît le sien, seul", () => {
    expect(estSien(p("Jacobo"), JACOBO)).toBe(true);
  });

  it("le reconnaît dans un binôme", () => {
    expect(estSien(p("Claudio & Jacobo"), JACOBO)).toBe(true);
  });

  it("ne lui donne pas celui d'un collègue", () => {
    expect(estSien(p("Jean-Marc & Miguel"), JACOBO)).toBe(false);
  });

  it("ignore la casse et les accents", () => {
    expect(estSien(p("loïc"), "Loic Schiro")).toBe(true);
    expect(estSien(p("LOIC"), "Loïc Schiro")).toBe(true);
  });

  /* LA RÈGLE QUI COMPTE, et la raison de ce fichier. */
  it("laisse voir un chantier que PERSONNE n'a pris", () => {
    expect(estSien(p(""), JACOBO)).toBe(true);
  });

  it("laisse voir un chantier confié à l'équipe entière", () => {
    expect(estSien(p("Team TM"), JACOBO)).toBe(true);
    expect(estSien(p("Team"), MIGUEL)).toBe(true);
  });

  it("ne confond pas deux prénoms qui commencent pareil", () => {
    expect(estSien(p("Michel"), "Micael Ferreira")).toBe(false);
  });
});

describe("filtrer une liste", () => {
  const liste = [
    p("", "libre-1"),
    p("", "libre-2"),
    p("Jacobo", "a-jacobo"),
    p("Claudio & Jacobo", "binome-jacobo"),
    p("Jean-Marc & Miguel", "aux-autres"),
    p("Team TM", "equipe"),
  ];

  it("« tous » ne touche à rien", () => {
    expect(filtrerPerimetre(liste, JACOBO, "tous")).toHaveLength(6);
    expect(compterMasques(liste, JACOBO, "tous")).toBe(0);
  });

  it("« les siens » ne retire QUE les chantiers d'un collègue", () => {
    const vus = filtrerPerimetre(liste, JACOBO, "siens").map((x) => x.id);
    expect(vus).toEqual(["libre-1", "libre-2", "a-jacobo", "binome-jacobo", "equipe"]);
    expect(vus).not.toContain("aux-autres");
  });

  it("compte ce qu'elle a masqué, pour pouvoir le dire", () => {
    expect(compterMasques(liste, JACOBO, "siens")).toBe(1);
  });

  it("donne à chacun une vue différente", () => {
    const vuJacobo = filtrerPerimetre(liste, JACOBO, "siens").map((x) => x.id);
    const vuMiguel = filtrerPerimetre(liste, MIGUEL, "siens").map((x) => x.id);
    expect(vuJacobo).toContain("a-jacobo");
    expect(vuMiguel).not.toContain("a-jacobo");
    expect(vuMiguel).toContain("aux-autres");
  });

  it("ne cache rien à un compte sans nom plutôt que de tout cacher par erreur", () => {
    /* Un nom vide ne doit pas transformer la restriction en black-out :
       les chantiers libres restent visibles, les attribués non. */
    const vus = filtrerPerimetre(liste, "", "siens").map((x) => x.id);
    expect(vus).toEqual(["libre-1", "libre-2"]);
  });
});

describe("la proportion réelle du 17 octobre 2026", () => {
  it("une lecture littérale aurait caché l'essentiel du travail", () => {
    /* 216 libres, 6 à Jacobo, 13 à d'autres — l'ordre de grandeur relevé. */
    const reel = [
      ...Array.from({ length: 216 }, (_, i) => p("", `libre-${i}`)),
      ...Array.from({ length: 6 }, (_, i) => p("Claudio & Jacobo", `j-${i}`)),
      ...Array.from({ length: 13 }, (_, i) => p("Jean-Marc & Miguel", `a-${i}`)),
    ];
    const avecLaRegle = filtrerPerimetre(reel, JACOBO, "siens");
    expect(avecLaRegle).toHaveLength(222);

    /* Ce qu'aurait donné « strictement les siens » : six projets sur 235. */
    const litteral = reel.filter((x) => prenomsDuProjet(x).includes("Jacobo"));
    expect(litteral).toHaveLength(6);
  });
});
