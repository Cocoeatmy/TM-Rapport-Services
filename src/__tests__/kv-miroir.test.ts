/**
 * Le miroir partagé des listes (Redis) : une instance froide n'attend plus
 * Notion — sans jamais servir une copie antérieure à la dernière écriture.
 *
 * Mesuré le 20.10.2026 : un rapport de montage à 32,8 s et 99 appels Notion,
 * parce que chaque nouvelle instance relisait pièces, débordement de photos
 * et noms de lots tranche par tranche.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const redis = new Map<string, unknown>();
let appelsNotion = 0;

vi.mock("../lib/redis-cache", () => ({
  redisEnabled: true,
  redisGetJSON: vi.fn(async (k: string) => (redis.has(k) ? redis.get(k) : null)),
  redisSetJSON: vi.fn(async (k: string, v: unknown) => { redis.set(k, v); }),
  redisSetTexte: vi.fn(async (k: string, v: string) => { redis.set(k, v); }),
  redisMGet: vi.fn(async (...ks: string[]) => ks.map((k) => (redis.has(k) ? String(redis.get(k)) : null))),
  redisDel: vi.fn(async (...ks: string[]) => { ks.forEach((k) => redis.delete(k)); }),
  redisHGetAll: vi.fn(async () => ({})),
  redisHSet: vi.fn(async () => {}),
  redisLockAcquire: vi.fn(async () => "jeton"),
  redisLockRelease: vi.fn(async () => {}),
}));

/* Notion injoignable : toute lecture échoue (et se compte). */
vi.mock("../lib/notion", () => {
  const echec = () => { appelsNotion++; return Promise.reject(new Error("Notion injoignable")); };
  const profond: any = new Proxy(echec, { get: () => profond, apply: echec });
  return { notion: profond, databaseId: "base-test" };
});

const { getData, setData } = await import("../lib/kv-store");

beforeEach(() => { redis.clear(); appelsNotion = 0; });

describe("miroir partagé des listes", () => {
  it("une instance froide lit le miroir, sans appeler Notion", async () => {
    redis.set("kv:miroir:essai-a", { t: Date.now(), data: [{ id: 1 }, { id: 2 }] });
    expect(await getData("essai-a")).toEqual([{ id: 1 }, { id: 2 }]);
    expect(appelsNotion).toBe(0);
  });

  it("un miroir antérieur à la dernière écriture est ignoré", async () => {
    redis.set("kv:miroir:essai-b", { t: Date.now() - 60_000, data: [{ id: "ancien" }] });
    redis.set("kv:ecrit:essai-b", String(Date.now()));
    expect(await getData("essai-b")).toEqual([]); // Notion injoignable : rien de mieux, mais pas l'ancien
    expect(appelsNotion).toBeGreaterThan(0);
  });

  it("une écriture retire le miroir et date le témoin, même quand Notion échoue", async () => {
    redis.set("kv:miroir:essai-c", { t: Date.now() - 1000, data: [{ id: "x" }] });
    await expect(setData("essai-c", [{ id: "y" }])).rejects.toThrow();
    expect(redis.has("kv:miroir:essai-c")).toBe(false);
    expect(Number(redis.get("kv:ecrit:essai-c"))).toBeGreaterThan(0);
  });
});
