/**
 * La sauvegarde et sa restauration, jouées en entier.
 *
 * Le fichier `sauvegarde.test.ts` vérifie les règles avec des doublures qui
 * comptent les appels. Celui-ci va plus loin : un magasin complet vit en
 * mémoire, on y écrit des données fictives, on sauvegarde, on abîme
 * l'original, on restaure par la VRAIE route, et on compare enregistrement
 * par enregistrement.
 *
 * C'est la validation demandée : « aller jusqu'à une restauration réussie ».
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

/* ── Un magasin complet, en mémoire ─────────────────────────────────────── */
const listes = new Map<string, unknown[]>();
const blobs = new Map<string, unknown[]>();

/** Pannes à la demande, par clé ou globales. */
let lectureCassee: Set<string> | "toutes" | null = null;
let ecritureBlobCassee = false;
let lectureBlobCassee = false;
/** Toute écriture sur une clé D'ORIGINE est une faute : on les relève. */
const ecrituresOriginaux: { cle: string; taille: number }[] = [];

class EcritureVideRefusee extends Error {}

function estSauvegarde(cle: string) {
  return cle.startsWith("sauvegarde-");
}

vi.mock("@/lib/kv-store", () => ({
  EcritureVideRefusee,
  getData: vi.fn(async (k: string) => [...(listes.get(k) || [])]),
  getDataFresh: vi.fn(async (k: string) => {
    if (lectureCassee === "toutes" || lectureCassee?.has?.(k)) {
      throw new Error(`Notion indisponible pour « ${k} »`);
    }
    return [...(listes.get(k) || [])];
  }),
  setData: vi.fn(async (k: string, d: unknown[], o?: { permettreVide?: boolean }) => {
    if (!estSauvegarde(k)) ecrituresOriginaux.push({ cle: k, taille: d.length });
    /* On reproduit le garde-fou de production : vider une liste de deux
       éléments ou plus exige une autorisation explicite. */
    const avant = (listes.get(k) || []).length;
    if (d.length === 0 && avant >= 2 && !o?.permettreVide) throw new EcritureVideRefusee();
    listes.set(k, [...d]);
  }),
  setBlob: vi.fn(async (k: string, d: unknown[]) => {
    if (ecritureBlobCassee) throw new Error("Redis refuse l'écriture");
    blobs.set(k, [...d]);
  }),
  getBlob: vi.fn(async (k: string) => {
    if (lectureBlobCassee) throw new Error("Redis illisible");
    if (!blobs.has(k)) throw new Error("absent");
    return [...(blobs.get(k) as unknown[])];
  }),
}));

vi.mock("@/lib/droits-serveur", () => ({
  exigerDroit: vi.fn(async () => ({ user: { name: "Micael", email: "m@tm.ch", role: "admin" } })),
}));

const { sauvegarderUne, sauvegarderTout, cleDeSauvegarde, inventaireDe, apercuRestauration } =
  await import("@/lib/sauvegarde");
const restauration = await import("@/app/api/admin/sauvegardes/route");

const LUNDI = new Date("2026-10-19T02:00:00Z");

/** Des défauts fictifs, avec tout ce qui compte dans un vrai. */
function defautsFictifs(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `d${i}`,
    projectId: "projet-fictif-0000",
    user: ["Miguel", "Claudio", "Jacobo"][i % 3],
    description: `Défaut fictif n°${i}`,
    photoUrls: [`https://c.test/${i}-a.jpg`, `https://c.test/${i}-b.jpg`],
    status: i % 2 ? "signale" : "resolu",
    timestamp: Date.parse("2026-10-01T08:00:00Z") + i * 3600_000,
    comments: [{ user: "Micael", message: `note ${i}`, timestamp: 1 }],
    cabineIdx: (i % 4) + 1,
  }));
}

beforeEach(() => {
  listes.clear();
  blobs.clear();
  lectureCassee = null;
  ecritureBlobCassee = false;
  lectureBlobCassee = false;
  ecrituresOriginaux.length = 0;
});

/* ─────────────────────────────────────────────────────────────────────────
   Scénario A — sauvegarde normale
   ───────────────────────────────────────────────────────────────────────── */

describe("Scénario A — sauvegarder, puis relire", () => {
  it("copie à l'emplacement du jour, et le vérifie", async () => {
    listes.set("defauts", defautsFictifs(80));

    const r = await sauvegarderUne("defauts", LUNDI);

    expect(r.etat).toBe("ok");
    expect(r.emplacement).toBe("sauvegarde-defauts-lun");
    expect(r.lignes).toBe(80);
    expect(r.verifiees).toBe(80);
    expect(blobs.get("sauvegarde-defauts-lun")).toHaveLength(80);
  });

  it("conserve le contenu EXACT, champ par champ", async () => {
    const origine = defautsFictifs(12);
    listes.set("defauts", origine);
    await sauvegarderUne("defauts", LUNDI);

    const copie = blobs.get("sauvegarde-defauts-lun") as typeof origine;
    expect(copie).toEqual(origine);
    /* Et dans le même ordre : un tri perdu, c'est un historique faussé. */
    expect(copie.map((x) => x.id)).toEqual(origine.map((x) => x.id));
    expect(copie[3].comments).toEqual(origine[3].comments);
    expect(copie[7].photoUrls).toEqual(origine[7].photoUrls);
  });

  it("n'écrit JAMAIS sur la clé d'origine", async () => {
    listes.set("defauts", defautsFictifs(5));
    listes.set("pieces", defautsFictifs(3));
    await sauvegarderTout(LUNDI, ["defauts", "pieces"]);
    expect(ecrituresOriginaux).toEqual([]);
  });

  it("range chaque jour à sa place, sans écraser la veille", async () => {
    listes.set("defauts", defautsFictifs(10));
    await sauvegarderUne("defauts", new Date("2026-10-19T02:00:00Z")); // lundi
    listes.set("defauts", defautsFictifs(14));
    await sauvegarderUne("defauts", new Date("2026-10-20T02:00:00Z")); // mardi

    expect(blobs.get("sauvegarde-defauts-lun")).toHaveLength(10);
    expect(blobs.get("sauvegarde-defauts-mar")).toHaveLength(14);
  });

  it("l'inventaire dit ce qu'on a sous la main", async () => {
    listes.set("defauts", defautsFictifs(6));
    await sauvegarderUne("defauts", LUNDI);

    const inv = await inventaireDe("defauts");
    expect(inv).toHaveLength(7);
    const lundi = inv.find((x) => x.jour === "lun");
    expect(lundi?.lisible).toBe(true);
    expect(lundi?.lignes).toBe(6);
    /* Les six autres jours n'existent pas encore, et le disent. */
    expect(inv.filter((x) => !x.lisible)).toHaveLength(6);
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   Scénario B — Notion tombe
   ───────────────────────────────────────────────────────────────────────── */

describe("Scénario B — Notion tombe pendant la sauvegarde", () => {
  it("ne remplace pas une sauvegarde valide par du vide", async () => {
    listes.set("defauts", defautsFictifs(80));
    await sauvegarderUne("defauts", LUNDI);
    expect(blobs.get("sauvegarde-defauts-lun")).toHaveLength(80);

    /* La nuit suivante, Notion ne répond pas. */
    lectureCassee = "toutes";
    const r = await sauvegarderUne("defauts", LUNDI);

    expect(r.etat).toBe("lecture-impossible");
    /* La sauvegarde d'avant est INTACTE. */
    expect(blobs.get("sauvegarde-defauts-lun")).toHaveLength(80);
    expect(ecrituresOriginaux).toEqual([]);
  });

  it("une liste en panne n'empêche pas les autres d'être sauvegardées", async () => {
    listes.set("defauts", defautsFictifs(10));
    listes.set("pieces", defautsFictifs(4));
    lectureCassee = new Set(["defauts"]);

    const r = await sauvegarderTout(LUNDI, ["defauts", "pieces"]);

    expect(r.find((x) => x.cle === "defauts")?.etat).toBe("lecture-impossible");
    expect(r.find((x) => x.cle === "pieces")?.etat).toBe("ok");
    expect(blobs.get("sauvegarde-pieces-lun")).toHaveLength(4);
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   Scénario C — Redis refuse
   ───────────────────────────────────────────────────────────────────────── */

describe("Scénario C — Redis refuse", () => {
  it("laisse la sauvegarde précédente intacte si l'écriture échoue", async () => {
    listes.set("defauts", defautsFictifs(30));
    await sauvegarderUne("defauts", LUNDI);

    listes.set("defauts", defautsFictifs(31));
    ecritureBlobCassee = true;
    const r = await sauvegarderUne("defauts", LUNDI);

    expect(r.etat).toBe("ecriture-impossible");
    expect(blobs.get("sauvegarde-defauts-lun")).toHaveLength(30); // la veille, intacte
  });

  it("signale une copie qu'on ne sait pas relire", async () => {
    listes.set("defauts", defautsFictifs(5));
    lectureBlobCassee = true;
    const r = await sauvegarderUne("defauts", LUNDI);
    expect(r.etat).toBe("verification-echouee");
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   Restauration
   ───────────────────────────────────────────────────────────────────────── */

function requete(corps: unknown): NextRequest {
  return new NextRequest("http://local/api/admin/sauvegardes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corps),
  });
}

describe("Restauration — le parcours complet", () => {
  it("rend EXACTEMENT les données sauvegardées", async () => {
    const origine = defautsFictifs(40);
    listes.set("defauts", origine);
    await sauvegarderUne("defauts", LUNDI);

    /* Catastrophe : la liste est amputée. */
    listes.set("defauts", origine.slice(0, 3));

    const r = await restauration.POST(requete({
      cle: "defauts",
      emplacement: "sauvegarde-defauts-lun",
      confirmation: "RESTAURER defauts DEPUIS sauvegarde-defauts-lun",
    }));

    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.lignes).toBe(40);
    expect(d.avant).toBe(3);

    /* Comparaison enregistrement par enregistrement. */
    const restaure = listes.get("defauts") as typeof origine;
    expect(restaure).toHaveLength(40);
    expect(restaure).toEqual(origine);
    expect(restaure.map((x) => x.id)).toEqual(origine.map((x) => x.id));
    expect(new Set(restaure.map((x) => x.id)).size).toBe(40); // aucun doublon
    expect(restaure[11].timestamp).toBe(origine[11].timestamp); // dates intactes
  });

  it("REFUSE une restauration qui ferait perdre des lignes", async () => {
    listes.set("defauts", defautsFictifs(5));
    await sauvegarderUne("defauts", LUNDI);
    listes.set("defauts", defautsFictifs(40)); // le travail a continué depuis

    const r = await restauration.POST(requete({
      cle: "defauts",
      emplacement: "sauvegarde-defauts-lun",
      confirmation: "RESTAURER defauts DEPUIS sauvegarde-defauts-lun",
    }));

    expect(r.status).toBe(409);
    const d = await r.json();
    expect(d.error).toContain("perdre");
    expect(listes.get("defauts")).toHaveLength(40); // rien n'a bougé
  });

  it("ne part pas sans la phrase de confirmation exacte", async () => {
    listes.set("defauts", defautsFictifs(10));
    await sauvegarderUne("defauts", LUNDI);
    listes.set("defauts", defautsFictifs(2));

    const sans = await restauration.POST(requete({
      cle: "defauts", emplacement: "sauvegarde-defauts-lun",
    }));
    expect(sans.status).toBe(428);

    const fausse = await restauration.POST(requete({
      cle: "defauts", emplacement: "sauvegarde-defauts-lun", confirmation: "oui",
    }));
    expect(fausse.status).toBe(428);
    expect(listes.get("defauts")).toHaveLength(2); // intact
  });

  it("refuse une sauvegarde illisible, sans toucher à l'existant", async () => {
    listes.set("defauts", defautsFictifs(7));
    await sauvegarderUne("defauts", LUNDI);
    lectureBlobCassee = true;

    const r = await restauration.POST(requete({
      cle: "defauts", emplacement: "sauvegarde-defauts-lun",
      confirmation: "RESTAURER defauts DEPUIS sauvegarde-defauts-lun",
    }));

    expect(r.status).toBe(503);
    expect(listes.get("defauts")).toHaveLength(7);
  });

  it("refuse une clé ou un emplacement inventés", async () => {
    const a = await restauration.POST(requete({
      cle: "inconnue", emplacement: "sauvegarde-inconnue-lun", confirmation: "x",
    }));
    expect(a.status).toBe(400);

    const b = await restauration.POST(requete({
      cle: "defauts", emplacement: "sauvegarde-defauts-ailleurs", confirmation: "x",
    }));
    expect(b.status).toBe(400);
  });

  it("l'aperçu annonce la perte AVANT qu'on décide", async () => {
    listes.set("defauts", defautsFictifs(3));
    await sauvegarderUne("defauts", LUNDI);
    listes.set("defauts", defautsFictifs(25));

    const a = await apercuRestauration("defauts", "sauvegarde-defauts-lun");
    expect(a.actuel).toBe(25);
    expect(a.sauvegarde).toBe(3);
    expect(a.delta).toBe(-22);
    expect(a.perteNette).toBe(true);
  });
});

describe("Restauration — une sauvegarde vide ne passe pas en douce", () => {
  it("le garde-fou de setData bloque même une restauration confirmée", async () => {
    listes.set("defauts", defautsFictifs(0));
    await sauvegarderUne("defauts", LUNDI); // sauvegarde vide, licite
    listes.set("defauts", defautsFictifs(20));

    const r = await restauration.POST(requete({
      cle: "defauts", emplacement: "sauvegarde-defauts-lun",
      confirmation: "RESTAURER defauts DEPUIS sauvegarde-defauts-lun",
    }));

    /* Refusé d'abord pour perte nette ; et même en l'acceptant, l'écriture
       vide reste soumise au garde-fou. */
    expect(r.status).toBe(409);
    expect(listes.get("defauts")).toHaveLength(20);
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   L'export indépendant
   ───────────────────────────────────────────────────────────────────────── */

describe("Export — une copie hors de l'application", () => {
  it("rend une archive complète et vérifiable", async () => {
    listes.set("defauts", defautsFictifs(9));
    listes.set("pieces", defautsFictifs(4));
    const exportRoute = await import("@/app/api/admin/sauvegardes/export/route");

    const r = await exportRoute.GET();

    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Disposition")).toContain("attachment");
    expect(r.headers.get("Cache-Control")).toBe("private, no-store");

    const a = JSON.parse(await r.text());
    expect(a.format).toBe("tm-rapport-export");
    expect(a.listes.defauts).toHaveLength(9);
    expect(a.listes.pieces).toHaveLength(4);
    expect(a.empreintes.defauts.lignes).toBe(9);
    expect(a.manquantes).toEqual({});
    /* Le contenu est intégral, pas un résumé. */
    expect(a.listes.defauts[0].photoUrls).toHaveLength(2);
  });

  it("dit ce qu'il n'a pas pu lire au lieu de le rendre vide", async () => {
    listes.set("defauts", defautsFictifs(5));
    lectureCassee = new Set(["pieces"]);
    const exportRoute = await import("@/app/api/admin/sauvegardes/export/route");

    const r = await exportRoute.GET();

    /* 206 : l'archive est partielle, et le dit avant même d'être ouverte. */
    expect(r.status).toBe(206);
    expect(r.headers.get("Content-Disposition")).toContain("PARTIEL");
    const a = JSON.parse(await r.text());
    expect(a.listes.pieces).toBeUndefined();
    expect(a.manquantes.pieces).toContain("indisponible");
  });
});
