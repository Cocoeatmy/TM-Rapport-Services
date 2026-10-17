/**
 * La chaîne des statuts, de bout en bout.
 *
 * C'est la demande du cahier des charges, section 7 :
 *
 *   hors ligne → finalisé localement → synchronisation en attente
 *   → synchronisation confirmée → rapport complet
 *
 * Et surtout, la garantie qui va avec : tant qu'une photo ou la signature
 * dort encore sur l'appareil, le rapport n'est PAS « synchronisé ». Le
 * statut n'est pas un texte décoratif — il se calcule à partir des deux
 * files, la vraie file IndexedDB et la file d'écritures.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/cloudinary-upload", () => ({
  UploadError: Error,
  uploadToCloudinary: vi.fn(async (_b: Blob, n: string) => `https://c.test/${n}`),
  attachPhotos: vi.fn(async () => {}),
  attacherChampTexte: vi.fn(async () => {}),
}));
vi.mock("@/lib/api-helpers", () => ({ invalidateApiCache: () => {} }));

const { etatRapport, marquerFinalise, lireFinalisation } = await import("@/lib/rapport-finalise");
const idb = await import("@/lib/idb-uploads");
const { addToQueue, clearQueue, getQueue } = await import("@/lib/offline");

const PROJET = "3cf1895b-9179-8002-8fae-d0746feb4995";
const image = () => new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });

/** Recalcule le statut comme le fait l'écran, depuis les deux files. */
async function statut(projectId: string) {
  const items = await idb.getPendingUploads({ projectId, status: "all" });
  const photos = items.reduce((n, i) => n + i.files.length, 0);
  const requetes = getQueue().filter((i) => String(i.url || "").includes(projectId)).length;
  return {
    etat: etatRapport({ finalise: lireFinalisation(projectId), photosEnAttente: photos, requetesEnAttente: requetes }),
    photos,
    requetes,
  };
}

beforeEach(async () => {
  localStorage.clear();
  clearQueue();
  for (const x of await idb.getPendingUploads({ status: "all" })) await idb.removePendingUpload(x.id);
});

describe("la chaîne complète d'un rapport hors ligne", () => {
  it("passe par tous les états, dans l'ordre, et ne saute aucune étape", async () => {
    /* 1 — rien n'a commencé. */
    expect((await statut(PROJET)).etat).toBe("aucun");

    /* 2 — le monteur travaille sans réseau : photos puis signature. */
    for (const nom of ["gauche.jpg", "centre.jpg", "droite.jpg"]) {
      await idb.addPendingUpload({
        projectId: PROJET, category: "montage", notionField: "Photos montage terminé",
        files: [{ name: nom, type: "image/jpeg", blob: image() }],
      });
    }
    await idb.addPendingUpload({
      projectId: PROJET, category: "signatures", champTexte: "signatureUrl",
      files: [{ name: "signature.png", type: "image/png", blob: image() }],
    });
    /* L'enregistrement du rapport part dans la file d'écritures. */
    addToQueue({ type: "update", url: `/api/projects/${PROJET}`, method: "PATCH", body: { rapportMonteur: "Pose terminée" } });

    /* 3 — il finalise sur le chantier. */
    marquerFinalise(PROJET, { client: true });
    const apresCloture = await statut(PROJET);
    expect(apresCloture.etat).toBe("en-attente");
    expect(apresCloture.photos).toBe(4);   // 3 photos + la signature
    expect(apresCloture.requetes).toBe(1);

    /* 4 — l'envoi part, mais tout n'est pas encore confirmé. */
    marquerFinalise(PROJET, { client: true, envoye: true });
    expect((await statut(PROJET)).etat).toBe("en-attente");

    /* 5 — le réseau revient : la file d'envoi se vide. */
    await idb.processPendingUploads();
    expect((await statut(PROJET)).photos).toBe(0);
    /* L'écriture du rapport, elle, attend encore. */
    expect((await statut(PROJET)).etat).toBe("en-attente");

    /* 6 — et seulement quand TOUT est parti : synchronisé. */
    clearQueue();
    const fin = await statut(PROJET);
    expect(fin.etat).toBe("synchronise");
    expect(fin.photos).toBe(0);
    expect(fin.requetes).toBe(0);
  });
});

describe("ce que le statut refuse de dire", () => {
  it("ne dit JAMAIS « synchronisé » tant que la signature dort sur l'appareil", async () => {
    marquerFinalise(PROJET, { client: true, envoye: true });
    await idb.addPendingUpload({
      projectId: PROJET, category: "signatures", champTexte: "signatureUrl",
      files: [{ name: "signature.png", type: "image/png", blob: image() }],
    });
    expect((await statut(PROJET)).etat).toBe("en-attente");
  });

  it("ne dit JAMAIS « synchronisé » tant qu'une photo attend", async () => {
    marquerFinalise(PROJET, { client: true, envoye: true });
    await idb.addPendingUpload({
      projectId: PROJET, category: "montage", notionField: "Photos montage terminé",
      files: [{ name: "p.jpg", type: "image/jpeg", blob: image() }],
    });
    expect((await statut(PROJET)).etat).toBe("en-attente");
  });

  it("ne dit JAMAIS « synchronisé » tant qu'une écriture attend", async () => {
    marquerFinalise(PROJET, { client: true, envoye: true });
    addToQueue({ type: "update", url: `/api/projects/${PROJET}`, method: "PATCH", body: { x: 1 } });
    expect((await statut(PROJET)).etat).toBe("en-attente");
  });

  it("ne compte pas les photos d'un AUTRE chantier", async () => {
    marquerFinalise(PROJET, { client: true, envoye: true });
    await idb.addPendingUpload({
      projectId: "un-autre-projet", category: "montage", notionField: "Photos montage terminé",
      files: [{ name: "p.jpg", type: "image/jpeg", blob: image() }],
    });
    expect((await statut(PROJET)).etat).toBe("synchronise");
  });

  it("même un échec permanent empêche de dire « synchronisé »", async () => {
    /* Une photo mise de côté reste une photo qui n'est pas arrivée. */
    marquerFinalise(PROJET, { client: true, envoye: true });
    const id = await idb.addPendingUpload({
      projectId: PROJET, category: "montage", notionField: "Photos montage terminé",
      files: [{ name: "p.jpg", type: "image/jpeg", blob: image() }],
    });
    const items = await idb.getPendingUploads({ projectId: PROJET });
    expect(items.find((x) => x.id === id)).toBeDefined();
    expect((await statut(PROJET)).etat).toBe("en-attente");
  });
});

describe("la finalisation survit à la fermeture de l'application", () => {
  it("se relit telle quelle au redémarrage", () => {
    marquerFinalise(PROJET, { client: true });
    const relu = lireFinalisation(PROJET);
    expect(relu).not.toBeNull();
    expect(relu!.client).toBe(true);
    expect(relu!.envoye).toBe(false);
    expect(typeof relu!.quand).toBe("number");
  });

  it("garde la date de clôture d'origine même si on renvoie", () => {
    marquerFinalise(PROJET, { client: true });
    const premier = lireFinalisation(PROJET)!.quand;
    marquerFinalise(PROJET, { client: true, envoye: true });
    expect(lireFinalisation(PROJET)!.quand).toBe(premier);
    expect(lireFinalisation(PROJET)!.envoye).toBe(true);
  });
});
