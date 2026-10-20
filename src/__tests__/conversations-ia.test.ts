/** L'historique de l'assistant : gardé par compte, sans expiration, jamais mélangé. */
import { describe, it, expect, vi, beforeEach } from "vitest";

const redis = new Map<string, unknown>();
vi.mock("../lib/redis-cache", () => ({
  redisGetJSON: vi.fn(async (k: string) => (redis.has(k) ? structuredClone(redis.get(k)) : null)),
  redisSetJSONDurable: vi.fn(async (k: string, v: unknown) => { redis.set(k, structuredClone(v)); }),
}));
const { ajouterEchange, listerConversations, lireConversation, titreDe } = await import("../lib/conversations-ia");

beforeEach(() => redis.clear());

describe("conversations de l'assistant", () => {
  it("une conversation se poursuit et garde ses messages dans l'ordre", async () => {
    const id = await ajouterEchange("Micael@TM.ch", null, "qui est le 076 818 55 56 ?", "Thierry Jacquaz (numéro proche)");
    const id2 = await ajouterEchange("micael@tm.ch", id, "et son adresse ?", "…");
    expect(id2).toBe(id);
    const c = await lireConversation("micael@tm.ch", id);
    expect(c?.messages.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant"]);
    expect(c?.titre).toBe("qui est le 076 818 55 56 ?");
  });

  it("chacun ne voit que les siennes", async () => {
    const id = await ajouterEchange("a@tm.ch", null, "question A", "réponse");
    await ajouterEchange("b@tm.ch", null, "question B", "réponse");
    expect((await listerConversations("a@tm.ch")).map((x) => x.titre)).toEqual(["question A"]);
    expect(await lireConversation("b@tm.ch", id)).toBeNull();
  });

  it("la plus récente en tête, rien n'est retiré", async () => {
    const un = await ajouterEchange("a@tm.ch", null, "première", "r");
    await ajouterEchange("a@tm.ch", null, "deuxième", "r");
    await ajouterEchange("a@tm.ch", un, "suite de la première", "r");
    const l = await listerConversations("a@tm.ch");
    expect(l.map((x) => x.titre)).toEqual(["première", "deuxième"]);
    expect(l[0].n).toBe(4);
  });

  it("un identifiant farfelu ne lit rien", async () => {
    expect(await lireConversation("a@tm.ch", "../autre:clé")).toBeNull();
    expect(titreDe("x".repeat(80))).toHaveLength(58);
  });
});
