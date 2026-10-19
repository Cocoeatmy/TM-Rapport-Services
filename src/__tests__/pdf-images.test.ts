/**
 * Les images d'un PDF, téléchargées avant le rendu : mêmes octets, une seule
 * fois, et rien ne casse si une image manque.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { prechargerImages, sourceImage } from "@/lib/pdf-images";

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
let appels = 0, enVol = 0, maxEnVol = 0;

beforeEach(() => {
  appels = 0; enVol = 0; maxEnVol = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    appels++; enVol++; maxEnVol = Math.max(maxEnVol, enVol);
    await new Promise((r) => setTimeout(r, 5));
    enVol--;
    if (url.includes("absente")) return new Response("", { status: 404 });
    if (url.includes("webp")) return new Response(Buffer.from("RIFF0000WEBP"), { status: 200 });
    return new Response(url.endsWith(".png") ? PNG : JPEG, { status: 200 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("le préchargement des images du PDF", () => {
  it("rend les octets exacts, avec leur format", async () => {
    const r = await prechargerImages(["https://c.test/a1.jpg", "https://c.test/a2.png"]);
    expect(r.chargees).toBe(2);
    expect(sourceImage("https://c.test/a1.jpg")).toEqual({ data: JPEG, format: "jpg" });
    expect(sourceImage("https://c.test/a2.png")).toEqual({ data: PNG, format: "png" });
  });

  it("ne retélécharge pas une image déjà gardée, ni un doublon dans la liste", async () => {
    await prechargerImages(["https://c.test/b1.jpg", "https://c.test/b1.jpg"]);
    expect(appels).toBe(1);
    await prechargerImages(["https://c.test/b1.jpg"]);
    expect(appels).toBe(1);
  });

  it("une image absente ou illisible retombe sur l'adresse : le moteur la retentera", async () => {
    await prechargerImages(["https://c.test/absente.jpg", "https://c.test/webp.jpg"]);
    expect(sourceImage("https://c.test/absente.jpg")).toBe("https://c.test/absente.jpg");
    expect(sourceImage("https://c.test/webp.jpg")).toBe("https://c.test/webp.jpg");
  });

  it("borne la concurrence", async () => {
    await prechargerImages(Array.from({ length: 40 }, (_, i) => `https://c.test/c${i}.jpg`), 8);
    expect(maxEnVol).toBeLessThanOrEqual(8);
    expect(appels).toBe(40);
  });

  it("ignore ce qui n'est pas une adresse https", async () => {
    const r = await prechargerImages(["data:image/png;base64,AAAA", "", "http://c.test/x.jpg"]);
    expect(r.demandees).toBe(0);
    expect(appels).toBe(0);
  });
});
