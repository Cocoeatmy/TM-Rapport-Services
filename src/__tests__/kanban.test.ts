/**
 * Le Kanban : ce qu'il range, et ce qu'il ne doit jamais perdre.
 *
 * La hantise d'un tableau à colonnes est le projet qui n'apparaît nulle part :
 * statut vide, statut renommé dans Notion, colonne masquée. Un dossier qui
 * disparaît de l'écran sans message est un dossier oublié, et un dossier
 * oublié coûte un chantier. Plusieurs tests ne vérifient que cela.
 */
import { describe, it, expect } from "vitest";
import type { Project } from "../lib/notion";
import {
  SANS_STATUT, LIBELLE_SANS_STATUT, FILTRES_VIDES, REGLAGES_COLONNES_PAR_DEFAUT,
  construireColonnes, comptesParColonne, estClos, filtrer, indexer,
  collaborateursDe, localiteDe, statutDe, trier, valeursDeFiltres, filtresActifs, TRIS,
  type OptionColonne,
} from "../lib/kanban";
import { correspond, foldSearch } from "../lib/recherche-projets";
import { REGLES_PAR_DEFAUT, type Contexte } from "../lib/kanban-indicateurs";
import { VUES_INTEGREES, idDepuisNom } from "../lib/kanban-vues";

function contexteTest(): Contexte {
  return {
    aujourdhui: "2026-10-17",
    maintenant: Date.parse("2026-10-17T12:00:00Z"),
    piecesOuvertes: new Set(),
    manuelles: {},
    regles: REGLES_PAR_DEFAUT,
  };
}

function projet(p: Partial<Project> & { id: string }): Project {
  return {
    createdTime: "2026-01-01T00:00:00.000Z",
    lastEditedTime: "2026-01-01T00:00:00.000Z",
    projet: "", ofrTM: "", emplacementCabine: "", nbCabines: null,
    fournisseurs: [], seriesCabines: [], nomChantier: "", adresseChantier: "",
    collaborateurs: "", etatCMD: "", etatMesures: "",
    ...p,
  } as unknown as Project;
}

const OPTIONS_MESURES: OptionColonne[] = [
  { nom: "Pas contacté", couleur: "gray" },
  { nom: "Contact sans réponse", couleur: "yellow" },
  { nom: "RDV - Attendre news", couleur: "blue" },
  { nom: "RDV - Fixé", couleur: "orange" },
];

describe("l'état lu dépend de la vue", () => {
  const p = projet({ id: "a", etatMesures: "RDV - Fixé", etatCMD: "Cabines en CMD" });

  it("lit « État - Mesures » dans la vue des mesures", () => {
    expect(statutDe(p, "mesures")).toBe("RDV - Fixé");
  });

  it("lit « État - CMD » dans la vue des commandes", () => {
    expect(statutDe(p, "cmd")).toBe("Cabines en CMD");
  });

  it("ne confond jamais les deux : le même projet tombe dans deux colonnes différentes", () => {
    const colsM = construireColonnes([p], "mesures", OPTIONS_MESURES);
    const colsC = construireColonnes([p], "cmd", []);
    expect(colsM.find((c) => c.projets.length)?.id).toBe("RDV - Fixé");
    expect(colsC.find((c) => c.projets.length)?.id).toBe("Cabines en CMD");
  });
});

describe("aucun projet ne disparaît", () => {
  it("range les projets sans statut dans une colonne qui le dit", () => {
    const cols = construireColonnes([projet({ id: "a" })], "mesures", OPTIONS_MESURES);
    const sans = cols.find((c) => c.id === SANS_STATUT);
    expect(sans?.titre).toBe(LIBELLE_SANS_STATUT);
    expect(sans?.projets).toHaveLength(1);
  });

  it("n'affiche pas la colonne « Sans statut » quand elle est vide", () => {
    const p = projet({ id: "a", etatMesures: "Pas contacté" });
    const cols = construireColonnes([p], "mesures", OPTIONS_MESURES);
    expect(cols.some((c) => c.id === SANS_STATUT)).toBe(false);
  });

  it("donne une colonne à un statut absent du schéma plutôt que de jeter le projet", () => {
    const p = projet({ id: "a", etatMesures: "Statut renommé hier" });
    const cols = construireColonnes([p], "mesures", OPTIONS_MESURES);
    const trouvee = cols.find((c) => c.id === "Statut renommé hier");
    expect(trouvee?.projets).toHaveLength(1);
  });

  it("ne cache jamais « Sans statut » même quand on masque les colonnes vides", () => {
    const cols = construireColonnes([projet({ id: "a" })], "mesures", OPTIONS_MESURES,
      { ...REGLAGES_COLONNES_PAR_DEFAUT, masquerVides: true });
    expect(cols.map((c) => c.id)).toEqual([SANS_STATUT]);
  });

  it("compte les projets des colonnes masquées : rien n'est perdu de vue", () => {
    const p = projet({ id: "a", etatMesures: "Pas contacté" });
    const cols = construireColonnes([p], "mesures", OPTIONS_MESURES,
      { ...REGLAGES_COLONNES_PAR_DEFAUT, masquees: ["Pas contacté"] });
    expect(cols.some((c) => c.id === "Pas contacté")).toBe(false);
    expect(comptesParColonne([p], "mesures")["Pas contacté"]).toBe(1);
  });
});

describe("les colonnes suivent Notion", () => {
  it("respectent l'ordre de la base, pas l'ordre alphabétique", () => {
    const projets = OPTIONS_MESURES.map((o, i) => projet({ id: `p${i}`, etatMesures: o.nom }));
    const cols = construireColonnes(projets, "mesures", OPTIONS_MESURES);
    expect(cols.map((c) => c.id)).toEqual([
      "Pas contacté", "Contact sans réponse", "RDV - Attendre news", "RDV - Fixé",
    ]);
  });

  it("gardent la couleur déclarée dans Notion", () => {
    const cols = construireColonnes([], "mesures", OPTIONS_MESURES);
    expect(cols.find((c) => c.id === "RDV - Fixé")?.couleur).toBe("orange");
  });

  it("montrent une colonne vide par défaut : une étape sans dossier reste une étape", () => {
    const cols = construireColonnes([], "mesures", OPTIONS_MESURES);
    expect(cols).toHaveLength(4);
  });
});

describe("la recherche", () => {
  const p = projet({
    id: "a",
    ofrTM: "TM-2600825",
    projet: "Getaz — Installation sanitaire SA",
    adresseChantier: "Rue du Centre 30, 1720 Corminbœuf",
    collaborateurs: "Miguel",
    grossistesNames: ["Getaz Romandie"],
  } as Partial<Project> & { id: string });
  const idx = indexer([p]);

  it.each([
    ["TM-2600825", "le numéro"],
    ["getaz", "le client"],
    ["rue du centre", "l'adresse"],
    ["corminboeuf", "la localité sans accent ni ligature"],
    ["Corminbœuf", "la localité telle qu'écrite"],
    ["1720", "le code postal"],
    ["miguel", "le collaborateur"],
    ["sanitaire sa", "l'entreprise"],
  ])("retrouve le projet par « %s » (%s)", (q) => {
    expect(filtrer(idx, { ...FILTRES_VIDES, recherche: q })).toHaveLength(1);
  });

  it("combine plusieurs mots en ET, dans n'importe quel ordre", () => {
    expect(correspond(p, "getaz corminboeuf")).toBe(true);
    expect(correspond(p, "corminboeuf getaz")).toBe(true);
    expect(correspond(p, "getaz lausanne")).toBe(false);
  });

  it("ignore casse, accents et ligature", () => {
    expect(foldSearch("Corminbœuf")).toBe("corminboeuf");
    expect(foldSearch("CŒUR")).toBe("coeur");
    expect(foldSearch("Épalinges")).toBe("epalinges");
  });

  it("rend tout quand la recherche est vide", () => {
    expect(filtrer(idx, FILTRES_VIDES)).toHaveLength(1);
  });
});

describe("les filtres", () => {
  const a = projet({ id: "a", collaborateurs: "Miguel", adresseChantier: "Rue A 1, 1400 Yverdon", fournisseurs: ["Duka"] });
  const b = projet({ id: "b", collaborateurs: "Claudio & Jacobo", adresseChantier: "Rue B 2, 1000 Lausanne", fournisseurs: ["Ronal"] });
  const idx = indexer([a, b]);

  it("filtrent par collaborateur, y compris dans un binôme", () => {
    expect(filtrer(idx, { ...FILTRES_VIDES, collaborateur: "Jacobo" }).map((p) => p.id)).toEqual(["b"]);
  });

  it("filtrent par fournisseur", () => {
    expect(filtrer(idx, { ...FILTRES_VIDES, fournisseur: "Duka" }).map((p) => p.id)).toEqual(["a"]);
  });

  it("filtrent par localité", () => {
    expect(filtrer(idx, { ...FILTRES_VIDES, localite: "1000 Lausanne" }).map((p) => p.id)).toEqual(["b"]);
  });

  it("ne proposent que des valeurs qui existent", () => {
    const v = valeursDeFiltres([a, b]);
    expect(v.collaborateurs).toEqual(["Claudio", "Jacobo", "Miguel"]);
    expect(v.fournisseurs).toEqual(["Duka", "Ronal"]);
    expect(v.localites).toEqual(["1000 Lausanne", "1400 Yverdon"]);
  });

  it("se comptent, pour que l'écran puisse le dire", () => {
    expect(filtresActifs(FILTRES_VIDES)).toBe(0);
    expect(filtresActifs({ ...FILTRES_VIDES, recherche: "x", localite: "y" })).toBe(2);
  });
});

describe("les dossiers clos", () => {
  const vivant = projet({ id: "a", etatCMD: "Cabines en CMD" });
  const fini = projet({ id: "b", etatCMD: "Terminé" });
  const annule = projet({ id: "c", etatCMD: "Annulé" });
  const idx = indexer([vivant, fini, annule]);

  it("sont reconnus à leur État - CMD", () => {
    expect(estClos(fini)).toBe(true);
    expect(estClos(annule)).toBe(true);
    expect(estClos(vivant)).toBe(false);
  });

  it("sont écartés par défaut", () => {
    expect(filtrer(idx, FILTRES_VIDES).map((p) => p.id)).toEqual(["a"]);
  });

  it("reviennent quand on les demande — ils ne sont jamais supprimés", () => {
    expect(filtrer(idx, { ...FILTRES_VIDES, avecTermines: true })).toHaveLength(3);
  });

  /* ── La régression du 17 octobre 2026 ──────────────────────────────────
     « Terminé » dans État - Mesures veut dire que LES MESURES sont faites,
     pas que le chantier l'est. L'avoir confondu avec une clôture écartait
     122 projets sur 234 — dont les deux seuls « Soucis montage », ce qui
     affichait « Bloqué 0 » alors que deux chantiers l'étaient. */
  it("ne confond pas des mesures terminées avec un chantier terminé", () => {
    const mesure = projet({ id: "m", etatMesures: "Terminé", etatCMD: "Cabines mesurées" });
    expect(estClos(mesure)).toBe(false);
    expect(filtrer(indexer([mesure]), FILTRES_VIDES)).toHaveLength(1);
  });

  it("garde un « Soucis montage » dont les mesures sont terminées", () => {
    const bloque = projet({ id: "s", etatMesures: "Terminé", etatCMD: "Soucis montage" });
    expect(filtrer(indexer([bloque]), FILTRES_VIDES).map((p) => p.id)).toEqual(["s"]);
    const cols = construireColonnes(
      filtrer(indexer([bloque]), FILTRES_VIDES), "cmd", [{ nom: "Soucis montage" }],
    );
    expect(cols.find((c) => c.id === "Soucis montage")?.projets).toHaveLength(1);
  });

  it("range bien les mesures terminées dans la colonne « Terminé » de la vue mesures", () => {
    const mesure = projet({ id: "m", etatMesures: "Terminé", etatCMD: "Cabines mesurées" });
    const cols = construireColonnes([mesure], "mesures", [{ nom: "Terminé" }]);
    expect(cols.find((c) => c.id === "Terminé")?.projets).toHaveLength(1);
  });
});

describe("le tri", () => {
  const vieux = projet({ id: "v", createdTime: "2026-01-01T00:00:00.000Z", ofrTM: "TM-1" });
  const neuf = projet({ id: "n", createdTime: "2026-06-01T00:00:00.000Z", ofrTM: "TM-9" });

  it("met le plus récent en tête", () => {
    expect(trier([vieux, neuf], "recent").map((p) => p.id)).toEqual(["n", "v"]);
  });

  it("respecte l'ordre manuel", () => {
    expect(trier([vieux, neuf], "manuel", ["n", "v"]).map((p) => p.id)).toEqual(["n", "v"]);
    expect(trier([vieux, neuf], "manuel", ["v", "n"]).map((p) => p.id)).toEqual(["v", "n"]);
  });

  it("ne cache pas un nouveau venu tout en bas d'un ordre ancien", () => {
    /* « n » n'est pas dans l'ordre enregistré : il suit les projets rangés,
       mais reste visible — et non relégué derrière une liste interminable. */
    const ordre = trier([vieux, neuf], "manuel", ["v"]);
    expect(ordre.map((p) => p.id)).toEqual(["v", "n"]);
  });
});

describe("lecture de l'adresse", () => {
  it("extrait la localité suisse en fin d'adresse", () => {
    expect(localiteDe(projet({ id: "a", adresseChantier: "Ch. du Bois-Murat 28 à 1066 Epalinges" })))
      .toBe("1066 Epalinges");
  });

  it("ne devine rien quand l'adresse n'en contient pas", () => {
    expect(localiteDe(projet({ id: "a", adresseChantier: "Dépôt" }))).toBe("");
  });

  it("sépare les binômes", () => {
    expect(collaborateursDe(projet({ id: "a", collaborateurs: "Claudio & Jacobo" })))
      .toEqual(["Claudio", "Jacobo"]);
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   Les filtres par couleur, ajoutés en phase 2.
   ───────────────────────────────────────────────────────────────────────── */

describe("filtrer par pastille", () => {
  const urgent = projet({ id: "u", priorite: "Haute" });
  const bloque = projet({ id: "b", etatCMD: "Soucis montage" });
  const calme = projet({ id: "c", etatMesures: "RDV - Fixé" });
  const orphelin = projet({ id: "o", etatMesures: "RDV - Fixé", collaborateurs: "" });
  const porte = projet({ id: "p", etatMesures: "RDV - Fixé", collaborateurs: "Miguel" });
  const idx = indexer([urgent, bloque, calme]);
  const c = contexteTest();

  it("retient une couleur", () => {
    expect(filtrer(idx, { ...FILTRES_VIDES, indicateurs: ["urgent"] }, c).map((p) => p.id)).toEqual(["u"]);
  });

  it("retient l'une OU l'autre quand on en coche deux", () => {
    const r = filtrer(idx, { ...FILTRES_VIDES, indicateurs: ["urgent", "bloque"] }, c).map((p) => p.id);
    expect(r.sort()).toEqual(["b", "u"]);
  });

  it("ne filtre rien sans contexte : on ne devine pas", () => {
    expect(filtrer(idx, { ...FILTRES_VIDES, indicateurs: ["urgent"] })).toHaveLength(3);
  });

  it("trouve les dossiers que personne ne porte", () => {
    const i2 = indexer([orphelin, porte]);
    expect(filtrer(i2, { ...FILTRES_VIDES, sansResponsable: true }, c).map((p) => p.id)).toEqual(["o"]);
  });

  it("rassemble « Mes priorités »", () => {
    const r = filtrer(idx, { ...FILTRES_VIDES, mesPriorites: true }, c).map((p) => p.id);
    expect(r.sort()).toEqual(["b", "u"]);
  });
});

describe("les vues enregistrées", () => {
  it("couvrent les questions du matin", () => {
    const noms = VUES_INTEGREES.map((v) => v.nom);
    expect(noms).toContain("À traiter aujourd'hui");
    expect(noms).toContain("Projets urgents");
    expect(noms).toContain("Projets à relancer");
    expect(noms).toContain("Projets bloqués");
    expect(noms).toContain("Projets sans responsable");
  });

  it("portent des filtres cohérents avec ce qu'elles annoncent", () => {
    const urgents = VUES_INTEGREES.find((v) => v.id === "urgents")!;
    expect(urgents.filtres.indicateurs).toEqual(["urgent"]);
    const aujourdhui = VUES_INTEGREES.find((v) => v.id === "aujourdhui")!;
    expect(aujourdhui.filtres.mesPriorites).toBe(true);
  });

  it("sont toutes marquées comme fournies, donc non supprimables", () => {
    expect(VUES_INTEGREES.every((v) => v.integree)).toBe(true);
  });

  it("fabriquent un identifiant lisible depuis le nom", () => {
    expect(idDepuisNom("À traiter aujourd'hui")).toBe("a-traiter-aujourd-hui");
    expect(idDepuisNom("Mesures / Yverdon")).toBe("mesures-yverdon");
  });

  it("donnent un identifiant même à un nom qui n'a que des symboles", () => {
    expect(idDepuisNom("###")).toMatch(/^vue-\d+$/);
  });
});

describe("le tri « Priorité automatique »", () => {
  const calme = projet({ id: "calme", etatMesures: "RDV - Fixé", createdTime: "2026-01-01T00:00:00.000Z" });
  const bloque = projet({ id: "bloque", etatCMD: "Soucis montage", createdTime: "2026-01-01T00:00:00.000Z" });
  const urgent = projet({ id: "urgent", priorite: "Haute", createdTime: "2026-01-01T00:00:00.000Z" });

  it("fait remonter ce qui demande une action", () => {
    const r = trier([calme, bloque, urgent], "priorite", [], contexteTest());
    expect(r.map((p) => p.id)).toEqual(["urgent", "bloque", "calme"]);
  });

  it("retombe sur le plus récent quand la gravité est inconnue", () => {
    const vieux = projet({ id: "v", createdTime: "2026-01-01T00:00:00.000Z" });
    const neuf = projet({ id: "n", createdTime: "2026-06-01T00:00:00.000Z" });
    expect(trier([vieux, neuf], "priorite").map((p) => p.id)).toEqual(["n", "v"]);
  });

  it("est proposé dans la liste des tris", () => {
    expect(TRIS.map((t) => t.id)).toContain("priorite");
  });
});
