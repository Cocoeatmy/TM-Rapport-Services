/**
 * Le planning : les rendez-vous fixés, construits depuis les fiches, et
 * filtrés SUR LE SERVEUR selon qui demande.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { construireRendezVous, rendezVousDe, type ProjetPlanning } from "@/lib/planning";

const P = (o: Partial<ProjetPlanning>): ProjetPlanning => ({ id: "p", projet: "Chantier", ofrTM: "TM-1", nbCabines: 2, ...o });
const SEMAINE = ["2026-10-19", "2026-10-25"] as const;

const projets: ProjetPlanning[] = [
  P({ id: "binome", projet: "Binôme", collaborateurs: "Jean-Marc & Miguel", dateMontage: "2026-10-20T08:30:00.000+02:00" }),
  P({ id: "long", projet: "Trois jours", collaborateurs: "Claudio", dateMontage: "2026-10-21", dateMontageEnd: "2026-10-23", nbCabines: 7 }),
  P({ id: "mesure", projet: "Relevé", mesuresTraiteePar: "Jean-Marc", collaborateurs: "Claudio", dateMesures: "2026-10-22T13:30:00.000+02:00" }),
  P({ id: "sav", projet: "SAV par lot", datesRdvSavCabines: "Cab1:2026-10-24 | Cab2:2026-10-24 | Cab3:2026-10-30", collaborateursSavCabines: "Cab1:Jacobo | Cab2:Jacobo", datesSavClotureCabines: "" }),
  P({ id: "sav-clos", projet: "SAV clos", datesRdvSavCabines: "Cab1:2026-10-24", collaborateursSavCabines: "Cab1:Jacobo", datesSavClotureCabines: "Cab1:2026-10-23" }),
  P({ id: "ancien", projet: "SAV ancien", etatSAV: "RDV fixé", dateRDVSAV: "2026-10-19", collaborateursSAV: "Miguel" }),
  P({ id: "service", projet: "Service", typeServices: ["Services"], collaborateurs: "Team TM", dateMontage: "2026-10-19" }),
  P({ id: "annule", projet: "Annulé", etatCMD: "Annulé", collaborateurs: "Claudio", dateMontage: "2026-10-20" }),
  P({ id: "hors", projet: "Hors semaine", collaborateurs: "Claudio", dateMontage: "2026-11-02" }),
];

describe("construire les rendez-vous", () => {
  const rdv = construireRendezVous(projets, ...SEMAINE);
  const de = (id: string) => rdv.filter((r) => r.projetId === id);

  it("montage avec heure, type et mode de fiche", () => {
    expect(de("binome")).toEqual([expect.objectContaining({ type: "montage", jour: "2026-10-20", heure: "08:30", mode: "cmd" })]);
  });
  it("montage étalé : un rendez-vous par jour ouvré, numérotés", () => {
    expect(de("long").map((r) => [r.jour, r.etape])).toEqual([["2026-10-21", "jour 1/3"], ["2026-10-22", "jour 2/3"], ["2026-10-23", "jour 3/3"]]);
  });
  it("relevé de mesures attribué à « Mesures traitée par », pas à l'équipe de montage", () => {
    expect(de("mesure")).toEqual([expect.objectContaining({ type: "mesures", collaborateurs: "Jean-Marc", heure: "13:30", mode: "mesures" })]);
  });
  it("SAV par lot : lots du même jour regroupés, lot clôturé et lot hors semaine exclus", () => {
    expect(de("sav")).toEqual([expect.objectContaining({ type: "sav", jour: "2026-10-24", cabines: 2, etape: "lots 1, 2", collaborateurs: "Jacobo" })]);
    expect(de("sav-clos")).toHaveLength(0);
  });
  it("SAV de l'ancienne base (sans lot) : sa date de projet", () => {
    expect(de("ancien")).toEqual([expect.objectContaining({ type: "sav", jour: "2026-10-19", collaborateurs: "Miguel" })]);
  });
  it("services, annulés, hors période", () => {
    expect(de("service")[0]).toMatchObject({ type: "services", mode: "services" });
    expect(de("annule")).toHaveLength(0);
    expect(de("hors")).toHaveLength(0);
  });
  it("trié par jour puis heure", () => {
    const cles = rdv.map((r) => `${r.jour} ${r.heure || "99"}`);
    expect([...cles].sort()).toEqual(cles);
  });
});

describe("à chacun ses rendez-vous", () => {
  const rdv = construireRendezVous(projets, ...SEMAINE);
  const ids = (nom: string) => [...new Set(rendezVousDe(rdv, nom).map((r) => r.projetId))].sort();
  it("binôme : chez les deux ; mesure chez son releveur ; Team chez tous", () => {
    expect(ids("Jean-Marc Nelzi")).toEqual(["binome", "mesure", "service"]);
    expect(ids("Miguel Test")).toEqual(["ancien", "binome", "service"]);
    expect(ids("Claudio Test")).toEqual(["long", "service"]);
    expect(ids("Jacobo Fontan Cassas")).toEqual(["sav", "service"]);
  });
});

/* ── La route : le filtre est appliqué sur le serveur ─────────────────── */
let compte = { email: "jm@tm.ch", name: "Jean-Marc Nelzi", role: "monteur" };
let activite = false;
vi.mock("@/lib/droits-serveur", () => ({
  exigerDroit: vi.fn(async () => ({ user: compte, droits: {} })),
}));
vi.mock("@/lib/droits", async (orig) => ({ ...(await orig<typeof import("@/lib/droits")>()), peut: vi.fn(() => activite) }));
vi.mock("@/lib/server-cache", () => ({ cachedOrFetch: vi.fn(async (_k: string, f: () => unknown) => f()) }));
vi.mock("@/lib/notion", () => ({ getProjectsPeriode: vi.fn(async () => []), getAllProjectsRaw: vi.fn(async () => projets) }));
vi.mock("@/lib/perimetre-serveur", () => ({ filtrerListe: vi.fn(async (p: unknown[]) => ({ projets: p, restreint: false, masques: 0 })) }));

const { GET } = await import("@/app/api/planning/route");
const lire = async (q: string) => (await GET(new NextRequest(`http://local/api/planning?${q}`))).json();

describe("/api/planning", () => {
  beforeEach(() => { compte = { email: "jm@tm.ch", name: "Jean-Marc Nelzi", role: "monteur" }; activite = false; });

  it("collaborateur : ne reçoit QUE ses rendez-vous, même s'il demande ceux d'un autre", async () => {
    const d = await lire("du=2026-10-19&au=2026-10-25&collab=Claudio");
    expect(d.voitTout).toBe(false);
    expect(d.collaborateurs).toEqual([]);
    expect([...new Set(d.rdv.map((r: { projetId: string }) => r.projetId))].sort()).toEqual(["binome", "mesure", "service"]);
  });
  it("administrateur : tout, et un collaborateur au choix", async () => {
    compte = { email: "m@tm.ch", name: "Micael", role: "admin" }; activite = true;
    const tout = await lire("du=2026-10-19&au=2026-10-25");
    expect(tout.voitTout).toBe(true);
    expect(tout.collaborateurs).toContain("Claudio");
    expect(new Set(tout.rdv.map((r: { projetId: string }) => r.projetId)).size).toBe(6);
    const claudio = await lire("du=2026-10-19&au=2026-10-25&collab=Claudio");
    expect([...new Set(claudio.rdv.map((r: { projetId: string }) => r.projetId))].sort()).toEqual(["long", "service"]);
  });
  it("période invalide ou trop large : refusée", async () => {
    expect((await GET(new NextRequest("http://local/api/planning?du=2026-10-25&au=2026-10-19"))).status).toBe(400);
    expect((await GET(new NextRequest("http://local/api/planning?du=2026-01-01&au=2026-06-01"))).status).toBe(400);
  });
});
void NextResponse;
