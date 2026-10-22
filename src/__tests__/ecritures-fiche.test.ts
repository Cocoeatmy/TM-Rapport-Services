import { describe, it, expect, vi, beforeEach } from "vitest";

/* Redis simulé : une autre instance a pu publier une écriture. */
const redis = { marqueur: null as string | null };
vi.mock("@/lib/redis-cache", () => ({
  redisEnabled: true,
  redisGetJSON: async () => null,
  redisSetTexte: async (k: string, v: string) => { if (k.startsWith("scw:")) redis.marqueur = v; },
  redisSetTexteJSON: async () => {},
  redisMGet: async (...cles: string[]) => cles.map((k) => (k.startsWith("scw:") ? redis.marqueur : null)),
  redisDel: async () => {},
}));

import { cachedOrFetch, invalidateCache } from "@/lib/server-cache";
import { projetEcrit, debutEcriture, finEcriture, lectureFiable } from "@/lib/ecritures-projet";

const ID = "3479b7a4-8b2f-81d2-9c55-e3e5f1a9b001";

describe("fiche projet en cache : jamais la fiche d'avant après une écriture", () => {
  beforeEach(() => { redis.marqueur = null; });

  it("une lecture partie avant l'écriture ne remet pas l'ancienne fiche en cache", async () => {
    const cle = "project-avant-apres";
    let liberer!: (v: string) => void;
    const lente = cachedOrFetch(cle, () => new Promise<string>((r) => { liberer = r; }));
    await invalidateCache(cle);                 // l'écriture passe pendant la lecture
    const fraiche = cachedOrFetch(cle, async () => "nouveau");
    liberer("ancien");
    expect(await lente).toBe("ancien");
    expect(await fraiche).toBe("nouveau");      // pas rattachée à la lecture d'avant
    // L'ancienne fiche n'a jamais été mise en cache (dans les 2 s, Notion est relu).
    expect(await cachedOrFetch(cle, async () => "relu")).not.toBe("ancien");
  });

  it("une écriture faite sur une AUTRE instance écarte la copie de celle-ci", async () => {
    const cle = "project-autre-instance";
    expect(await cachedOrFetch(cle, async () => "ancien")).toBe("ancien");
    expect(await cachedOrFetch(cle, async () => "jamais")).toBe("ancien"); // copie servie
    redis.marqueur = String(Date.now());        // écriture publiée par une autre instance
    expect(await cachedOrFetch(cle, async () => "nouveau")).toBe("nouveau");
  });

  it("l'écriture est publiée pour les autres instances", async () => {
    await invalidateCache("project-publie");
    expect(Number(redis.marqueur)).toBeGreaterThan(Date.now() - 5_000);
  });
});

describe("relecture côté appareil", () => {
  it("reconnaît une écriture de fiche", () => {
    expect(projetEcrit(`/api/projects/${ID}`, "PATCH")).toBe(ID);
    expect(projetEcrit(`/api/projects/${ID}/champs`, "POST")).toBe(ID);
    expect(projetEcrit(`/api/projects/${ID}`, "GET")).toBeNull();
    expect(projetEcrit(`/api/projects/all`, "PATCH")).toBeNull();
  });
  it("ignore une relecture qui a croisé une écriture", async () => {
    const debut = Date.now() - 10;
    expect(lectureFiable(ID, debut)).toBe(true);
    debutEcriture(ID);
    expect(lectureFiable(ID, debut)).toBe(false);   // écriture en cours
    finEcriture(ID);
    expect(lectureFiable(ID, debut)).toBe(false);   // finie après le départ de la lecture
    await new Promise((r) => setTimeout(r, 5));
    expect(lectureFiable(ID, Date.now())).toBe(true);
  });
});
