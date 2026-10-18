/**
 * L'envoi vers Cloudinary : signature gardée en mémoire, progression des gros
 * fichiers, abandon des envois en vol, refus suivi d'une signature fraîche.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const { uploadToCloudinary, abandonnerEnvoisEnVol } = await import("@/lib/cloudinary-upload");

let signatures = 0;
let reponseCloudinary: { status: number; corps: unknown } = { status: 200, corps: { secure_url: "https://c.test/ok.jpg" } };
let envoisFetch = 0;

function fauxFetch() {
  return vi.fn(async (url: string) => {
    if (url === "/api/photos/sign") {
      signatures++;
      return new Response(JSON.stringify({ signature: `s${signatures}`, timestamp: 1, apiKey: "k", cloudName: "c", folder: "f" }), { status: 200 });
    }
    envoisFetch++;
    return new Response(JSON.stringify(reponseCloudinary.corps), { status: reponseCloudinary.status });
  });
}

/** Un faux XMLHttpRequest : progression en trois temps, puis la réponse. */
class FauxXHR {
  static derniers: FauxXHR[] = [];
  upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null; onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null; onabort: (() => void) | null = null;
  status = 0; responseText = ""; timeout = 0; coupe = false;
  open() {}
  abort() { this.coupe = true; this.onabort?.(); }
  send() {
    FauxXHR.derniers.push(this);
    setTimeout(() => {
      if (this.coupe) return;
      for (const l of [25, 50, 100]) this.upload.onprogress?.({ lengthComputable: true, loaded: l, total: 100 });
      this.status = 200; this.responseText = JSON.stringify({ secure_url: "https://c.test/video.mp4" });
      this.onload?.();
    }, 5);
  }
}

beforeEach(() => {
  signatures = 0; envoisFetch = 0; FauxXHR.derniers = [];
  reponseCloudinary = { status: 200, corps: { secure_url: "https://c.test/ok.jpg" } };
  vi.stubGlobal("fetch", fauxFetch());
  vi.stubGlobal("XMLHttpRequest", FauxXHR);
});
afterEach(() => vi.unstubAllGlobals());

const petite = () => new Blob([new Uint8Array([0xff, 0xd8, 1, 2])], { type: "image/jpeg" });

describe("l'envoi vers Cloudinary", () => {
  it("garde la signature : deux photos du même dossier, une seule signature", async () => {
    await uploadToCloudinary(petite(), "a.jpg", "projet-sig-1", "montage");
    await uploadToCloudinary(petite(), "b.jpg", "projet-sig-1", "montage");
    expect(signatures).toBe(1);
    expect(envoisFetch).toBe(2);
  });

  it("refus avec une signature gardée : une signature fraîche, puis le refus est conclu", async () => {
    await uploadToCloudinary(petite(), "a.jpg", "projet-sig-2", "montage");
    reponseCloudinary = { status: 401, corps: { error: "stale" } };
    await expect(uploadToCloudinary(petite(), "b.jpg", "projet-sig-2", "montage")).rejects.toMatchObject({ permanent: true });
    expect(signatures).toBe(2); // la fraîche a bien été demandée
  });

  it("suit la progression d'un gros fichier et rend l'URL", async () => {
    const gros = new Blob([new Uint8Array(3 * 1024 * 1024)], { type: "video/mp4" });
    const pcts: number[] = [];
    const url = await uploadToCloudinary(gros, "montage.mp4", "projet-sig-3", "montage", (p) => pcts.push(p));
    expect(url).toBe("https://c.test/video.mp4");
    expect(pcts).toEqual([25, 50, 100]);
    expect(envoisFetch).toBe(0); // passé par l'envoi avec progression
  });

  it("un gros envoi abandonné au retour du réseau échoue « passagèrement » — la photo restera en file", async () => {
    const gros = new Blob([new Uint8Array(3 * 1024 * 1024)], { type: "video/mp4" });
    const envoi = uploadToCloudinary(gros, "montage.mp4", "projet-sig-4", "montage", () => {});
    await new Promise((r) => setTimeout(r, 1));
    expect(abandonnerEnvoisEnVol()).toBeGreaterThan(0);
    await expect(envoi).rejects.toMatchObject({ permanent: false });
  });

  it("refuse d'envoyer une photo vide", async () => {
    await expect(uploadToCloudinary(new Blob([]), "vide.jpg", "p", "montage")).rejects.toMatchObject({ permanent: false });
    expect(envoisFetch).toBe(0);
  });
});
