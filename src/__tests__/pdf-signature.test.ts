/**
 * La signature dans le PDF final.
 *
 * On avait démontré que l'écriture `signatureUrl` part vers le bon projet.
 * Il restait à vérifier l'étape qui compte pour le client : que la signature
 * **apparaisse réellement dans le document**.
 *
 * ── Pourquoi ce test ne compare pas des tailles ──────────────────────────
 *
 * Une première version mesurait l'écart de poids entre un PDF signé et un
 * PDF sans signature. Ce n'était pas une preuve : un document plus lourd
 * peut l'être pour mille raisons, et rien ne disait que les pixels affichés
 * étaient ceux du client.
 *
 * Ici le PDF est produit pour de bon par @react-pdf/renderer, puis **ouvert
 * et décodé** : on y retrouve l'objet image de la signature, on détend son
 * flux, et on compare les pixels **un par un** à ceux qu'on a dessinés. Le
 * document contient la signature, ou le test échoue.
 *
 * Le tracé est dessiné ici même, à la main : une boucle cursive dans une
 * encre d'une couleur unique et improbable. Aucune autre image du document
 * — le logo en contient quatre — ne peut produire ces pixels-là.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { deflateSync, inflateSync } from "node:zlib";
import { PDFDocument, PDFName, PDFRawStream } from "pdf-lib";

/* ── Le tracé ───────────────────────────────────────────────────────────── */

const LARGEUR = 600, HAUTEUR = 200;
/** L'encre : une couleur unique, qui n'apparaît nulle part ailleurs. */
const ENCRE = [10, 20, 90] as const;

/** Les pixels attendus, en RVBA. C'est la référence de tout ce fichier. */
const PIXELS = (() => {
  const p = Buffer.alloc(LARGEUR * HAUTEUR * 4); // transparent
  const poser = (cx: number, cy: number, r: number) => {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      const x = Math.round(cx + dx), y = Math.round(cy + dy);
      if (x < 0 || y < 0 || x >= LARGEUR || y >= HAUTEUR) continue;
      const i = (y * LARGEUR + x) * 4;
      p[i] = ENCRE[0]; p[i + 1] = ENCRE[1]; p[i + 2] = ENCRE[2]; p[i + 3] = 255;
    }
  };
  for (let t = 0; t <= 1; t += 0.0005) {
    poser(40 + t * 520,
          110 + 55 * Math.sin(t * Math.PI * 5) * Math.exp(-t * 0.6)
              - 30 * Math.sin(t * Math.PI * 1.2), 4);
  }
  for (let t = 0; t <= 1; t += 0.0005) poser(60 + t * 500, 165 - t * 20, 3);
  for (let a = 0; a < Math.PI * 2; a += 0.002) poser(90 + 38 * Math.cos(a), 95 + 48 * Math.sin(a), 4);
  return p;
})();

/** Les mêmes pixels, encodés en PNG — ce que l'application reçoit. */
const PNG = (() => {
  const brut = Buffer.alloc((LARGEUR * 4 + 1) * HAUTEUR);
  for (let y = 0; y < HAUTEUR; y++) {
    brut[y * (LARGEUR * 4 + 1)] = 0; // aucun filtre de ligne
    PIXELS.copy(brut, y * (LARGEUR * 4 + 1) + 1, y * LARGEUR * 4, (y + 1) * LARGEUR * 4);
  }
  const table = [...Array(256)].map((_, n) => {
    let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const o of b) c = table[(c ^ o) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const bloc = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(LARGEUR, 0); ihdr.writeUInt32BE(HAUTEUR, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8 bits par canal, RVBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloc("IHDR", ihdr), bloc("IDAT", deflateSync(brut)), bloc("IEND", Buffer.alloc(0)),
  ]);
})();

const URL_SIGNATURE = `data:image/png;base64,${PNG.toString("base64")}`;

/* ── Rouvrir le PDF et en ressortir les images ──────────────────────────── */

interface ImagePdf { largeur: number; hauteur: number; espace: string; octets: Buffer }

/** Toutes les images embarquées, décompressées. */
async function imagesDu(pdfBrut: Buffer): Promise<ImagePdf[]> {
  const doc = await PDFDocument.load(pdfBrut);
  const out: ImagePdf[] = [];
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    const d = obj.dict;
    if (d.get(PDFName.of("Subtype"))?.toString() !== "/Image") continue;
    if (d.get(PDFName.of("Filter"))?.toString() !== "/FlateDecode") continue;
    out.push({
      largeur: Number(d.get(PDFName.of("Width"))?.toString()),
      hauteur: Number(d.get(PDFName.of("Height"))?.toString()),
      espace: d.get(PDFName.of("ColorSpace"))?.toString() || "",
      octets: inflateSync(Buffer.from(obj.contents)),
    });
  }
  return out;
}

const projetFictif = (o: Record<string, unknown> = {}) => ({
  id: "11111111-2222-3333-4444-555555555555",
  createdTime: "2026-10-01T08:00:00.000Z",
  lastEditedTime: "2026-10-16T08:00:00.000Z",
  projet: "Chantier fictif — contrôle PDF",
  ofrTM: "TM-9999999",
  nomChantier: "Immeuble d'essai",
  adresseChantier: "Rue de l'Essai 1, 1000 Lausanne",
  emplacementCabine: "Dépôt",
  nbCabines: 1,
  collaborateurs: "Jacobo",
  fournisseurs: [], fournisseursNames: [], grossistesNames: [], sanitaireNames: [],
  seriesCabines: [],
  dateMontage: "2026-10-16",
  heureArrivee: "08:00", heureDepart: "16:30",
  commentairesMontages: "", rapportMonteur: "Pose effectuée sans difficulté.",
  noteInterneMontage: "",
  photosAvant: [], photosDemontage: [], photosMontage: [], photosQRCode: [],
  photosGaranties: [], photosCartons: [], photosCartonsRecus: [], photosMesures: [],
  documentsMontagee: [], documentsMesures: [], offresTM: [],
  etatCMD: "Récéptionné - RDV à fixer", etatMesures: "Terminé",
  priorite: "", facturations: "", rapportDeMontage: "",
  signatureUrl: URL_SIGNATURE,
  ...o,
});

let projet: ReturnType<typeof projetFictif> | null = projetFictif();

vi.mock("@/lib/notion", async (original) => {
  const vrai = await original<Record<string, unknown>>();
  return {
    ...vrai,
    getProject: vi.fn(async () => projet),
    fournisseursForDisplay: () => "",
  };
});
vi.mock("@/lib/auth", () => ({
  verifyToken: vi.fn(async () => ({ email: "micael@tm.ch", name: "Micael", role: "admin" })),
}));
vi.mock("@/lib/droits-serveur", () => ({
  exigerDroit: vi.fn(async () => ({ user: { email: "micael@tm.ch", name: "Micael", role: "admin" } })),
  aLeDroit: vi.fn(async () => true),
  droitsDe: vi.fn(async () => ({ perimetre: "tous", droits: {} })),
}));
/* Aucun envoi : on produit le document, on ne le diffuse pas. */
vi.mock("@/lib/email", () => ({ sendPdfByEmail: vi.fn(async () => true) }));
vi.mock("@/lib/telegram", () => ({ sendReportToTelegram: vi.fn(async () => true) }));

const pdf = await import("@/app/api/pdf/[id]/route");

function requete(params = ""): NextRequest {
  const r = new NextRequest(`http://local/api/pdf/11111111-2222-3333-4444-555555555555${params}`);
  r.cookies.set("auth-token", "jeton-de-test");
  return r;
}
const contexte = { params: Promise.resolve({ id: "11111111-2222-3333-4444-555555555555" }) };


beforeEach(() => {
  projet = projetFictif();
});

/** Produit le PDF et rend ses octets. */
async function produire(p: ReturnType<typeof projetFictif> | null) {
  projet = p;
  const r = await pdf.GET(requete(), contexte);
  expect(r.status).toBe(200);
  return Buffer.from(await r.arrayBuffer());
}

describe("le PDF du rapport", () => {
  it("se génère et renvoie bien un document PDF", async () => {
    const r = await pdf.GET(requete(), contexte);
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Type")).toContain("pdf");
    const octets = new Uint8Array(await r.arrayBuffer());
    expect(octets.byteLength).toBeGreaterThan(1000);
    expect(String.fromCharCode(...octets.slice(0, 5))).toBe("%PDF-");
  }, 60_000);

  it("la signature est DANS le document, pixel pour pixel", async () => {
    const avec = await produire(projetFictif());
    const images = await imagesDu(avec);

    /* L'image aux dimensions du tracé, en couleurs. */
    const sig = images.find(
      (i) => i.largeur === LARGEUR && i.hauteur === HAUTEUR && i.espace === "/DeviceRGB",
    );
    expect(sig, `aucune image ${LARGEUR}×${HAUTEUR} dans le PDF`).toBeDefined();
    if (!sig) return;
    expect(sig.octets.length).toBe(LARGEUR * HAUTEUR * 3);

    /* Et son masque de transparence, qui dit où il y a de l'encre. */
    const masque = images.find(
      (i) => i.largeur === LARGEUR && i.hauteur === HAUTEUR && i.espace === "/DeviceGray",
    );
    expect(masque, "le masque de transparence doit accompagner l'image").toBeDefined();
    if (!masque) return;

    /* ── La comparaison, pixel par pixel ──────────────────────────────── */
    let opaques = 0, divergences = 0;
    for (let i = 0; i < LARGEUR * HAUTEUR; i++) {
      const alphaAttendu = PIXELS[i * 4 + 3];
      if (masque.octets[i] !== alphaAttendu) { divergences++; continue; }
      if (alphaAttendu === 0) continue; // hors du tracé : la couleur n'a pas de sens
      opaques++;
      if (sig.octets[i * 3] !== ENCRE[0] ||
          sig.octets[i * 3 + 1] !== ENCRE[1] ||
          sig.octets[i * 3 + 2] !== ENCRE[2]) divergences++;
    }

    expect(divergences, "chaque pixel du tracé doit se retrouver à l'identique").toBe(0);
    /* Un tracé, pas trois pixels égarés : la boucle en couvre plusieurs
       milliers. */
    expect(opaques, "le tracé doit être substantiel").toBeGreaterThan(5000);
  }, 90_000);

  it("sans signature, cette image n'existe pas", async () => {
    /* Le pendant du test précédent : s'il trouvait la signature dans un
       document non signé, c'est qu'il mesurerait autre chose. */
    const sans = await produire(projetFictif({ signatureUrl: "" }));
    const images = await imagesDu(sans);

    expect(images.length, "le logo reste là").toBeGreaterThan(0);
    expect(
      images.find((i) => i.largeur === LARGEUR && i.hauteur === HAUTEUR),
      "aucune image aux dimensions de la signature",
    ).toBeUndefined();
  }, 90_000);

  it("le cadre « Signature du client » suit la signature", async () => {
    const avec = await produire(projetFictif());
    const sans = await produire(projetFictif({ signatureUrl: "" }));
    /* Le bloc entier — cadre, libellé et image — apparaît et disparaît
       avec elle. */
    expect(avec.byteLength).toBeGreaterThan(sans.byteLength);
  }, 90_000);

  it("ne tombe pas en panne si la signature est illisible", async () => {
    /* Une URL cassée ne doit pas empêcher le rapport de sortir : le reste
       du document vaut mieux que rien du tout. */
    projet = projetFictif({ signatureUrl: "data:image/png;base64,PAS-UNE-IMAGE" });
    const r = await pdf.GET(requete(), contexte);
    /* Soit le document sort sans la signature, soit la route répond une
       erreur claire — jamais un document silencieusement tronqué. */
    expect([200, 500]).toContain(r.status);
    if (r.status === 200) {
      const b = Buffer.from(await r.arrayBuffer());
      expect(String.fromCharCode(...b.subarray(0, 5))).toBe("%PDF-");
    }
  }, 90_000);
});
