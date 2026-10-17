/**
 * Sur iPhone : l'affichage, et ce que l'application dit quand elle ne peut
 * PAS garder une signature.
 *
 * Le WebKit embarqué par Playwright refuse de stocker un `Blob` dans
 * IndexedDB (le même enregistrement passe avec un tableau d'octets). C'est
 * une limite de l'outil — Safari sur un vrai iPhone le fait, et
 * l'application s'en sert tous les jours pour ses photos.
 *
 * Mais cette limite reproduit exactement la panne qu'on redoute le plus :
 * le stockage refuse. C'est donc l'occasion de vérifier, dans un vrai
 * navigateur, la promesse la plus importante de toute cette campagne :
 *
 *     l'application ne dit JAMAIS qu'une donnée est enregistrée
 *     quand elle ne l'est pas.
 */
import { test, expect } from "@playwright/test";
import { brancherFixtures, sansServiceWorker, seConnecter, PROJET_ID } from "./harnais";

test.describe("la fiche sur un écran d'iPhone", () => {
  test("s'affiche entièrement et sans débordement horizontal", async ({ page, context }) => {
    await sansServiceWorker(context);
    await seConnecter(context);
    await brancherFixtures(page);
    await page.goto(`/projet/${PROJET_ID}?mode=cmd`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Chantier de test E2E").first()).toBeVisible({ timeout: 30_000 });

    /* Rien ne doit dépasser à droite : c'est le défaut qui rend une page
       illisible au doigt, et qu'on a déjà corrigé ailleurs. */
    const debordement = await page.evaluate(() => ({
      largeur: document.documentElement.clientWidth,
      contenu: document.documentElement.scrollWidth,
    }));
    expect(debordement.contenu, "la page ne doit pas déborder à droite")
      .toBeLessThanOrEqual(debordement.largeur + 1);
  });

  test("le rapport et la carte de signature s'ouvrent au doigt", async ({ page, context }) => {
    await sansServiceWorker(context);
    await seConnecter(context);
    await brancherFixtures(page);
    await page.goto(`/projet/${PROJET_ID}?mode=cmd`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Chantier de test E2E").first()).toBeVisible({ timeout: 30_000 });

    await page.getByText(/Consulter le rapport de montage/).first().tap();
    const carte = page.locator("#signature-card");
    await expect(carte).toBeVisible({ timeout: 15_000 });
    await carte.locator("button").first().tap();
    await expect(page.getByText("Signez ici")).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("quand le stockage de l'appareil refuse", () => {
  test("l'application dit que la signature n'est PAS enregistrée", async ({ page, context }) => {
    await sansServiceWorker(context);
    await seConnecter(context);
    await brancherFixtures(page);
    await page.goto(`/projet/${PROJET_ID}?mode=cmd`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Chantier de test E2E").first()).toBeVisible({ timeout: 30_000 });

    await page.getByText(/Consulter le rapport de montage/).first().click();
    const carte = page.locator("#signature-card");
    await expect(carte).toBeVisible({ timeout: 15_000 });
    await carte.locator("button").first().click();
    await expect(page.getByText("Signez ici")).toBeVisible({ timeout: 10_000 });

    /* On signe. Le stockage refusera le blob — c'est la panne qu'on veut. */
    const boite = await carte.locator("canvas").boundingBox();
    await page.mouse.move(boite!.x + 30, boite!.y + 60);
    await page.mouse.down();
    await page.mouse.move(boite!.x + 120, boite!.y + 100, { steps: 6 });
    await page.mouse.up();
    await page.getByText(/Valider la signature/).click();

    /* LA promesse : l'écran l'avoue, en toutes lettres. */
    await expect(page.getByText(/NON enregistrée/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Prévenez le bureau/).first()).toBeVisible();

    /* Et surtout, il ne prétend PAS le contraire. */
    await expect(page.getByText("Signature enregistrée")).toHaveCount(0);
    await expect(page.getByText(/en attente d'envoi/i)).toHaveCount(0);
  });
});
