/**
 * Les téléphones vus du bureau : ce qu'ils déposent, ce que le bureau lit,
 * et le signal qui repart dans l'autre sens.
 *
 * Redis est absent ici : les routes tombent sur leur mémoire de repli, et
 * les tests vérifient la logique, pas le transport.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

let compte: { email: string; name: string; role: string } | null =
  { email: "jacobo@tm.ch", name: "Jacobo Fontan Cassas", role: "monteur" };
let admin = true;
const pushs: { email: string; title: string }[] = [];
let pushCasse = false;

vi.mock("@/lib/redis-cache", () => ({
  redisEnabled: false,
  redisHGetAll: vi.fn(async () => ({})),
  redisHSet: vi.fn(async () => {}),
}));
vi.mock("@/lib/auth", () => ({ verifyToken: vi.fn(async () => compte) }));
vi.mock("@/lib/droits-serveur", () => ({
  exigerDroit: vi.fn(async () =>
    admin ? { user: { email: "micael@tm.ch", name: "Micael", role: "admin" } }
          : { refus: new Response("non", { status: 403 }) }),
}));
vi.mock("@/lib/send-push", () => ({
  sendPushToUser: vi.fn(async (email: string, p: { title: string }) => {
    if (pushCasse) throw new Error("VAPID manquant");
    pushs.push({ email, title: p.title });
  }),
}));

const { viderLaMemoire, resumer, PEREMPTION_APPAREIL_MS } = await import("@/lib/appareils");
const battement = await import("@/app/api/appareils/etat/route");
const bureau = await import("@/app/api/admin/appareils/route");

const T0 = Date.parse("2026-10-19T10:00:00Z");

function poster(url: string, corps: unknown, cookie = "x") {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: `auth-token=${cookie}` },
    body: JSON.stringify(corps),
  });
}
const battre = (corps: Record<string, unknown>) =>
  battement.POST(poster("http://local/api/appareils/etat", corps));

const etatNominal = (appareil: string, extra: Record<string, unknown> = {}) => ({
  appareil, navigateur: "iPhone Safari", enLigne: true,
  photosEnAttente: 3, photosEnEchec: 1, requetesEnAttente: 2,
  rapportsNonEnvoyes: [{ projectId: "p1", depuis: T0 - 3600_000, client: true, retenuPar: 2 }],
  preparesHorsLigne: 7, preparesQuand: T0 - 7200_000, build: "abc", ...extra,
});

beforeEach(() => {
  viderLaMemoire();
  compte = { email: "jacobo@tm.ch", name: "Jacobo Fontan Cassas", role: "monteur" };
  admin = true;
  pushs.length = 0;
  pushCasse = false;
});

describe("Le battement", () => {
  it("refuse sans session", async () => {
    compte = null;
    const r = await battre(etatNominal("tel-1"));
    expect(r.status).toBe(401);
  });

  it("enregistre l'état, et le bureau le voit", async () => {
    const r = await battre(etatNominal("tel-1"));
    expect(r.status).toBe(200);
    expect((await r.json()).ok).toBe(true);

    const vue = await (await bureau.GET()).json();
    expect(vue.appareils).toHaveLength(1);
    const a = vue.appareils[0];
    expect(a.nom).toBe("Jacobo Fontan Cassas");
    expect(a.photosEnAttente).toBe(3);
    expect(a.photosEnEchec).toBe(1);
    expect(a.rapportsNonEnvoyes).toHaveLength(1);
    expect(a.preparesHorsLigne).toBe(7);
  });

  it("ne recopie pas n'importe quoi : types forcés, listes bornées", async () => {
    await battre({
      appareil: "tel-x".padEnd(200, "x"),
      photosEnAttente: "beaucoup", photosEnEchec: -5, requetesEnAttente: 2.9,
      rapportsNonEnvoyes: Array.from({ length: 80 }, (_, i) => ({ projectId: `p${i}`, depuis: T0 })),
    });
    const a = (await (await bureau.GET()).json()).appareils[0];
    expect(a.appareil.length).toBe(64);
    expect(a.photosEnAttente).toBe(0);
    expect(a.photosEnEchec).toBe(0);
    expect(a.requetesEnAttente).toBe(2);
    expect(a.rapportsNonEnvoyes).toHaveLength(50);
  });

  it("un second battement du même appareil remplace le premier", async () => {
    await battre(etatNominal("tel-1"));
    await battre(etatNominal("tel-1", { photosEnAttente: 0 }));
    const vue = await (await bureau.GET()).json();
    expect(vue.appareils).toHaveLength(1);
    expect(vue.appareils[0].photosEnAttente).toBe(0);
  });
});

describe("Le bureau", () => {
  it("est réservé à l'administrateur", async () => {
    admin = false;
    expect((await bureau.GET()).status).toBe(403);
    expect((await bureau.POST(poster("http://local/x", { appareil: "tel-1", action: "relancer" }))).status).toBe(403);
  });

  it("résume : totaux et rapports bloqués depuis plus de 24 h", () => {
    const r = resumer([
      {
        appareil: "a", email: "", nom: "Jacobo", role: "monteur", navigateur: "", enLigne: true,
        photosEnAttente: 3, photosEnEchec: 1, requetesEnAttente: 0, preparesHorsLigne: 0, preparesQuand: 0, build: "", vu: T0,
        rapportsNonEnvoyes: [
          { projectId: "vieux", depuis: T0 - 30 * 3600_000, client: true, retenuPar: 0 },
          { projectId: "jeune", depuis: T0 - 3600_000, client: true, retenuPar: 1 },
        ],
      },
      {
        appareil: "b", email: "", nom: "Claudio", role: "monteur", navigateur: "", enLigne: false,
        photosEnAttente: 2, photosEnEchec: 0, requetesEnAttente: 4, preparesHorsLigne: 0, preparesQuand: 0, build: "", vu: T0,
        rapportsNonEnvoyes: [],
      },
    ], T0);
    expect(r.appareils).toBe(2);
    expect(r.photosEnAttente).toBe(5);
    expect(r.photosEnEchec).toBe(1);
    expect(r.requetesEnAttente).toBe(4);
    expect(r.rapportsNonEnvoyes).toBe(2);
    expect(r.bloques.map((b) => b.projectId)).toEqual(["vieux"]);
  });

  it("oublie un appareil qui n'a plus battu depuis 14 jours", async () => {
    const { listerAppareils } = await import("@/lib/appareils");
    await battre(etatNominal("tel-recent"));
    const dansLongtemps = Date.now() + PEREMPTION_APPAREIL_MS + 60_000;
    expect(await listerAppareils(dansLongtemps)).toHaveLength(0);
    expect(await listerAppareils(Date.now())).toHaveLength(1);
  });
});

describe("Le signal « relance tout »", () => {
  it("part vers l'appareil ET en notification, puis revient au prochain battement", async () => {
    await battre(etatNominal("tel-1"));

    const r = await bureau.POST(poster("http://local/x", { appareil: "tel-1", action: "relancer" }));
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.push).toBe("envoyee");
    expect(d.nom).toBe("Jacobo Fontan Cassas");
    expect(pushs).toEqual([{ email: "jacobo@tm.ch", title: "Des envois attendent sur votre téléphone" }]);

    /* Le téléphone bat à nouveau : il reçoit le signal. */
    const suivant = await (await battre(etatNominal("tel-1"))).json();
    expect(suivant.signal?.requestedAt).toBe(d.signal.requestedAt);
    expect(suivant.signal?.par).toBe("micael@tm.ch");
  });

  it("le bureau voit qu'un signal attend encore", async () => {
    await battre(etatNominal("tel-1"));
    await new Promise((r) => setTimeout(r, 5));
    await bureau.POST(poster("http://local/x", { appareil: "tel-1", action: "relancer" }));
    const vue = await (await bureau.GET()).json();
    expect(vue.appareils[0].signalEnAttente).not.toBeNull();
  });

  it("une notification qui échoue n'annule pas le signal", async () => {
    await battre(etatNominal("tel-1"));
    pushCasse = true;
    const d = await (await bureau.POST(poster("http://local/x", { appareil: "tel-1", action: "relancer" }))).json();
    expect(d.ok).toBe(true);
    expect(d.push).not.toBe("envoyee");
    const suivant = await (await battre(etatNominal("tel-1"))).json();
    expect(suivant.signal?.requestedAt).toBe(d.signal.requestedAt);
  });

  it("refuse un appareil inconnu et une action inventée", async () => {
    expect((await bureau.POST(poster("http://local/x", { appareil: "fantome", action: "relancer" }))).status).toBe(404);
    await battre(etatNominal("tel-1"));
    expect((await bureau.POST(poster("http://local/x", { appareil: "tel-1", action: "effacer" }))).status).toBe(400);
  });
});
