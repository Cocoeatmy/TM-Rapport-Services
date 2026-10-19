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
import { readFileSync } from "node:fs";
import { join } from "node:path";
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

  test("une écriture ne fait pas disparaître la fiche gardée pour le hors-ligne", async ({ page, context }) => {
    /* Constaté en production sur TEST 5 le 19.10.2026 : chaque photo prise
       demandait au service worker d'EFFACER tout son cache API. À la
       réouverture sans réseau : « Projet introuvable », sur tous les
       chantiers préparés. Une écriture doit rendre les lectures suivantes
       fraîches, pas détruire la copie hors-ligne. */
    await seConnecter(context);
    await brancherFixtures(page);

    await page.goto(`/projet/${PROJET_ID}?mode=cmd`, { waitUntil: "domcontentloaded" });
    await page.reload({ waitUntil: "domcontentloaded" });
    await attendreLeServiceWorker(page);
    await page.waitForTimeout(2000);

    /* Le banc sert ses données AVANT le service worker : on dépose donc
       nous-mêmes, dans la réserve API du worker, la copie qu'il aurait
       gardée d'une fiche préparée. */
    const URL_FICHE = `/api/projects/${PROJET_ID}`;
    const version = /const VERSION = "([^"]+)"/.exec(readFileSync(join(process.cwd(), "public", "sw.js"), "utf8"))![1];
    await page.evaluate(async ({ u, nom }) => {
      await (await caches.open(nom)).put(u, new Response(JSON.stringify({ id: "copie" }), { headers: { "Content-Type": "application/json" } }));
    }, { u: URL_FICHE, nom: `tm-api-${version}` });
    const copies = () => page.evaluate(async (u) => {
      let n = 0;
      for (const nom of await caches.keys()) for (const r of await (await caches.open(nom)).keys()) if (new URL(r.url).pathname === u) n++;
      return n;
    }, URL_FICHE);
    expect(await copies()).toBe(1);

    /* Ce que l'application envoie après chaque photo ou saisie. */
    await page.evaluate(() => navigator.serviceWorker.controller?.postMessage({ type: "INVALIDATE_API_CACHE" }));
    await page.waitForTimeout(1500);
    expect(await copies(), "une écriture ne doit pas effacer la copie hors-ligne").toBe(1);

    await context.setOffline(false);
  });

  test("un PDF n'est jamais servi depuis une ancienne copie", async ({ page, context }) => {
    /* Constaté en production le 20.10.2026 : rapport de suivi, d'arrivage,
       de signalements, planning, déstockage passaient par la branche API du
       worker, qui servait sa copie au-delà de 400 ms — une version ANCIENNE. */
    await seConnecter(context);
    await brancherFixtures(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.reload({ waitUntil: "domcontentloaded" });
    await attendreLeServiceWorker(page);
    const version = /const VERSION = "([^"]+)"/.exec(readFileSync(join(process.cwd(), "public", "sw.js"), "utf8"))![1];
    const recus = await page.evaluate(async (nom) => {
      const chemins = ["/api/synthese/X", "/api/arrivage/X", "/api/rapport-signalements/X", "/api/planning-pdf?month=2026-10", "/api/destockage/pdf/all"];
      const cache = await caches.open(nom);
      for (const c of chemins) await cache.put(c, new Response("ANCIEN-PDF", { headers: { "Content-Type": "application/pdf" } }));
      const out: string[] = [];
      for (const c of chemins) out.push(await (await fetch(c)).text());
      return out;
    }, `tm-api-${version}`);
    for (const r of recus) expect(r, "jamais l'ancienne copie").not.toBe("ANCIEN-PDF");
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
