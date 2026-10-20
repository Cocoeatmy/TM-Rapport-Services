/**
 * Le passage d'un mécanisme d'envoi à l'autre ne perd ni ne dédouble une photo.
 *
 * Le formulaire de défaut et les photos de cartons essaient d'abord l'envoi
 * en ligne (/api/upload), puis confient les photos à la file de l'appareil si
 * le réseau lâche. Deux pièges, vérifiés ici sur un Cloudinary simulé qui
 * compte ses images par identifiant :
 *
 *  1. la réponse se perd alors que le serveur avait reçu la photo : chaque
 *     chemin la renvoyait sous un identifiant différent — plusieurs copies ;
 *  2. deux photos de cartons prises sans réseau recevaient le MÊME nom, et le
 *     rattachement (qui écarte les doublons par leur nom) en perdait une.
 */
import { test, expect, type Page, type Route } from "@playwright/test";
import { brancherFixtures, seConnecter, sansServiceWorker, projetFictif, PROJET_ID } from "./harnais";

/** Un Cloudinary de banc : une image par identifiant, comme le vrai. */
class FauxCloudinary {
  images = new Map<string, number>(); // identifiant → nombre d'envois reçus
  private n = 0;
  recevoir(publicId: string | null): string {
    const id = publicId || `aleatoire-${++this.n}`;
    this.images.set(id, (this.images.get(id) || 0) + 1);
    return `https://c.test/${id}.jpg`;
  }
}

/** Lit un champ d'un corps multipart (assez pour nos champs texte). */
function champ(corps: Buffer | null, nom: string): string | null {
  const t = (corps || Buffer.alloc(0)).toString("latin1");
  const m = new RegExp(`name="${nom}"\\r\\n\\r\\n([^\\r]*)`).exec(t);
  return m ? m[1] : null;
}
function nbFichiers(corps: Buffer | null): number {
  return ((corps || Buffer.alloc(0)).toString("latin1").match(/name="files"; filename=/g) || []).length;
}

async function brancherEnvois(page: Page, cloud: FauxCloudinary, journal: { defauts: unknown[]; attaches: { name: string }[][] }) {
  const json = (route: Route, corps: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(corps) });
  /* Enregistrées APRÈS les fixtures : Playwright les consulte en premier. */
  await page.route("**/api/upload", async (route) => {
    const corps = route.request().postDataBuffer();
    const cle = champ(corps, "cleEnvoi");
    for (let i = 0; i < nbFichiers(corps); i++) cloud.recevoir(cle ? `${cle}-${i}` : null);
    /* Le serveur a tout reçu… et la réponse ne revient jamais. */
    await route.abort("connectionreset");
  });
  await page.route("**/api/photos/sign", async (route) => {
    const b = JSON.parse(route.request().postData() || "{}");
    return json(route, { signature: "x", timestamp: 1, apiKey: "k", cloudName: "c", folder: "f", ...(b.publicId ? { publicId: b.publicId } : {}) });
  });
  await page.route("**api.cloudinary.com/**", async (route) => {
    const url = cloud.recevoir(champ(route.request().postDataBuffer(), "public_id"));
    return json(route, { secure_url: url });
  });
  await page.route("**/api/defauts**", async (route) => {
    if (route.request().method() !== "POST") return json(route, []);
    journal.defauts.push(JSON.parse(route.request().postData() || "{}"));
    return json(route, { success: true });
  });
  await page.route("**/api/photos/attach", async (route) => {
    journal.attaches.push((JSON.parse(route.request().postData() || "{}").photos || []) as { name: string }[]);
    return json(route, { ok: true });
  });
}

async function jpeg(page: Page, teinte: number): Promise<Buffer> {
  const b64 = await page.evaluate((h) => {
    const c = document.createElement("canvas"); c.width = 64; c.height = 48;
    const g = c.getContext("2d")!; g.fillStyle = `hsl(${h} 70% 50%)`; g.fillRect(0, 0, 64, 48);
    return c.toDataURL("image/jpeg", 0.9).split(",")[1];
  }, teinte);
  return Buffer.from(b64, "base64");
}

test.describe("l'envoi de secours", () => {
  test("défaut : réponse perdue deux fois, puis la file — une seule image, un seul défaut", async ({ page, context }) => {
    test.setTimeout(90_000);
    await sansServiceWorker(context);
    await seConnecter(context);
    await brancherFixtures(page, { projet: projetFictif() });
    const cloud = new FauxCloudinary();
    const journal = { defauts: [] as unknown[], attaches: [] as { name: string }[][] };
    await brancherEnvois(page, cloud, journal);

    await page.goto(`/projet/${PROJET_ID}?mode=cmd`, { waitUntil: "domcontentloaded" });
    await page.getByText(/Consulter le rapport de montage|Démarrer le rapport de montage/).first().click();
    await page.getByRole("button", { name: "Signalements", exact: true }).click();
    await page.getByRole("button", { name: /^Signaler un défaut$/ }).click();
    await page.getByRole("button", { name: "Défaut d'usine" }).click();
    await page.getByPlaceholder("Décrivez le défaut constaté...").fill("Éclat sur la paroi (banc).");
    await page.locator("div.glass-card", { hasText: "Description du défaut" }).locator('input[type="file"][multiple]')
      .setInputFiles({ name: "defaut.jpg", mimeType: "image/jpeg", buffer: await jpeg(page, 10) });
    await page.getByRole("button", { name: "Enregistrer le signalement" }).click();

    /* Les deux essais en ligne ont « échoué » : le défaut part dans la file. */
    await expect(page.getByText(/Défaut enregistré sur l'appareil/).first()).toBeVisible({ timeout: 20_000 });
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect.poll(() => journal.defauts.length, { timeout: 30_000 }).toBeGreaterThan(0);
    await page.waitForTimeout(1500);

    /* Le serveur a reçu la photo deux fois, la file une fois : UNE image. */
    expect([...cloud.images.values()].reduce((a, b) => a + b, 0), "trois envois au total").toBe(3);
    expect([...cloud.images.keys()], "une seule image, sous un identifiant unique").toHaveLength(1);
    const ids = new Set(journal.defauts.map((d) => (d as { id: string }).id));
    expect(ids.size, "un seul défaut").toBe(1);
    const urls = (journal.defauts.at(-1) as { photoUrls: string[] }).photoUrls;
    expect(urls, "le défaut porte sa photo, une fois").toHaveLength(1);
    expect(urls[0]).toContain([...cloud.images.keys()][0]);
  });

  test("cartons : deux photos sans réseau, l'une après l'autre — les deux arrivent", async ({ page, context }) => {
    test.setTimeout(90_000);
    await sansServiceWorker(context);
    await seConnecter(context);
    await brancherFixtures(page, { projet: projetFictif() });
    const cloud = new FauxCloudinary();
    const journal = { defauts: [] as unknown[], attaches: [] as { name: string }[][] };
    await brancherEnvois(page, cloud, journal);

    await page.goto(`/projet/${PROJET_ID}?mode=cmd`, { waitUntil: "domcontentloaded" });
    const champCartons = page.locator("label", { hasText: "Photographier ou joindre (cartons)" }).first()
      .locator("xpath=ancestor::div[1]//input[@type='file' and @multiple]").first();
    await expect(champCartons).toHaveCount(1, { timeout: 30_000 });

    await context.setOffline(true);
    await champCartons.setInputFiles({ name: "IMG_1.jpg", mimeType: "image/jpeg", buffer: await jpeg(page, 120) });
    await page.waitForTimeout(1200);
    await champCartons.setInputFiles({ name: "IMG_2.jpg", mimeType: "image/jpeg", buffer: await jpeg(page, 240) });
    await page.waitForTimeout(1200);

    const enFile = await page.evaluate(async () => {
      const db: IDBDatabase = await new Promise((r) => { const q = indexedDB.open("tm-rapport-uploads"); q.onsuccess = () => r(q.result); });
      const tout: { files: { name: string }[]; cleEnvoi?: string }[] = await new Promise((r) => {
        const q = db.transaction("pendingUploads").objectStore("pendingUploads").getAll(); q.onsuccess = () => r(q.result);
      });
      db.close();
      return tout.map((x) => ({ noms: x.files.map((f) => f.name), cle: x.cleEnvoi }));
    });
    const noms = enFile.flatMap((x) => x.noms);
    expect(noms, "deux photos en attente").toHaveLength(2);
    expect(new Set(noms).size, "deux noms DIFFÉRENTS").toBe(2);
    expect(enFile.every((x) => !!x.cle), "chaque envoi porte sa clé").toBe(true);

    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect.poll(() => new Set(journal.attaches.flat().map((p) => p.name)).size, { timeout: 30_000 }).toBe(2);
    expect(new Set(journal.attaches.flat().map((p) => p.name))).toEqual(new Set(noms));
  });
});
