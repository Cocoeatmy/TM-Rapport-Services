/**
 * La garde de mise à jour : jamais de rechargement sous les doigts de
 * quelqu'un, jamais hors ligne, jamais sur une version non vérifiée.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

let file: unknown[] = [];
let photos = 0;
let finalisations: unknown[] = [];
let synchroSaisies = false;
let enLigne = true;

let fileIllisible = false;
let photosIllisibles = false;
vi.mock("@/lib/offline", () => ({
  compterSaisiesStrict: () => { if (fileIllisible) throw new Error("illisible"); return file.length; },
  isOnline: () => enLigne,
  saisiesEnCoursDEnvoi: () => synchroSaisies,
}));
vi.mock("@/lib/idb-uploads", () => ({
  getPendingUploads: async () => { if (photosIllisibles) throw new Error("idb"); return Array.from({ length: photos }); },
  photosEnCoursDEnvoi: () => false,
}));
vi.mock("@/lib/envois-differes", () => ({ rapportsEnAttente: async () => finalisations }));

const M = await import("@/lib/etat-mise-a-jour");
const { motifsDeRetenue, INACTIVITE_MS } = M;

const calme: Parameters<typeof motifsDeRetenue>[0] = {
  visible: true, enLigne: true, surFicheProjet: false, champActif: false,
  inactifDepuisMs: INACTIVITE_MS + 1, saisiesEnAttente: 0, photosEnAttente: 0,
  synchroEnCours: false, finalisationsEnAttente: 0, dialogueOuvert: false, travauxNonEnregistres: 0,
};

const VERSION_PAGE = { numero: "2026.10.19-100000", sha: "aaaaaaa", deploiement: "dpl_PAGE", env: "production", compile: "2026-10-19T10:00:00Z", dateCommit: null };
const VERSION_SERVEUR = { ...VERSION_PAGE, numero: "2026.10.19-120000", sha: "bbbbbbb", deploiement: "dpl_NEUF", compile: "2026-10-19T12:00:00Z" };

function servir(version: unknown, ok = true) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
    new Response(JSON.stringify({ build: "bbb", version, coqueAppleMinimum: "1.0" }), { status: ok ? 200 : 500 }));
}

beforeEach(() => {
  vi.restoreAllMocks();
  M._reinitialiser();
  file = []; photos = 0; finalisations = []; synchroSaisies = false; enLigne = true;
  fileIllisible = false; photosIllisibles = false;
  localStorage.clear(); sessionStorage.clear();
  document.head.innerHTML = `<meta name="tm-version" content='${JSON.stringify(VERSION_PAGE)}'>`;
  document.body.innerHTML = "";
});

describe("chaque condition bloque l'application automatique, une à une", () => {
  const cas: [string, Partial<typeof calme>, RegExp][] = [
    ["hors ligne", { enLigne: false }, /hors ligne/],
    ["champ actif", { champActif: true }, /saisie en cours/],
    ["arrière-plan", { visible: false }, /arrière-plan/],
    ["fiche projet", { surFicheProjet: true }, /fiche projet/],
    ["geste récent", { inactifDepuisMs: 5_000 }, /utilisation en cours/],
    ["saisie en file", { saisiesEnAttente: 2 }, /2 saisie/],
    ["photo en file", { photosEnAttente: 1 }, /1 photo/],
    ["synchro en cours", { synchroEnCours: true }, /synchronisation en cours/],
    ["rapport finalisé non envoyé", { finalisationsEnAttente: 1 }, /rapport/],
    ["boîte de dialogue", { dialogueOuvert: true }, /fenêtre ouverte/],
    ["brouillon non enregistré", { travauxNonEnregistres: 1 }, /non enregistrées/],
  ];
  for (const [nom, delta, motif] of cas) {
    it(nom, () => {
      const m = motifsDeRetenue({ ...calme, ...delta }, "auto");
      expect(m).toHaveLength(1);
      expect(m[0]).toMatch(motif);
    });
  }
  it("tout est calme : rien ne retient", () => {
    expect(motifsDeRetenue(calme, "auto")).toEqual([]);
  });
});

describe("lectures illisibles : jamais prises pour des files vides", () => {
  it("file de saisies illisible → retenue", async () => {
    fileIllisible = true;
    expect((await M.lireConditions()).saisiesEnAttente).toBe(1);
  });
  it("file de photos illisible → retenue", async () => {
    photosIllisibles = true;
    expect((await M.lireConditions()).photosEnAttente).toBe(1);
  });
});

describe("travail non enregistré", () => {
  it("un éditeur qui se déclare retient l'application, même manuelle, jusqu'à ce qu'il se retire", async () => {
    M.marquerTravailNonEnregistre("droits", true);
    const c = await M.lireConditions();
    expect(c.travauxNonEnregistres).toBe(1);
    expect(M.motifsDeRetenue(c, "manuel")).toContain("modifications non enregistrées");
    M.marquerTravailNonEnregistre("droits", false);
    expect((await M.lireConditions()).travauxNonEnregistres).toBe(0);
  });
});

describe("fenêtres ouvertes", () => {
  it("boîte de dialogue déclarée, ou modale aria", () => {
    document.body.innerHTML = "<div aria-modal='true'></div>";
    expect(M.fenetreOuverte()).toBe(true);
    document.body.innerHTML = "<dialog open></dialog>";
    expect(M.fenetreOuverte()).toBe(true);
    document.body.innerHTML = "<div></div>";
    expect(M.fenetreOuverte()).toBe(false);
  });
});

describe("application manuelle", () => {
  it("permise avec des opérations en attente (elles sont persistées et reprendront)", () => {
    expect(motifsDeRetenue({ ...calme, saisiesEnAttente: 3, photosEnAttente: 2, surFicheProjet: true }, "manuel")).toEqual([]);
  });
  it("interdite hors ligne et pendant une saisie", () => {
    expect(motifsDeRetenue({ ...calme, enLigne: false }, "manuel")).toEqual(["hors ligne"]);
    expect(motifsDeRetenue({ ...calme, champActif: true }, "manuel")).toEqual(["saisie en cours"]);
  });
});

describe("vérifier", () => {
  it("même déploiement → à jour", async () => {
    servir(VERSION_PAGE);
    expect((await M.verifier()).etat).toBe("a-jour");
  });
  it("autre déploiement → disponible, et l'observation est partagée datée", async () => {
    servir(VERSION_SERVEUR);
    const e = await M.verifier();
    expect(e.etat).toBe("disponible");
    expect(e.executee?.deploiement).toBe("dpl_PAGE");
    expect(e.disponible?.deploiement).toBe("dpl_NEUF");
    expect(M.lireObservation()?.version?.deploiement).toBe("dpl_NEUF");
  });
  it("hors ligne → « vérification impossible », avec la dernière observation connue", async () => {
    servir(VERSION_SERVEUR);
    await M.verifier();
    enLigne = false;
    const e = await M.verifier();
    expect(e.etat).toBe("hors-ligne");
    expect(e.disponible?.deploiement).toBe("dpl_NEUF");
  });
  it("serveur en erreur → « inconnu », jamais « à jour »", async () => {
    servir(null, false);
    expect((await M.verifier()).etat).toBe("inconnu");
  });
  it("la version exécutée est celle du DOCUMENT, pas celle qu'un autre onglet a observée", async () => {
    localStorage.setItem("tm-maj-observation", JSON.stringify({ version: VERSION_SERVEUR, coqueAppleMinimum: "1.0", verifieLe: 1 }));
    servir(VERSION_SERVEUR);
    const e = await M.verifier();
    expect(e.executee?.deploiement).toBe("dpl_PAGE");
    expect(e.etat).toBe("disponible");
  });
});

describe("appliquer", () => {
  it("automatique : refusé tant que la version n'est pas téléchargée et vérifiée", async () => {
    servir(VERSION_SERVEUR);
    await M.verifier();
    const recharge = vi.fn();
    vi.stubGlobal("location", { ...location, reload: recharge, pathname: "/" });
    expect(await M.appliquer("auto")).toMatch(/pas encore téléchargée/);
    expect(recharge).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
  it("manuel hors ligne : refusé, rien ne bouge", async () => {
    servir(VERSION_SERVEUR);
    await M.verifier();
    enLigne = false;
    const recharge = vi.fn();
    vi.stubGlobal("location", { ...location, reload: recharge, pathname: "/" });
    expect(await M.appliquer("manuel")).toMatch(/hors ligne/);
    expect(recharge).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
  it("manuel : si la version disponible a changé entre-temps, pas de rechargement", async () => {
    servir(VERSION_SERVEUR);
    await M.verifier();
    vi.restoreAllMocks();
    servir({ ...VERSION_SERVEUR, deploiement: "dpl_ENCORE_PLUS_NEUF" });
    const recharge = vi.fn();
    vi.stubGlobal("location", { ...location, reload: recharge, pathname: "/" });
    expect(await M.appliquer("manuel")).toMatch(/vient de changer/);
    expect(recharge).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
  it("manuel, en ligne, version confirmée : recharge — sans rien vider", async () => {
    servir(VERSION_SERVEUR);
    await M.verifier();
    const recharge = vi.fn();
    const poste = vi.fn();
    vi.stubGlobal("location", { ...location, reload: recharge, pathname: "/" });
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { controller: { postMessage: poste }, getRegistration: async () => null } });
    expect(await M.appliquer("manuel")).toBeNull();
    expect(recharge).toHaveBeenCalledTimes(1);
    expect(poste).not.toHaveBeenCalledWith(expect.objectContaining({ type: "PURGE_APP_SHELL" }));
    vi.unstubAllGlobals();
  });
  it("manuel : une saisie active retient même l'application manuelle", async () => {
    servir(VERSION_SERVEUR);
    await M.verifier();
    document.body.innerHTML = "<textarea id='t'></textarea>";
    (document.getElementById("t") as HTMLTextAreaElement).focus();
    const recharge = vi.fn();
    vi.stubGlobal("location", { ...location, reload: recharge, pathname: "/" });
    expect(await M.appliquer("manuel")).toMatch(/saisie en cours/);
    expect(recharge).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
