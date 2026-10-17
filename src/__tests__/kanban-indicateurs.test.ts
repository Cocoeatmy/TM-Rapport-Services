/**
 * Les pastilles : ce qu'elles promettent, et surtout ce qu'elles ne doivent
 * jamais inventer.
 *
 * Deux garanties sont testées plus que les autres, parce que ce sont elles
 * qui décident si l'outil sera cru :
 *   — une attente n'est pas un blocage ;
 *   — une priorité posée à la main n'efface jamais une alerte réelle.
 */
import { describe, it, expect } from "vitest";
import type { Project } from "../lib/notion";
import {
  META_INDICATEURS, ORDRE_INDICATEURS, REGLES_PAR_DEFAUT,
  aRelancer, comptesIndicateurs, estDansMesPriorites, estEnAttente, estNouveau,
  estUrgent, joursEntre, joursSansEvolution, situationDe,
  type Contexte, type LigneHistorique,
} from "../lib/kanban-indicateurs";

const AUJOURDHUI = "2026-10-17";
const MAINTENANT = Date.parse(`${AUJOURDHUI}T12:00:00Z`);

function ctx(p: Partial<Contexte> = {}): Contexte {
  return {
    aujourdhui: AUJOURDHUI,
    maintenant: MAINTENANT,
    piecesOuvertes: new Set(),
    manuelles: {},
    regles: REGLES_PAR_DEFAUT,
    ...p,
  };
}

function projet(p: Partial<Project> & { id: string }): Project {
  return {
    createdTime: "2026-01-01T00:00:00.000Z",
    lastEditedTime: "2026-01-01T00:00:00.000Z",
    projet: "", ofrTM: "", nbCabines: null, etatCMD: "", etatMesures: "",
    collaborateurs: "", adresseChantier: "", priorite: "",
    dateMontage: null, dateOffre: null, dateCMDRecue: null, relanceDossier: null,
    previsionLivraison: null, arrivageTM: null, arrivageGrossiste: null,
    emplacementCabine: "",
    ...p,
  } as unknown as Project;
}

describe("le catalogue des pastilles", () => {
  it("décrit chaque indicateur", () => {
    for (const i of ORDRE_INDICATEURS) {
      expect(META_INDICATEURS[i]?.libelle, i).toBeTruthy();
      expect(META_INDICATEURS[i]?.trait, i).toMatch(/^#/);
    }
  });

  it("classe du plus grave au plus anodin", () => {
    expect(ORDRE_INDICATEURS[0]).toBe("urgent");
    expect(ORDRE_INDICATEURS[ORDRE_INDICATEURS.length - 1]).toBe("ajour");
  });
});

describe("une attente n'est pas un blocage", () => {
  const attente = projet({ id: "a", etatMesures: "RDV - Attendre news" });

  it("reconnaît l'attente au texte du statut", () => {
    expect(estEnAttente(attente)).toBe(true);
    expect(estEnAttente(projet({ id: "b", etatMesures: "RDV - Fixé" }))).toBe(false);
  });

  it("ne la transforme jamais en blocage", () => {
    const s = situationDe(attente, ctx());
    expect(s.tous).toContain("attente");
    expect(s.tous).not.toContain("bloque");
  });

  it("ne bloque que sur un fait : pièce ouverte ou statut « Soucis montage »", () => {
    const piece = situationDe(attente, ctx({ piecesOuvertes: new Set(["a"]) }));
    expect(piece.tous).toContain("bloque");
    const souci = situationDe(projet({ id: "c", etatCMD: "Soucis montage" }), ctx());
    expect(souci.tous).toContain("bloque");
  });
});

describe("urgent", () => {
  it("suit la priorité posée dans Notion", () => {
    expect(estUrgent(projet({ id: "a", priorite: "Haute" }), AUJOURDHUI)).toBe(true);
  });

  it("ignore « Normal » : sinon tout le tableau serait rouge", () => {
    expect(estUrgent(projet({ id: "a", priorite: "Normal" }), AUJOURDHUI)).toBe(false);
    expect(estUrgent(projet({ id: "b", priorite: "" }), AUJOURDHUI)).toBe(false);
  });

  it("compte un montage dont la date est passée sans rien de posé", () => {
    const p = projet({ id: "a", dateMontage: "2026-10-10", nbCabines: 2 });
    expect(estUrgent(p, AUJOURDHUI)).toBe(true);
    expect(situationDe(p, ctx()).raisons.join(" ")).toContain("retard");
  });

  it("compte une livraison annoncée et jamais arrivée", () => {
    expect(estUrgent(projet({ id: "a", previsionLivraison: "2026-10-01" }), AUJOURDHUI)).toBe(true);
  });

  it("se tait dès que la marchandise est arrivée", () => {
    expect(estUrgent(projet({ id: "a", previsionLivraison: "2026-10-01", arrivageTM: "2026-10-05" }), AUJOURDHUI)).toBe(false);
  });
});

describe("à relancer", () => {
  const r = REGLES_PAR_DEFAUT;

  it("se déclenche sur une offre ancienne sans commande", () => {
    expect(aRelancer(projet({ id: "a", dateOffre: "2026-09-20" }), AUJOURDHUI, r)).toBe(true);
  });

  it("se tait tant que l'offre est fraîche", () => {
    expect(aRelancer(projet({ id: "a", dateOffre: "2026-10-14" }), AUJOURDHUI, r)).toBe(false);
  });

  it("se tait dès qu'une commande est reçue", () => {
    expect(aRelancer(projet({ id: "a", dateOffre: "2026-09-01", dateCMDRecue: "2026-09-15" }), AUJOURDHUI, r)).toBe(false);
  });

  it("repart de la dernière relance, pas de l'offre", () => {
    /* Relancé il y a trois jours : on ne reharcèle pas le client. */
    expect(aRelancer(projet({ id: "a", dateOffre: "2026-01-01", relanceDossier: "2026-10-14" }), AUJOURDHUI, r)).toBe(false);
    expect(aRelancer(projet({ id: "b", dateOffre: "2026-01-01", relanceDossier: "2026-09-01" }), AUJOURDHUI, r)).toBe(true);
  });

  it("se tait sur un dossier clos", () => {
    expect(aRelancer(projet({ id: "a", dateOffre: "2026-01-01", etatCMD: "Terminé" }), AUJOURDHUI, r)).toBe(false);
  });
});

describe("nouveau", () => {
  it("dure 48 heures", () => {
    const frais = projet({ id: "a", createdTime: "2026-10-16T12:00:00.000Z" });
    const vieux = projet({ id: "b", createdTime: "2026-10-10T12:00:00.000Z" });
    expect(estNouveau(frais, MAINTENANT, 48)).toBe(true);
    expect(estNouveau(vieux, MAINTENANT, 48)).toBe(false);
  });
});

describe("une seule pastille, mais tous les filtres", () => {
  const p = projet({
    id: "a",
    priorite: "Haute",
    etatCMD: "Soucis montage",
    createdTime: "2026-10-16T12:00:00.000Z",
  });

  it("affiche la plus grave", () => {
    expect(situationDe(p, ctx()).principal).toBe("urgent");
  });

  it("retient quand même les autres situations", () => {
    const s = situationDe(p, ctx());
    expect(s.tous).toContain("urgent");
    expect(s.tous).toContain("bloque");
    expect(s.tous).toContain("nouveau");
  });

  it("met « à jour » quand il n'y a rien à dire", () => {
    const s = situationDe(projet({ id: "z", etatMesures: "RDV - Fixé" }), ctx());
    expect(s.principal).toBe("ajour");
    expect(s.tous).toEqual(["ajour"]);
  });
});

describe("la priorité posée à la main", () => {
  const enRetard = projet({ id: "a", dateMontage: "2026-10-01", nbCabines: 1 });

  it("décide de la couleur affichée", () => {
    const s = situationDe(enRetard, ctx({ manuelles: { a: "ajour" } }));
    expect(s.principal).toBe("ajour");
    expect(s.manuelle).toBe("ajour");
  });

  it("n'efface JAMAIS l'alerte réelle : le projet reste dans « Urgents »", () => {
    const s = situationDe(enRetard, ctx({ manuelles: { a: "ajour" } }));
    expect(s.tous).toContain("urgent");
  });

  it("le dit dans l'explication", () => {
    const s = situationDe(enRetard, ctx({ manuelles: { a: "ajour" } }));
    expect(s.raisons[0]).toContain("à la main");
  });
});

describe("les compteurs", () => {
  it("comptent un projet dans chacune de ses situations", () => {
    const p = projet({ id: "a", priorite: "Haute", etatCMD: "Soucis montage" });
    const c = comptesIndicateurs([p], ctx());
    expect(c.urgent).toBe(1);
    expect(c.bloque).toBe(1);
    expect(c.ajour).toBe(0);
  });
});

describe("mes priorités", () => {
  it("retient l'urgent, le bloqué et le à-relancer", () => {
    expect(estDansMesPriorites(projet({ id: "a", priorite: "Haute" }), ctx())).toBe(true);
    expect(estDansMesPriorites(projet({ id: "b", etatCMD: "Soucis montage" }), ctx())).toBe(true);
    expect(estDansMesPriorites(projet({ id: "c", dateOffre: "2026-01-01" }), ctx())).toBe(true);
  });

  it("retient aussi un montage prévu aujourd'hui", () => {
    expect(estDansMesPriorites(projet({ id: "d", dateMontage: AUJOURDHUI }), ctx())).toBe(true);
  });

  it("laisse de côté un dossier tranquille", () => {
    expect(estDansMesPriorites(projet({ id: "e", etatMesures: "RDV - Fixé" }), ctx())).toBe(false);
  });
});

describe("les jours sans évolution", () => {
  const h: LigneHistorique[] = [
    { projetId: "a", vue: "mesures", avant: "Pas contacté", apres: "RDV - Fixé", quand: "2026-10-07T09:00:00.000Z", qui: "Micael" },
    { projetId: "a", vue: "mesures", avant: "RDV - Fixé", apres: "Mesures partielles", quand: "2026-10-12T09:00:00.000Z", qui: "Micael" },
  ];

  it("comptent depuis le dernier changement connu", () => {
    expect(joursSansEvolution("a", "mesures", h, AUJOURDHUI)).toBe(5);
  });

  it("n'inventent RIEN quand le journal ne sait pas", () => {
    expect(joursSansEvolution("inconnu", "mesures", h, AUJOURDHUI)).toBeNull();
    expect(joursSansEvolution("a", "cmd", h, AUJOURDHUI)).toBeNull();
  });

  it("comptent les jours correctement", () => {
    expect(joursEntre("2026-10-10", "2026-10-17")).toBe(7);
    expect(joursEntre("2026-10-17", "2026-10-10")).toBe(0);
  });
});
