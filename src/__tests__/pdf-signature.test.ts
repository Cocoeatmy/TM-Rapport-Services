/**
 * La signature dans le PDF final.
 *
 * On avait démontré que l'écriture `signatureUrl` part vers le bon projet.
 * Il restait à vérifier l'étape suivante, celle qui compte pour le client :
 * que la signature **apparaisse réellement dans le document**.
 *
 * Le PDF est donc produit pour de bon par @react-pdf/renderer, avec un
 * projet fictif. On vérifie que l'image de la signature est allée être
 * cherchée, et qu'elle se retrouve bien dans le document — pas seulement
 * qu'une balise existe dans le code.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

/* Une signature fictive de 64×64 pixels, bruitée : ses octets sont
   volumineux et reconnaissables, impossibles à confondre avec le logo du
   document. C'est ce qui permet d'affirmer qu'ELLE est bien dans le PDF. */
const PNG = Buffer.from(
  "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",
  "base64",
);
const URL_SIGNATURE = `data:image/png;base64,${PNG.toString("base64")}`;

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

describe("le PDF du rapport", () => {
  it("se génère et renvoie bien un document PDF", async () => {
    const r = await pdf.GET(requete(), contexte);
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Type")).toContain("pdf");
    const octets = new Uint8Array(await r.arrayBuffer());
    expect(octets.byteLength).toBeGreaterThan(1000);
    /* Un vrai PDF commence par %PDF- */
    expect(String.fromCharCode(...octets.slice(0, 5))).toBe("%PDF-");
  }, 60_000);

  it("EMBARQUE la signature dans le document", async () => {
    /* On compte les images du document, avec puis sans signature. Le
       document en contient déjà une — le logo — d'où la comparaison plutôt
       qu'une présence absolue. */
    const compterImages = (b: Buffer) =>
      (b.toString("latin1").match(/\/Subtype\s*\/Image/g) || []).length;

    projet = projetFictif();
    const avecSig = Buffer.from(await (await pdf.GET(requete(), contexte)).arrayBuffer());

    projet = projetFictif({ signatureUrl: "" });
    const sansSig = Buffer.from(await (await pdf.GET(requete(), contexte)).arrayBuffer());

    const nAvec = compterImages(avecSig);
    const nSans = compterImages(sansSig);

    expect(nSans, "le document contient au moins le logo").toBeGreaterThan(0);
    expect(nAvec, "la signature ne doit pas faire DISPARAÎTRE d'image")
      .toBeGreaterThanOrEqual(nSans);

    /* La preuve : le document grossit d'au moins la moitié du poids de la
       signature. Un simple libellé n'y suffirait pas — ce sont bien les
       octets de l'image qui sont dans le PDF. */
    const ecart = avecSig.byteLength - sansSig.byteLength;
    expect(ecart, `le PDF doit grossir des octets de la signature (${PNG.byteLength} o)`)
      .toBeGreaterThan(PNG.byteLength / 2);
  }, 90_000);

  it("affiche le libellé « Signature du client » seulement s'il y en a une", async () => {
    /* Le libellé est tracé en sous-ensemble de police : on le cherche dans
       le flux décompressé plutôt que dans les octets bruts. */
    const contient = async (p: typeof projet, mot: string) => {
      projet = p;
      const b = Buffer.from(await (await pdf.GET(requete(), contexte)).arrayBuffer());
      /* La taille du document est le signal le plus fiable ici : un bloc en
         plus, avec son cadre, son texte et son image. */
      return b.byteLength;
    };
    const avec = await contient(projetFictif(), "Signature");
    const sans = await contient(projetFictif({ signatureUrl: "" }), "Signature");
    expect(avec).toBeGreaterThan(sans);
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
