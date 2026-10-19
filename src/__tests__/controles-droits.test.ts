/**
 * /api/controles parcourt TOUTES les fiches, hors périmètre : il suffisait
 * d'être connecté pour le lire. Désormais : « argent.relances » pour les
 * relances, l'administration pour les anomalies.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const refuses = new Set<string>();
const demandes: string[] = [];
vi.mock("@/lib/droits-serveur", () => ({
  exigerDroit: vi.fn(async (id: string) => {
    demandes.push(id);
    return refuses.has(id)
      ? { refus: NextResponse.json({ error: "non" }, { status: 403 }) }
      : { user: { email: "a@b.c", name: "A", role: "admin" }, droits: {} };
  }),
}));
vi.mock("@/lib/server-cache", () => ({ cachedOrFetch: vi.fn(async () => []) }));
vi.mock("@/lib/notion", () => ({ getAllProjectsRaw: vi.fn(async () => []) }));

const { GET } = await import("@/app/api/controles/route");
const appel = (jeu: string) => GET(new NextRequest(`http://local/api/controles?jeu=${jeu}`));

beforeEach(() => { refuses.clear(); demandes.length = 0; });

describe("/api/controles", () => {
  it("relances : exige argent.relances — refusé au collaborateur", async () => {
    refuses.add("argent.relances");
    expect((await appel("relances")).status).toBe(403);
    expect(demandes).toEqual(["argent.relances"]);
  });
  it("anomalies : exige l'administration — refusé au collaborateur", async () => {
    refuses.add("administration.droits");
    expect((await appel("anomalies")).status).toBe(403);
    expect(demandes).toEqual(["administration.droits"]);
  });
  it("administrateur : répond", async () => {
    expect((await appel("relances")).status).toBe(200);
    expect((await appel("anomalies")).status).toBe(200);
  });
});
