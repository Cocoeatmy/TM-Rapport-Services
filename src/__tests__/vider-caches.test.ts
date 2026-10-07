import { describe, it, expect } from "vitest";
import { clesAVider, estPreservee } from "@/lib/vider-caches";

describe("vider les caches de lecture", () => {
  const presentes = [
    "tm-projects-cache", "tm-projects-cache-ts", "tm-rapport-cache", "tm-cache-warm-ts",
    "tm-stats-data-v2", "tm-stats-ts-v2",
    "tm-rapport-queue", "tm-offline-abandons",
    "tm-cabin-noms-abc", "tm-cabin-monteurs-abc", "tm-pointages-abc",
    "carton-photos-x-abc", "stock-usage-abc",
    "tm-ui-mode", "tm-dark-mode", "tm-dashboard-order-Micael", "tm-rdv-hidden-status",
  ];

  it("n'emporte que les copies de ce que le serveur sait déjà", () => {
    expect(clesAVider(presentes).sort()).toEqual([
      "tm-cache-warm-ts", "tm-projects-cache", "tm-projects-cache-ts",
      "tm-rapport-cache", "tm-stats-data-v2", "tm-stats-ts-v2",
    ]);
  });

  it("ne touche JAMAIS au travail pas encore envoyé", () => {
    for (const cle of ["tm-rapport-queue", "tm-offline-abandons", "tm-cabin-noms-abc",
                       "tm-cabin-monteurs-abc", "tm-pointages-abc", "carton-photos-x-abc", "stock-usage-abc"]) {
      expect(estPreservee(cle)).toBe(true);
      expect(clesAVider(presentes)).not.toContain(cle);
    }
  });

  it("ne touche pas aux réglages personnels", () => {
    for (const cle of ["tm-ui-mode", "tm-dark-mode", "tm-dashboard-order-Micael", "tm-rdv-hidden-status"]) {
      expect(clesAVider(presentes)).not.toContain(cle);
    }
  });

  it("une clé inconnue n'est pas emportée — on ne jette que ce qu'on connaît", () => {
    expect(clesAVider(["tm-nouvelle-cle-inconnue"])).toEqual([]);
  });
});
