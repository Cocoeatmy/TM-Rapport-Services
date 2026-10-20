/**
 * Le coffre de l'app Apple, vu du site.
 *
 * Le pont natif est remplacé par une doublure qui parle EXACTEMENT le même
 * protocole que PontNatif.swift (mêmes actions, mêmes réponses) et range
 * tout en mémoire. Le côté natif a ses propres tests (TMRapportTests).
 *
 * Ce qui est prouvé ici :
 *  - dans un navigateur, rien ne change : aucun appel, aucun objet global ;
 *  - chaque photo mise en file a son double au coffre, sans les octets dans
 *    la description ;
 *  - une photo confirmée quitte le coffre AVANT de quitter la file ;
 *  - une file vidée par le système est reconstituée depuis le coffre, avec
 *    les mêmes identifiants, et jamais par-dessus une photo existante ;
 *  - un retrait que le coffre n'a pas reçu est rejoué, et la photo n'est
 *    pas remise en file ;
 *  - les saisies locales ne sont remises que si le stockage a été vidé ;
 *  - deux passes simultanées de la file des saisies n'envoient qu'une fois.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/lib/cloudinary-upload", () => {
  class UploadError extends Error { permanent = false; }
  return {
    UploadError,
    uploadToCloudinary: vi.fn(async (_b: Blob, nom: string) => `https://cloudinary.test/${nom}`),
    attachPhotos: vi.fn(async () => {}),
    attacherChampTexte: vi.fn(async () => {}),
  };
});
vi.mock("@/lib/api-helpers", () => ({ invalidateApiCache: () => {} }));

const relances = { n: 0 };
vi.mock("@/lib/telemetrie-appareil", () => ({
  toutRelancer: vi.fn(async () => {
    relances.n += 1;
    await new Promise((r) => setTimeout(r, 20));
  }),
  instantane: vi.fn(async () => ({
    photosEnAttente: 0, photosEnEchec: 0, requetesEnAttente: 0, rapportsNonEnvoyes: [], enLigne: true,
  })),
}));

const idb = await import("@/lib/idb-uploads");
const app = await import("@/lib/app-apple");
const pontApple = await import("@/lib/pont-apple");

/* ── La doublure du pont natif ─────────────────────────────────────────── */

interface Depot { meta: string; fichiers: { nom: string; type: string; base64: string }[] }
const coffre = {
  photos: new Map<string, Depot>(),
  archive: [] as { id: string; motif: string; fileAvait: boolean }[],
  local: null as string | null,
  messages: [] as Record<string, unknown>[],
  /** Simule un coffre qui ne répond plus à une action donnée. */
  enPanne: new Set<string>(),
};

async function fileContient(id: string): Promise<boolean> {
  return (await idb.getPendingUploads({ status: "all" })).some((u) => u.id === id);
}

function installerPont() {
  (window as unknown as { webkit: unknown }).webkit = {
    messageHandlers: {
      tmCoffre: {
        postMessage: async (m: Record<string, unknown>) => {
          coffre.messages.push(m);
          if (coffre.enPanne.has(m.action as string)) throw new Error("coffre en panne");
          switch (m.action) {
            case "deposerPhoto": {
              const id = m.id as string;
              const nouveau = !coffre.photos.has(id);
              if (nouveau) coffre.photos.set(id, { meta: m.meta as string, fichiers: m.fichiers as Depot["fichiers"] });
              return { ok: true, nouveau };
            }
            case "retirerPhoto": {
              const id = m.id as string;
              if (coffre.photos.delete(id)) {
                coffre.archive.push({ id, motif: m.motif as string, fileAvait: await fileContient(id) });
              }
              return { ok: true };
            }
            case "local":
              coffre.local = m.json as string;
              return { ok: true };
            case "inventaire":
              return {
                photos: [...coffre.photos.entries()].map(([id, d]) => ({ id, meta: d.meta })),
                local: coffre.local,
              };
            case "photo": {
              const d = coffre.photos.get(m.id as string);
              if (!d) throw new Error("introuvable");
              return d;
            }
            case "etat":
              return { photos: coffre.photos.size };
            default:
              throw new Error("action inconnue");
          }
        },
      },
    },
  };
}

function retirerPont() {
  delete (window as unknown as { webkit?: unknown }).webkit;
}

/** Efface une photo de la file SANS passer par le site — comme le ferait le système. */
async function effacerDeLaFileCommeLeSysteme(id: string) {
  const db = await new Promise<IDBDatabase>((res, rej) => {
    const r = indexedDB.open("tm-rapport-uploads");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  await new Promise<void>((res, rej) => {
    const tx = db.transaction("pendingUploads", "readwrite");
    tx.objectStore("pendingUploads").delete(id);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
  db.close();
}

function photo(nom = "m1.jpg") {
  return {
    projectId: "projet-test",
    category: "montage",
    notionField: "Photos montage terminé",
    files: [{ name: nom, type: "image/jpeg", blob: new Blob([new Uint8Array([0xff, 0xd8, 1, 2, 3])], { type: "image/jpeg" }) }],
  };
}

beforeEach(async () => {
  retirerPont();
  for (const x of await idb.getPendingUploads({ status: "all" })) await idb.removePendingUpload(x.id);
  coffre.photos.clear();
  coffre.archive.length = 0;
  coffre.local = null;
  coffre.messages.length = 0;
  coffre.enPanne.clear();
  localStorage.clear();
  relances.n = 0;
});

afterEach(() => retirerPont());

describe("Dans un navigateur", () => {
  it("ne contacte rien et n'installe rien", async () => {
    expect(pontApple.dansAppApple()).toBe(false);
    const id = await idb.addPendingUpload(photo());
    expect(await fileContient(id)).toBe(true);
    await idb.removePendingUpload(id);
    app.installerAppApple();
    expect(window.tmApple).toBeUndefined();
    expect(coffre.messages).toHaveLength(0);
  });
});

describe("Dans une fenêtre annexe de l'app Mac", () => {
  beforeEach(() => installerPont());
  it("ne touche pas au coffre : c'est l'affaire de la fenêtre principale", () => {
    const avant = Object.getOwnPropertyDescriptor(window, "opener");
    Object.defineProperty(window, "opener", { value: {}, configurable: true });
    try {
      app.installerAppApple();
      expect(window.tmApple).toBeUndefined();
      expect(coffre.messages).toHaveLength(0);
    } finally {
      if (avant) Object.defineProperty(window, "opener", avant);
      else delete (window as { opener?: unknown }).opener;
    }
  });
});

describe("Dans l'app Apple — les photos", () => {
  beforeEach(() => installerPont());

  it("chaque photo mise en file a son double au coffre, sans octets dans la description", async () => {
    const id = await idb.addPendingUpload(photo("gauche.jpg"));
    const depot = coffre.photos.get(id);
    expect(depot).toBeDefined();
    expect(depot!.fichiers[0].nom).toBe("gauche.jpg");
    expect(depot!.fichiers[0].type).toBe("image/jpeg");
    const meta = JSON.parse(depot!.meta);
    expect(meta.id).toBe(id);
    expect(meta.notionField).toBe("Photos montage terminé");
    expect(meta.files[0]).not.toHaveProperty("blob");
  });

  it("une photo confirmée quitte le coffre AVANT de quitter la file", async () => {
    const id = await idb.addPendingUpload(photo());
    const r = await idb.processPendingUploads();
    expect(r.success).toBe(1);
    expect(await fileContient(id)).toBe(false);
    expect(coffre.photos.has(id)).toBe(false);
    expect(coffre.archive).toEqual([{ id, motif: "confirme", fileAvait: true }]);
  });

  it("une file vidée par le système est reconstituée, avec le même identifiant", async () => {
    const id = await idb.addPendingUpload(photo("droite.jpg"));
    await effacerDeLaFileCommeLeSysteme(id);
    expect(await fileContient(id)).toBe(false);

    const r = await app.restaurerDepuisCoffre();
    expect(r.photos).toBe(1);
    const [rendue] = await idb.getPendingUploads({ status: "all" });
    expect(rendue.id).toBe(id);
    expect(rendue.files[0].name).toBe("droite.jpg");
    expect(rendue.status).toBe("pending");
    expect(rendue.notionField).toBe("Photos montage terminé");
  });

  it("ne remet jamais une photo par-dessus celle qui est déjà en file", async () => {
    await idb.addPendingUpload(photo());
    const r = await app.restaurerDepuisCoffre();
    expect(r.photos).toBe(0);
    expect(await idb.getPendingUploads({ status: "all" })).toHaveLength(1);
  });

  it("un retrait perdu est rejoué, et la photo n'est pas renvoyée une seconde fois", async () => {
    const id = await idb.addPendingUpload(photo());
    coffre.enPanne.add("retirerPhoto");
    await idb.processPendingUploads();
    expect(await fileContient(id)).toBe(false); // confirmée par le serveur
    expect(coffre.photos.has(id)).toBe(true);    // mais le coffre ne l'a pas su

    coffre.enPanne.clear();
    const r = await app.restaurerDepuisCoffre();
    expect(r.photos).toBe(0);                    // pas remise en file
    expect(coffre.photos.has(id)).toBe(false);   // et le retrait est passé
  });

  it("le site continue de fonctionner si le coffre ne répond pas", async () => {
    coffre.enPanne.add("deposerPhoto");
    const id = await idb.addPendingUpload(photo());
    expect(await fileContient(id)).toBe(true);
  });
});

describe("Dans l'app Apple — les saisies locales", () => {
  beforeEach(() => installerPont());

  it("part au coffre, puis revient seulement si le stockage a été vidé", async () => {
    localStorage.setItem(app.SENTINELLE, "1");
    localStorage.setItem("tm-rapport-queue", JSON.stringify([{ id: "a", url: "/api/x", method: "POST" }]));
    localStorage.setItem("tm-pointages-projet", "{\"arrivee\":\"07:30\"}");
    localStorage.setItem("tm-projects-cache", "copie jetable");
    expect(await app.doublerMaintenant()).toBe(true);
    const double = JSON.parse(coffre.local!);
    expect(Object.keys(double).sort()).toEqual(["__origine__", "tm-pointages-projet", "tm-rapport-queue"]);
    expect(double.__origine__).toBe(location.origin);

    // Stockage intact : rien n'est remis, même si une saisie a changé depuis.
    localStorage.setItem("tm-pointages-projet", "{\"arrivee\":\"08:00\"}");
    expect((await app.restaurerDepuisCoffre()).cles).toBe(0);
    expect(localStorage.getItem("tm-pointages-projet")).toBe("{\"arrivee\":\"08:00\"}");

    // Le système vide tout : les saisies reviennent, le cache jetable non.
    localStorage.clear();
    expect((await app.restaurerDepuisCoffre()).cles).toBe(2);
    expect(JSON.parse(localStorage.getItem("tm-rapport-queue")!)[0].id).toBe("a");
    expect(localStorage.getItem("tm-pointages-projet")).toBe("{\"arrivee\":\"07:30\"}");
    expect(localStorage.getItem("tm-projects-cache")).toBeNull();
    expect(localStorage.getItem(app.SENTINELLE)).not.toBeNull();
  });

  it("une écriture de la file des saisies est signalée", async () => {
    const vu = vi.fn();
    window.addEventListener("tm-file-modifiee", vu);
    const { addToQueue } = await import("@/lib/offline");
    addToQueue({ type: "update", url: "/api/projects/x", method: "PATCH", body: { a: 1 } });
    window.removeEventListener("tm-file-modifiee", vu);
    expect(vu).toHaveBeenCalledTimes(1);
  });
});

describe("Dans l'app Apple — le coffre est commun, les sites restent séparés", () => {
  beforeEach(() => installerPont());

  it("ne rend jamais au site une photo déposée par un autre site (essais locaux)", async () => {
    coffre.photos.set("up-autre-site", {
      meta: JSON.stringify({ id: "up-autre-site", projectId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", category: "montage",
        notionField: "Photos montage terminé", files: [{ name: "a.jpg", type: "image/jpeg" }], __origine: "http://localhost:3137" }),
      fichiers: [{ nom: "a.jpg", type: "image/jpeg", base64: "AQID" }],
    });
    expect((await app.restaurerDepuisCoffre()).photos).toBe(0);
    expect(await fileContient("up-autre-site")).toBe(false);
  });

  it("un ancien double sans origine n'est rendu que pour un vrai projet", async () => {
    coffre.photos.set("up-essai", {
      meta: JSON.stringify({ id: "up-essai", projectId: "essai-apple", category: "essai", files: [{ name: "e.jpg", type: "image/jpeg" }] }),
      fichiers: [{ nom: "e.jpg", type: "image/jpeg", base64: "AQID" }],
    });
    coffre.photos.set("up-reel", {
      meta: JSON.stringify({ id: "up-reel", projectId: "3f91895b-9179-80f7-b6f7-cfe62982303a", category: "montage",
        notionField: "Photos montage terminé", files: [{ name: "r.jpg", type: "image/jpeg" }] }),
      fichiers: [{ nom: "r.jpg", type: "image/jpeg", base64: "AQID" }],
    });
    expect((await app.restaurerDepuisCoffre()).photos).toBe(1);
    expect(await fileContient("up-reel")).toBe(true);
    expect(await fileContient("up-essai")).toBe(false);
  });

  it("n'applique jamais les saisies d'un double venu d'un autre site", async () => {
    coffre.local = JSON.stringify({ "tm-pointages-x": "7h", __origine__: "http://localhost:3137" });
    expect((await app.restaurerDepuisCoffre()).cles).toBe(0);
    expect(localStorage.getItem("tm-pointages-x")).toBeNull();
    expect(localStorage.getItem(app.SENTINELLE)).not.toBeNull();
  });
});

describe("Dans l'app Apple — les traces des essais", () => {
  beforeEach(() => installerPont());

  it("retire les photos du projet d'essai et les heures d'essai, rien d'autre", async () => {
    const essai = await idb.addPendingUpload({ ...photo("essai.jpg"), projectId: app.PROJET_ESSAI });
    const vraie = await idb.addPendingUpload(photo("vraie.jpg"));
    localStorage.setItem("tm-pointages-essai-mac", "x");
    localStorage.setItem("tm-pointages-3f91895b-9179-80f7-b6f7-cfe62982303a", "7h30");
    localStorage.setItem("tm-pointages-projet", "garde");
    expect(await app.retirerTracesEssais()).toBe(2);
    expect(await fileContient(essai)).toBe(false);
    expect(await fileContient(vraie)).toBe(true);
    expect(coffre.archive.map((a) => a.motif)).toEqual(["essai"]);
    expect(localStorage.getItem("tm-pointages-essai-mac")).toBeNull();
    expect(localStorage.getItem("tm-pointages-3f91895b-9179-80f7-b6f7-cfe62982303a")).toBe("7h30");
    expect(localStorage.getItem("tm-pointages-projet")).toBe("garde");
  });
});

describe("Une seule passe à la fois", () => {
  it("deux passes simultanées de la file des saisies n'envoient qu'une fois", async () => {
    const { addToQueue, processQueue } = await import("@/lib/offline");
    addToQueue({ type: "update", url: "/api/projects/x", method: "PATCH", body: { a: 1 } });
    const envoi = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 30));
      return new Response("{}", { status: 200 });
    });
    vi.stubGlobal("fetch", envoi);
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    const [a, b] = await Promise.all([processQueue(), processQueue()]);
    vi.unstubAllGlobals();
    expect(envoi).toHaveBeenCalledTimes(1);
    expect(a.success + b.success).toBe(1);
  });

  it("la synchronisation demandée par l'app ne tourne qu'une fois à la fois", async () => {
    installerPont();
    const [a, b] = await Promise.all([app.synchroniser("test"), app.synchroniser("test")]);
    expect(relances.n).toBe(1);
    expect(a).toEqual(b);
    expect(a).toMatchObject({ photosEnAttente: 0, requetesEnAttente: 0 });
  });
});

describe("Le pont, une fois installé", () => {
  it("expose window.tmApple dans l'app", () => {
    installerPont();
    app.installerAppApple();
    expect(typeof window.tmApple?.synchroniser).toBe("function");
  });

  it("encode et décode les octets sans perte", async () => {
    const octets = new Uint8Array([0, 1, 2, 250, 255, 128]);
    const b64 = await pontApple.versBase64(new Blob([octets]));
    const retour = new Uint8Array(await pontApple.depuisBase64(b64, "image/jpeg").arrayBuffer());
    expect([...retour]).toEqual([...octets]);
  });
});
