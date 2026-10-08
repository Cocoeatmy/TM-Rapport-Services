import { describe, it, expect, beforeAll } from "vitest";
import { chiffrer, dechiffrer, SCOPES, bexioFetch } from "@/lib/bexio";

beforeAll(() => { process.env.BEXIO_TOKEN_KEY = "cle-de-test-pour-le-chiffrement"; });

describe("accès bexio", () => {
  it("ne demande QUE des permissions de lecture", () => {
    const demandes: string[] = [...SCOPES];
    // « accounting » est le seul scope bexio qui ne se décline pas en lecture.
    const ecriture = demandes.filter((s) => s.endsWith("_edit") || s === "accounting");
    expect(ecriture).toEqual([]);
  });

  it("ne demande aucune donnée de paie", () => {
    expect([...SCOPES].filter((s: string) => s.startsWith("payroll"))).toEqual([]);
  });

  it("demande de quoi rester connecté sans redemander l'accord", () => {
    expect([...SCOPES] as string[]).toContain("offline_access");
  });

  it("chiffre et relit un jeton", () => {
    const secret = "refresh-token-abcdef-123456";
    const paquet = chiffrer(secret);
    expect(paquet).not.toContain(secret);
    expect(dechiffrer(paquet)).toBe(secret);
  });

  it("produit un paquet différent à chaque chiffrement (vecteur aléatoire)", () => {
    expect(chiffrer("x")).not.toBe(chiffrer("x"));
  });

  it("refuse de relire un paquet modifié", () => {
    const paquet = chiffrer("secret");
    const [iv, tag, corps] = paquet.split(".");
    expect(() => dechiffrer(`${iv}.${tag}.${Buffer.from("autre").toString("base64")}`)).toThrow();
    expect(() => dechiffrer(`${iv}.${tag}`)).toThrow();
    expect(corps.length).toBeGreaterThan(0);
  });

  it("refuse toute écriture, même demandée par erreur dans le code", async () => {
    await expect(bexioFetch("/2.0/kb_invoice", { method: "POST" })).rejects.toThrow(/lecture seule/i);
    await expect(bexioFetch("/2.0/kb_invoice/searchx", { method: "POST" })).rejects.toThrow(/lecture seule/i);
    await expect(bexioFetch("/2.0/contact/1", { method: "DELETE" })).rejects.toThrow(/lecture seule/i);
    await expect(bexioFetch("/2.0/contact/1", { method: "PATCH" })).rejects.toThrow(/lecture seule/i);
  });

  it("laisse passer la recherche filtrée, qui est un POST mais une lecture", async () => {
    /* Pas connecté ici : la preuve que le garde-fou a laissé passer, c'est
       qu'on échoue plus loin, sur l'absence de jeton. */
    await expect(bexioFetch("/2.0/kb_invoice/search", { method: "POST" }))
      .rejects.toThrow(/pas connecté/i);
  });
});
