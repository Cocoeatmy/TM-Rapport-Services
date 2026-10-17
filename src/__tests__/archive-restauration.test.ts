/**
 * L'archive exportée est-elle VRAIMENT restaurable ?
 *
 * La question n'est pas rhétorique. Jusqu'ici, l'export produisait un fichier
 * que personne n'avait jamais rouvert : on supposait qu'il contenait ce qu'il
 * fallait et qu'on saurait s'en servir. Une sauvegarde non relue n'est pas
 * une sauvegarde.
 *
 * Ce fichier joue le scénario en entier, et dans l'ordre d'une vraie
 * catastrophe :
 *
 *   1. des données fictives vivent dans un magasin en mémoire ;
 *   2. on EXPORTE par la vraie route, et on garde le texte du fichier tel
 *      qu'il serait téléchargé — pas l'objet en mémoire, le TEXTE ;
 *   3. on détruit tout : le magasin est vidé, comme si l'espace Notion avait
 *      disparu. Les sauvegardes internes aussi : elles y étaient.
 *   4. on relit le fichier depuis zéro, par la vraie route d'import ;
 *   5. on compare enregistrement par enregistrement, champ par champ.
 *
 * Aucune donnée de production n'est touchée : tout vit dans des `Map`.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

/* ── Le magasin isolé ───────────────────────────────────────────────────── */
const listes = new Map<string, unknown[]>();
let lectureCassee: Set<string> | "toutes" | null = null;

class EcritureVideRefusee extends Error {}

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
    const avant = (listes.get(k) || []).length;
    if (d.length === 0 && avant >= 2 && !o?.permettreVide) throw new EcritureVideRefusee();
    listes.set(k, [...d]);
  }),
  setBlob: vi.fn(async () => {}),
  getBlob: vi.fn(async () => { throw new Error("absent"); }),
}));

vi.mock("@/lib/droits-serveur", () => ({
  exigerDroit: vi.fn(async () => ({ user: { name: "Micael", email: "m@tm.ch", role: "admin" } })),
}));

const exportRoute = await import("@/app/api/admin/sauvegardes/export/route");
const importRoute = await import("@/app/api/admin/sauvegardes/import/route");
const { validerArchive, construireArchive, comparerArchive, nomDeFichier } =
  await import("@/lib/archive");

/* ── Des données fictives, avec tout ce qui rend une donnée fragile ────── */
function defautsFictifs(n: number, prefixe = "d") {
  return Array.from({ length: n }, (_, i) => ({
    id: `${prefixe}${i}`,
    projectId: "projet-fictif-0000",
    user: ["Miguel", "Claudio", "Jacobo"][i % 3],
    description: `Défaut « spécial » n°${i} — accents éàü, guillemets "doubles", \\ et /`,
    photoUrls: [`https://c.test/${i}-a.jpg`, `https://c.test/${i}-b.jpg`],
    status: i % 2 ? "signale" : "resolu",
    timestamp: Date.parse("2026-10-01T08:00:00Z") + i * 3600_000,
    comments: [{ user: "Micael", message: `note ${i}`, timestamp: 1 }],
    cabineIdx: (i % 4) + 1,
    /* Les valeurs qui se perdent le plus souvent à la sérialisation. */
    vide: "",
    zero: 0,
    faux: false,
    nul: null,
    imbrique: { a: { b: { c: [1, 2, { d: "profond" }] } } },
  }));
}

/** Télécharge l'archive comme le ferait un navigateur : on garde le TEXTE. */
async function telecharger(): Promise<{ texte: string; statut: number; nom: string }> {
  const r = await exportRoute.GET();
  const disposition = r.headers.get("Content-Disposition") || "";
  return {
    texte: await r.text(),
    statut: r.status,
    nom: /filename="([^"]+)"/.exec(disposition)?.[1] || "",
  };
}

function requeteImport(corps: unknown): NextRequest {
  return new NextRequest("http://local/api/admin/sauvegardes/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corps),
  });
}

beforeEach(() => {
  listes.clear();
  lectureCassee = null;
});

/* ─────────────────────────────────────────────────────────────────────────
   LE scénario : tout disparaît, le fichier suffit à tout remettre
   ───────────────────────────────────────────────────────────────────────── */

describe("Tout est perdu — l'archive remet tout en place", () => {
  it("restaure à l'identique après destruction complète du magasin", async () => {
    const defauts = defautsFictifs(60, "def-");
    const pieces = defautsFictifs(23, "pie-");
    const logs = defautsFictifs(140, "log-");
    const stocks = defautsFictifs(9, "sto-");
    const notifications = defautsFictifs(4, "not-");
    listes.set("defauts", defauts);
    listes.set("pieces", pieces);
    listes.set("logs", logs);
    listes.set("stocks", stocks);
    listes.set("notifications", notifications);

    /* 1. On télécharge. */
    const fichier = await telecharger();
    expect(fichier.statut).toBe(200);
    expect(fichier.nom).toMatch(/^tm-rapport-export-\d{4}-\d{2}-\d{2}\.json$/);

    /* 2. CATASTROPHE : il ne reste plus rien, nulle part. */
    listes.clear();
    expect(listes.size).toBe(0);

    /* 3. Le fichier revient de l'extérieur : on le relit depuis son TEXTE,
          exactement comme un humain qui le ré-téléverse. */
    const relu = JSON.parse(fichier.texte);
    const verdict = validerArchive(relu);
    expect(verdict.valide).toBe(true);
    if (!verdict.valide) return;

    /* 4. Simulation d'abord : on regarde avant de toucher. */
    const simu = await importRoute.POST(requeteImport({ archive: relu }));
    expect(simu.status).toBe(200);
    const s = await simu.json();
    expect(s.simulation).toBe(true);
    expect(listes.size, "une simulation n'écrit RIEN").toBe(0);
    expect(s.listes.find((l: { cle: string }) => l.cle === "defauts").archive).toBe(60);

    /* 5. On applique, avec la phrase exacte que la simulation a donnée. */
    const applique = await importRoute.POST(requeteImport({
      archive: relu,
      appliquer: true,
      confirmation: s.confirmationAttendue,
    }));
    expect(applique.status).toBe(200);
    expect((await applique.json()).ok).toBe(true);

    /* 6. Comparaison enregistrement par enregistrement. */
    expect(listes.get("defauts")).toEqual(defauts);
    expect(listes.get("pieces")).toEqual(pieces);
    expect(listes.get("stocks")).toEqual(stocks);
    expect(listes.get("notifications")).toEqual(notifications);
    /* Le journal, lui, revient du plus récent au plus ancien : l'archive le
       lit de ses deux sources — la liste Redis et le reliquat Notion — et
       les range par date, comme le fait `/api/logs`. L'ordre d'insertion du
       jeu d'essai n'est donc pas celui qu'on retrouve ; le CONTENU, si. */
    const journal = listes.get("logs") as typeof logs;
    expect(journal).toHaveLength(logs.length);
    expect([...journal].sort((a, b) => a.id.localeCompare(b.id)))
      .toEqual([...logs].sort((a, b) => a.id.localeCompare(b.id)));
    expect(journal.map((l) => l.timestamp))
      .toEqual([...logs.map((l) => l.timestamp)].sort((a, b) => b - a));

    /* Et dans le détail de ce qui se perd d'habitude. */
    const d = listes.get("defauts") as typeof defauts;
    expect(d.map((x) => x.id)).toEqual(defauts.map((x) => x.id)); // l'ordre
    expect(new Set(d.map((x) => x.id)).size).toBe(60);            // aucun doublon
    expect(d[7].timestamp).toBe(defauts[7].timestamp);            // les dates
    expect(d[7].imbrique.a.b.c[2]).toEqual({ d: "profond" });     // l'imbriqué
    expect(d[7].vide).toBe("");                                   // "" ≠ absent
    expect(d[7].zero).toBe(0);                                    // 0 ≠ absent
    expect(d[7].faux).toBe(false);                                // false ≠ absent
    expect(d[7].nul).toBeNull();                                  // null ≠ absent
    expect(d[3].description).toBe(defauts[3].description);        // accents, quotes
    expect(d[3].comments).toEqual(defauts[3].comments);
  });

  it("le fichier traverse un aller-retour JSON sans rien perdre", () => {
    /* C'est ce que fait réellement un fichier posé sur un disque : il n'est
       plus un objet, il est du texte. Tout ce qui ne survit pas à ce passage
       est perdu pour de bon. */
    const origine = defautsFictifs(30);
    const archive = construireArchive({ defauts: origine }, {}, "test");
    const apres = JSON.parse(JSON.stringify(archive));
    expect(apres.listes.defauts).toEqual(origine);
    expect(apres.empreintes.defauts.lignes).toBe(30);
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   Une archive abîmée doit être REFUSÉE, pas appliquée à moitié
   ───────────────────────────────────────────────────────────────────────── */

describe("Une archive douteuse ne passe pas", () => {
  it("refuse un fichier tronqué, repéré par ses empreintes", async () => {
    listes.set("defauts", defautsFictifs(50));
    const fichier = await telecharger();
    const abimee = JSON.parse(fichier.texte);
    abimee.listes.defauts = abimee.listes.defauts.slice(0, 20); // moitié perdue

    const v = validerArchive(abimee);
    expect(v.valide).toBe(false);
    if (!v.valide) expect(v.motif).toContain("incomplète");

    const r = await importRoute.POST(requeteImport({ archive: abimee }));
    expect(r.status).toBe(400);
    expect(listes.get("defauts")).toHaveLength(50); // rien n'a bougé
  });

  it("refuse un fichier qui n'est pas une archive", async () => {
    for (const faux of [null, 42, "texte", [], { format: "autre-chose" }, {}]) {
      expect(validerArchive(faux).valide).toBe(false);
    }
    const r = await importRoute.POST(requeteImport({ archive: { format: "autre" } }));
    expect(r.status).toBe(400);
  });

  it("refuse une version future qu'elle ne sait pas lire", () => {
    const a = construireArchive({ defauts: [] }, {}, "test");
    const v = validerArchive({ ...a, version: 99 });
    expect(v.valide).toBe(false);
  });

  it("ignore les clés inventées au lieu de les créer dans le magasin", async () => {
    listes.set("defauts", defautsFictifs(5));
    const a = construireArchive(
      { defauts: defautsFictifs(5), "clef-bricolee": [{ x: 1 }] }, {}, "test",
    );
    const r = await importRoute.POST(requeteImport({
      archive: a, appliquer: true,
      confirmation: importRoute.phraseDImport(a),
    }));
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.inconnues).toContain("clef-bricolee");
    expect(listes.has("clef-bricolee"), "aucune clé inventée ne doit apparaître").toBe(false);
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   Les verrous : on ne réinstalle pas par inadvertance
   ───────────────────────────────────────────────────────────────────────── */

describe("Les verrous de l'import", () => {
  it("n'écrit rien sans le drapeau d'application", async () => {
    listes.set("defauts", defautsFictifs(3));
    const a = construireArchive({ defauts: defautsFictifs(40) }, {}, "test");

    const r = await importRoute.POST(requeteImport({ archive: a }));

    expect((await r.json()).simulation).toBe(true);
    expect(listes.get("defauts")).toHaveLength(3); // intact
  });

  it("exige la phrase exacte, qui nomme la DATE de l'archive", async () => {
    listes.set("defauts", defautsFictifs(3));
    const a = construireArchive(
      { defauts: defautsFictifs(40) }, {}, "test", new Date("2026-05-04T10:00:00Z"),
    );
    expect(importRoute.phraseDImport(a)).toBe("IMPORTER L'ARCHIVE DU 2026-05-04");

    const sans = await importRoute.POST(requeteImport({ archive: a, appliquer: true }));
    expect(sans.status).toBe(428);

    const autreDate = await importRoute.POST(requeteImport({
      archive: a, appliquer: true, confirmation: "IMPORTER L'ARCHIVE DU 2026-10-17",
    }));
    expect(autreDate.status).toBe(428);
    expect(listes.get("defauts")).toHaveLength(3);
  });

  it("REFUSE un import qui ferait perdre des lignes", async () => {
    listes.set("defauts", defautsFictifs(80)); // le travail a continué
    const a = construireArchive({ defauts: defautsFictifs(12) }, {}, "test");

    const r = await importRoute.POST(requeteImport({
      archive: a, appliquer: true, confirmation: importRoute.phraseDImport(a),
    }));

    expect(r.status).toBe(409);
    expect((await r.json()).error).toContain("perdrait 68");
    expect(listes.get("defauts")).toHaveLength(80); // rien n'a bougé
  });

  it("accepte la perte quand elle est assumée explicitement", async () => {
    const ancien = defautsFictifs(12, "vieux-");
    listes.set("defauts", defautsFictifs(80));
    const a = construireArchive({ defauts: ancien }, {}, "test");

    const r = await importRoute.POST(requeteImport({
      archive: a, appliquer: true,
      confirmation: importRoute.phraseDImport(a), accepterPerte: true,
    }));

    expect(r.status).toBe(200);
    expect(listes.get("defauts")).toEqual(ancien);
  });

  it("n'écrase pas un état qu'il n'a pas pu lire", async () => {
    listes.set("defauts", defautsFictifs(30));
    lectureCassee = new Set(["defauts"]);
    const a = construireArchive({ defauts: defautsFictifs(30) }, {}, "test");

    const r = await importRoute.POST(requeteImport({
      archive: a, appliquer: true, confirmation: importRoute.phraseDImport(a),
    }));

    /* On ne devine pas ce qu'on écrase : lecture impossible, donc on ne
       touche à rien. */
    expect(r.status).toBe(503);
    expect(listes.get("defauts")).toHaveLength(30);
  });

  it("se limite aux listes demandées", async () => {
    listes.set("defauts", defautsFictifs(2));
    listes.set("pieces", defautsFictifs(2));
    const a = construireArchive(
      { defauts: defautsFictifs(20, "neuf-"), pieces: defautsFictifs(20, "neuf-") }, {}, "test",
    );

    const r = await importRoute.POST(requeteImport({
      archive: a, cles: ["defauts"], appliquer: true,
      confirmation: importRoute.phraseDImport(a),
    }));

    expect(r.status).toBe(200);
    expect(listes.get("defauts")).toHaveLength(20);
    expect(listes.get("pieces"), "« pieces » n'était pas demandée").toHaveLength(2);
  });

  it("une liste refusée n'empêche pas les autres de revenir", async () => {
    /* `defauts` sera refusée par le garde-fou de setData (archive vide sur
       une liste peuplée), `pieces` doit passer quand même. */
    listes.set("defauts", defautsFictifs(10));
    listes.set("pieces", defautsFictifs(1));
    const a = construireArchive({ defauts: [], pieces: defautsFictifs(30) }, {}, "test");

    const r = await importRoute.POST(requeteImport({
      archive: a, appliquer: true,
      confirmation: importRoute.phraseDImport(a), accepterPerte: false,
    }));
    /* D'abord un refus net, pour la perte annoncée. */
    expect(r.status).toBe(409);

    const force = await importRoute.POST(requeteImport({
      archive: a, appliquer: true,
      confirmation: importRoute.phraseDImport(a), accepterPerte: true,
    }));
    expect(force.status).toBe(200);
    expect(listes.get("pieces")).toHaveLength(30);
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   Une archive partielle le dit, et reste utilisable
   ───────────────────────────────────────────────────────────────────────── */

describe("Archive partielle", () => {
  it("se télécharge en 206, se nomme PARTIEL, et restaure ce qu'elle a", async () => {
    listes.set("defauts", defautsFictifs(15));
    listes.set("pieces", defautsFictifs(6));
    lectureCassee = new Set(["logs"]);

    const fichier = await telecharger();
    expect(fichier.statut).toBe(206);
    expect(fichier.nom).toContain("PARTIEL");

    const a = JSON.parse(fichier.texte);
    expect(a.manquantes.logs).toContain("indisponible");

    listes.clear();
    lectureCassee = null;
    const r = await importRoute.POST(requeteImport({
      archive: a, appliquer: true, confirmation: importRoute.phraseDImport(a),
    }));

    expect(r.status).toBe(200);
    expect(listes.get("defauts")).toHaveLength(15);
    expect(listes.get("pieces")).toHaveLength(6);
    expect(listes.has("logs"), "ce qui manquait manque, sans inventer du vide").toBe(false);
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   Les petites fonctions, pour elles-mêmes
   ───────────────────────────────────────────────────────────────────────── */

describe("Le format d'archive", () => {
  it("compte les lignes et les octets de chaque liste", () => {
    const a = construireArchive({ defauts: defautsFictifs(7), pieces: [] }, {}, "m@tm.ch");
    expect(a.empreintes.defauts.lignes).toBe(7);
    expect(a.empreintes.defauts.octets).toBeGreaterThan(100);
    expect(a.empreintes.pieces).toEqual({ lignes: 0, octets: 2 }); // "[]"
    expect(a.par).toBe("m@tm.ch");
  });

  it("annonce ce qu'une restauration changerait, sans la faire", () => {
    const a = construireArchive({ defauts: defautsFictifs(10), pieces: defautsFictifs(3) }, {}, "t");
    const c = comparerArchive(a, { defauts: 25, pieces: 1 });
    expect(c.find((x) => x.cle === "defauts")).toMatchObject({ delta: -15, perteNette: true });
    expect(c.find((x) => x.cle === "pieces")).toMatchObject({ delta: 2, perteNette: false });
  });

  it("un état actuel inconnu n'est pas un zéro", () => {
    const a = construireArchive({ defauts: defautsFictifs(10) }, {}, "t");
    const c = comparerArchive(a, { defauts: null });
    expect(c[0].delta).toBeNull();
    expect(c[0].perteNette).toBe(false);
  });

  it("nomme le fichier par sa date, et signale le partiel", () => {
    const j = new Date("2026-10-17T22:00:00Z");
    expect(nomDeFichier(j, true)).toBe("tm-rapport-export-2026-10-17.json");
    expect(nomDeFichier(j, false)).toBe("tm-rapport-export-2026-10-17-PARTIEL.json");
  });
});
