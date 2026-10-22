import { describe, it, expect, vi } from "vitest";

const bexio = { proprio: "patron@test.ch" };
vi.mock("@/lib/bexio", () => ({
  peutVoirBexio: async (u: { email?: string } | null) => u?.email === bexio.proprio,
}));
vi.mock("@/lib/kv-store", () => ({ getData: async () => [], getDataFresh: async () => [], setData: async () => {} }));
vi.mock("@/lib/redis-cache", () => ({ redisGetJSON: async () => null, redisSetJSON: async () => {} }));
vi.mock("@/lib/auth", () => ({ getUser: async () => null }));

import { droitsDe } from "@/lib/droits-serveur";
import { sansArgent, avecMontants } from "@/lib/argent-projets";

describe("l'argent n'est qu'au propriétaire", () => {
  it("un administrateur qui n'est pas le propriétaire n'a pas argent.voir", async () => {
    const autre = await droitsDe({ email: "admin2@test.ch", role: "admin", name: "Admin 2" } as never);
    expect(autre.droits["argent.voir"].niveau).toBe("non");
    expect(autre.droits["argent.relances"].niveau).toBe("non");
    expect(autre.droits["projets.modifier"].niveau).toBe("oui");
    const patron = await droitsDe({ email: "patron@test.ch", role: "admin", name: "Patron" } as never);
    expect(patron.droits["argent.voir"].niveau).toBe("oui");
  });

  it("les listes ne transportent jamais d'argent ; le propriétaire le recolle", () => {
    const p = { id: "a", projet: "X", montantOFR: 1200, facturations: "A facturer", offresTM: [{ name: "o.pdf", url: "u" }], offresTMNb: 1 };
    const nu = sansArgent(p);
    expect(nu).toMatchObject({ montantOFR: null, facturations: "", offresTM: [] });
    expect("offresTMNb" in nu).toBe(false);
    expect(p.montantOFR).toBe(1200); // l'original n'est pas touché
    const [r] = avecMontants([nu], new Map([["a", { montantOFR: 1200, facturations: "A facturer" }]]));
    expect(r).toMatchObject({ montantOFR: 1200, facturations: "A facturer" });
  });
});
