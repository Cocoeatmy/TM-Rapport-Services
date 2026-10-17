/**
 * TEST A — la sauvegarde ne doit jamais pouvoir détruire ce qu'elle sauvegarde.
 *
 * Le scénario du 17 octobre 2026 : Notion ne répond pas, la lecture rend une
 * liste vide sans erreur, et la réécriture l'impose aux vraies données. Ces
 * tests simulent chaque façon dont Notion peut mal répondre — timeout, 429,
 * 500, JSON invalide, réponse vide — et vérifient qu'AUCUNE écriture ne part
 * vers la clé d'origine.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

/** Ce que le faux magasin a vu passer. */
const ecritures: { cle: string; lignes: number }[] = [];
let lectureLeve: Error | null = null;
let contenu: unknown[] = [];
let relecture: unknown[] | null = null;

vi.mock("../lib/kv-store", () => ({
  getDataFresh: vi.fn(async (cle: string) => {
    if (lectureLeve) throw lectureLeve;
    void cle;
    return contenu;
  }),
  setBlob: vi.fn(async (cle: string, data: unknown[]) => {
    ecritures.push({ cle, lignes: data.length });
  }),
  getBlob: vi.fn(async (cle: string) => {
    void cle;
    return relecture ?? contenu;
  }),
  setData: vi.fn(async (cle: string, data: unknown[]) => {
    ecritures.push({ cle, lignes: data.length });
  }),
}));

const {
  CLES_SAUVEGARDEES, cleDeSauvegarde, emplacementsDe,
  sauvegarderUne, sauvegarderTout, apercuRestauration,
} = await import("../lib/sauvegarde");

const LUNDI = new Date("2026-10-19T02:00:00Z"); // un lundi

beforeEach(() => {
  ecritures.length = 0;
  lectureLeve = null;
  contenu = [{ id: "a" }, { id: "b" }, { id: "c" }];
  relecture = null;
});

describe("où va une sauvegarde", () => {
  it("écrit dans une clé DISTINCTE de l'original", () => {
    expect(cleDeSauvegarde("defauts", LUNDI)).toBe("sauvegarde-defauts-lun");
    expect(cleDeSauvegarde("defauts", LUNDI)).not.toBe("defauts");
  });

  it("garde sept emplacements, un par jour", () => {
    const e = emplacementsDe("pieces");
    expect(e).toHaveLength(7);
    expect(new Set(e).size).toBe(7);
    expect(e.every((x) => x.startsWith("sauvegarde-pieces-"))).toBe(true);
  });

  it("couvre les listes vivantes de l'application", () => {
    expect([...CLES_SAUVEGARDEES]).toEqual(["pieces", "defauts", "logs", "stocks", "notifications"]);
  });
});

describe("TEST A — une erreur Notion n'écrit rien", () => {
  it.each([
    ["timeout", new Error("Request to Notion API has timed out")],
    ["429 (limite de débit)", Object.assign(new Error("rate_limited"), { status: 429 })],
    ["500", Object.assign(new Error("internal_server_error"), { status: 500 })],
    ["JSON invalide", new SyntaxError("Unexpected token < in JSON")],
    ["coupure réseau", new TypeError("fetch failed")],
  ])("%s : aucune écriture, et l'échec est rapporté", async (_nom, erreur) => {
    lectureLeve = erreur;
    const r = await sauvegarderUne("defauts", LUNDI);

    expect(ecritures).toEqual([]);          // ← le cœur du test
    expect(r.etat).toBe("lecture-impossible");
    expect(r.lignes).toBe(0);
    expect(r.message).toBeTruthy();
  });

  it("n'écrit JAMAIS vers la clé d'origine, même quand tout va bien", async () => {
    await sauvegarderUne("defauts", LUNDI);
    expect(ecritures.map((e) => e.cle)).toEqual(["sauvegarde-defauts-lun"]);
    expect(ecritures.some((e) => e.cle === "defauts")).toBe(false);
  });

  it("copie bien les lignes quand la lecture réussit", async () => {
    const r = await sauvegarderUne("defauts", LUNDI);
    expect(r.etat).toBe("ok");
    expect(r.lignes).toBe(3);
    expect(r.verifiees).toBe(3);
  });
});

describe("une sauvegarde est relue avant d'être déclarée bonne", () => {
  it("signale une copie incomplète", async () => {
    relecture = [{ id: "a" }]; // on n'en relit qu'une sur trois
    const r = await sauvegarderUne("defauts", LUNDI);
    expect(r.etat).toBe("verification-echouee");
    expect(r.verifiees).toBe(1);
  });
});

describe("une panne sur une liste n'arrête pas les autres", () => {
  it("rapporte chaque liste séparément", async () => {
    const r = await sauvegarderTout(LUNDI, ["defauts", "pieces"]);
    expect(r).toHaveLength(2);
    expect(r.every((x) => x.etat === "ok")).toBe(true);
  });
});

describe("l'aperçu de restauration", () => {
  it("annonce une perte quand la sauvegarde est plus maigre que l'actuel", async () => {
    contenu = [{ id: "a" }, { id: "b" }, { id: "c" }];
    relecture = [{ id: "a" }];
    const a = await apercuRestauration("defauts", "sauvegarde-defauts-lun");
    expect(a.actuel).toBe(3);
    expect(a.sauvegarde).toBe(1);
    expect(a.delta).toBe(-2);
    expect(a.perteNette).toBe(true);
  });

  it("ne crie pas quand la restauration ne perd rien", async () => {
    contenu = [{ id: "a" }];
    relecture = [{ id: "a" }, { id: "b" }];
    const a = await apercuRestauration("defauts", "sauvegarde-defauts-lun");
    expect(a.perteNette).toBe(false);
    expect(a.delta).toBe(1);
  });

  it("ne prétend rien savoir quand l'état actuel est illisible", async () => {
    lectureLeve = new Error("Notion muet");
    const a = await apercuRestauration("defauts", "sauvegarde-defauts-lun");
    expect(a.actuel).toBeNull();
    expect(a.delta).toBeNull();
    expect(a.perteNette).toBe(false);
    expect(a.message).toContain("illisible");
  });
});
