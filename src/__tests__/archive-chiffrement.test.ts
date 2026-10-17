/**
 * L'enveloppe : elle protège, et elle se rouvre.
 *
 * Deux craintes opposées, et il faut répondre aux deux :
 *
 *   — qu'une archive en clair traîne dans une boîte aux lettres, alors
 *     qu'elle contient des adresses, des téléphones, des noms de chantiers
 *     et des liens vers des photographies qui s'ouvrent sans mot de passe ;
 *   — qu'une archive chiffrée devienne illisible, c'est-à-dire perdue.
 *
 * Ces tests vont donc jusqu'au bout du chemin de retour : on chiffre, on
 * rouvre, et on **réinstalle dans un magasin vidé**. Et on vérifie aussi
 * que le script de secours — celui qui n'a besoin que de Node — fait la
 * même chose, parce que c'est lui qui servira le jour où plus rien d'autre
 * ne tourne.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const listes = new Map<string, unknown[]>();

vi.mock("@/lib/kv-store", () => ({
  EcritureVideRefusee: class extends Error {},
  getData: vi.fn(async (k: string) => [...(listes.get(k) || [])]),
  getDataFresh: vi.fn(async (k: string) => [...(listes.get(k) || [])]),
  setData: vi.fn(async (k: string, d: unknown[]) => { listes.set(k, [...d]); }),
  setBlob: vi.fn(async () => {}),
  getBlob: vi.fn(async () => { throw new Error("absent"); }),
}));
vi.mock("@/lib/droits-serveur", () => ({
  exigerDroit: vi.fn(async () => ({ user: { name: "M", email: "m@tm.ch", role: "admin" } })),
}));

const courriers: { pieces: { filename: string; content: Buffer }[] }[] = [];
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(async (_t: string, _s: string, _h: string, pieces?: { filename: string; content: Buffer }[]) => {
    courriers.push({ pieces: pieces || [] });
    return { success: true };
  }),
}));

const { chiffrer, dechiffrer, estChiffree, PhraseIncorrecte, REPERE } =
  await import("@/lib/archive-chiffree");
const { construireArchive, validerArchive } = await import("@/lib/archive");
const importRoute = await import("@/app/api/admin/sauvegardes/import/route");
const cron = await import("@/app/api/cron/export-hebdo/route");

const PASSE = "une-phrase-secrete-de-test-assez-longue";

function lignesFictives(n: number, prefixe = "x") {
  return Array.from({ length: n }, (_, i) => ({
    id: `${prefixe}${i}`,
    user: ["Miguel", "Claudio"][i % 2],
    description: `Chantier « Rue de l'Essai ${i} » — éàü`,
    photoUrls: [`https://res.cloudinary.com/demo/image/upload/v1/${i}.jpg`],
    timestamp: Date.parse("2026-10-01T08:00:00Z") + i * 1000,
  }));
}

beforeEach(() => {
  listes.clear();
  courriers.length = 0;
  process.env.CRON_SECRET = "chut";
  process.env.BACKUP_EMAIL = "sauvegarde@tm.ch";
  process.env.BACKUP_PASSPHRASE = PASSE;
});

/* ─────────────────────────────────────────────────────────────────────────
   L'enveloppe elle-même
   ───────────────────────────────────────────────────────────────────────── */

describe("L'enveloppe", () => {
  it("rend illisible ce qu'elle contient", () => {
    const clair = Buffer.from(JSON.stringify({
      secret: "Rue de l'Essai 1, 1000 Lausanne",
      tel: "+41 79 555 24 74",
      mail: "client@exemple.ch",
    }), "utf-8");

    const enveloppe = chiffrer(clair, PASSE);
    const texte = enveloppe.toString("latin1");

    /* Rien du contenu ne transparaît. */
    expect(texte).not.toContain("Rue de l'Essai");
    expect(texte).not.toContain("+41 79");
    expect(texte).not.toContain("client@exemple.ch");
    /* Et la phrase secrète encore moins. */
    expect(texte).not.toContain(PASSE);
  });

  it("porte son mode d'emploi en clair", () => {
    const enveloppe = chiffrer(Buffer.from("x".repeat(100)), PASSE);
    const lignes = enveloppe.toString("utf-8").split("\n");

    expect(lignes[0]).toBe(REPERE);
    const entete = JSON.parse(lignes[1]);
    expect(entete.alg).toBe("aes-256-gcm");
    expect(entete.kdf).toBe("scrypt");
    /* Tout ce qu'il faut pour rouvrir le fichier sans cette application. */
    expect(entete.sel).toBeTruthy();
    expect(entete.iv).toBeTruthy();
    expect(entete.tag).toBeTruthy();
    expect(entete.N).toBeGreaterThan(1000);
    expect(entete.aide).toContain("dechiffrer-archive");
  });

  it("rend EXACTEMENT ce qu'on lui a confié", () => {
    /* Y compris les octets qui se perdent facilement. */
    const clair = Buffer.concat([
      Buffer.from("début éàü\n", "utf-8"),
      Buffer.from([0x00, 0xff, 0x1f, 0x8b, 0x0a, 0x0d]),
      Buffer.from(JSON.stringify(lignesFictives(200)), "utf-8"),
    ]);
    expect(dechiffrer(chiffrer(clair, PASSE), PASSE)).toEqual(clair);
  });

  it("refuse la mauvaise phrase", () => {
    const e = chiffrer(Buffer.from("contenu"), PASSE);
    expect(() => dechiffrer(e, "pas-la-bonne-phrase")).toThrow(PhraseIncorrecte);
  });

  it("refuse un fichier abîmé d'UN SEUL octet", () => {
    const e = chiffrer(Buffer.from("x".repeat(5000)), PASSE);
    const abime = Buffer.from(e);
    abime[abime.length - 50] ^= 0x01;
    /* AES-GCM authentifie : il ne rend pas une bouillie plausible. */
    expect(() => dechiffrer(abime, PASSE)).toThrow();
  });

  it("refuse une phrase trop courte au moment de chiffrer", () => {
    expect(() => chiffrer(Buffer.from("x"), "court")).toThrow(/12 caractères/);
  });

  it("deux enveloppes du même contenu diffèrent", () => {
    /* Sel et vecteur d'initialisation tirés au hasard : sinon, comparer
       deux archives révélerait qu'elles sont identiques. */
    const a = chiffrer(Buffer.from("même contenu"), PASSE);
    const b = chiffrer(Buffer.from("même contenu"), PASSE);
    expect(a.equals(b)).toBe(false);
    expect(dechiffrer(a, PASSE)).toEqual(dechiffrer(b, PASSE));
  });

  it("se reconnaît sans la phrase secrète", () => {
    expect(estChiffree(chiffrer(Buffer.from("x"), PASSE))).toBe(true);
    expect(estChiffree(Buffer.from('{"format":"tm-rapport-export"}'))).toBe(false);
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   Le script de secours — celui qui servira vraiment
   ───────────────────────────────────────────────────────────────────────── */

describe("Le script de secours, avec Node seul", () => {
  it("rouvre une enveloppe et rend l'archive", () => {
    const dossier = mkdtempSync(join(tmpdir(), "tm-dechiffre-"));
    try {
      const archive = construireArchive({ defauts: lignesFictives(40) }, {}, "test");
      const clair = Buffer.from(JSON.stringify(archive, null, 2), "utf-8");
      writeFileSync(join(dossier, "a.tmenc"), chiffrer(clair, PASSE));

      /* On l'appelle exactement comme un humain le ferait un jour de panne. */
      execFileSync("node", [
        "scripts/dechiffrer-archive.mjs",
        join(dossier, "a.tmenc"), PASSE, join(dossier, "sortie.json"),
      ], { stdio: "pipe" });

      const relu = JSON.parse(readFileSync(join(dossier, "sortie.json"), "utf-8"));
      expect(validerArchive(relu).valide).toBe(true);
      expect(relu.listes.defauts).toHaveLength(40);
      expect(relu.listes.defauts).toEqual(archive.listes.defauts);
    } finally {
      rmSync(dossier, { recursive: true, force: true });
    }
  }, 30_000);

  it("refuse la mauvaise phrase, sans rien écrire", () => {
    const dossier = mkdtempSync(join(tmpdir(), "tm-dechiffre-"));
    try {
      writeFileSync(join(dossier, "a.tmenc"), chiffrer(Buffer.from("{}"), PASSE));
      expect(() => execFileSync("node", [
        "scripts/dechiffrer-archive.mjs",
        join(dossier, "a.tmenc"), "mauvaise-phrase-longue", join(dossier, "s.json"),
      ], { stdio: "pipe" })).toThrow();
      expect(() => readFileSync(join(dossier, "s.json"))).toThrow();
    } finally {
      rmSync(dossier, { recursive: true, force: true });
    }
  }, 30_000);
});

/* ─────────────────────────────────────────────────────────────────────────
   Le chemin complet : le courriel du dimanche remet tout en place
   ───────────────────────────────────────────────────────────────────────── */

describe("La copie hebdomadaire chiffrée", () => {
  it("n'expédie RIEN sans phrase secrète, et le signale en rouge", async () => {
    delete process.env.BACKUP_PASSPHRASE;
    listes.set("defauts", lignesFictives(10));

    const r = await cron.GET(new NextRequest("http://local/api/cron/export-hebdo?secret=chut"));

    expect(r.status).toBe(503);
    expect((await r.json()).raison).toContain("BACKUP_PASSPHRASE");
    expect(courriers, "aucune donnée personnelle ne part en clair").toHaveLength(0);
  });

  it("refuse aussi une phrase trop courte", async () => {
    process.env.BACKUP_PASSPHRASE = "trop-court";
    listes.set("defauts", lignesFictives(10));
    const r = await cron.GET(new NextRequest("http://local/api/cron/export-hebdo?secret=chut"));
    expect(r.status).toBe(503);
    expect(courriers).toHaveLength(0);
  });

  it("la pièce jointe est chiffrée, et ne laisse rien filtrer", async () => {
    listes.set("defauts", lignesFictives(30, "secret-"));
    const r = await cron.GET(new NextRequest("http://local/api/cron/export-hebdo?secret=chut"));

    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.chiffre).toBe(true);

    const piece = courriers[0].pieces[0];
    expect(piece.filename).toMatch(/\.tmenc$/);
    const texte = piece.content.toString("latin1");
    expect(texte).not.toContain("secret-");
    expect(texte).not.toContain("cloudinary");
    expect(texte).not.toContain("Miguel");
  });

  it("et cette pièce jointe RESTAURE tout, après ouverture", async () => {
    const defauts = lignesFictives(50, "def-");
    const pieces = lignesFictives(12, "pie-");
    listes.set("defauts", defauts);
    listes.set("pieces", pieces);

    await cron.GET(new NextRequest("http://local/api/cron/export-hebdo?secret=chut"));
    const piece = courriers[0].pieces[0];

    /* Catastrophe : il ne reste plus rien. */
    listes.clear();

    /* Le fichier revient de la boîte aux lettres, tel quel. */
    const corps = (extra: Record<string, unknown> = {}) => new NextRequest(
      "http://local/api/admin/sauvegardes/import",
      {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fichierChiffre: piece.content.toString("base64"),
          phraseSecrete: PASSE, ...extra,
        }),
      },
    );

    /* Simulation d'abord : rien ne s'écrit. */
    const simu = await importRoute.POST(corps());
    expect(simu.status).toBe(200);
    const s = await simu.json();
    expect(s.simulation).toBe(true);
    expect(listes.size).toBe(0);

    const applique = await importRoute.POST(
      corps({ appliquer: true, confirmation: s.confirmationAttendue }),
    );
    expect(applique.status).toBe(200);
    expect(listes.get("defauts")).toEqual(defauts);
    expect(listes.get("pieces")).toEqual(pieces);
  }, 30_000);

  it("l'import refuse une enveloppe sans phrase, et avec la mauvaise", async () => {
    const archive = construireArchive({ defauts: lignesFictives(5) }, {}, "t");
    const enveloppe = chiffrer(Buffer.from(JSON.stringify(archive)), PASSE);
    listes.set("defauts", lignesFictives(5));

    const sans = await importRoute.POST(new NextRequest("http://local/x", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fichierChiffre: enveloppe.toString("base64") }),
    }));
    expect(sans.status).toBe(428);
    expect((await sans.json()).chiffree).toBe(true);

    const fausse = await importRoute.POST(new NextRequest("http://local/x", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fichierChiffre: enveloppe.toString("base64"),
        phraseSecrete: "une-autre-phrase-assez-longue",
      }),
    }));
    expect(fausse.status).toBe(428);
    expect(listes.get("defauts")).toHaveLength(5); // intact
  }, 30_000);

  it("ouvre aussi une enveloppe COMPRIMÉE", async () => {
    /* Au-delà de 8 Mo, l'archive part comprimée sous l'enveloppe. On
       vérifie que le chemin de retour sait défaire les deux couches. */
    const archive = construireArchive({ defauts: lignesFictives(300) }, {}, "t");
    const comprimee = gzipSync(Buffer.from(JSON.stringify(archive), "utf-8"));
    const enveloppe = chiffrer(comprimee, PASSE);

    const r = await importRoute.POST(new NextRequest("http://local/x", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fichierChiffre: enveloppe.toString("base64"), phraseSecrete: PASSE,
      }),
    }));

    expect(r.status).toBe(200);
    const s = await r.json();
    expect(s.listes.find((l: { cle: string }) => l.cle === "defauts").archive).toBe(300);
  }, 30_000);
});
