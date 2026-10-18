/**
 * La reprise globale des envois différés.
 *
 * Un rapport finalisé sans réseau attend son PDF. Avant, seule la page du
 * chantier pouvait le demander ; ces tests tiennent la version globale et,
 * surtout, ses garde-fous : ne jamais envoyer deux fois, ne jamais envoyer
 * tant qu'une photo manque, ne rien faire hors ligne.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

/* Un localStorage de poche : les finalisations y vivent. */
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
Object.defineProperty(globalThis, "window", {
  value: { dispatchEvent: () => true, localStorage: fauxStorage }, configurable: true,
});

let enLigne = true;
let file: { url: string }[] = [];
let uploads: { projectId: string; status?: string }[] = [];

vi.mock("@/lib/offline", () => ({
  getQueue: () => file,
  isOnline: () => enLigne,
  processQueue: vi.fn(async () => ({ success: 0, failed: 0, skipped: 0 })),
}));
vi.mock("@/lib/idb-uploads", () => ({
  getPendingUploads: vi.fn(async () => uploads),
  processPendingUploads: vi.fn(async () => ({ success: 0, failed: 0 })),
  resetBackoffForAll: vi.fn(async () => 0),
  retryAllFailedUploads: vi.fn(async () => 0),
}));

const { marquerFinalise, lireFinalisation, lireToutesLesFinalisations } = await import("@/lib/rapport-finalise");
const { relancerEnvoisDifferes, rapportsEnAttente, oublierLesTentatives, DELAI_ENTRE_TENTATIVES_MS } =
  await import("@/lib/envois-differes");

const T0 = Date.parse("2026-10-19T10:00:00Z");

beforeEach(() => {
  memoire.clear();
  enLigne = true;
  file = [];
  uploads = [];
  oublierLesTentatives();
});

describe("Ce qui attend", () => {
  it("liste les rapports finalisés non envoyés, les plus anciens d'abord", async () => {
    memoire.set("tm-rapport-finalise-b", JSON.stringify({ quand: T0 - 1000, client: false, envoye: false }));
    memoire.set("tm-rapport-finalise-a", JSON.stringify({ quand: T0 - 5000, client: true, envoye: false }));
    memoire.set("tm-rapport-finalise-c", JSON.stringify({ quand: T0 - 9000, client: true, envoye: true }));

    const l = await rapportsEnAttente(T0);
    expect(l.map((r) => r.projectId)).toEqual(["a", "b"]);
  });

  it("dit ce qui retient chacun", async () => {
    marquerFinalise("3cf1-aaaa", { client: true });
    uploads = [{ projectId: "3cf1-aaaa" }, { projectId: "3cf1-aaaa" }, { projectId: "3cf1-zzzz" }];
    file = [{ url: "/api/projects/3cf1-aaaa" }, { url: "/api/projects/3cf1-zzzz" }];
    const [r] = await rapportsEnAttente(T0);
    expect(r.photosEnAttente).toBe(2);
    expect(r.requetesEnAttente).toBe(1);
  });

  it("signale un rapport bloqué depuis plus de 24 h", async () => {
    memoire.set("tm-rapport-finalise-vieux", JSON.stringify({ quand: T0 - 25 * 3600_000, client: true, envoye: false }));
    memoire.set("tm-rapport-finalise-jeune", JSON.stringify({ quand: T0 - 3600_000, client: true, envoye: false }));
    const l = await rapportsEnAttente(T0);
    expect(l.find((r) => r.projectId === "vieux")?.bloque).toBe(true);
    expect(l.find((r) => r.projectId === "jeune")?.bloque).toBe(false);
  });
});

describe("La reprise", () => {
  it("demande le PDF d'un rapport libre, avec ses paramètres persistés, et le marque envoyé", async () => {
    marquerFinalise("p", { client: true, params: "arrivee=08:00&depart=16:30&client=1&send=1" });
    const appels: string[] = [];
    const r = await relancerEnvoisDifferes({
      maintenant: T0,
      demanderPdf: async (id, params) => { appels.push(`${id}?${params}`); return true; },
    });
    expect(appels).toEqual(["p?arrivee=08:00&depart=16:30&client=1&send=1"]);
    expect(r.envoyes).toEqual(["p"]);
    expect(lireFinalisation("p")?.envoye).toBe(true);
  });

  it("sans paramètres persistés, le repli dit au moins « envoi délibéré »", async () => {
    memoire.set("tm-rapport-finalise-p", JSON.stringify({ quand: T0, client: false, envoye: false }));
    const appels: string[] = [];
    await relancerEnvoisDifferes({ maintenant: T0, demanderPdf: async (id, p) => { appels.push(p); return true; } });
    expect(appels).toEqual(["client=0&send=1"]);
  });

  it("RETIENT un rapport tant qu'une photo attend", async () => {
    marquerFinalise("p", { client: true });
    uploads = [{ projectId: "p" }];
    const demander = vi.fn(async () => true);
    const r = await relancerEnvoisDifferes({ maintenant: T0, demanderPdf: demander });
    expect(demander).not.toHaveBeenCalled();
    expect(r.retenus).toEqual(["p"]);
    expect(lireFinalisation("p")?.envoye).toBe(false);
  });

  it("ne réessaie pas le même rapport avant cinq minutes", async () => {
    marquerFinalise("p", { client: true });
    const demander = vi.fn(async () => false); // le serveur refuse
    await relancerEnvoisDifferes({ maintenant: T0, demanderPdf: demander });
    await relancerEnvoisDifferes({ maintenant: T0 + 60_000, demanderPdf: demander });
    expect(demander).toHaveBeenCalledTimes(1);
    await relancerEnvoisDifferes({ maintenant: T0 + DELAI_ENTRE_TENTATIVES_MS + 1, demanderPdf: demander });
    expect(demander).toHaveBeenCalledTimes(2);
  });

  it("n'envoie JAMAIS deux fois un rapport marqué envoyé", async () => {
    marquerFinalise("p", { client: true });
    const demander = vi.fn(async () => true);
    await relancerEnvoisDifferes({ maintenant: T0, demanderPdf: demander });
    await relancerEnvoisDifferes({ maintenant: T0 + 3600_000, demanderPdf: demander });
    await relancerEnvoisDifferes({ maintenant: T0 + 48 * 3600_000, demanderPdf: demander });
    expect(demander).toHaveBeenCalledTimes(1);
  });

  it("hors ligne, ne fait rien et ne consomme pas de tentative", async () => {
    marquerFinalise("p", { client: true });
    enLigne = false;
    const demander = vi.fn(async () => true);
    const r = await relancerEnvoisDifferes({ maintenant: T0, demanderPdf: demander });
    expect(demander).not.toHaveBeenCalled();
    expect(r.examines).toBe(0);
    enLigne = true;
    await relancerEnvoisDifferes({ maintenant: T0 + 1000, demanderPdf: demander });
    expect(demander).toHaveBeenCalledTimes(1);
  });

  it("une erreur réseau pendant la demande est un échec, pas un envoi", async () => {
    marquerFinalise("p", { client: true });
    const r = await relancerEnvoisDifferes({ maintenant: T0, demanderPdf: async () => { throw new Error("coupé"); } });
    expect(r.echoues).toEqual(["p"]);
    expect(lireFinalisation("p")?.envoye).toBe(false);
  });

  it("traite plusieurs rapports en un balayage", async () => {
    marquerFinalise("a", { client: true });
    marquerFinalise("b", { client: false });
    uploads = [{ projectId: "b" }];
    const r = await relancerEnvoisDifferes({ maintenant: T0, demanderPdf: async () => true });
    expect(r.envoyes).toEqual(["a"]);
    expect(r.retenus).toEqual(["b"]);
    expect(lireToutesLesFinalisations().filter((x) => !x.finalisation.envoye).map((x) => x.projectId)).toEqual(["b"]);
  });
});
