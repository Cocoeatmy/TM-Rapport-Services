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
