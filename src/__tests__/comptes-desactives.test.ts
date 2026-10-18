/**
 * Désactiver un compte : l'accès est coupé, rien n'est effacé.
 *
 * Le magasin des comptes et Redis sont remplacés par des doublures en
 * mémoire ; tout le reste (signature des sessions, hachage des mots de passe,
 * middleware) est le vrai code.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

process.env.JWT_SECRET = "cle-de-test-comptes-desactives";

const magasin = new Map<string, unknown[]>();
vi.mock("@/lib/kv-store", () => ({
  getData: vi.fn(async (k: string) => [...(magasin.get(k) || [])]),
  getDataFresh: vi.fn(async (k: string) => [...(magasin.get(k) || [])]),
  setData: vi.fn(async (k: string, d: unknown[]) => { magasin.set(k, JSON.parse(JSON.stringify(d))); }),
}));

const miroir = new Map<string, string>();
vi.mock("@/lib/redis-cache", () => ({
  redisHSet: vi.fn(async (_k: string, champ: string, v: string) => { miroir.set(champ, v); }),
  redisHDel: vi.fn(async (_k: string, champ: string) => { miroir.delete(champ); }),
}));

const auth = await import("@/lib/auth");
const revocation = await import("@/lib/revocation");
const { middleware } = await import("@/middleware");

const MOT_DE_PASSE = "mot-de-passe-de-test";
const empreinte = auth.hashPassword(MOT_DE_PASSE);
const PARTI = "parti@exemple.invalid";
const RESTE = "reste@exemple.invalid";
const ADMIN = "admin@exemple.invalid";

function semer() {
  magasin.set("app-users", [
    { email: PARTI, name: "Monteur Parti", password: empreinte, role: "monteur" },
    { email: RESTE, name: "Monteur Resté", password: empreinte, role: "monteur" },
    { email: ADMIN, name: "Admin Test", password: empreinte, role: "admin" },
  ]);
}

async function jeton(email: string, role: "admin" | "monteur" = "monteur") {
  return auth.createToken({ email, name: email, role });
}

beforeEach(async () => {
  semer();
  miroir.clear();
  revocation._definirComptesDesactives(null);
  // Vide le cache mémoire des comptes : une modification relit le magasin.
  await auth.definirCompteActif(RESTE, true, "test");
});

describe("Désactiver un compte", () => {
  it("coupe la connexion et la session, sans toucher aux autres", async () => {
    const sessionOuverte = await jeton(PARTI);
    expect(await auth.verifyToken(sessionOuverte)).not.toBeNull();

    const r = await auth.definirCompteActif(PARTI, false, ADMIN);
    expect(r).toEqual({ ok: true, miroir: true });

    expect(await auth.authenticate(PARTI, MOT_DE_PASSE)).toBeNull();
    expect(await auth.verifyToken(sessionOuverte)).toBeNull();
    expect((await auth.verifyTokenWithExpiry(sessionOuverte)).user).toBeNull();

    expect(await auth.authenticate(RESTE, MOT_DE_PASSE)).not.toBeNull();
    expect(await auth.verifyToken(await jeton(RESTE))).not.toBeNull();
  });

  it("n'efface rien : le compte, son nom et son mot de passe restent", async () => {
    await auth.definirCompteActif(PARTI, false, ADMIN);
    const lignes = magasin.get("app-users") as Record<string, unknown>[];
    expect(lignes).toHaveLength(3);
    const fiche = lignes.find((l) => l.email === PARTI)!;
    expect(fiche).toMatchObject({ name: "Monteur Parti", password: empreinte, role: "monteur", desactive: true, desactivePar: ADMIN });
    expect(typeof fiche.desactiveLe).toBe("string");
    expect(miroir.has(PARTI)).toBe(true);
    expect((await auth.getAllUsers()).find((u) => u.email === PARTI)?.desactive).toBe(true);
  });

  it("se réactive d'un geste, et l'accès revient", async () => {
    const session = await jeton(PARTI);
    await auth.definirCompteActif(PARTI, false, ADMIN);
    await auth.definirCompteActif(PARTI, true, ADMIN);
    expect(await auth.verifyToken(session)).not.toBeNull();
    expect(await auth.authenticate(PARTI, MOT_DE_PASSE)).not.toBeNull();
    expect(miroir.has(PARTI)).toBe(false);
    const fiche = (magasin.get("app-users") as Record<string, unknown>[]).find((l) => l.email === PARTI)!;
    expect(fiche).not.toHaveProperty("desactive");
  });

  it("refuse de désactiver un administrateur ou un compte inconnu", async () => {
    expect((await auth.definirCompteActif(ADMIN, false, ADMIN)).ok).toBe(false);
    expect((await auth.definirCompteActif("inconnu@exemple.invalid", false, ADMIN)).ok).toBe(false);
    expect(await auth.authenticate(ADMIN, MOT_DE_PASSE)).not.toBeNull();
  });
});

describe("Le middleware", () => {
  async function requete(chemin: string, email: string) {
    const r = new NextRequest(new URL(`https://tm.test${chemin}`));
    r.cookies.set("auth-token", await jeton(email));
    return middleware(r);
  }

  it("refuse une session désactivée : 401 pour les données, retour à la connexion pour les pages", async () => {
    revocation._definirComptesDesactives([PARTI]);
    const api = await requete("/api/projects/all", PARTI);
    expect(api.status).toBe(401);
    const page = await requete("/", PARTI);
    expect(page.status).toBe(307);
    expect(page.headers.get("location")).toContain("/login?desactive=1");
    expect(page.headers.get("set-cookie") || "").toContain("auth-token=;");
  });

  it("laisse passer les autres, et tout le monde si la liste est illisible", async () => {
    revocation._definirComptesDesactives([PARTI]);
    expect((await requete("/api/projects/all", RESTE)).headers.get("x-middleware-next")).toBe("1");
    revocation._definirComptesDesactives(null);
    expect((await requete("/api/projects/all", PARTI)).headers.get("x-middleware-next")).toBe("1");
  });
});
