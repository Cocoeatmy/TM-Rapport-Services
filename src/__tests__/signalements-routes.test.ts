/**
 * Les signalements, testés sur les VRAIES routes.
 *
 * Jusqu'ici, les protections anti-doublon se vérifiaient de deux façons : les
 * règles pures d'un côté, le texte source des routes de l'autre. Ni l'un ni
 * l'autre ne démontrait que la route, assemblée, fait ce qu'on croit.
 *
 * Ici les handlers sont appelés pour de bon, avec de vraies `Request`. Seuls
 * le magasin (une liste en mémoire), Notion et les droits sont remplacés par
 * des doublures. Le verrou, les empreintes, les pierres tombales et
 * l'enchaînement des étapes sont ceux de production.
 *
 * Ce sont les tests A à F demandés pour le projet TM-2600825.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

/* ── Le magasin, en mémoire ─────────────────────────────────────────────── */
const magasin = new Map<string, unknown[]>();
/** Nombre d'écritures : sert à prouver qu'un rejeu n'écrit rien. */
let ecritures = 0;
/** Fait échouer la lecture, pour vérifier qu'on refuse plutôt que d'écraser. */
let lectureCassee = false;

vi.mock("@/lib/kv-store", () => ({
  getData: vi.fn(async (k: string) => [...(magasin.get(k) || [])]),
  getDataFresh: vi.fn(async (k: string) => {
    if (lectureCassee) throw new Error("Notion indisponible");
    return [...(magasin.get(k) || [])];
  }),
  setData: vi.fn(async (k: string, d: unknown[]) => {
    ecritures += 1;
    magasin.set(k, [...d]);
  }),
}));

/* Notion : on note les appels, on ne contacte personne. */
const notionAppels: string[] = [];
vi.mock("@/lib/notion", () => ({
  notion: {
    pages: {
      retrieve: vi.fn(async () => ({ properties: {} })),
      update: vi.fn(async () => { notionAppels.push("update"); return {}; }),
    },
  },
}));

vi.mock("@/lib/server-cache", () => ({ invalidateCache: vi.fn() }));
vi.mock("@/lib/notion-fichiers", () => ({
  descripteurFichier: (nom: string, url: string) => ({ name: nom, external: { url }, type: "external" }),
}));

/* Droits : tout est permis, ce n'est pas l'objet de ces tests. */
vi.mock("@/lib/droits-serveur", () => ({
  exigerDroit: vi.fn(async () => ({ user: { name: "Miguel", email: "m@tm.ch", role: "monteur" } })),
}));

/* Redis absent : `avecVerrou` retombe alors sur l'exécution directe, comme en
   développement local. La sérialisation réelle est testée ailleurs. */
vi.mock("@/lib/redis-cache", () => ({
  redisEnabled: false,
  redisLockAcquire: vi.fn(async () => null),
  redisLockRelease: vi.fn(async () => {}),
}));

const defauts = await import("@/app/api/defauts/route");
const pieces = await import("@/app/api/pieces/route");

const PROJET = "3cf1895b-9179-8002-8fae-d0746feb4995";

/* De vraies `NextRequest` : les handlers lisent `request.nextUrl`, que la
   `Request` standard ne porte pas. */
function requetePost(corps: unknown): NextRequest {
  return new NextRequest("http://local/api/signalements", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corps),
  });
}
function requeteDelete(id: string): NextRequest {
  return new NextRequest(`http://local/api/signalements?id=${encodeURIComponent(id)}`, { method: "DELETE" });
}
function requetePatch(corps: unknown): NextRequest {
  return new NextRequest("http://local/api/signalements", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corps),
  });
}

/* Les deux routes ont la même forme : un seul jeu de tests les parcourt. */
const CAS = [
  { nom: "défauts", mod: () => defauts, cle: "defauts", tombes: "defauts-supprimes" },
  { nom: "pièces manquantes", mod: () => pieces, cle: "pieces", tombes: "pieces-supprimees" },
] as const;

beforeEach(() => {
  magasin.clear();
  notionAppels.length = 0;
  ecritures = 0;
  lectureCassee = false;
});

for (const cas of CAS) {
  describe(`${cas.nom} — création`, () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const route = () => cas.mod() as any;

    it("TEST A — une création donne UN signalement", async () => {
      const r = await route().POST(requetePost({
        id: "s1", projectId: PROJET, description: "Aimant cassé", photoUrls: [],
      }));
      expect(r.status).toBe(200);
      expect(magasin.get(cas.cle)).toHaveLength(1);
    });

    it("TEST B — la même requête envoyée deux fois n'en donne qu'un", async () => {
      const corps = { id: "s1", projectId: PROJET, description: "Aimant cassé", photoUrls: [] };
      await route().POST(requetePost(corps));
      const ecrituresApres1 = ecritures;
      const r2 = await route().POST(requetePost(corps));

      const d = await r2.json();
      expect(d.deja).toBe(true);
      expect(magasin.get(cas.cle)).toHaveLength(1);
      /* Et surtout : le rejeu n'a RIEN réécrit. */
      expect(ecritures).toBe(ecrituresApres1);
    });

    it("TEST C — un rejeu sans identifiant, après coupure, n'en donne qu'un", async () => {
      /* Le cas réel : la requête aboutit, le téléphone ne reçoit pas la
         réponse, sa file rejoue — sans identifiant cette fois. */
      await route().POST(requetePost({
        projectId: PROJET, description: "Joint à refaire",
        photoUrls: ["https://c/a.jpg", "https://c/b.jpg"],
      }));
      const r2 = await route().POST(requetePost({
        projectId: PROJET, description: "Joint à refaire",
        photoUrls: ["https://c/a.jpg", "https://c/b.jpg"],
      }));

      expect((await r2.json()).deja).toBe(true);
      expect(magasin.get(cas.cle)).toHaveLength(1);
    });

    it("laisse passer un signalement réellement différent", async () => {
      await route().POST(requetePost({ projectId: PROJET, description: "Aimant cassé", photoUrls: [] }));
      await route().POST(requetePost({ projectId: PROJET, description: "Vitre rayée", photoUrls: [] }));
      expect(magasin.get(cas.cle)).toHaveLength(2);
    });

    it("refuse d'écrire quand le magasin est illisible, plutôt que d'écraser", async () => {
      magasin.set(cas.cle, [{ id: "existant", projectId: PROJET, description: "déjà là" }]);
      lectureCassee = true;
      const r = await route().POST(requetePost({ projectId: PROJET, description: "nouveau" }));
      expect(r.status).toBe(503);
      expect(magasin.get(cas.cle)).toHaveLength(1); // intact
    });
  });

  describe(`${cas.nom} — suppression`, () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const route = () => cas.mod() as any;

    it("TEST D — supprimé, il ne revient pas lors d'une synchronisation tardive", async () => {
      const corps = {
        id: "s1", projectId: PROJET, description: "Aimant cassé",
        photoUrls: ["https://c/a.jpg"],
      };
      await route().POST(requetePost(corps));
      expect(magasin.get(cas.cle)).toHaveLength(1);

      await route().DELETE(requeteDelete("s1"));
      expect(magasin.get(cas.cle)).toHaveLength(0);
      /* Une pierre tombale a été posée. */
      expect(magasin.get(cas.tombes)).toHaveLength(1);

      /* Le téléphone, qui n'a jamais reçu l'accusé de réception, rejoue. */
      const r = await route().POST(requetePost(corps));
      const d = await r.json();

      expect(d.supprime).toBe(true);
      expect(magasin.get(cas.cle)).toHaveLength(0); // ← il ne revient PAS
    });

    it("le rejeu sans identifiant ne le ressuscite pas non plus", async () => {
      const corps = {
        id: "s1", projectId: PROJET, description: "Aimant cassé",
        photoUrls: ["https://c/a.jpg"],
      };
      await route().POST(requetePost(corps));
      await route().DELETE(requeteDelete("s1"));

      /* Le même envoi, mais sans identifiant : c'est ainsi qu'un téléphone
         rejoue après avoir perdu la réponse. */
      const sansId = { ...corps };
      delete (sansId as { id?: string }).id;
      await route().POST(requetePost(sansId));
      expect(magasin.get(cas.cle)).toHaveLength(0);
    });

    it("supprimer deux signalements de suite les supprime tous les deux", async () => {
      /* Le scénario du 15 octobre : on efface à la chaîne, et les lignes
         revenaient une à une. */
      await route().POST(requetePost({ id: "a", projectId: PROJET, description: "Un" }));
      await route().POST(requetePost({ id: "b", projectId: PROJET, description: "Deux" }));
      await route().POST(requetePost({ id: "c", projectId: PROJET, description: "Trois" }));

      await route().DELETE(requeteDelete("a"));
      await route().DELETE(requeteDelete("b"));

      const restants = (magasin.get(cas.cle) || []) as { id: string }[];
      expect(restants.map((x) => x.id)).toEqual(["c"]);
    });
  });

  describe(`${cas.nom} — modification`, () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const route = () => cas.mod() as any;

    it("TEST E — modifier ne crée pas un second enregistrement", async () => {
      await route().POST(requetePost({ id: "s1", projectId: PROJET, description: "Aimant cassé" }));
      await route().PATCH(requetePatch({ id: "s1", description: "Aimant cassé côté droit" }));

      const liste = (magasin.get(cas.cle) || []) as { id: string; description: string }[];
      expect(liste).toHaveLength(1);
      expect(liste[0].description).toContain("côté droit");
    });
  });

  describe(`${cas.nom} — concurrence`, () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const route = () => cas.mod() as any;

    it("TEST F — cinq fois la même requête en même temps : un seul enregistrement", async () => {
      const corps = { id: "s1", projectId: PROJET, description: "Aimant cassé", photoUrls: [] };
      await Promise.all(Array.from({ length: 5 }, () => route().POST(requetePost(corps))));
      expect(magasin.get(cas.cle)).toHaveLength(1);
    });

    it("trois créations différentes lancées ensemble ne s'effacent pas", async () => {
      await Promise.all([
        route().POST(requetePost({ id: "a", projectId: PROJET, description: "Un" })),
        route().POST(requetePost({ id: "b", projectId: PROJET, description: "Deux" })),
        route().POST(requetePost({ id: "c", projectId: PROJET, description: "Trois" })),
      ]);
      const liste = (magasin.get(cas.cle) || []) as { id: string }[];
      expect(liste.map((x) => x.id).sort()).toEqual(["a", "b", "c"]);
    });
  });
}

describe("les deux listes restent étanches", () => {
  it("un défaut n'apparaît pas dans les pièces, et réciproquement", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (defauts as any).POST(requetePost({ id: "d1", projectId: PROJET, description: "Défaut" }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (pieces as any).POST(requetePost({ id: "p1", projectId: PROJET, description: "Pièce" }));

    expect(magasin.get("defauts")).toHaveLength(1);
    expect(magasin.get("pieces")).toHaveLength(1);
    expect(magasin.get("defauts-supprimes")).toBeUndefined();
    expect(magasin.get("pieces-supprimees")).toBeUndefined();
  });
});
