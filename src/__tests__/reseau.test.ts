import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  reseauDegrade,
  reseauUtilisable,
  noterEchecReseau,
  noterSuccesReseau,
  reinitialiserReseau,
  REPOS_MS,
} from "@/lib/reseau";

describe("état du réseau", () => {
  beforeEach(() => {
    reinitialiserReseau();
    vi.useFakeTimers();
  });
  afterEach(() => { vi.useRealTimers(); });

  it("considère le réseau utilisable au départ", () => {
    expect(reseauUtilisable()).toBe(true);
    expect(reseauDegrade()).toBe(false);
  });

  it("ne renonce pas sur un seul échec (ça peut être un hasard)", () => {
    noterEchecReseau();
    expect(reseauUtilisable()).toBe(true);
  });

  it("renonce après deux échecs d'affilée", () => {
    noterEchecReseau();
    noterEchecReseau();
    expect(reseauDegrade()).toBe(true);
    expect(reseauUtilisable()).toBe(false);
  });

  it("retente après la période de repos", () => {
    noterEchecReseau();
    noterEchecReseau();
    vi.advanceTimersByTime(REPOS_MS + 1);
    expect(reseauUtilisable()).toBe(true);
  });

  it("un succès efface les échecs précédents", () => {
    noterEchecReseau();
    noterSuccesReseau();
    noterEchecReseau();
    expect(reseauUtilisable()).toBe(true); // un seul échec depuis le succès
  });

  it("un succès sort immédiatement du mode dégradé", () => {
    noterEchecReseau();
    noterEchecReseau();
    expect(reseauUtilisable()).toBe(false);
    noterSuccesReseau();
    expect(reseauUtilisable()).toBe(true);
  });
});

/**
 * Une écriture Notion lente n'est pas une panne de réseau.
 *
 * Au bureau, sur une ligne à 300 Mb/s, deux écritures qui dépassaient le
 * délai suffisaient à afficher « Réseau trop faible » (16 octobre 2026). On
 * tranche maintenant en posant une question courte au serveur : s'il répond,
 * la ligne est bonne et rien n'est dégradé.
 */
describe("expiration : serveur lent ou réseau mort", () => {
  beforeEach(() => { reinitialiserReseau(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("ne dégrade rien quand le serveur répond encore à la sonde", async () => {
    const { fetchAvecDelai } = await import("@/lib/reseau");
    let appels = 0;
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
      appels += 1;
      // La vraie requête n'aboutit jamais → elle sera coupée par le délai.
      if (!String(url).includes("/api/build")) {
        return new Promise((_r, rej) => {
          init?.signal?.addEventListener("abort", () => rej(new Error("aborted")));
        });
      }
      // La sonde, elle, répond tout de suite.
      return Promise.resolve(new Response("{}", { status: 200 }));
    });

    await expect(fetchAvecDelai("/api/projects/x", { method: "PATCH" }, 20)).rejects.toThrow();
    expect(appels).toBe(2);           // la requête, puis la sonde
    expect(reseauDegrade()).toBe(false);
    expect(reseauUtilisable()).toBe(true);
  });

  it("dégrade quand la sonde ne passe pas non plus", async () => {
    const { fetchAvecDelai } = await import("@/lib/reseau");
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
      if (String(url).includes("/api/build")) return Promise.reject(new Error("réseau"));
      return new Promise((_r, rej) => {
        init?.signal?.addEventListener("abort", () => rej(new Error("aborted")));
      });
    });

    await expect(fetchAvecDelai("/api/projects/x", { method: "PATCH" }, 20)).rejects.toThrow();
    /* Une seule expiration confirmée ne suffit pas : il en faut deux, comme
       pour tout échec — un hasard reste un hasard. */
    expect(reseauDegrade()).toBe(false);
    await expect(fetchAvecDelai("/api/projects/x", { method: "PATCH" }, 20)).rejects.toThrow();
    expect(reseauDegrade()).toBe(true);
  });
});
