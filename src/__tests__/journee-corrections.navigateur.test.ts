/**
 * Les trois défauts révélés par le scénario « journée hors ligne » (60-…),
 * vérifiés ici à l'échelle d'une fonction :
 *
 *  1. l'ordre des écritures vers une même fiche est respecté — une ancienne
 *     version en attente ne repart plus APRÈS la correction ;
 *  2. le retour du réseau lève aussi les délais des saisies ;
 *  3. un défaut saisi sans réseau, avec ses photos, part une fois ses photos
 *     envoyées, avec leurs URLs, sous son identifiant d'origine.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const recus: { url: string; corps: unknown }[] = [];
const rattaches: string[] = [];
let signalementEchoue: { message: string; permanent: boolean } | null = null;

vi.mock("@/lib/cloudinary-upload", () => {
  class UploadError extends Error {
    permanent: boolean;
    constructor(m: string, p = false) { super(m); this.permanent = p; }
  }
  return {
    UploadError,
    uploadToCloudinary: vi.fn(async (_b: Blob, nom: string, _p: string, dossier: string) => `https://c.test/${dossier}/${nom}`),
    attachPhotos: vi.fn(async (_p: string, champ: string, photos: { name: string; url: string }[]) => {
      if (photos.some((ph) => ph.name.includes("refus"))) throw new UploadError("champ refusé", true);
      rattaches.push(...photos.map((ph) => ph.name));
    }),
    attacherChampTexte: vi.fn(async () => {}),
    envoyerSignalement: vi.fn(async (corps: Record<string, unknown>) => {
      if (signalementEchoue) throw new UploadError(signalementEchoue.message, signalementEchoue.permanent);
      recus.push({ url: "/api/defauts", corps });
    }),
  };
});
vi.mock("@/lib/api-helpers", () => ({ invalidateApiCache: () => {} }));

const offline = await import("@/lib/offline");
const idb = await import("@/lib/idb-uploads");

function ecrireFile(items: unknown[]) {
  localStorage.setItem("tm-rapport-queue", JSON.stringify(items));
}

beforeEach(async () => {
  localStorage.clear();
  recus.length = 0;
  rattaches.length = 0;
  signalementEchoue = null;
  for (const x of await idb.getPendingUploads({ status: "all" })) await idb.removePendingUpload(x.id);
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
});

describe("1. L'ordre des écritures vers une même fiche", () => {
  it("une correction n'est jamais envoyée avant l'ancienne version encore en attente", async () => {
    const ordre: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      ordre.push(`${url} ${JSON.parse(String(init.body)).rapportMonteur ?? JSON.parse(String(init.body)).autre}`);
      return new Response("{}", { status: 200 });
    }));
    ecrireFile([
      // V1 a déjà échoué : elle attend encore une minute.
      { id: "v1", type: "update", url: "/api/projects/A", method: "PATCH", body: { rapportMonteur: "V1" }, timestamp: Date.now() - 5000, retryCount: 1, nextAttemptAt: Date.now() + 60_000 },
      { id: "v2", type: "update", url: "/api/projects/A", method: "PATCH", body: { rapportMonteur: "V2" }, timestamp: Date.now() - 1000 },
      { id: "b", type: "update", url: "/api/projects/B", method: "PATCH", body: { autre: "B" }, timestamp: Date.now() - 1000 },
    ]);
    const r1 = await offline.processQueue();
    // B part ; V2 attend que V1 soit passée.
    expect(ordre).toEqual(["/api/projects/B B"]);
    expect(r1.success).toBe(1);
    expect(offline.getQueue().map((q) => q.id)).toEqual(["v1", "v2"]);

    // Le délai est levé (retour du réseau) : V1 puis V2, dans cet ordre.
    expect(offline.leverLesDelais()).toBe(1);
    await offline.processQueue();
    expect(ordre).toEqual(["/api/projects/B B", "/api/projects/A V1", "/api/projects/A V2"]);
    expect(offline.getQueue()).toHaveLength(0);
    vi.unstubAllGlobals();
  });

  it("si l'ancienne version échoue encore, la correction attend aussi — rien n'est jeté", async () => {
    const envoyes: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const v = JSON.parse(String(init.body)).rapportMonteur;
      envoyes.push(v);
      return new Response("{}", { status: v === "V1" ? 503 : 200 });
    }));
    ecrireFile([
      { id: "v1", type: "update", url: "/api/projects/A", method: "PATCH", body: { rapportMonteur: "V1" }, timestamp: Date.now() - 5000 },
      { id: "v2", type: "update", url: "/api/projects/A", method: "PATCH", body: { rapportMonteur: "V2" }, timestamp: Date.now() - 1000 },
    ]);
    await offline.processQueue();
    expect(envoyes).toEqual(["V1"]);
    expect(offline.getQueue().map((q) => q.id)).toEqual(["v1", "v2"]);
    vi.unstubAllGlobals();
  });
});

describe("2. Le retour du réseau lève les délais des saisies", () => {
  it("resetBackoffForAll remet aussi à zéro l'attente des saisies, sans toucher aux mises de côté", async () => {
    ecrireFile([
      { id: "a", type: "update", url: "/x", method: "PATCH", timestamp: 1, nextAttemptAt: Date.now() + 30 * 60_000 },
      { id: "b", type: "update", url: "/y", method: "PATCH", timestamp: 1, statut: "echec", nextAttemptAt: Date.now() + 60_000 },
    ]);
    await idb.resetBackoffForAll();
    const q = offline.getQueue();
    expect(q.find((x) => x.id === "a")?.nextAttemptAt).toBe(0);
    expect(q.find((x) => x.id === "b")?.statut).toBe("echec");
  });
});

describe("3. Un défaut saisi sans réseau, avec ses photos", () => {
  function photo(nom: string) {
    return { name: nom, type: "image/jpeg", blob: new Blob([new Uint8Array([0xff, 0xd8, 1])], { type: "image/jpeg" }) };
  }

  it("part une fois ses photos envoyées, avec leurs URLs et son identifiant d'origine", async () => {
    await idb.addPendingUpload({
      projectId: "P", category: "signalements-hors-ligne",
      signalement: { id: "sig-123", projectId: "P", description: "Joint fendu", types: ["joint"] },
      files: [photo("d1.jpg"), photo("d2.jpg")],
    });
    const r = await idb.processPendingUploads();
    expect(r.success).toBe(1);
    expect(recus).toHaveLength(1);
    expect(recus[0].corps).toMatchObject({
      id: "sig-123", description: "Joint fendu",
      photoUrls: ["https://c.test/defauts/d1.jpg", "https://c.test/defauts/d2.jpg"],
    });
    expect(await idb.getPendingUploads({ status: "all" })).toHaveLength(0);
  });

  it("reste sur l'appareil si le serveur ne répond pas, et repart sous le même identifiant", async () => {
    await idb.addPendingUpload({
      projectId: "P", category: "signalements-hors-ligne",
      signalement: { id: "sig-456", projectId: "P", description: "Rayure" },
      files: [photo("d3.jpg")],
    });
    signalementEchoue = { message: "503", permanent: false };
    await idb.processPendingUploads();
    expect(recus).toHaveLength(0);
    const [enFile] = await idb.getPendingUploads({ status: "all" });
    expect(enFile.signalement?.id).toBe("sig-456");

    signalementEchoue = null;
    await idb.resetBackoffForAll();
    await idb.processPendingUploads();
    expect(recus.map((x) => (x.corps as { id: string }).id)).toEqual(["sig-456"]);
    expect(await idb.getPendingUploads({ status: "all" })).toHaveLength(0);
  });
});

describe("4. Un lot refusé définitivement à cause d'une seule photo", () => {
  function photo(nom: string) {
    return { projectId: "P", category: "montage", notionField: "Photos montage terminé",
      files: [{ name: nom, type: "image/jpeg", blob: new Blob([new Uint8Array([0xff, 0xd8, 1])], { type: "image/jpeg" }) }] };
  }
  it("les autres photos du lot passent ; seule la fautive reste en échec, gardée", async () => {
    await idb.addPendingUpload(photo("bonne-1.jpg"));
    await idb.addPendingUpload(photo("refus.jpg"));
    await idb.addPendingUpload(photo("bonne-2.jpg"));
    await idb.processPendingUploads();
    expect(rattaches.sort()).toEqual(["bonne-1.jpg", "bonne-2.jpg"]);
    const restes = await idb.getPendingUploads({ status: "all" });
    expect(restes.map((r) => [r.files[0].name, r.status])).toEqual([["refus.jpg", "permanently-failed"]]);
  });
});
