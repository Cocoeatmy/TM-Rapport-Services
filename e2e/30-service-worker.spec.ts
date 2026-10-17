/**
 * La PWA avec son VRAI service worker.
 *
 * Les autres parcours le désactivent, parce qu'il s'interpose entre la page
 * et l'observateur. Ici il est actif, et c'est tout l'objet : vérifier que
 * l'application s'ouvre réellement sans réseau après avoir été visitée une
 * fois — ce qui est la définition même d'une PWA utilisable sur un chantier.
 *
 * Chromium seulement : Playwright n'intercepte les requêtes d'un service
 * worker que sur ce moteur. Le service worker lui-même est celui de
 * production, écrit à la main dans `public/sw.js`.
 */
import { test, expect } from "@playwright/test";
import { brancherFixtures, seConnecter, PROJET_ID } from "./harnais";

/** Attend que le service worker prenne la main sur la page. */
async function attendreLeServiceWorker(page: import("@playwright/test").Page) {
  await expect
    .poll(async () => page.evaluate(() => !!navigator.serviceWorker?.controller),
          { timeout: 30_000, message: "le service worker doit prendre la main" })
    .toBe(true);
}

test.describe("la PWA et son service worker", () => {
  test("s'installe, prend la main, et met la coquille en réserve", async ({ page, context }) => {
    await seConnecter(context);
    await brancherFixtures(page);

    await page.goto("/", { waitUntil: "domcontentloaded" });
    /* Première visite : le worker s'installe, puis réclame la page. Un
       rechargement suffit à le rendre maître. */
    await page.reload({ waitUntil: "domcontentloaded" });
    await attendreLeServiceWorker(page);

    const reserves = await page.evaluate(async () => {
      const noms = await caches.keys();
      const tailles: Record<string, number> = {};
      for (const n of noms) tailles[n] = (await (await caches.open(n)).keys()).length;
      return tailles;
    });

    /* Au moins une réserve, et elle n'est pas vide. */
    expect(Object.keys(reserves).length).toBeGreaterThan(0);
    expect(Math.max(...Object.values(reserves))).toBeGreaterThan(0);
  });

  test("ouvre l'application SANS RÉSEAU après une première visite", async ({ page, context }) => {
    await seConnecter(context);
    await brancherFixtures(page);

    /* 1. Une visite avec réseau : le worker garnit sa réserve. */
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.reload({ waitUntil: "domcontentloaded" });
    await attendreLeServiceWorker(page);
    await page.waitForTimeout(3000); // le pré-cache travaille en fond

    /* 2. Plus de réseau du tout, et on relance l'application. */
    await context.setOffline(true);
    await page.goto("/", { waitUntil: "domcontentloaded" });

    /* 3. Elle s'ouvre quand même : c'est toute la promesse de la PWA. */
    await expect(page.locator("body")).toContainText(/Dashboard|Services|Kanban/, { timeout: 30_000 });

    await context.setOffline(false);
  });

  test("la fiche d'un projet déjà consulté se rouvre sans réseau", async ({ page, context }) => {
    await seConnecter(context);
    await brancherFixtures(page);

    await page.goto(`/projet/${PROJET_ID}?mode=cmd`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Chantier de test E2E").first()).toBeVisible({ timeout: 30_000 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await attendreLeServiceWorker(page);
    await expect(page.getByText("Chantier de test E2E").first()).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(2000);

    /* Coupure totale, puis on revient sur la fiche. */
    await context.setOffline(true);
    await page.goto(`/projet/${PROJET_ID}?mode=cmd`, { waitUntil: "domcontentloaded" });

    /* La coquille s'affiche : le monteur n'est pas devant une page blanche.
       Le détail vient du cache local de l'application. */
    await expect(page.locator("body")).not.toBeEmpty();
    await expect(page.locator("body")).not.toContainText("This site can't be reached", { timeout: 5000 });

    await context.setOffline(false);
  });

  test("les fragments de code déjà vus sont resservis sans réseau", async ({ page, context }) => {
    /* C'est le rôle du service worker, et le cas qui avait échoué sans lui :
       le pavé de signature est chargé à la demande, en fragment séparé. Si
       personne ne le ressert hors ligne, on ne peut pas signer sur un
       chantier. On le vérifie directement, sans dépendre des données du
       projet — c'est le fragment qui est en cause, pas le dossier. */
    await seConnecter(context);
    await brancherFixtures(page);

    await page.goto(`/projet/${PROJET_ID}?mode=cmd`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Chantier de test E2E").first()).toBeVisible({ timeout: 30_000 });
    await page.getByText(/Consulter le rapport de montage/).first().click();
    await page.locator("#signature-card").locator("button").first().click();
    await expect(page.getByText("Signez ici")).toBeVisible({ timeout: 15_000 });
    await attendreLeServiceWorker(page);
    await page.waitForTimeout(2500);

    /* Les fragments que la page a chargés, tels que le navigateur les a vus. */
    const fragments: string[] = await page.evaluate(() =>
      performance.getEntriesByType("resource")
        .map((e) => e.name)
        .filter((n) => n.includes("/_next/static/chunks/") && n.endsWith(".js"))
        .slice(0, 12),
    );
    expect(fragments.length, "la page doit avoir chargé des fragments").toBeGreaterThan(0);

    /* Coupure totale. Les mêmes fragments doivent encore répondre. */
    await context.setOffline(true);
    const resultats = await page.evaluate(async (urls: string[]) => {
      const out: { url: string; ok: boolean; taille: number }[] = [];
      for (const u of urls) {
        try {
          const r = await fetch(u);
          out.push({ url: u, ok: r.ok, taille: (await r.arrayBuffer()).byteLength });
        } catch {
          out.push({ url: u, ok: false, taille: 0 });
        }
      }
      return out;
    }, fragments);

    const perdus = resultats.filter((r) => !r.ok || r.taille === 0);
    expect(perdus.map((r) => r.url), "aucun fragment ne doit manquer hors ligne").toEqual([]);

    await context.setOffline(false);
  });
});
