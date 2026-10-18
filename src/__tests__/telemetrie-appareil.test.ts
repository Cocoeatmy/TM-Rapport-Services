/**
 * Le battement, côté téléphone : ce qu'il envoie, et comment il obéit.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const memoire = new Map<string, string>();
const fauxStorage = {
  getItem: (k: string) => memoire.get(k) ?? null,
  setItem: (k: string, v: string) => { memoire.set(k, v); },
  removeItem: (k: string) => { memoire.delete(k); },
  key: (i: number) => [...memoire.keys()][i] ?? null,
  get length() { return memoire.size; },
  clear: () => memoire.clear(),
};
Object.defineProperty(globalThis, "localStorage", { value: fauxStorage, configurable: true });
Object.defineProperty(globalThis, "window", { value: { dispatchEvent: () => true, localStorage: fauxStorage }, configurable: true });
Object.defineProperty(globalThis, "navigator", { value: { userAgent: "Mozilla/5.0 (iPhone) Safari", onLine: true }, configurable: true });

let enLigne = true;
const relances = { reset: 0, retry: 0, queue: 0, uploads: 0 };
let uploads: { projectId: string; status?: string }[] = [];

vi.mock("@/lib/offline", () => ({
  getQueue: () => [{ url: "/api/projects/p1" }, { url: "/api/projects/p2" }],
  isOnline: () => enLigne,
  processQueue: vi.fn(async () => { relances.queue++; return { success: 0, failed: 0, skipped: 0 }; }),
}));
vi.mock("@/lib/idb-uploads", () => ({
  getPendingUploads: vi.fn(async () => uploads),
  processPendingUploads: vi.fn(async () => { relances.uploads++; return { success: 0, failed: 0 }; }),
  resetBackoffForAll: vi.fn(async () => { relances.reset++; return 0; }),
  retryAllFailedUploads: vi.fn(async () => { relances.retry++; return 0; }),
}));
vi.mock("@/lib/offline-prefetch", () => ({
  lireEtat: () => ({ projets: 6, quand: 1234 }),
}));

const tele = await import("@/lib/telemetrie-appareil");
const { marquerFinalise } = await import("@/lib/rapport-finalise");

/** Un faux serveur : il note ce qu'il reçoit et répond ce qu'on lui dit. */
const recu: unknown[] = [];
let reponse: unknown = { ok: true, signal: null };
beforeEach(() => {
  memoire.clear();
  enLigne = true;
  uploads = [{ projectId: "p1" }, { projectId: "p1", status: "permanently-failed" }];
  recu.length = 0;
  reponse = { ok: true, signal: null };
  Object.assign(relances, { reset: 0, retry: 0, queue: 0, uploads: 0 });
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
    recu.push(JSON.parse(String(init?.body || "{}")));
    return new Response(JSON.stringify(reponse), { status: 200 });
  }));
});

describe("L'identifiant", () => {
  it("est stable d'un appel à l'autre, et n'est pas l'User-Agent", () => {
    const a = tele.identifiantAppareil();
    expect(a).toBe(tele.identifiantAppareil());
    expect(a).not.toContain("Mozilla");
    expect(a.length).toBeGreaterThan(8);
  });
});

describe("L'instantané", () => {
  it("compte sans rien révéler d'autre", async () => {
    marquerFinalise("p1", { client: true });
    const s = await tele.instantane("b1");
    expect(s.photosEnAttente).toBe(1);
    expect(s.photosEnEchec).toBe(1);
    expect(s.requetesEnAttente).toBe(2);
    expect(s.rapportsNonEnvoyes).toHaveLength(1);
    expect(s.rapportsNonEnvoyes[0].retenuPar).toBe(3); // 2 photos + 1 requête
    expect(s.preparesHorsLigne).toBe(6);
    expect(s.build).toBe("b1");
    /* Aucun texte de chantier, aucun nom de client : des chiffres et des ids. */
    expect(JSON.stringify(s)).not.toMatch(/Rue|client@|\+41/);
  });
});

describe("Le battement", () => {
  it("hors ligne, ne tente rien", async () => {
    enLigne = false;
    expect(await tele.battre()).toBeNull();
    expect(recu).toHaveLength(0);
  });

  it("envoie l'état, et sans signal ne relance rien", async () => {
    const r = await tele.battre("b1");
    expect(r?.ok).toBe(true);
    expect(recu).toHaveLength(1);
    expect(relances).toEqual({ reset: 0, retry: 0, queue: 0, uploads: 0 });
  });

  it("obéit à un signal — une seule fois — et rend compte aussitôt", async () => {
    reponse = { ok: true, signal: { requestedAt: 1000, par: "micael@tm.ch" } };
    await tele.battre();
    expect(relances).toEqual({ reset: 1, retry: 1, queue: 1, uploads: 1 });
    /* Deux envois : le battement, puis le compte rendu après relance. */
    expect(recu).toHaveLength(2);

    /* Le même signal revient au battement suivant : déjà vu, on ne refait pas. */
    await tele.battre();
    expect(relances.queue).toBe(1);

    /* Un signal plus récent, lui, est obéi. */
    reponse = { ok: true, signal: { requestedAt: 2000, par: "micael@tm.ch" } };
    await tele.battre();
    expect(relances.queue).toBe(2);
  });

  it("une erreur serveur ne casse rien", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 500 })));
    expect(await tele.battre()).toBeNull();
  });
});
