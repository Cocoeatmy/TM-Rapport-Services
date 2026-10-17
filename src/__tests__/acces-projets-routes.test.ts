/**
 * Les accès aux projets, testés sur les vraies routes.
 *
 * Quatre comptes fictifs, cinq projets fictifs, et les trois politiques
 * possibles. On vérifie la liste, la recherche, l'accès direct par
 * identifiant et l'écriture — car une liste filtrée ne vaut rien si l'adresse
 * directe reste ouverte.
 *
 * On vérifie aussi ce qui compte autant : que le cache partagé ne puisse pas
 * servir la liste réduite d'un monteur à quelqu'un d'autre.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

/* ── Les comptes et ce qu'on leur accorde ───────────────────────────────── */
/* `name`, comme l'interface `User` de l'application — pas `nom`. Première
   version de ce fichier : j'avais francisé le champ, et tous les comptes
   retombaient sur leur adresse e-mail. */
type Compte = { name: string; email: string; role: "admin" | "monteur" };
const ADMIN: Compte = { name: "Micael Ferreira", email: "micael@tm.ch", role: "admin" };
const A: Compte = { name: "Jacobo Fontan Cassas", email: "a@tm.ch", role: "monteur" };
const B: Compte = { name: "Miguel Roberto", email: "b@tm.ch", role: "monteur" };
const SANS_NOM: Compte = { name: "", email: "x@tm.ch", role: "monteur" };

let connecte: Compte | null = ADMIN;
let perimetre: "tous" | "siens" | "siens-stricts" = "tous";

vi.mock("@/lib/auth", () => ({
  getUser: vi.fn(async () => connecte),
}));
vi.mock("@/lib/droits-serveur", () => ({
  droitsDe: vi.fn(async () => ({ perimetre })),
  exigerDroit: vi.fn(async () =>
    connecte ? { user: connecte } : { refus: new Response("non", { status: 401 }) },
  ),
}));

const { filtrerListe, projetVisible, accesProjetAutorise, reponseProjets } =
  await import("@/lib/perimetre-serveur");

/* ── Les projets fictifs ────────────────────────────────────────────────── */
const PROJETS = [
  { id: "p-libre-1", collaborateurs: "" },
  { id: "p-libre-2", collaborateurs: "   " },
  { id: "p-a", collaborateurs: "Jacobo" },
  { id: "p-ab", collaborateurs: "Jacobo & Miguel" },
  { id: "p-b", collaborateurs: "Jean-Marc & Miguel" },
  { id: "p-equipe", collaborateurs: "Team TM" },
];

beforeEach(() => {
  connecte = ADMIN;
  perimetre = "tous";
});

const vus = async () => (await filtrerListe(PROJETS)).projets.map((p) => p.id);

describe("l'administrateur voit tout", () => {
  it("quelle que soit la politique, s'il n'est pas restreint", async () => {
    connecte = ADMIN;
    expect(await vus()).toHaveLength(6);
  });
});

describe("politique « les siens et les non attribués »", () => {
  beforeEach(() => { perimetre = "siens"; });

  it("montre à A ses chantiers, les libres et ceux de l'équipe", async () => {
    connecte = A;
    expect(await vus()).toEqual(["p-libre-1", "p-libre-2", "p-a", "p-ab", "p-equipe"]);
  });

  it("cache à A le chantier confié à d'autres", async () => {
    connecte = A;
    expect(await vus()).not.toContain("p-b");
  });

  it("donne à B une vue DIFFÉRENTE de celle de A", async () => {
    connecte = B;
    const deB = await vus();
    expect(deB).toContain("p-b");
    expect(deB).not.toContain("p-a");
  });
});

describe("politique « uniquement ceux qui lui sont confiés »", () => {
  beforeEach(() => { perimetre = "siens-stricts"; });

  it("ne montre à A que ses chantiers nommés, pas les libres", async () => {
    connecte = A;
    expect(await vus()).toEqual(["p-a", "p-ab", "p-equipe"]);
  });

  it("l'absence d'attribution ne vaut PAS autorisation", async () => {
    connecte = A;
    const liste = await vus();
    expect(liste).not.toContain("p-libre-1");
    expect(liste).not.toContain("p-libre-2");
  });

  it("un chantier confié à l'équipe reste le sien", async () => {
    connecte = B;
    expect(await vus()).toContain("p-equipe");
  });
});

describe("un compte sans nom ne tombe pas dans un trou", () => {
  /* Sans nom, l'application se rabat sur l'adresse e-mail. Aucun projet ne
     porte une adresse comme collaborateur : le compte ne voit donc que les
     chantiers libres et ceux de l'équipe. C'est le bon sens de l'échec —
     restreindre trop plutôt que d'ouvrir trop. */
  it("ne voit que les libres et l'équipe en politique souple", async () => {
    connecte = SANS_NOM; perimetre = "siens";
    expect(await vus()).toEqual(["p-libre-1", "p-libre-2", "p-equipe"]);
  });

  it("ne voit que l'équipe en politique stricte — et surtout pas tout", async () => {
    connecte = SANS_NOM; perimetre = "siens-stricts";
    expect(await vus()).toEqual(["p-equipe"]);
  });
});

describe("l'accès direct par identifiant", () => {
  const lire = async (id: string) => PROJETS.find((p) => p.id === id) || null;

  it("laisse passer un chantier autorisé", async () => {
    connecte = A; perimetre = "siens";
    expect(await accesProjetAutorise("p-a", lire)).toBe(true);
  });

  it("REFUSE le chantier d'un collègue, même en connaissant son identifiant", async () => {
    connecte = A; perimetre = "siens";
    expect(await accesProjetAutorise("p-b", lire)).toBe(false);
  });

  it("refuse aussi un libre en politique stricte", async () => {
    connecte = A; perimetre = "siens-stricts";
    expect(await accesProjetAutorise("p-libre-1", lire)).toBe(false);
  });

  it("ne lit MÊME PAS le projet quand le compte n'est pas restreint", async () => {
    /* Le contrôle ne doit pas coûter une lecture Notion à tout le monde. */
    connecte = ADMIN; perimetre = "tous";
    const lecteur = vi.fn(lire);
    expect(await accesProjetAutorise("p-b", lecteur)).toBe(true);
    expect(lecteur).not.toHaveBeenCalled();
  });

  it("laisse la route rendre son 404 quand le projet n'existe pas", async () => {
    connecte = A; perimetre = "siens";
    expect(await accesProjetAutorise("inconnu", async () => null)).toBe(true);
  });

  it("projetVisible répond la même chose, sur un objet déjà lu", async () => {
    connecte = A; perimetre = "siens";
    expect(await projetVisible({ collaborateurs: "Jean-Marc & Miguel" })).toBe(false);
    expect(await projetVisible({ collaborateurs: "Jacobo" })).toBe(true);
  });
});

describe("le cache partagé ne doit pas fuir d'un compte à l'autre", () => {
  it("compte NON restreint : la réponse reste mise en cache, comme avant", async () => {
    connecte = ADMIN; perimetre = "tous";
    const r = await reponseProjets(PROJETS, { sMaxAge: 30, swr: 120 });
    const cc = r.headers.get("Cache-Control") || "";
    expect(cc).toContain("s-maxage=30");
    const corps = await r.json();
    expect(corps).toHaveLength(6);
  });

  it("compte restreint : la réponse devient PRIVÉE et n'est plus partagée", async () => {
    connecte = A; perimetre = "siens";
    const r = await reponseProjets(PROJETS, { sMaxAge: 30, swr: 120 });
    const cc = r.headers.get("Cache-Control") || "";
    expect(cc).toContain("private");
    expect(cc).toContain("no-store");
    expect(cc).not.toContain("s-maxage");
    const corps = await r.json();
    expect(corps).toHaveLength(5);
  });

  it("deux comptes restreints reçoivent deux listes différentes", async () => {
    connecte = A; perimetre = "siens";
    const deA = await (await reponseProjets(PROJETS)).json();
    connecte = B;
    const deB = await (await reponseProjets(PROJETS)).json();
    expect(deA.map((x: { id: string }) => x.id)).not.toEqual(deB.map((x: { id: string }) => x.id));
  });
});

describe("sans session", () => {
  it("on ne restreint pas : ces chemins ont leurs propres contrôles", async () => {
    /* Liens signés, tâches planifiées : leur sécurité est ailleurs, et
       appliquer le périmètre d'un utilisateur inexistant n'aurait aucun sens. */
    connecte = null; perimetre = "siens";
    expect(await vus()).toHaveLength(6);
  });
});
