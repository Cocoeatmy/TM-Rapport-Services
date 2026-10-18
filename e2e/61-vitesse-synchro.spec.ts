/**
 * Banc de MESURE de la synchronisation, à conditions identiques avant et
 * après optimisation.
 *
 * La version compilée du site tourne dans WebKit (gabarit iPhone, profil
 * persistant : c'est ce qui permet de garder des photos dans IndexedDB). Le
 * serveur est simulé avec des latences réalistes, fixes et documentées :
 *
 *   signature d'envoi (Vercel)        120 ms
 *   envoi d'une photo (Cloudinary)    600 ms   (≈ 400 Ko en 4G correcte)
 *   rattachement d'une photo (Notion) 900 ms   (lecture + écriture de la fiche)
 *   écriture d'une saisie (Notion)    500 ms
 *
 * Les photos et les saisies sont déposées dans les files du site comme si le
 * monteur les avait faites hors ligne, puis « le réseau revient ». On mesure
 * ce que le monteur vit : le délai avant le premier envoi, la durée moyenne
 * d'une photo, la durée totale, le nombre d'envois simultanés, les essais.
 *
 * Deux garde-fous vérifiés à chaque mesure : chaque photo est rattachée UNE
 * fois, et jamais deux rattachements simultanés sur le même champ du même
 * projet (c'est une lecture-écriture côté serveur : deux à la fois pourraient
 * effacer une photo).
 *
 * Résultats écrits dans test-results/vitesse-synchro-<etiquette>.json.
 * Lancer : E2E_VITESSE_ETIQUETTE=avant npx playwright test e2e/61 --project=vitesse-webkit
 */
import { test, expect, devices, type BrowserContext, type Page, type Route } from "@playwright/test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brancherFixtures, seConnecter, sansServiceWorker, projetFictif, PROJET_ID } from "./harnais";

const BASE = "http://127.0.0.1:3137";
const LAT = { sign: 120, cloudinary: 600, attach: 900, patch: 500 };
const CHAMP = "Photos montage terminé";

interface Mesure {
  cas: string;
  photos: number;
  saisies: number;
  premierEnvoiMs: number;
  photoMoyenneMs: number;
  totalMs: number;
  saisiesFiniesMs: number;
  envoisSimultanesMax: number;
  rattachementsSimultanesMemeChampMax: number;
  essaisCloudinary: number;
  essaisRattachement: number;
  rattacheesUneFois: boolean;
}

class Serveur {
  enLigne = false;
  /** Probabilité d'une coupure par requête (réseau instable). */
  instabilite = 0;
  /** Les envois Cloudinary restent suspendus (réseau qui ne répond plus). */
  suspendre = false;
  private suspendues: Route[] = [];
  t0 = 0;
  premierEnvoi = 0;
  fini = new Map<string, number>();       // nom de photo -> instant du rattachement
  debutEnvoi = new Map<string, number>(); // nom -> premier envoi d'octets
  rattachees = new Map<string, number>(); // nom -> nombre de rattachements
  enVolCloudinary = 0; maxCloudinary = 0;
  enVolAttach = new Map<string, number>(); maxAttachMemeChamp = 0;
  essaisCloudinary = 0; essaisAttach = 0;
  patches = 0; dernierPatch = 0;
  private alea = 12345;
  private hasard(): number { this.alea = (this.alea * 1103515245 + 12345) % 2147483648; return this.alea / 2147483648; }

  liberer() { for (const r of this.suspendues) r.abort("connectionreset").catch(() => {}); this.suspendues = []; }

  async brancher(page: Page) {
    await brancherFixtures(page, { projet: projetFictif() });
    const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const coupe = () => !this.enLigne || (this.instabilite > 0 && this.hasard() < this.instabilite);
    const json = (route: Route, corps: unknown, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(corps) }).catch(() => {});

    await page.route("**/api/**", async (route) => {
      const req = route.request();
      const c = new URL(req.url()).pathname;
      if (c === "/api/photos/sign") {
        if (coupe()) return route.abort("internetdisconnected").catch(() => {});
        await attendre(LAT.sign);
        return json(route, { signature: "x", timestamp: 1, apiKey: "k", cloudName: "banc", folder: "f" });
      }
      if (c === "/api/photos/attach" && req.method() === "POST") {
        this.essaisAttach++;
        if (coupe()) return route.abort("internetdisconnected").catch(() => {});
        const corps = JSON.parse(req.postData() || "{}") as { projectId: string; notionField: string; photos: { name: string }[] };
        const cle = `${corps.projectId}::${corps.notionField}`;
        const n = (this.enVolAttach.get(cle) ?? 0) + 1;
        this.enVolAttach.set(cle, n);
        this.maxAttachMemeChamp = Math.max(this.maxAttachMemeChamp, n);
        await attendre(LAT.attach);
        this.enVolAttach.set(cle, (this.enVolAttach.get(cle) ?? 1) - 1);
        const t = Date.now();
        for (const p of corps.photos) {
          this.rattachees.set(p.name, (this.rattachees.get(p.name) ?? 0) + 1);
          if (!this.fini.has(p.name)) this.fini.set(p.name, t);
        }
        return json(route, { ok: true });
      }
      if (/^\/api\/projects\/[^/]+$/.test(c) && req.method() === "PATCH") {
        if (coupe()) return route.abort("internetdisconnected").catch(() => {});
        await attendre(LAT.patch);
        this.patches++;
        this.dernierPatch = Date.now();
        return json(route, { ok: true });
      }
      if (!this.enLigne && req.method() !== "GET") return route.abort("internetdisconnected").catch(() => {});
      return route.fallback();
    });

    await page.route("**api.cloudinary.com/**", async (route) => {
      this.essaisCloudinary++;
      if (this.suspendre) { this.suspendues.push(route); return; }
      if (coupe()) return route.abort("internetdisconnected").catch(() => {});
      const nom = /filename="([^"]+)"/.exec(route.request().postDataBuffer()?.toString("latin1") ?? "")?.[1] ?? `inconnu-${this.essaisCloudinary}`;
      const t = Date.now();
      if (!this.premierEnvoi) this.premierEnvoi = t;
      if (!this.debutEnvoi.has(nom)) this.debutEnvoi.set(nom, t);
      this.enVolCloudinary++;
      this.maxCloudinary = Math.max(this.maxCloudinary, this.enVolCloudinary);
      await attendre(LAT.cloudinary);
      this.enVolCloudinary--;
      return json(route, { secure_url: `https://res.cloudinary.test/${this.essaisCloudinary}/${encodeURIComponent(nom)}` });
    });
  }
}

/** Dépose des photos dans la file IndexedDB du site, comme prises hors ligne. */
async function deposerPhotos(page: Page, n: number) {
  await page.evaluate(async (n) => {
    const db: IDBDatabase = await new Promise((res, rej) => {
      const r = indexedDB.open("tm-rapport-uploads", 2);
      r.onupgradeneeded = () => {
        const s = r.result.createObjectStore("pendingUploads", { keyPath: "id" });
        s.createIndex("projectId", "projectId", { unique: false });
        s.createIndex("status", "status", { unique: false });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const octets = new Uint8Array(400 * 1024);
    octets[0] = 0xff; octets[1] = 0xd8;
    for (let i = 2; i < octets.length; i++) octets[i] = (i * 31) & 0xff;
    await new Promise<void>((res, rej) => {
      const tx = db.transaction("pendingUploads", "readwrite");
      for (let i = 1; i <= n; i++) {
        tx.objectStore("pendingUploads").put({
          id: `up-banc-${i}`, projectId: "11111111-2222-3333-4444-555555555555",
          category: "montage", notionField: "Photos montage terminé",
          files: [{ name: `Montage.${i}.banc.jpg`, type: "image/jpeg", blob: new Blob([octets], { type: "image/jpeg" }) }],
          createdAt: Date.now() - 60_000 + i, retryCount: 0, status: "pending",
        });
      }
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
    db.close();
  }, n);
}

/** Dépose des saisies dans la file du site (heures, rapport…), même projet. */
async function deposerSaisies(page: Page, n: number) {
  await page.evaluate((n) => {
    const file = JSON.parse(localStorage.getItem("tm-rapport-queue") || "[]");
    for (let i = 0; i < n; i++) {
      file.push({ id: `s${i}`, type: "update", url: "/api/projects/11111111-2222-3333-4444-555555555555", method: "PATCH",
                  body: { rapportMonteur: `version ${i}`, heureArrivee: "07:30", heureDepart: "16:00" }, timestamp: Date.now() - 50_000 + i });
    }
    localStorage.setItem("tm-rapport-queue", JSON.stringify(file));
  }, n);
}

async function filesVides(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    const q = JSON.parse(localStorage.getItem("tm-rapport-queue") || "[]");
    const db: IDBDatabase = await new Promise((res) => { const r = indexedDB.open("tm-rapport-uploads"); r.onsuccess = () => res(r.result); });
    const n: number = await new Promise((res) => {
      if (!db.objectStoreNames.contains("pendingUploads")) return res(0);
      const c = db.transaction("pendingUploads", "readonly").objectStore("pendingUploads").count();
      c.onsuccess = () => res(c.result); c.onerror = () => res(-1);
    });
    db.close();
    return q.length === 0 && n === 0;
  });
}

let serveurCourant: Serveur | null = null;

async function mesurer(playwright: typeof import("playwright"), cas: string, photos: number, saisies: number,
                       reglage: (s: Serveur) => void = () => {}): Promise<Mesure> {
  const profil = mkdtempSync(join(tmpdir(), "tm-e2e-vitesse-"));
  const iphone = { ...devices["iPhone 13"] } as Record<string, unknown>;
  delete iphone.defaultBrowserType;
  const ctx: BrowserContext = await playwright.webkit.launchPersistentContext(profil, { ...(iphone as object), baseURL: BASE });
  try {
    await sansServiceWorker(ctx);
    await seConnecter(ctx);
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    const srv = new Serveur();
    serveurCourant = srv;
    await srv.brancher(page);
    // L'app est ouverte, hors ligne : la page est là, rien ne passe.
    await page.goto(`/projet/${PROJET_ID}?mode=cmd`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Chantier de test E2E").first()).toBeVisible({ timeout: 40_000 });
    await deposerPhotos(page, photos);
    await deposerSaisies(page, saisies);
    reglage(srv);
    // Une passe tente sa chance hors ligne, comme sur le chantier.
    await page.evaluate(() => window.dispatchEvent(new Event("tm-pending-upload-added")));
    await page.waitForTimeout(2500);
    // Le réseau revient.
    srv.enLigne = true;
    srv.t0 = Date.now();
    // Un envoi suspendu le reste : seule l'application peut décider d'y renoncer.
    srv.suspendre = false;
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect.poll(() => filesVides(page), { timeout: 240_000, intervals: [250] }).toBe(true);
    const totalMs = Math.max(...[...srv.fini.values(), srv.dernierPatch].filter(Boolean)) - srv.t0;
    const durees = [...srv.fini.entries()].map(([nom, t]) => t - (srv.debutEnvoi.get(nom) ?? srv.t0));
    const m: Mesure = {
      cas, photos, saisies,
      premierEnvoiMs: srv.premierEnvoi ? srv.premierEnvoi - srv.t0 : -1,
      photoMoyenneMs: durees.length ? Math.round(durees.reduce((a, b) => a + b, 0) / durees.length) : 0,
      totalMs,
      saisiesFiniesMs: srv.dernierPatch ? srv.dernierPatch - srv.t0 : 0,
      envoisSimultanesMax: srv.maxCloudinary,
      rattachementsSimultanesMemeChampMax: srv.maxAttachMemeChamp,
      essaisCloudinary: srv.essaisCloudinary,
      essaisRattachement: srv.essaisAttach,
      rattacheesUneFois: srv.rattachees.size === photos && [...srv.rattachees.values()].every((n) => n === 1),
    };
    console.log(`MESURE ${JSON.stringify(m)}`);
    return m;
  } finally {
    serveurCourant?.liberer();
    await ctx.close().catch(() => {});
    rmSync(profil, { recursive: true, force: true });
  }
}

test.describe.serial("vitesse de la synchronisation", () => {
  test.skip(!process.env.E2E_VITESSE_ETIQUETTE, "banc de mesure lancé à la demande (E2E_VITESSE_ETIQUETTE=...)");
  const resultats: Mesure[] = [];
  test.afterAll(() => {
    const etiquette = process.env.E2E_VITESSE_ETIQUETTE || "mesure";
    mkdirSync("test-results", { recursive: true });
    writeFileSync(`test-results/vitesse-synchro-${etiquette}.json`, JSON.stringify({ latences: LAT, resultats }, null, 1));
  });

  for (const n of [5, 10, 20]) {
    test(`${n} photos`, async ({ playwright }) => {
      test.setTimeout(300_000);
      const m = await mesurer(playwright as never, `${n} photos`, n, 0);
      resultats.push(m);
      expect(m.rattacheesUneFois, "chaque photo rattachée une seule fois").toBe(true);
      expect(m.rattachementsSimultanesMemeChampMax, "jamais deux rattachements simultanés sur un même champ").toBeLessThanOrEqual(1);
    });
  }

  test("7 photos + 17 saisies (la capture du 18.10)", async ({ playwright }) => {
    test.setTimeout(300_000);
    const m = await mesurer(playwright as never, "7 photos + 17 saisies", 7, 17);
    resultats.push(m);
    expect(m.rattacheesUneFois).toBe(true);
  });

  test("10 photos, réseau instable (1 requête sur 4 coupée)", async ({ playwright }) => {
    test.setTimeout(300_000);
    const m = await mesurer(playwright as never, "10 photos instable", 10, 0, (s) => { s.instabilite = 0.25; });
    resultats.push(m);
    expect(m.rattacheesUneFois).toBe(true);
    expect(m.rattachementsSimultanesMemeChampMax).toBeLessThanOrEqual(1);
  });

  test("5 photos, un envoi suspendu au retour du réseau", async ({ playwright }) => {
    test.setTimeout(300_000);
    const m = await mesurer(playwright as never, "5 photos envoi suspendu", 5, 0, (s) => { s.enLigne = true; s.suspendre = true; });
    resultats.push(m);
    expect(m.rattacheesUneFois).toBe(true);
  });
});
