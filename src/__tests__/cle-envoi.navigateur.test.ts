/**
 * La clé d'un envoi qui peut passer d'un mécanisme à l'autre : la file de
 * l'appareil réutilise l'identifiant Cloudinary que /api/upload aurait pris.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { nouvelleCleEnvoi, identifiantCloudinary, identifiantValide } from "@/lib/cle-envoi";

const envois: { nom: string; publicId?: string }[] = [];
vi.mock("@/lib/cloudinary-upload", () => {
  class UploadError extends Error { permanent = false; }
  return {
    UploadError,
    uploadToCloudinary: vi.fn(async (_b: Blob, nom: string, _p: string, _d: string, _pr?: unknown, publicId?: string) => {
      envois.push({ nom, publicId });
      return `https://c.test/${publicId || nom}`;
    }),
    attachPhotos: vi.fn(async () => {}),
    attacherChampTexte: vi.fn(async () => {}),
    envoyerSignalement: vi.fn(async () => {}),
  };
});
vi.mock("@/lib/api-helpers", () => ({ invalidateApiCache: () => {} }));
const idb = await import("@/lib/idb-uploads");

beforeEach(async () => {
  envois.length = 0;
  for (const x of await idb.getPendingUploads({ status: "all" })) await idb.removePendingUpload(x.id);
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
});

const photo = (nom: string) => ({ name: nom, type: "image/jpeg", blob: new Blob([new Uint8Array([0xff, 0xd8, 1])], { type: "image/jpeg" }) });

describe("la clé d'envoi", () => {
  it("fabrique des clés valides et uniques", () => {
    const a = nouvelleCleEnvoi(), b = nouvelleCleEnvoi();
    expect(a).not.toBe(b);
    expect(identifiantValide(identifiantCloudinary(a, 0))).toBe(true);
  });

  it("refuse une clé mal formée (rien n'est imposé à Cloudinary)", () => {
    expect(identifiantCloudinary("../../x", 0)).toBeUndefined();
    expect(identifiantCloudinary(undefined, 0)).toBeUndefined();
    expect(identifiantValide("tm-rapport/autre-dossier/photo")).toBe(false);
  });

  it("la file envoie chaque photo sous « <clé>-<rang> »", async () => {
    const cle = nouvelleCleEnvoi();
    await idb.addPendingUpload({ projectId: "P", category: "cartons", notionField: "Photos cartons", cleEnvoi: cle, files: [photo("carton-1.1.jpg"), photo("carton-2.2.jpg")] });
    await idb.processPendingUploads();
    expect(envois.map((e) => e.publicId)).toEqual([`${cle}-0`, `${cle}-1`]);
  });

  it("sans clé, rien ne change : pas d'identifiant imposé", async () => {
    await idb.addPendingUpload({ projectId: "P", category: "montage", notionField: "Photos montage terminé", files: [photo("Montage gauche.1.1.jpg")] });
    await idb.processPendingUploads();
    expect(envois.map((e) => e.publicId)).toEqual([undefined]);
  });
});
