/**
 * Les OCTETS d'une photo, avant et après fermeture complète du navigateur.
 *
 * Les tests précédents démontraient que l'enregistrement survit — projet,
 * champ visé, statut. Pas les octets : les deux bancs d'essai perdaient les
 * `Blob` à la relecture.
 *
 * Ici on va jusqu'au bout. Le navigateur tourne avec un PROFIL PERSISTANT
 * sur disque : on le ferme pour de bon, on le rouvre, et on relit la photo
 * octet par octet. C'est la crainte du chantier — « un collaborateur a perdu
 * ses photographies » — mise à l'épreuve.
 */
import { test, expect, chromium, type BrowserContext, type Page } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brancherFixtures, seConnecter, PROJET_ID } from "./harnais";

/** Un contexte lancé à la main n'hérite pas du `baseURL` de la configuration. */
const BASE = "http://127.0.0.1:3137";

/** Une image JPEG minuscule mais valide, aux octets connus. */
const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a" +
  "HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA" +
  "AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
  "base64",
);

/** L'empreinte des octets réellement stockés dans IndexedDB. */
async function empreintesEnFile(page: Page) {
  return page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((res, rej) => {
      const r = indexedDB.open("tm-rapport-uploads");
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    if (!db.objectStoreNames.contains("pendingUploads")) return [];
    const items: { files: { name: string; blob: Blob }[] }[] = await new Promise((res) => {
      const tx = db.transaction("pendingUploads", "readonly");
      const q = tx.objectStore("pendingUploads").getAll();
      q.onsuccess = () => res(q.result);
      q.onerror = () => res([]);
    });
    const out: { nom: string; taille: number; sha: string }[] = [];
    for (const it of items) {
      for (const f of it.files || []) {
        const buf = await f.blob.arrayBuffer();
        const h = await crypto.subtle.digest("SHA-256", buf);
        out.push({
          nom: f.name,
          taille: buf.byteLength,
          sha: [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join(""),
        });
      }
    }
    return out.sort((a, b) => a.nom.localeCompare(b.nom));
  });
}

async function ouvrirLeRapport(page: Page) {
  await page.goto(`${BASE}/projet/${PROJET_ID}?mode=cmd`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Chantier de test E2E").first()).toBeVisible({ timeout: 40_000 });
  await page.getByText(/Consulter le rapport de montage/).first().click();
  await page.locator("#signature-card").locator("button").first().click();
  await expect(page.getByText("Signez ici")).toBeVisible({ timeout: 20_000 });
}

/**
 * Dépose une image dans la file, HORS RÉSEAU.
 *
 * Elle passe par le pavé de signature. Ce n'est pas un détour : photos et
 * signature empruntent le MÊME appel (`addPendingUpload`), le même magasin
 * IndexedDB et la même structure de fichier — `{ name, type, blob }`. Ce
 * qu'on démontre ici des octets d'une image vaut donc pour les deux. Le pavé
 * a l'avantage de se piloter sans dépendre de l'arborescence des planches de
 * photos, qui change avec le type de chantier.
 */
async function deposerUneImage(page: Page) {
  const boite = await page.locator("#signature-card canvas").boundingBox();
  if (!boite) throw new Error("pavé introuvable");
  await page.mouse.move(boite.x + 30, boite.y + 60);
  await page.mouse.down();
  await page.mouse.move(boite.x + 120, boite.y + 110, { steps: 10 });
  await page.mouse.move(boite.x + 200, boite.y + 70, { steps: 10 });
  await page.mouse.up();
  await page.getByText(/Valider la signature/).click();
  await expect(page.getByText(/en attente d'envoi/i)).toBeVisible({ timeout: 20_000 });
}

test.describe("les octets d'une photo survivent à la fermeture du navigateur", () => {
  test("mêmes octets, même empreinte, après extinction complète", async () => {
    /* Un profil sur disque : sans lui, tout disparaît avec le processus et
       on ne testerait qu'un rechargement. */
    const profil = mkdtempSync(join(tmpdir(), "tm-e2e-profil-"));
    let contexte: BrowserContext | null = null;
    try {
      /* ── Première session : on dépose la photo, hors réseau ──────────── */
      contexte = await chromium.launchPersistentContext(profil, {
        viewport: { width: 390, height: 844 },
        serviceWorkers: "allow",
      });
      let page = contexte.pages()[0] ?? (await contexte.newPage());
      await seConnecter(contexte);
      await brancherFixtures(page);
      await ouvrirLeRapport(page);
      await contexte.setOffline(true);
      await deposerUneImage(page);
      const avant = await empreintesEnFile(page);
      expect(avant.length, "l'image doit être en file").toBeGreaterThan(0);
      expect(avant[0].taille, "la photo stockée ne doit pas être vide").toBeGreaterThan(0);

      /* ── On ÉTEINT le navigateur, pour de bon ────────────────────────── */
      await contexte.close();
      contexte = null;

      /* ── Deuxième session, même profil ───────────────────────────────── */
      contexte = await chromium.launchPersistentContext(profil, {
        viewport: { width: 390, height: 844 },
        serviceWorkers: "allow",
        offline: true,
      });
      page = contexte.pages()[0] ?? (await contexte.newPage());
      await brancherFixtures(page);
      await page.goto(`${BASE}/projet/${PROJET_ID}?mode=cmd`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2000);

      const apres = await empreintesEnFile(page);

      /* LA vérification : octet pour octet, rien n'a bougé. */
      expect(apres, "la photo doit être retrouvée après extinction").toHaveLength(avant.length);
      expect(apres[0].taille).toBe(avant[0].taille);
      expect(apres[0].sha).toBe(avant[0].sha);
      expect(apres[0].nom).toBe(avant[0].nom);
    } finally {
      await contexte?.close().catch(() => {});
      rmSync(profil, { recursive: true, force: true });
    }
  });

  test("et l'image part au retour du réseau, après extinction", async () => {
    const profil = mkdtempSync(join(tmpdir(), "tm-e2e-profil-"));
    let contexte: BrowserContext | null = null;
    try {
      /* ── Session 1 : on dépose hors réseau, puis on éteint ───────────── */
      contexte = await chromium.launchPersistentContext(profil, {
        viewport: { width: 390, height: 844 }, serviceWorkers: "allow",
      });
      let page = contexte.pages()[0] ?? (await contexte.newPage());
      await seConnecter(contexte);
      await brancherFixtures(page);
      await ouvrirLeRapport(page);
      await contexte.setOffline(true);
      await deposerUneImage(page);
      const avant = await empreintesEnFile(page);
      expect(avant.length).toBeGreaterThan(0);
      await contexte.close();

      /* ── Session 2 : on rallume AVEC réseau ──────────────────────────── */
      contexte = await chromium.launchPersistentContext(profil, {
        viewport: { width: 390, height: 844 }, serviceWorkers: "allow",
      });
      page = contexte.pages()[0] ?? (await contexte.newPage());
      const trace = await brancherFixtures(page);
      await page.goto(`${BASE}/projet/${PROJET_ID}?mode=cmd`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1500);
      await page.evaluate(() => window.dispatchEvent(new Event("online")));

      /* La file se vide : ce qui dormait sur l'appareil est parti. */
      await expect
        .poll(async () => (await empreintesEnFile(page)).length,
              { timeout: 60_000, message: "la file doit se vider au retour du réseau" })
        .toBe(0);

      /* Et c'est bien allé dans le bon champ du bon projet. */
      const ecriture = trace.appels.find(
        (a) => a.methode === "PATCH" &&
               a.url === `/api/projects/${PROJET_ID}` &&
               !!(a.corps as Record<string, unknown>)?.signatureUrl,
      );
      expect(ecriture, "l'écriture doit partir vers le bon projet").toBeDefined();
    } finally {
      await contexte?.close().catch(() => {});
      rmSync(profil, { recursive: true, force: true });
    }
  });
});
