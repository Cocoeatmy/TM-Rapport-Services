/**
 * Le journal dans l'archive : les DEUX sources, pas une seule.
 *
 * Découvert en vérifiant l'export sur la production, le 17 octobre 2026 :
 * l'archive annonçait 500 lignes de journal alors que l'application en
 * affichait 3 202. La clé Notion `logs` ne contient plus que le reliquat
 * d'avant la migration ; le journal vivant est une liste Redis.
 *
 * Une sauvegarde qui emporte 15 % du journal sans le dire n'est pas une
 * sauvegarde partielle : c'est une sauvegarde trompeuse. Ces tests tiennent
 * la fusion des deux sources.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const listes = new Map<string, unknown[]>();
let journalRedis: string[] = [];
let redisActif = true;
let redisCasse = false;
let notionCasse = false;

vi.mock("@/lib/kv-store", () => ({
  EcritureVideRefusee: class extends Error {},
  getData: vi.fn(async (k: string) => [...(listes.get(k) || [])]),
  getDataFresh: vi.fn(async (k: string) => {
    if (notionCasse) throw new Error(`Notion indisponible pour « ${k} »`);
    return [...(listes.get(k) || [])];
  }),
  setData: vi.fn(async () => {}),
  setBlob: vi.fn(async () => {}),
  getBlob: vi.fn(async () => { throw new Error("absent"); }),
}));

vi.mock("@/lib/redis-cache", () => ({
  get redisEnabled() { return redisActif; },
  redisLRange: vi.fn(async () => {
    if (redisCasse) throw new Error("Redis muet");
    return journalRedis;
  }),
}));

const { rassemblerLesListes, lireListeSauvegardable } = await import("@/lib/sauvegarde");

const ligne = (id: string, t: number, quoi = "action") =>
  JSON.stringify({ id, timestamp: t, user: "Micael", action: quoi, details: "" });

beforeEach(() => {
  listes.clear();
  journalRedis = [];
  redisActif = true;
  redisCasse = false;
  notionCasse = false;
});

describe("Le journal sauvegardé", () => {
  it("réunit la liste Redis ET le reliquat Notion", async () => {
    journalRedis = [ligne("r1", 3000), ligne("r2", 2000)];
    listes.set("logs", [{ id: "n1", timestamp: 1000, action: "ancien" }]);

    const { listes: out, manquantes } = await rassemblerLesListes(["logs"]);

    expect(manquantes).toEqual({});
    expect(out.logs).toHaveLength(3);
    /* Du plus récent au plus ancien, toutes sources confondues. */
    expect((out.logs as { id: string }[]).map((l) => l.id)).toEqual(["r1", "r2", "n1"]);
  });

  it("ne compte pas deux fois une entrée présente des deux côtés", async () => {
    journalRedis = [ligne("x", 5000)];
    listes.set("logs", [{ id: "x", timestamp: 5000 }, { id: "y", timestamp: 1 }]);

    const { listes: out } = await rassemblerLesListes(["logs"]);

    expect(out.logs).toHaveLength(2);
    expect(new Set((out.logs as { id: string }[]).map((l) => l.id))).toEqual(new Set(["x", "y"]));
  });

  it("emporte un journal volumineux en entier", async () => {
    journalRedis = Array.from({ length: 3000 }, (_, i) => ligne(`r${i}`, i));
    listes.set("logs", Array.from({ length: 500 }, (_, i) => ({ id: `n${i}`, timestamp: -i })));

    const { listes: out } = await rassemblerLesListes(["logs"]);

    /* C'était le défaut : 500 au lieu de 3 500. */
    expect(out.logs).toHaveLength(3500);
  });

  it("une ligne Redis illisible n'emporte pas les autres", async () => {
    journalRedis = [ligne("a", 2), "{{{ pas du JSON", ligne("b", 1)];
    const { listes: out } = await rassemblerLesListes(["logs"]);
    expect(out.logs).toHaveLength(2);
  });

  it("sans Redis, le reliquat Notion suffit", async () => {
    redisActif = false;
    listes.set("logs", [{ id: "n1", timestamp: 1 }]);
    const { listes: out, manquantes } = await rassemblerLesListes(["logs"]);
    expect(out.logs).toHaveLength(1);
    expect(manquantes).toEqual({});
  });

  it("si Redis répond et que Notion tombe, on garde ce que Redis a donné", async () => {
    journalRedis = [ligne("r1", 1), ligne("r2", 2)];
    notionCasse = true;
    const { listes: out, manquantes } = await rassemblerLesListes(["logs"]);
    expect(out.logs).toHaveLength(2);
    expect(manquantes).toEqual({});
  });

  it("si les DEUX sources tombent, on le DIT au lieu d'annoncer un journal vide", async () => {
    redisCasse = true;
    notionCasse = true;
    const { listes: out, manquantes } = await rassemblerLesListes(["logs"]);
    expect(out.logs).toBeUndefined();
    expect(manquantes.logs).toBeTruthy();
  });

  it("l'aperçu d'un import compte le journal de la MÊME façon que l'export", async () => {
    /* Sans cela, la simulation annonçait « +2 702 lignes » là où rien ne
       change : elle comptait la clé Notion seule, l'export comptait les
       deux sources. Un aperçu faux est pire qu'une absence d'aperçu. */
    journalRedis = Array.from({ length: 300 }, (_, i) => ligne(`r${i}`, i));
    listes.set("logs", Array.from({ length: 50 }, (_, i) => ({ id: `n${i}`, timestamp: -i })));

    const { listes: out } = await rassemblerLesListes(["logs"]);
    const pourApercu = await lireListeSauvegardable("logs");

    expect(pourApercu.length).toBe((out.logs as unknown[]).length);
    expect(pourApercu).toHaveLength(350);
  });

  it("les autres listes continuent de passer par le magasin", async () => {
    listes.set("defauts", [{ id: "d1" }, { id: "d2" }]);
    journalRedis = [ligne("r1", 1)];
    const { listes: out } = await rassemblerLesListes(["defauts", "logs"]);
    expect(out.defauts).toHaveLength(2);
    expect(out.logs).toHaveLength(1);
  });
});
