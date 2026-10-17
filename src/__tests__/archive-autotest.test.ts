/**
 * L'essai à blanc : il doit dire vrai, surtout quand ça va mal.
 *
 * Un auto-test qui répond toujours « tout va bien » est pire qu'une
 * absence de test : il donne la tranquillité sans la garantie. Ces cas
 * cassent donc la chaîne à chaque maillon et vérifient que le verdict
 * tombe au bon endroit.
 *
 * On vérifie aussi, et c'est le plus important, qu'il n'ÉCRIT jamais : le
 * magasin est surveillé, toute écriture est une faute.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const listes = new Map<string, unknown[]>();
const ecritures: string[] = [];
let lectureCassee: Set<string> | null = null;

vi.mock("@/lib/kv-store", () => ({
  EcritureVideRefusee: class extends Error {},
  getData: vi.fn(async (k: string) => [...(listes.get(k) || [])]),
  getDataFresh: vi.fn(async (k: string) => {
    if (lectureCassee?.has(k)) throw new Error(`indisponible : ${k}`);
    return [...(listes.get(k) || [])];
  }),
  setData: vi.fn(async (k: string) => { ecritures.push(k); }),
  setBlob: vi.fn(async (k: string) => { ecritures.push("blob:" + k); }),
  getBlob: vi.fn(async () => { throw new Error("absent"); }),
}));
vi.mock("@/lib/redis-cache", () => ({
  redisEnabled: false,
  redisLRange: vi.fn(async () => []),
}));
vi.mock("@/lib/droits-serveur", () => ({
  exigerDroit: vi.fn(async () => ({ user: { name: "M", email: "m@tm.ch", role: "admin" } })),
}));
vi.mock("@/lib/email", () => ({ gmailEnabled: true, sendEmail: vi.fn(async () => ({ success: true })) }));

const autotest = await import("@/app/api/admin/sauvegardes/autotest/route");

const PASSE = "phrase-secrete-de-test-assez-longue";

function lignes(n: number, p = "x") {
  return Array.from({ length: n }, (_, i) => ({
    id: `${p}${i}`, description: `Ligne ${i} — éàü`, timestamp: 1000 + i,
    photoUrls: [`https://res.cloudinary.com/demo/${i}.jpg`],
  }));
}

const etape = (d: { etapes: { etape: string; ok: boolean; detail: string }[] }, nom: string) =>
  d.etapes.find((e) => e.etape === nom);

beforeEach(() => {
  listes.clear();
  ecritures.length = 0;
  lectureCassee = null;
  process.env.BACKUP_PASSPHRASE = PASSE;
});

describe("L'essai à blanc de la sauvegarde", () => {
  it("parcourt la chaîne entière et la déclare bonne", async () => {
    listes.set("defauts", lignes(40, "d"));
    listes.set("pieces", lignes(12, "p"));
    listes.set("logs", lignes(200, "l"));

    const r = await autotest.GET();
    const d = await r.json();

    expect(r.status).toBe(200);
    expect(d.ok).toBe(true);
    expect(etape(d, "chiffrement")?.ok).toBe(true);
    expect(etape(d, "déchiffrement")?.detail).toContain("EXACTEMENT");
    expect(etape(d, "détection d'altération")?.ok).toBe(true);
    expect(etape(d, "simulation de restauration")?.detail).toContain("aucun écart");
    /* Chaque liste se retrouve, au nombre près. */
    const parCle = Object.fromEntries(d.listes.map((l: { cle: string; dansLArchive: number }) => [l.cle, l.dansLArchive]));
    expect(parCle.defauts).toBe(40);
    expect(parCle.pieces).toBe(12);
    expect(parCle.logs).toBe(200);
  });

  it("n'écrit RIEN, nulle part", async () => {
    listes.set("defauts", lignes(30));
    await autotest.GET();
    expect(ecritures, "un essai à blanc qui écrit n'est pas à blanc").toEqual([]);
  });

  it("refuse de s'exécuter sans phrase secrète", async () => {
    delete process.env.BACKUP_PASSPHRASE;
    listes.set("defauts", lignes(5));

    const r = await autotest.GET();

    expect(r.status).toBe(503);
    expect((await r.json()).ok).toBe(false);
  });

  it("refuse une phrase trop courte", async () => {
    process.env.BACKUP_PASSPHRASE = "court";
    const r = await autotest.GET();
    expect(r.status).toBe(503);
  });

  it("signale une liste illisible au lieu de la passer sous silence", async () => {
    listes.set("defauts", lignes(10));
    lectureCassee = new Set(["pieces"]);

    const r = await autotest.GET();
    const d = await r.json();

    expect(d.ok).toBe(false);
    expect(etape(d, "lecture des listes")?.ok).toBe(false);
    expect(etape(d, "lecture des listes")?.detail).toContain("pieces");
    /* Mais la chaîne de chiffrement, elle, a bien été éprouvée. */
    expect(etape(d, "déchiffrement")?.ok).toBe(true);
  });

  it("vérifie que la phrase n'apparaît pas dans l'enveloppe", async () => {
    listes.set("defauts", lignes(20));
    const d = await (await autotest.GET()).json();
    expect(etape(d, "chiffrement")?.detail).toContain("n'apparaît pas");
  });

  it("dit la taille réelle, chiffrée et en clair", async () => {
    listes.set("defauts", lignes(100));
    const d = await (await autotest.GET()).json();
    expect(d.archive.octetsClair).toBeGreaterThan(1000);
    expect(d.archive.octetsChiffre).toBeGreaterThan(d.archive.octetsClair * 0.9);
    expect(d.archive.comprimee).toBe(false);
  });
});
