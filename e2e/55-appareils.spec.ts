/**
 * Les téléphones vus du bureau — de bout en bout, dans un vrai navigateur.
 *
 * Trois choses à tenir :
 *   — un téléphone de monteur REND COMPTE : il envoie son état, en chiffres,
 *     sans rien de confidentiel dedans ;
 *   — il OBÉIT à un signal du bureau, une fois, et rend compte aussitôt ;
 *   — le bureau VOIT : les lignes de « Signaux », la page Appareils, le
 *     bouton « Relancer » — et un monteur n'y a pas accès.
 */
import { test, expect } from "@playwright/test";
import { brancherFixtures, seConnecter, sansServiceWorker, MONTEUR, ADMIN, PROJET_ID } from "./harnais";

const signal = async (context: import("@playwright/test").BrowserContext) => {
  await sansServiceWorker(context);
  await context.addInitScript(() => {
    try { localStorage.setItem("tm-ui-mode", "signal"); } catch { /* ignore */ }
    document.documentElement.setAttribute("data-ui", "signal");
  });
};

test.describe("côté téléphone (monteur)", () => {
  test("rend compte au bureau, en chiffres seulement", async ({ page, context }) => {
    await signal(context);
    await seConnecter(context, MONTEUR);
    const trace = await brancherFixtures(page, { compte: MONTEUR });
    await page.goto("/?mode=dashboard", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    /* Le retour du réseau déclenche un battement 1,5 s plus tard — plus vite
       que d'attendre le tic de trente secondes. */
    await page.evaluate(() => window.dispatchEvent(new Event("online")));

    await expect.poll(
      () => trace.appels.filter((a) => a.methode === "POST" && a.url === "/api/appareils/etat").length,
      { timeout: 15_000, message: "un battement doit partir" },
    ).toBeGreaterThan(0);

    const b = trace.appels.find((a) => a.methode === "POST" && a.url === "/api/appareils/etat")!.corps as Record<string, unknown>;
    expect(typeof b.appareil).toBe("string");
    expect((b.appareil as string).length).toBeGreaterThan(8);
    expect(b.appareil).not.toContain("Mozilla"); // pas l'User-Agent
    for (const k of ["photosEnAttente", "photosEnEchec", "requetesEnAttente", "preparesHorsLigne"]) {
      expect(typeof b[k], k).toBe("number");
    }
    expect(Array.isArray(b.rapportsNonEnvoyes)).toBe(true);
    /* Rien de confidentiel : ni adresse, ni téléphone, ni nom de chantier. */
    const texte = JSON.stringify(b);
    expect(texte).not.toMatch(/Rue |Lausanne|\+41|Immeuble d'essai|Chantier de test/);
  });

  test("obéit à un signal du bureau, une fois, et rend compte aussitôt", async ({ page, context }) => {
    await signal(context);
    await seConnecter(context, MONTEUR);
    const trace = await brancherFixtures(page, { compte: MONTEUR });
    /* Le serveur répond avec un signal au premier battement, puis plus rien. */
    let battements = 0;
    const requestedAt = Date.now();
    await page.route("**/api/appareils/etat", (route) => {
      battements += 1;
      return route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({ ok: true, signal: battements === 1 ? { requestedAt, par: "micael@tm.ch" } : null }),
      });
    });
    await page.goto("/?mode=dashboard", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));

    /* Deux battements : le premier reçoit le signal, le second est le compte
       rendu immédiat après la relance. */
    await expect.poll(() => battements, { timeout: 15_000 }).toBeGreaterThanOrEqual(2);
    /* Le signal est retenu : il ne sera pas rejoué. */
    const vu = await page.evaluate(() => localStorage.getItem("tm-appareil-signal-vu"));
    expect(Number(vu)).toBe(requestedAt);
    /* (La trace du harnais ne voit pas ces appels : la route posée ici les
       prend avant elle. Le compteur `battements` est la preuve.) */
    void trace;
  });

  test("n'a pas accès à la page Appareils", async ({ page, context }) => {
    await signal(context);
    await seConnecter(context, MONTEUR);
    await brancherFixtures(page, { compte: MONTEUR });
    await page.goto("/admin/appareils", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    expect(new URL(page.url()).pathname).toBe("/");
  });
});

test.describe("côté bureau (administrateur)", () => {
  test("« Signaux » montre ce qui attend sur les téléphones, et les rapports bloqués", async ({ page, context }) => {
    await signal(context);
    await seConnecter(context, ADMIN);
    await brancherFixtures(page, { compte: ADMIN });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/?mode=dashboard", { waitUntil: "domcontentloaded" });

    const ligne = page.locator(".sg-signal-row", { hasText: "Envois en attente sur les téléphones" });
    await expect(ligne).toBeVisible({ timeout: 15_000 });
    /* 3 photos + 1 échec + 0 écriture + 1 rapport = 5 */
    await expect(ligne.locator(".sg-signal-count")).toHaveText("5");
    await expect(ligne).toContainText("1 appareil");
    await expect(ligne).toContainText("1 en échec");

    const bloque = page.locator(".sg-signal-row", { hasText: "Rapports non envoyés depuis plus de 24 h" });
    await expect(bloque).toBeVisible();
    await expect(bloque).toContainText("Jacobo Fontan Cassas");
    await expect(bloque.locator(".sg-signal-count")).toHaveText("1");
  });

  test("la page Appareils liste le téléphone et « Relancer » pose le signal", async ({ page, context }) => {
    await signal(context);
    await seConnecter(context, ADMIN);
    await brancherFixtures(page, { compte: ADMIN });
    /* Le POST « relancer » répond comme le ferait le serveur — et l'on note
       ce qu'il a reçu, puisque la trace du harnais ne voit pas les routes
       posées après elle. */
    const recus: unknown[] = [];
    await page.route("**/api/admin/appareils", (route) => {
      if (route.request().method() === "POST") {
        try { recus.push(JSON.parse(route.request().postData() || "{}")); } catch { recus.push(null); }
        return route.fulfill({
          status: 200, contentType: "application/json",
          body: JSON.stringify({ ok: true, push: "envoyee", nom: "Jacobo Fontan Cassas", signal: { requestedAt: Date.now(), par: "e2e@test.local" } }),
        });
      }
      return route.fallback();
    });
    await page.goto("/admin/appareils", { waitUntil: "domcontentloaded" });

    await expect(page.getByText("Jacobo Fontan Cassas").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("iPhone").first()).toBeVisible();
    /* Les compteurs du téléphone, et ceux du résumé en tête de page. */
    await expect(page.getByText(/3 envois de photos en attente/)).toBeVisible();
    await expect(page.getByText(/1 en échec/)).toBeVisible();
    /* La tuile du résumé sépare le chiffre de son libellé : on les lit
       ensemble dans leur conteneur. */
    await expect(page.locator("div", { hasText: /^3\s*photos en attente$/ }).first()).toBeVisible();
    /* Le rapport bloqué est nommé, avec un lien vers la fiche, et dit depuis quand. */
    await expect(page.locator(`a[href="/projet/${PROJET_ID}"]`)).toBeVisible();
    await expect(page.getByText(/finalisé il y a 30 h, PDF non envoyé/)).toBeVisible();

    await page.getByRole("button", { name: /Relancer/ }).click();
    await expect(page.getByText(/Relance envoyée à Jacobo Fontan Cassas : notification partie/)).toBeVisible({ timeout: 10_000 });

    expect(recus).toEqual([{ appareil: "tel-fictif-1", action: "relancer" }]);
  });
});
