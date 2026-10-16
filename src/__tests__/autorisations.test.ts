/**
 * Les autorisations : ce qu'elles accordent, et ce qu'elles ne peuvent pas
 * retirer.
 *
 * Deux dangers guettent un système de droits. Le premier est de bloquer du
 * travail légitime le jour de sa mise en service : les valeurs par défaut
 * doivent reproduire l'existant, et c'est vérifié ici droit par droit. Le
 * second est de se croire protégé : le dernier test relit le code des routes
 * et refuse toute autorisation inventée, car une faute de frappe dans un
 * identifiant produit un verrou qui ne verrouille rien.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  CATALOGUE,
  PROFILS,
  TOUS_LES_DROITS,
  droitsEffectifs,
  peut,
  profilDeCompte,
  profilEffectif,
  resumeChangement,
  REGLAGES_VIDES,
  type Reglages,
} from "../lib/droits";

const MICAEL = "ferreira.micael@gmail.com";
const JACOBO = "tm.douche.montage.3@gmail.com";

describe("catalogue", () => {
  it("n'a aucun identifiant en double", () => {
    expect(new Set(TOUS_LES_DROITS).size).toBe(TOUS_LES_DROITS.length);
  });

  it("donne à chaque droit un libellé et une description lisibles", () => {
    for (const cat of CATALOGUE) {
      for (const d of cat.droits) {
        expect(d.libelle.length).toBeGreaterThan(3);
        expect(d.description.length).toBeGreaterThan(10);
        // Aucun jargon : c'est la raison d'être de cet écran.
        expect(d.description).not.toMatch(/API|route|token|middleware|HMAC|GET|POST/i);
      }
    }
  });

  it("couvre chaque droit dans les trois profils", () => {
    for (const profil of Object.values(PROFILS)) {
      for (const id of TOUS_LES_DROITS) {
        expect(profil.droits[id], id).toBeDefined();
      }
    }
  });
});

describe("l'administrateur garde la main", () => {
  it("a tous les droits, quoi qu'on ait enregistré contre lui", () => {
    const hostile: Reglages = {
      version: 1,
      profils: {},
      comptes: {
        [MICAEL]: {
          profil: "collaborateur",
          droits: Object.fromEntries(TOUS_LES_DROITS.map((id) => [id, "non" as const])),
          perimetre: "siens",
        },
      },
      historique: [],
    };
    const d = droitsEffectifs(MICAEL, "admin", hostile);
    expect(d.profil).toBe("administrateur");
    expect(d.perimetre).toBe("tous");
    for (const id of TOUS_LES_DROITS) expect(peut(d, id), id).toBe(true);
  });

  it("garde en particulier la gestion des autorisations", () => {
    const d = droitsEffectifs(MICAEL, "admin", REGLAGES_VIDES);
    expect(peut(d, "administration.droits")).toBe(true);
  });
});

describe("le profil « collaborateur » reproduit l'existant", () => {
  const d = droitsEffectifs(JACOBO, "monteur", REGLAGES_VIDES);

  it("est le profil appliqué par défaut", () => {
    expect(profilDeCompte(JACOBO, "monteur", REGLAGES_VIDES)).toBe("collaborateur");
  });

  it.each([
    "tableau.voir",
    "tableau.calendrier",
    "projets.voir",
    "projets.modifier",
    "projets.termines",
    "documents.ajouter",
    "rapports.heures",
    "mesures.saisir",
    "signalements.voir",
    "signalements.creer",
    "signalements.modifier",
    "stock.voir",
    /* Déjà possibles aujourd'hui : seules les suppressions étaient réservées.
       Les couper d'office aurait arrêté du travail en cours. */
    "stock.modifier",
    "carnet.voir",
    "carnet.modifier",
  ])("laisse « %s » autorisé", (id) => {
    expect(peut(d, id)).toBe(true);
  });

  it.each([
    "projets.creer",
    "projets.supprimer",
    "carnet.supprimer",
    "tableau.activite",
    "stats.voir",
    "argent.voir",
    "argent.relances",
    "administration.comptes",
    "administration.droits",
  ])("laisse « %s » interdit", (id) => {
    expect(peut(d, id)).toBe(false);
  });
});

describe("le profil « responsable »", () => {
  const reglages: Reglages = { ...REGLAGES_VIDES, comptes: { [JACOBO]: { profil: "responsable" } } };
  const d = droitsEffectifs(JACOBO, "monteur", reglages);

  it("pilote les chantiers de bout en bout", () => {
    expect(peut(d, "projets.creer")).toBe(true);
    expect(peut(d, "projets.supprimer")).toBe(true);
    expect(peut(d, "stats.voir")).toBe(true);
  });

  it("n'approche ni l'argent ni les comptes", () => {
    expect(peut(d, "argent.voir")).toBe(false);
    expect(peut(d, "administration.comptes")).toBe(false);
    expect(peut(d, "administration.droits")).toBe(false);
  });
});

describe("réglages généraux et exceptions personnelles", () => {
  it("un réglage général s'applique à tout le profil", () => {
    const reglages: Reglages = {
      ...REGLAGES_VIDES,
      profils: { collaborateur: { droits: { "projets.modifier": "non" } } },
    };
    expect(profilEffectif("collaborateur", reglages).droits["projets.modifier"]).toBe("non");
    const d = droitsEffectifs(JACOBO, "monteur", reglages);
    expect(peut(d, "projets.modifier")).toBe(false);
    expect(d.droits["projets.modifier"].source).toBe("profil");
  });

  it("une exception personnelle l'emporte sur le réglage général", () => {
    const reglages: Reglages = {
      ...REGLAGES_VIDES,
      profils: { collaborateur: { droits: { "projets.modifier": "non" } } },
      comptes: { [JACOBO]: { droits: { "projets.modifier": "oui" } } },
    };
    const d = droitsEffectifs(JACOBO, "monteur", reglages);
    expect(peut(d, "projets.modifier")).toBe(true);
    expect(d.droits["projets.modifier"].source).toBe("personnalise");
  });

  it("effacer l'exception fait revenir le réglage général", () => {
    const general: Reglages = {
      ...REGLAGES_VIDES,
      profils: { collaborateur: { droits: { "projets.modifier": "non" } } },
    };
    const d = droitsEffectifs(JACOBO, "monteur", general);
    expect(peut(d, "projets.modifier")).toBe(false);
    expect(d.droits["projets.modifier"].source).toBe("profil");
  });
});

describe("le périmètre des projets", () => {
  it("vaut « tous » tant qu'on n'a rien décidé", () => {
    expect(droitsEffectifs(JACOBO, "monteur", REGLAGES_VIDES).perimetre).toBe("tous");
  });

  it("se restreint compte par compte", () => {
    const reglages: Reglages = { ...REGLAGES_VIDES, comptes: { [JACOBO]: { perimetre: "siens" } } };
    const d = droitsEffectifs(JACOBO, "monteur", reglages);
    expect(d.perimetre).toBe("siens");
    expect(d.perimetreSource).toBe("personnalise");
  });

  it("ne donne pas le droit de modifier ce qu'on voit", () => {
    const reglages: Reglages = {
      ...REGLAGES_VIDES,
      comptes: { [JACOBO]: { perimetre: "tous", droits: { "projets.modifier": "non" } } },
    };
    const d = droitsEffectifs(JACOBO, "monteur", reglages);
    expect(peut(d, "projets.voir")).toBe(true);
    expect(peut(d, "projets.modifier")).toBe(false);
  });
});

describe("les niveaux", () => {
  it("« lecture seule » laisse consulter, pas agir", () => {
    const reglages: Reglages = {
      ...REGLAGES_VIDES,
      comptes: { [JACOBO]: { droits: { "rapports.rediger": "lecture" } } },
    };
    const d = droitsEffectifs(JACOBO, "monteur", reglages);
    expect(peut(d, "rapports.rediger", "lecture")).toBe(true);
    expect(peut(d, "rapports.rediger")).toBe(false);
  });

  it("« interdit » ferme aussi la consultation", () => {
    const reglages: Reglages = {
      ...REGLAGES_VIDES,
      comptes: { [JACOBO]: { droits: { "rapports.rediger": "non" } } },
    };
    const d = droitsEffectifs(JACOBO, "monteur", reglages);
    expect(peut(d, "rapports.rediger", "lecture")).toBe(false);
  });

  it("résume un changement en français", () => {
    expect(resumeChangement("projets.modifier", "oui", "non")).toBe("Modifier un projet : autorisé → interdit");
  });
});

/* ───────────────────────────────────────────────────────────────────────────
   Le garde-fou qui compte : un verrou posé sur un droit inexistant ne
   protégerait rien, et rien à l'écran ne le dirait.
   ─────────────────────────────────────────────────────────────────────────── */

function sources(dossier: string, out: string[] = []): string[] {
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) sources(chemin, out);
    else if (/\.tsx?$/.test(nom)) out.push(chemin);
  }
  return out;
}

describe("les verrous posés dans les routes", () => {
  const fichiers = sources(join(process.cwd(), "src", "app"));
  const utilises = new Set<string>();
  for (const f of fichiers) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/(?:exigerDroit|aLeDroit)\(\s*["']([^"']+)["']/g)) {
      utilises.add(m[1]);
    }
  }

  it("protègent au moins les opérations sensibles", () => {
    expect(utilises.size).toBeGreaterThanOrEqual(10);
  });

  it("n'invoquent que des autorisations qui existent", () => {
    const inconnues = [...utilises].filter((id) => !TOUS_LES_DROITS.includes(id));
    expect(inconnues).toEqual([]);
  });

  it("couvrent les écritures les plus lourdes de conséquences", () => {
    for (const id of [
      "projets.modifier",
      "projets.creer",
      "signalements.supprimer",
      "documents.ajouter",
      "administration.comptes",
      "administration.droits",
    ]) {
      expect(utilises.has(id), id).toBe(true);
    }
  });
});
