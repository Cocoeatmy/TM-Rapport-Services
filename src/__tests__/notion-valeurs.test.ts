import { describe, it, expect } from "vitest";
import { lireValeur, ecrireValeur, memeValeur, TypeNonEcrivable } from "@/lib/notion-valeurs";
import { normaliserSchema, champPar } from "@/lib/notion-schema";

/**
 * Aller-retour entre Notion et l'écran.
 *
 * Ce qui compte : qu'une valeur relue soit la valeur écrite, qu'un champ
 * vidé le soit vraiment dans Notion — sinon on ne peut jamais corriger une
 * saisie — et qu'un type que l'API refuse d'écrire soit refusé BRUYAMMENT,
 * plutôt que d'annoncer un enregistrement qui n'a pas eu lieu.
 */

describe("lireValeur", () => {
  it("lit les textes, même découpés en fragments", () => {
    expect(lireValeur({ type: "rich_text", rich_text: [{ plain_text: "Aimant " }, { plain_text: "cassé" }] }))
      .toBe("Aimant cassé");
  });

  it("rend une date avec ses deux bornes", () => {
    expect(lireValeur({ type: "date", date: { start: "2026-10-16", end: "2026-10-18" } }))
      .toEqual({ debut: "2026-10-16", fin: "2026-10-18" });
    expect(lireValeur({ type: "date", date: null })).toBeNull();
  });

  it("distingue un fichier hébergé par Notion d'un lien externe", () => {
    /* La distinction n'est pas cosmétique : renvoyer un fichier Notion en
       « external » fait rejeter la propriété ENTIÈRE, donc disparaître
       toutes les photos du champ. */
    const v = lireValeur({ type: "files", files: [
      { type: "file", name: "a.jpg", file: { url: "https://notion.so/a.jpg" } },
      { type: "external", name: "b.jpg", external: { url: "https://cloudinary/b.jpg" } },
    ] }) as { nom: string; interne?: boolean }[];
    expect(v[0].interne).toBe(true);
    expect(v[1].interne).toBe(false);
  });

  it("lit une formule selon ce qu'elle produit", () => {
    expect(lireValeur({ type: "formula", formula: { type: "string", string: "🔁 Clôturé" } })).toBe("🔁 Clôturé");
    expect(lireValeur({ type: "formula", formula: { type: "number", number: 12 } })).toBe(12);
  });

  it("ne prétend rien lire d'un bouton", () => {
    expect(lireValeur({ type: "button", button: {} })).toBeNull();
  });

  it("lit l'adresse de chantier avec ses coordonnées", () => {
    expect(lireValeur({ type: "place", place: { name: "La Vounaise 24", address: "1489 Estavayer", lat: 46.8, lon: 6.8 } }))
      .toEqual({ nom: "La Vounaise 24", adresse: "1489 Estavayer", lat: 46.8, lon: 6.8 });
  });
});

describe("ecrireValeur", () => {
  it("vider un champ le vide VRAIMENT dans Notion", () => {
    /* Sans cela, une saisie erronée serait impossible à corriger depuis
       l'application : il faudrait rouvrir Notion. */
    expect(ecrireValeur("rich_text", "")).toEqual({ rich_text: [] });
    expect(ecrireValeur("number", "")).toEqual({ number: null });
    expect(ecrireValeur("select", "")).toEqual({ select: null });
    expect(ecrireValeur("date", null)).toEqual({ date: null });
    expect(ecrireValeur("url", "")).toEqual({ url: null });
  });

  it("accepte une virgule décimale, comme on la tape", () => {
    expect(ecrireValeur("number", "1234,50")).toEqual({ number: 1234.5 });
  });

  it("renvoie chaque fichier sous SON type", () => {
    expect(ecrireValeur("files", [
      { nom: "a.jpg", url: "https://notion.so/a.jpg", interne: true },
      { nom: "b.jpg", url: "https://cloudinary/b.jpg" },
    ])).toEqual({ files: [
      { type: "file", name: "a.jpg", file: { url: "https://notion.so/a.jpg" } },
      { type: "external", name: "b.jpg", external: { url: "https://cloudinary/b.jpg" } },
    ] });
  });

  it("accepte une relation donnée par identifiant ou par objet", () => {
    expect(ecrireValeur("relation", ["abc"])).toEqual({ relation: [{ id: "abc" }] });
    expect(ecrireValeur("relation", [{ id: "abc", titre: "Duka" }])).toEqual({ relation: [{ id: "abc" }] });
  });

  it("REFUSE bruyamment ce que l'API ne sait pas écrire", () => {
    /* Vérifié sur notre base le 16 octobre 2026 : Notion répond 400 pour
       une formule comme pour un bouton. Mieux vaut le dire ici que laisser
       croire à un enregistrement. */
    expect(() => ecrireValeur("formula", "x")).toThrow(TypeNonEcrivable);
    expect(() => ecrireValeur("button", null)).toThrow(TypeNonEcrivable);
    expect(() => ecrireValeur("rollup", 3)).toThrow(TypeNonEcrivable);
  });

  it("l'aller-retour conserve la valeur", () => {
    /* Notion répond `plain_text` là où il attend `text.content` : on
       simule ce qu'il RENVOIE, sinon l'aller-retour ne prouverait rien. */
    const commeNotionLeRend = (type: string, ecrit: Record<string, unknown>) => {
      if (type === "rich_text" || type === "title") {
        const l = (ecrit[type] as { text: { content: string } }[]).map((x) => ({ plain_text: x.text.content }));
        return { type, [type]: l };
      }
      return { type, ...ecrit };
    };
    const cas: [string, unknown][] = [
      ["title", "Costa SA - Lambert-Cart"],
      ["rich_text", "Porte qui frotte"],
      ["number", 42],
      ["checkbox", true],
      ["select", "Erreur TM"],
      ["multi_select", ["Micael", "Jean-Marc"]],
      ["status", "RDV fixé"],
      ["url", "https://exemple.ch"],
    ];
    for (const [type, v] of cas) {
      const ecrit = ecrireValeur(type, v as never);
      expect(lireValeur(commeNotionLeRend(type, ecrit)), type).toEqual(v);
    }
  });
});

describe("memeValeur — n'écrire que ce qui a changé", () => {
  it("tient le vide pour le vide, quelle que soit sa forme", () => {
    expect(memeValeur("", null)).toBe(true);
    expect(memeValeur([], null)).toBe(true);
    expect(memeValeur(undefined as never, "")).toBe(true);
  });

  it("voit une vraie différence", () => {
    expect(memeValeur("a", "b")).toBe(false);
    expect(memeValeur(["a"], ["a", "b"])).toBe(false);
  });
});

describe("normaliserSchema", () => {
  const schema = normaliserSchema("base-1", [{ plain_text: "Base de données" }], {
    Projet: { id: "title", type: "title" },
    "État - CMD": { id: "abc", type: "status", status: {
      options: [{ id: "o1", name: "RDV - fixé" }, { id: "o2", name: "Terminé" }],
      groups: [{ name: "En cours", option_ids: ["o1"] }],
    } },
    "Jours Montage": { id: "xyz", type: "formula", formula: { expression: "dateBetween(...)" } },
    "A facturer": { id: "btn", type: "button" },
    Sanitaire: { id: "rel", type: "relation", relation: { database_id: "base-2" } },
    Inconnu: { id: "new", type: "type_de_demain" },
  });

  it("garde toutes les propriétés, y compris celles qu'on ne sait pas écrire", () => {
    expect(schema.champs).toHaveLength(6);
  });

  it("marque ce qui est modifiable, et dit pourquoi quand ça ne l'est pas", () => {
    expect(champPar(schema, "abc")?.modifiable).toBe(true);
    expect(champPar(schema, "xyz")?.modifiable).toBe(false);
    expect(champPar(schema, "xyz")?.raison).toMatch(/Calculée/);
    expect(champPar(schema, "btn")?.raison).toMatch(/Bouton/);
  });

  it("n'ignore JAMAIS un type qu'il ne connaît pas — il le signale", () => {
    const c = champPar(schema, "new");
    expect(c?.modifiable).toBe(false);
    expect(c?.raison).toMatch(/non pris en charge/);
  });

  it("retrouve un champ par son identifiant, insensible au renommage", () => {
    /* C'est tout l'intérêt : renommer « État - CMD » dans Notion ne doit
       rien casser, puisqu'on ne s'en sert pas pour le désigner. */
    expect(champPar(schema, "abc")?.nom).toBe("État - CMD");
    expect(champPar(schema, "État - CMD")?.id).toBe("abc");
  });

  it("récupère les options et leurs groupes", () => {
    expect(champPar(schema, "abc")?.options.map((o) => o.nom)).toEqual(["RDV - fixé", "Terminé"]);
    expect(champPar(schema, "abc")?.groupes?.[0]).toEqual({ nom: "En cours", options: ["RDV - fixé"] });
  });

  it("retient la base visée par une relation", () => {
    expect(champPar(schema, "rel")?.baseLiee).toBe("base-2");
  });
});
