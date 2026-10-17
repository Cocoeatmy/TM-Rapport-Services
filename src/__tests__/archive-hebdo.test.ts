/**
 * La copie hebdomadaire par courriel.
 *
 * L'intérêt de cette copie-là est qu'elle sort de chez Notion : si l'espace
 * disparaît, elle est encore dans la boîte aux lettres. Encore faut-il que ce
 * qui part par courriel soit la MÊME chose que ce que l'export produit, et
 * qu'on sache la relire. C'est ce qu'on vérifie ici : la pièce jointe est
 * ouverte, validée, et réinstallée.
 *
 * Aucun courriel n'est réellement expédié : l'envoi est une doublure qui
 * garde ce qu'on lui a donné.
 *
 * La pièce jointe part sous enveloppe chiffrée — `archive-chiffrement.test.ts`
 * s'occupe de l'enveloppe elle-même ; ici on l'ouvre juste pour vérifier ce
 * qu'elle transporte.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { gunzipSync } from "node:zlib";

const listes = new Map<string, unknown[]>();
let lectureCassee: Set<string> | "toutes" | null = null;

vi.mock("@/lib/kv-store", () => ({
  EcritureVideRefusee: class extends Error {},
  getData: vi.fn(async (k: string) => [...(listes.get(k) || [])]),
  getDataFresh: vi.fn(async (k: string) => {
    if (lectureCassee === "toutes" || lectureCassee?.has?.(k)) throw new Error(`indisponible : ${k}`);
    return [...(listes.get(k) || [])];
  }),
  setData: vi.fn(async (k: string, d: unknown[]) => { listes.set(k, [...d]); }),
  setBlob: vi.fn(async () => {}),
  getBlob: vi.fn(async () => { throw new Error("absent"); }),
}));

/* La plupart des tests passent par des routes d'administration : on est
   donc connecté par défaut. Les deux tests qui éprouvent la PORTE de la
   tâche planifiée mettent `sessionAdmin = false` pour qu'elle doive tenir
   sur son seul secret. */
let sessionAdmin = true;
vi.mock("@/lib/droits-serveur", () => ({
  exigerDroit: vi.fn(async () =>
    sessionAdmin
      ? { user: { name: "M", email: "m@tm.ch", role: "admin" } }
      : { refus: new Response("non", { status: 403 }) }),
}));

/** Le facteur : il note ce qu'on lui confie, et ne poste rien.
    Les alertes d'échec passent par le même chemin : on les range à part
    pour que « aucune donnée n'est partie » reste vérifiable. */
const courriers: { to: string; subject: string; html: string; pieces: { filename: string; content: Buffer }[] }[] = [];
const alertes: { to: string; subject: string }[] = [];
let envoiCasse = false;

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(async (to: string, subject: string, html: string, pieces?: { filename: string; content: Buffer }[]) => {
    if (subject.startsWith("ÉCHEC")) { alertes.push({ to, subject }); return { success: true }; }
    if (envoiCasse) return { success: false, error: "SMTP refuse" };
    courriers.push({ to, subject, html, pieces: pieces || [] });
    return { success: true };
  }),
}));

const cron = await import("@/app/api/cron/export-hebdo/route");
const importRoute = await import("@/app/api/admin/sauvegardes/import/route");
const { validerArchive } = await import("@/lib/archive");
const { dechiffrer } = await import("@/lib/archive-chiffree");

const PASSE = "phrase-secrete-de-test-assez-longue";

/** Ouvre la pièce jointe : enveloppe, puis compression éventuelle. */
function ouvrir(piece: { content: Buffer }) {
  let clair = dechiffrer(piece.content, PASSE);
  if (clair[0] === 0x1f && clair[1] === 0x8b) clair = gunzipSync(clair);
  return JSON.parse(clair.toString("utf-8"));
}

function lignesFictives(n: number, prefixe = "x") {
  return Array.from({ length: n }, (_, i) => ({
    id: `${prefixe}${i}`,
    description: `Ligne n°${i} — accents éàü`,
    timestamp: Date.parse("2026-10-01T08:00:00Z") + i * 1000,
    photoUrls: [`https://c.test/${i}.jpg`],
  }));
}

const requete = () => new NextRequest("http://local/api/cron/export-hebdo?secret=chut");

beforeEach(() => {
  listes.clear();
  courriers.length = 0;
  alertes.length = 0;
  sessionAdmin = true;
  lectureCassee = null;
  envoiCasse = false;
  process.env.CRON_SECRET = "chut";
  delete process.env.BACKUP_EMAIL;
  process.env.BACKUP_PASSPHRASE = PASSE;
});

describe("La copie hebdomadaire par courriel", () => {
  it("ne poste RIEN tant que personne ne l'a demandé", async () => {
    listes.set("defauts", lignesFictives(10));

    const r = await cron.GET(requete());

    expect(r.status).toBe(200);
    expect((await r.json()).actif).toBe(false);
    expect(courriers, "aucun courriel non réclamé").toHaveLength(0);
  });

  it("refuse un appel sans le bon secret", async () => {
    sessionAdmin = false;
    process.env.BACKUP_EMAIL = "m@tm.ch";
    listes.set("defauts", lignesFictives(5));

    const r = await cron.GET(new NextRequest("http://local/api/cron/export-hebdo?secret=faux"));

    expect(r.status).toBe(401);
    expect(courriers).toHaveLength(0);
  });

  it("un ADMINISTRATEUR peut l'essayer sans attendre dimanche", async () => {
    /* Une sauvegarde qu'on ne peut pas essayer est une sauvegarde qu'on
       découvre en panne le jour où l'on en a besoin. */
    sessionAdmin = true;
    process.env.BACKUP_EMAIL = "m@tm.ch";
    listes.set("defauts", lignesFictives(4));

    const r = await cron.GET(new NextRequest("http://local/api/cron/export-hebdo"));

    expect(r.status).toBe(200);
    expect((await r.json()).declencheur).toContain("essai manuel");
    expect(courriers).toHaveLength(1);
  });

  it("se TAIT si CRON_SECRET n'est pas configuré du tout", async () => {
    /* Les autres tâches laissent passer dans ce cas. Pas celle-ci : elle
       expédie l'intégralité des données hors de l'application, et une URL
       devinée suffirait. */
    sessionAdmin = false;
    delete process.env.CRON_SECRET;
    process.env.BACKUP_EMAIL = "m@tm.ch";
    listes.set("defauts", lignesFictives(5));

    const r = await cron.GET(new NextRequest("http://local/api/cron/export-hebdo"));

    expect(r.status).toBe(503);
    expect(courriers).toHaveLength(0);
  });

  it("expédie une pièce jointe qui est une archive valide et RESTAURABLE", async () => {
    process.env.BACKUP_EMAIL = "sauvegarde@tm.ch";
    const defauts = lignesFictives(42, "def-");
    const pieces = lignesFictives(8, "pie-");
    listes.set("defauts", defauts);
    listes.set("pieces", pieces);

    const r = await cron.GET(requete());
    expect(r.status).toBe(200);
    expect((await r.json()).envoye).toBe(true);

    /* Un courriel, une pièce jointe, au bon destinataire. */
    expect(courriers).toHaveLength(1);
    expect(courriers[0].to).toBe("sauvegarde@tm.ch");
    expect(courriers[0].pieces).toHaveLength(1);
    const piece = courriers[0].pieces[0];
    expect(piece.filename).toMatch(/^tm-rapport-export-\d{4}-\d{2}-\d{2}\.json\.tmenc$/);

    /* ── Et maintenant la seule question qui compte : ça se relit ? ────── */
    const relu = ouvrir(piece);
    expect(validerArchive(relu).valide).toBe(true);

    listes.clear(); // tout est perdu
    const appliquer = await importRoute.POST(
      new NextRequest("http://local/api/admin/sauvegardes/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          archive: relu, appliquer: true,
          confirmation: importRoute.phraseDImport(relu),
        }),
      }),
    );

    expect(appliquer.status).toBe(200);
    expect(listes.get("defauts")).toEqual(defauts);
    expect(listes.get("pieces")).toEqual(pieces);
  });

  it("comprime quand l'archive est volumineuse, et la compression se défait", async () => {
    process.env.BACKUP_EMAIL = "m@tm.ch";
    /* Plus de 8 Mo de JSON : le seuil au-delà duquel Gmail commence à
       rechigner. On reste raisonnable pour le temps de test. */
    const gros = Array.from({ length: 12_000 }, (_, i) => ({
      id: `g${i}`,
      texte: "x".repeat(700),
    }));
    listes.set("logs", gros);

    const r = await cron.GET(requete());
    expect(r.status).toBe(200);

    const piece = courriers[0].pieces[0];
    expect(piece.filename).toMatch(/\.json\.gz\.tmenc$/);
    /* Les deux couches se défont, et rendent exactement l'archive. */
    const relu = ouvrir(piece);
    expect(validerArchive(relu).valide).toBe(true);
    expect(relu.listes.logs).toHaveLength(12_000);
    expect(relu.listes.logs[11_999]).toEqual(gros[11_999]);
  });

  it("dit ce qu'il n'a pas pu lire, au lieu de l'annoncer vide", async () => {
    process.env.BACKUP_EMAIL = "m@tm.ch";
    listes.set("defauts", lignesFictives(5));
    lectureCassee = new Set(["logs", "stocks"]);

    const r = await cron.GET(requete());
    expect(r.status).toBe(200);

    const piece = courriers[0].pieces[0];
    expect(piece.filename).toContain("PARTIEL");
    expect(courriers[0].subject).toContain("PARTIELLE");
    const relu = ouvrir(piece);
    expect(relu.manquantes.logs).toContain("indisponible");
    expect(relu.listes.logs, "pas de liste vide inventée").toBeUndefined();
  });

  it("échoue bruyamment si RIEN n'a pu être lu", async () => {
    process.env.BACKUP_EMAIL = "m@tm.ch";
    lectureCassee = "toutes";

    const r = await cron.GET(requete());

    expect(r.status).toBe(500);
    expect(courriers, "mieux vaut pas de courriel qu'un courriel vide").toHaveLength(0);
    /* Mais l'administrateur, lui, doit l'apprendre. */
    expect(alertes).toHaveLength(1);
    expect(alertes[0].subject).toContain("ÉCHEC");
  });

  it("signale un envoi qui n'est pas parti", async () => {
    process.env.BACKUP_EMAIL = "m@tm.ch";
    listes.set("defauts", lignesFictives(3));
    envoiCasse = true;

    const r = await cron.GET(requete());

    expect(r.status).toBe(502);
    expect((await r.json()).envoye).toBe(false);
    expect(alertes, "un envoi qui ne part pas doit se signaler").toHaveLength(1);
  });
});
