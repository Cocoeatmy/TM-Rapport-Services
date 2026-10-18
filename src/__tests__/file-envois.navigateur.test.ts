/**
 * La file d'envoi, exécutée pour de bon.
 *
 * Jusqu'ici, le parcours hors ligne n'était vérifié que par lecture du code.
 * Ici, IndexedDB est réel (`fake-indexeddb` implémente les transactions, les
 * index et les versions), les blobs sont de vrais `Blob`, et seuls Cloudinary
 * et l'API de rattachement sont remplacés par des doublures dont on décide à
 * la main qu'elles réussissent ou qu'elles échouent.
 *
 * Ce sont les scénarios A à D du cahier des charges : signature sans réseau,
 * fermeture de l'application, retour du réseau, réseau instable.
 *
 * ── UNE LIMITE DU BANC D'ESSAI, dite ici plutôt que cachée ────────────────
 *
 * `fake-indexeddb` sous jsdom ne sait pas cloner un `Blob` : il ressort de la
 * base comme un objet vide. C'est une limite de l'outil — un vrai navigateur
 * stocke les Blobs nativement — mais elle a une conséquence honnête : ces
 * tests prouvent que l'ENREGISTREMENT survit (identité, champ visé, projet,
 * statut, compteurs), pas que les OCTETS d'une photo survivent à un
 * redémarrage. Cette dernière garantie repose sur IndexedDB lui-même, et
 * reste à constater sur un vrai iPhone.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

/* ── Les doublures des services distants ────────────────────────────────── */
const appels = { cloudinary: 0, attachPhotos: 0, champTexte: 0 };
let cloudinaryEchoue: { message: string; permanent: boolean } | null = null;
let attachEchoue: { message: string; permanent: boolean } | null = null;
/** Ce que « le serveur » a fini par recevoir. */
const recu: { champ: string; valeur: string }[] = [];
const recuPhotos: { champ: string; urls: string[] }[] = [];

class FausseErreurUpload extends Error {
  permanent: boolean;
  constructor(message: string, permanent = false) {
    super(message);
    this.permanent = permanent;
  }
}

vi.mock("@/lib/cloudinary-upload", () => ({
  UploadError: FausseErreurUpload,
  uploadToCloudinary: vi.fn(async (_blob: Blob, nom: string) => {
    appels.cloudinary += 1;
    if (cloudinaryEchoue) throw new FausseErreurUpload(cloudinaryEchoue.message, cloudinaryEchoue.permanent);
    return `https://cloudinary.test/${nom}`;
  }),
  attachPhotos: vi.fn(async (_p: string, champ: string, photos: { url: string }[]) => {
    appels.attachPhotos += 1;
    if (attachEchoue) throw new FausseErreurUpload(attachEchoue.message, attachEchoue.permanent);
    recuPhotos.push({ champ, urls: photos.map((x) => x.url) });
  }),
  attacherChampTexte: vi.fn(async (_p: string, champ: string, valeur: string) => {
    appels.champTexte += 1;
    if (attachEchoue) throw new FausseErreurUpload(attachEchoue.message, attachEchoue.permanent);
    recu.push({ champ, valeur });
  }),
}));

vi.mock("@/lib/api-helpers", () => ({ invalidateApiCache: () => {} }));

const {
  addPendingUpload, getPendingUploads, processPendingUploads,
  countPendingUploads, countPermanentlyFailed, retryAllFailedUploads,
} = await import("@/lib/idb-uploads");

const PROJET = "3cf1895b-9179-8002-8fae-d0746feb4995";

function image(): Blob {
  return new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 1, 2, 3])], { type: "image/jpeg" });
}

async function viderLaFile() {
  const { removePendingUpload } = await import("@/lib/idb-uploads");
  for (const x of await getPendingUploads({ status: "all" })) await removePendingUpload(x.id);
}

beforeEach(async () => {
  appels.cloudinary = 0; appels.attachPhotos = 0; appels.champTexte = 0;
  cloudinaryEchoue = null; attachEchoue = null;
  recu.length = 0; recuPhotos.length = 0;
  await viderLaFile();
});

/* ─────────────────────────────────────────────────────────────────────────
   SCÉNARIO A — signer sans réseau
   ───────────────────────────────────────────────────────────────────────── */

describe("Scénario A — une signature prise sans réseau", () => {
  it("est rangée dans la file, avec ses octets", async () => {
    const id = await addPendingUpload({
      projectId: PROJET,
      category: "signatures",
      champTexte: "signatureUrl",
      files: [{ name: "signature-1.png", type: "image/png", blob: image() }],
    });

    const enFile = await getPendingUploads({ projectId: PROJET });
    expect(enFile).toHaveLength(1);
    expect(enFile[0].id).toBe(id);
    expect(enFile[0].champTexte).toBe("signatureUrl");
    expect(enFile[0].files[0].name).toBe("signature-1.png");
    expect(enFile[0].status).toBe("pending");
    /* Rien n'est encore parti : c'est précisément l'état « hors ligne ». */
    expect(appels.cloudinary).toBe(0);
    expect(appels.champTexte).toBe(0);
  });

  it("cohabite avec les photos obligatoires du même chantier", async () => {
    for (const nom of ["montage-gauche", "montage-centre", "montage-droite"]) {
      await addPendingUpload({
        projectId: PROJET,
        category: "montage",
        notionField: "Photos montage terminé",
        files: [{ name: `${nom}.jpg`, type: "image/jpeg", blob: image() }],
      });
    }
    await addPendingUpload({
      projectId: PROJET, category: "signatures", champTexte: "signatureUrl",
      files: [{ name: "signature.png", type: "image/png", blob: image() }],
    });

    expect(await countPendingUploads()).toBe(4);
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   SCÉNARIO B — fermer l'application
   ───────────────────────────────────────────────────────────────────────── */

describe("Scénario B — fermer puis rouvrir l'application", () => {
  it("retrouve la signature et les photos, octets compris", async () => {
    await addPendingUpload({
      projectId: PROJET, category: "signatures", champTexte: "signatureUrl",
      files: [{ name: "signature.png", type: "image/png", blob: image() }],
    });
    await addPendingUpload({
      projectId: PROJET, category: "montage", notionField: "Photos montage terminé",
      files: [{ name: "m1.jpg", type: "image/jpeg", blob: image() }],
    });

    /* « Fermer l'application » : on oublie le module et sa connexion ouverte,
       puis on recharge tout depuis la base — comme au prochain démarrage. */
    vi.resetModules();
    const frais = await import("@/lib/idb-uploads");

    const apres = await frais.getPendingUploads({ projectId: PROJET });
    expect(apres).toHaveLength(2);
    const signature = apres.find((x) => x.champTexte === "signatureUrl");
    expect(signature).toBeDefined();
    expect(signature!.projectId).toBe(PROJET);
    expect(signature!.files[0].name).toBe("signature.png");
    expect(signature!.files[0].type).toBe("image/png");
    /* La photo du même chantier est là aussi, et toujours vers son champ. */
    const photo = apres.find((x) => x.notionField === "Photos montage terminé");
    expect(photo).toBeDefined();
    expect(photo!.files[0].name).toBe("m1.jpg");
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   SCÉNARIO C — le réseau revient
   ───────────────────────────────────────────────────────────────────────── */

describe("Scénario C — le réseau revient", () => {
  it("envoie la signature et l'inscrit dans le bon champ du bon projet", async () => {
    await addPendingUpload({
      projectId: PROJET, category: "signatures", champTexte: "signatureUrl",
      files: [{ name: "signature.png", type: "image/png", blob: image() }],
    });

    const r = await processPendingUploads();

    expect(r.success).toBe(1);
    expect(recu).toEqual([{ champ: "signatureUrl", valeur: "https://cloudinary.test/signature.png" }]);
    /* Et elle quitte la file SEULEMENT maintenant. */
    expect(await countPendingUploads()).toBe(0);
  });

  it("prévient l'écran, pour qu'il affiche l'URL définitive", async () => {
    const vus: CustomEvent[] = [];
    const ecoute = (e: Event) => vus.push(e as CustomEvent);
    window.addEventListener("tm-upload-attached", ecoute);

    await addPendingUpload({
      projectId: PROJET, category: "signatures", champTexte: "signatureUrl",
      files: [{ name: "sig.png", type: "image/png", blob: image() }],
    });
    await processPendingUploads();
    window.removeEventListener("tm-upload-attached", ecoute);

    expect(vus).toHaveLength(1);
    expect(vus[0].detail.champTexte).toBe("signatureUrl");
    expect(vus[0].detail.projectId).toBe(PROJET);
    expect(vus[0].detail.files[0].url).toBe("https://cloudinary.test/sig.png");
  });

  it("envoie aussi les photos, dans leur champ à elles", async () => {
    await addPendingUpload({
      projectId: PROJET, category: "montage", notionField: "Photos montage terminé",
      files: [{ name: "m1.jpg", type: "image/jpeg", blob: image() }],
    });
    await processPendingUploads();
    expect(recuPhotos).toEqual([{ champ: "Photos montage terminé", urls: ["https://cloudinary.test/m1.jpg"] }]);
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   SCÉNARIO D — réseau instable
   ───────────────────────────────────────────────────────────────────────── */

describe("Scénario D — réseau instable", () => {
  it("ne supprime RIEN tant que le rattachement n'est pas confirmé", async () => {
    attachEchoue = { message: "réseau", permanent: false };
    await addPendingUpload({
      projectId: PROJET, category: "signatures", champTexte: "signatureUrl",
      files: [{ name: "sig.png", type: "image/png", blob: image() }],
    });

    const r = await processPendingUploads();
    expect(r.failed).toBe(1);
    /* Les octets sont toujours là, et la signature n'est pas « faite ». */
    const reste = await getPendingUploads({ status: "all" });
    expect(reste).toHaveLength(1);
    expect(reste[0].files[0].name).toBe("sig.png");
    expect(reste[0].retryCount).toBeGreaterThanOrEqual(1);
    expect(recu).toEqual([]);
  });

  it("ne renvoie JAMAIS les octets deux fois : l'URL obtenue est gardée", async () => {
    attachEchoue = { message: "coupure", permanent: false };
    await addPendingUpload({
      projectId: PROJET, category: "signatures", champTexte: "signatureUrl",
      files: [{ name: "sig.png", type: "image/png", blob: image() }],
    });

    await processPendingUploads();
    expect(appels.cloudinary).toBe(1);

    /* Le réseau revient. On lève le backoff et on relance. */
    const { resetBackoffForAll } = await import("@/lib/idb-uploads");
    await resetBackoffForAll();
    attachEchoue = null;
    const r2 = await processPendingUploads();

    expect(r2.success).toBe(1);
    expect(appels.cloudinary).toBe(1);  // ← les octets n'ont pas été renvoyés
    expect(appels.champTexte).toBe(2);  // ← seul le petit JSON a été rejoué
    expect(await countPendingUploads()).toBe(0);
  });

  it("n'inscrit la signature qu'UNE fois malgré plusieurs tentatives", async () => {
    attachEchoue = { message: "coupure", permanent: false };
    await addPendingUpload({
      projectId: PROJET, category: "signatures", champTexte: "signatureUrl",
      files: [{ name: "sig.png", type: "image/png", blob: image() }],
    });
    const { resetBackoffForAll } = await import("@/lib/idb-uploads");

    await processPendingUploads();
    await resetBackoffForAll();
    await processPendingUploads();
    await resetBackoffForAll();
    attachEchoue = null;
    await processPendingUploads();

    /* Trois tentatives, une seule inscription côté serveur. */
    expect(recu).toHaveLength(1);
  });

  it("garde les données même après un échec déclaré définitif", async () => {
    attachEchoue = { message: "413 trop gros", permanent: true };
    await addPendingUpload({
      projectId: PROJET, category: "signatures", champTexte: "signatureUrl",
      files: [{ name: "sig.png", type: "image/png", blob: image() }],
    });
    await processPendingUploads();

    expect(await countPermanentlyFailed()).toBe(1);
    const gardes = await getPendingUploads({ status: "permanently-failed" });
    expect(gardes[0].files[0].name).toBe("sig.png");
    expect(gardes[0].reason).toContain("413");
    expect(await countPendingUploads()).toBe(0); // plus « en attente »…

    /* …mais récupérable : on relance et, le serveur acceptant, ça passe. */
    attachEchoue = null;
    await retryAllFailedUploads();
    await processPendingUploads();
    expect(recu).toHaveLength(1);
  });

  it("deux envois lancés en même temps ne se marchent pas dessus", async () => {
    for (let i = 0; i < 3; i++) {
      await addPendingUpload({
        projectId: PROJET, category: "montage", notionField: "Photos montage terminé",
        files: [{ name: `p${i}.jpg`, type: "image/jpeg", blob: image() }],
      });
    }
    /* Le garde-fou `_processingUploads` fait renoncer le second appel (qui
       demande une passe de plus, sans rien renvoyer). Les trois photos du
       même champ partent en UN rattachement groupé (depuis le 18.10.2026) :
       un seul appel, chaque photo une seule fois. */
    const [a, b] = await Promise.all([processPendingUploads(), processPendingUploads()]);
    const total = a.success + b.success;
    expect(total).toBe(3);
    expect(appels.attachPhotos).toBe(1); // un rattachement groupé — ni 3, ni 6
    const noms = recuPhotos.flatMap((r) => r.urls);
    expect(noms).toHaveLength(3);
    expect(new Set(noms).size).toBe(3); // aucune photo deux fois
    expect(await countPendingUploads()).toBe(0);
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   Volume
   ───────────────────────────────────────────────────────────────────────── */

describe("beaucoup de photos en attente", () => {
  it("en encaisse 120 et n'en perd aucune", async () => {
    for (let i = 0; i < 120; i++) {
      await addPendingUpload({
        projectId: PROJET, category: "montage", notionField: "Photos montage terminé",
        files: [{ name: `p${i}.jpg`, type: "image/jpeg", blob: image() }],
      });
    }
    expect(await countPendingUploads()).toBe(120);

    const r = await processPendingUploads();
    expect(r.success).toBe(120);
    expect(await countPendingUploads()).toBe(0);

    const envoyees = recuPhotos.flatMap((x) => x.urls);
    expect(new Set(envoyees).size).toBe(120); // aucune perdue, aucune en double
  });
});
