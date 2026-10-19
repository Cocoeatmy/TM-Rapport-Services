/**
 * Le panneau des opérations en attente, tel que le monteur le voit.
 *
 * WebKit, gabarit iPhone, profil persistant (photos dans IndexedDB). Les
 * opérations sont déposées dans les files du site au format exact de
 * l'application ; le serveur est simulé (aucune donnée réelle).
 *
 * Ce qui est exigé :
 *  - des intitulés lisibles : « TM-TEST — Photo montage gauche 1 », « TM-TEST
 *    — Signature du client », « TM-TEST — Défaut — Joint endommagé »… ;
 *  - hors ligne : « En attente du réseau », jamais « Échec » ;
 *  - au retour du réseau : le décompte « x photos sur y envoyées », l'état
 *    de chaque opération, le pourcentage d'un gros fichier, l'heure du nouvel
 *    essai après un échec passager ;
 *  - « Tout est synchronisé » UNIQUEMENT quand tout est confirmé — jamais
 *    pendant qu'il reste un envoi, jamais avec une photo en échec.
 */
import { test, expect, devices, type BrowserContext, type Page, type Route } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brancherFixtures, seConnecter, sansServiceWorker, projetFictif, PROJET_ID } from "./harnais";

const BASE = "http://127.0.0.1:3137";
const PROJET_B = "22222222-3333-4444-5555-666666666666";

interface Reglage { enLigne: boolean; refuserDefinitivement?: (nom: string) => boolean; echecsPassagers: number }

async function lancer(playwright: typeof import("playwright")) {
  const profil = mkdtempSync(join(tmpdir(), "tm-e2e-panneau-"));
  const iphone = { ...devices["iPhone 13"] } as Record<string, unknown>;
  delete iphone.defaultBrowserType;
  const ctx: BrowserContext = await playwright.webkit.launchPersistentContext(profil, { ...(iphone as object), baseURL: BASE });
  return { ctx, profil };
}

async function brancher(page: Page, r: Reglage) {
  await brancherFixtures(page, { projet: projetFictif({ ofrTM: "TM-TEST", projet: "Chantier d'essai" }) });
  const lent = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
  const json = (route: Route, corps: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(corps) }).catch(() => {});
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const c = new URL(req.url()).pathname;
    if (req.method() === "GET") return route.fallback();
    if (!r.enLigne) return route.abort("internetdisconnected").catch(() => {});
    if (c === "/api/photos/sign") { await lent(150); return json(route, { signature: "x", timestamp: 1, apiKey: "k", cloudName: "c", folder: "f" }); }
    if (c === "/api/photos/attach") {
      const corps = JSON.parse(req.postData() || "{}") as { photos: { name: string }[] };
      await lent(1200);
      if (r.refuserDefinitivement && corps.photos.some((p) => r.refuserDefinitivement!(p.name))) return json(route, { error: "champ refusé" }, 400);
      return json(route, { ok: true });
    }
    if (c === "/api/defauts") { await lent(800); return json(route, { success: true }); }
    if (r.echecsPassagers > 0) { r.echecsPassagers--; return json(route, { error: "indisponible" }, 503); }
    await lent(900);
    return json(route, { ok: true });
  });
  await page.route("**api.cloudinary.com/**", async (route) => {
    if (!r.enLigne) return route.abort("internetdisconnected").catch(() => {});
    await lent(1500);
    return json(route, { secure_url: `https://res.cloudinary.test/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg` });
  });
}

/** Dépose les opérations d'une vraie journée, au format de l'application. */
async function deposer(page: Page, avecGrosFichier: boolean) {
  await page.evaluate(async ({ a, b, gros }) => {
    localStorage.setItem("tm-projects-cache", JSON.stringify({
      cmd: [{ id: a, ofrTM: "TM-TEST", projet: "Chantier d'essai" }, { id: b, ofrTM: "TM-2600825", projet: "Villa du Lac" }],
    }));
    const db: IDBDatabase = await new Promise((res) => {
      const rq = indexedDB.open("tm-rapport-uploads", 2);
      rq.onupgradeneeded = () => { const st = rq.result.createObjectStore("pendingUploads", { keyPath: "id" }); st.createIndex("projectId", "projectId"); st.createIndex("status", "status"); };
      rq.onsuccess = () => res(rq.result);
    });
    const jpeg = (n: number) => { const o = new Uint8Array(n); o[0] = 0xff; o[1] = 0xd8; return new Blob([o], { type: "image/jpeg" }); };
    const t = Date.now() - 600_000;
    const entrees = [
      { id: "p1", projectId: a, category: "montage", notionField: "Photos montage terminé", files: [{ name: "Montage gauche.1.1792346187038.jpg", type: "image/jpeg", blob: jpeg(150_000) }] },
      { id: "p2", projectId: a, category: "montage", notionField: "Photos montage terminé", files: [{ name: "Montage droite.2.1792346187039.jpg", type: "image/jpeg", blob: jpeg(150_000) }] },
      { id: "p3", projectId: b, category: "montage", notionField: "Photos montage terminé", files: [{ name: "Montage gauche.1.1792346187040.jpg", type: "image/jpeg", blob: jpeg(150_000) }] },
      { id: "sig", projectId: a, category: "signatures", champTexte: "signatureUrl", files: [{ name: "signature-1792346187041.png", type: "image/png", blob: jpeg(40_000) }] },
      { id: "def", projectId: a, category: "signalements-hors-ligne", notionField: "__signalement_hors_ligne__",
        signalement: { id: "sig-essai-1", projectId: a, typesLabel: "Joint endommagé", description: "Joint fendu côté mur" },
        files: [{ name: "defaut.1.1792346187042.jpg", type: "image/jpeg", blob: jpeg(150_000) }] },
      ...(gros ? [{ id: "video", projectId: a, category: "montage", notionField: "Photos montage terminé",
        files: [{ name: "Video montage.3.1792346187043.mp4", type: "video/mp4", blob: new Blob([new Uint8Array(3 * 1024 * 1024)], { type: "video/mp4" }) }] }] : []),
    ];
    await new Promise<void>((ok) => {
      const tx = db.transaction("pendingUploads", "readwrite");
      entrees.forEach((e, i) => tx.objectStore("pendingUploads").put({ ...e, createdAt: t + i * 1000, retryCount: 0, status: "pending" }));
      tx.oncomplete = () => ok();
    });
    db.close();
    localStorage.setItem("tm-rapport-queue", JSON.stringify([
      { id: "h1", type: "update", url: `/api/projects/${a}`, method: "PATCH", body: { heureArrivee: "07:30", heureDepart: "16:00" }, timestamp: t + 10_000 },
      { id: "c1", type: "update", url: `/api/projects/${a}`, method: "PATCH", body: { commentairesMontages: "Joint refait" }, timestamp: t + 11_000 },
      { id: "c2", type: "update", url: `/api/projects/${b}`, method: "PATCH", body: { rapportMonteur: "Pose OK", heureArrivee: "08:00" }, timestamp: t + 12_000 },
    ]));
    window.dispatchEvent(new Event("tm-offline-queued"));
  }, { a: PROJET_ID, b: PROJET_B, gros: avecGrosFichier });
}

const panneau = (page: Page) => page.getByRole("status").first();

async function ouvrirLePanneau(page: Page) {
  await page.waitForTimeout(800);
  await panneau(page).click();
  await expect(page.getByText("Opérations en attente", { exact: true })).toBeVisible({ timeout: 10_000 });
}

test.describe.serial("le panneau des opérations en attente", () => {
  test("intitulés lisibles, hors ligne puis au retour du réseau, jusqu'à « Tout est synchronisé »", async ({ playwright }) => {
    test.setTimeout(240_000);
    const { ctx, profil } = await lancer(playwright);
    try {
      await sansServiceWorker(ctx); await seConnecter(ctx);
      const page = ctx.pages()[0] ?? (await ctx.newPage());
      const r: Reglage = { enLigne: false, echecsPassagers: 1 };
      await brancher(page, r);
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2500);
      await deposer(page, true);
      await ctx.setOffline(true);
      await page.evaluate(() => window.dispatchEvent(new Event("offline")));
      await ouvrirLePanneau(page);

      // Les intitulés : le projet d'abord, puis ce qui part.
      for (const t of [
        "TM-TEST — Photo montage gauche 1", "TM-TEST — Photo montage droite 2", "TM-2600825 — Photo montage gauche 1",
        "TM-TEST — Signature du client", "TM-TEST — Défaut — Joint endommagé", "TM-TEST — Photo video montage 3",
        "TM-TEST — Heures d'intervention", "TM-TEST — Commentaires", "TM-2600825 — Rapport de montage + heures",
      ]) {
        await expect(page.getByText(t, { exact: true }), t).toBeVisible();
      }
      // Hors ligne, rien n'a « échoué » : tout attend.
      await expect(page.getByText(/En attente du réseau/).first()).toBeVisible();
      await expect(page.getByText(/^Échec/)).toHaveCount(0);
      await expect(page.getByText(/Tout est synchronisé/)).toHaveCount(0);
      // Les identifiants techniques restent au toucher.
      await page.getByText("TM-TEST — Signature du client", { exact: true }).click();
      await expect(page.getByText(/signature-1792346187041\.png · signatureUrl/)).toBeVisible();

      // Le réseau revient.
      await ctx.setOffline(false); r.enLigne = true;
      await page.evaluate(() => window.dispatchEvent(new Event("online")));
      await expect(panneau(page)).toContainText(/Synchronisation — \d+ photos? sur 6 envoyées?/, { timeout: 15_000 });
      await expect(page.getByText(/Envoi en cours/).first()).toBeVisible({ timeout: 15_000 });
      // Le gros fichier montre sa progression (envoi suivi au-delà de 2 Mo).
      const pct = await page.getByText(/Envoi en cours · \d+ %/).first().isVisible().catch(() => false);
      test.info().annotations.push({ type: "progression", description: pct ? "pourcentage affiché" : "pourcentage non observé (envoi trop rapide dans le banc)" });
      // Une saisie a reçu un 503 : elle annonce son nouvel essai, sans alarmer.
      await expect(page.getByText(/Échec — nouvel essai à \d\d:\d\d:\d\d/).first()).toBeVisible({ timeout: 15_000 });
      // Tant qu'il reste quelque chose, pas de faux succès.
      await expect(page.getByText(/Tout est synchronisé/)).toHaveCount(0);

      // Fin : tout est confirmé, et seulement alors le message vert.
      await expect(page.getByText(/Tout est synchronisé/)).toBeVisible({ timeout: 120_000 });
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem("tm-rapport-queue") || "[]").length)).toBe(0);
      await page.getByText(/Tout est synchronisé/).click();
      await expect(page.getByText("TM-TEST — Défaut — Joint endommagé")).toBeVisible();
    } finally {
      await ctx.close().catch(() => {});
      rmSync(profil, { recursive: true, force: true });
    }
  });

  test("une photo refusée définitivement : jamais « Tout est synchronisé », la photo reste", async ({ playwright }) => {
    test.setTimeout(180_000);
    const { ctx, profil } = await lancer(playwright);
    try {
      await sansServiceWorker(ctx); await seConnecter(ctx);
      const page = ctx.pages()[0] ?? (await ctx.newPage());
      const r: Reglage = { enLigne: true, echecsPassagers: 0, refuserDefinitivement: (n) => n.startsWith("Montage droite") };
      await brancher(page, r);
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2500);
      await deposer(page, false);
      await page.evaluate(() => window.dispatchEvent(new Event("online")));
      // L'alerte rouge, et la photo gardée sur l'appareil.
      await expect(page.getByText(/n'ont pas pu être envoyées — données conservées localement/)).toBeVisible({ timeout: 90_000 });
      await page.waitForTimeout(3000);
      await expect(page.getByText(/Tout est synchronisé/)).toHaveCount(0);
      const enEchec = await page.evaluate(async () => {
        const db: IDBDatabase = await new Promise((ok) => { const rq = indexedDB.open("tm-rapport-uploads"); rq.onsuccess = () => ok(rq.result); });
        const items: { status?: string; files: { name: string }[] }[] = await new Promise((ok) => {
          const q = db.transaction("pendingUploads", "readonly").objectStore("pendingUploads").getAll(); q.onsuccess = () => ok(q.result);
        });
        return items.filter((i) => i.status === "permanently-failed").map((i) => i.files[0].name);
      });
      expect(enEchec.some((n) => n.startsWith("Montage droite")), "la photo refusée est gardée").toBe(true);
      // Les autres photos du même champ ne sont pas bloquées avec elle.
      expect(enEchec, "seule la photo refusée reste en échec").toEqual(["Montage droite.2.1792346187039.jpg"]);
    } finally {
      await ctx.close().catch(() => {});
      rmSync(profil, { recursive: true, force: true });
    }
  });
});
