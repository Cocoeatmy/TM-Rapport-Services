/**
 * Le menu du profil, après le déménagement du 18 octobre 2026.
 *
 * Deux changements y ont été demandés, et tous deux touchent à des points
 * d'accès : déplacer n'est pas supprimer, et supprimer un doublon ne doit
 * pas supprimer la fonction. Ces tests tiennent la différence.
 *
 *   — « Journée hors ligne » (le nuage descendant) a quitté la barre du
 *     haut pour le menu. Son PANNEAU doit s'ouvrir depuis là, avec son
 *     bouton « Préparer la journée ».
 *   — « Pièces & Défauts » a quitté le menu, parce que le panneau
 *     « Signaux » y mène déjà. La PAGE doit rester accessible et intacte.
 */
import { test, expect } from "@playwright/test";
import { brancherFixtures, seConnecter, sansServiceWorker, ADMIN, MONTEUR } from "./harnais";

const MENU = 'div.z-\\[100\\].w-56';

async function ouvrirLeMenu(page: import("@playwright/test").Page) {
  await page.goto("/?mode=dashboard", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  await page.locator('button[aria-label="Mon compte"]').click();
  await expect(page.locator(MENU)).toBeVisible({ timeout: 10_000 });
}

for (const theme of ["signal"]) {
  test.describe(`menu du profil · ${theme}`, () => {
    test.beforeEach(async ({ context }) => {
      await sansServiceWorker(context);
      await context.addInitScript((t) => {
        try { localStorage.setItem("tm-ui-mode", t); } catch { /* ignore */ }
        document.documentElement.setAttribute("data-ui", t);
      }, theme);
      await seConnecter(context, ADMIN);
    });

    test("pour l'ADMINISTRATEUR, le nuage a quitté la barre du haut", async ({ page }) => {
      await brancherFixtures(page, { compte: ADMIN });
      await page.goto("/?mode=dashboard", { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1500);
      await expect(page.locator("header .sgh-off"),
        "depuis le bureau, il vit dans le menu").toHaveCount(0);
    });

    test("« Journée hors ligne » est dans le menu, et son panneau s'ouvre", async ({ page }) => {
      await brancherFixtures(page, { compte: ADMIN });
      await ouvrirLeMenu(page);

      const entree = page.locator(MENU).getByText("Journée hors ligne");
      await expect(entree, "l'entrée doit exister dans le menu").toBeVisible();

      await entree.click();

      /* Le panneau s'ouvre — c'est le MÊME que celui de l'ancien bouton :
         on le reconnaît à son action, qui est tout l'intérêt du bouton. */
      const preparer = page.getByRole("button", { name: /Préparer la journée/ });
      await expect(preparer, "le panneau hors ligne doit s'ouvrir depuis le menu")
        .toBeVisible({ timeout: 10_000 });

      /* Et il se déplie DANS le menu, qui reste ouvert : une bulle
         flottante aurait recouvert la liste dont elle sort. */
      await expect(page.locator(MENU), "le menu reste ouvert").toHaveCount(1);
      await expect(page.locator(MENU).locator("button", { hasText: /Préparer la journée/ }),
        "le panneau doit être DANS le menu, pas par-dessus").toHaveCount(1);

      /* On le replie en recliquant : l'entrée est une bascule. */
      await entree.click();
      await expect(preparer).toHaveCount(0);
    });

    test("« Pièces & Défauts » a disparu du menu", async ({ page }) => {
      await brancherFixtures(page, { compte: ADMIN });
      await ouvrirLeMenu(page);
      await expect(page.locator(MENU).getByText(/Pièces\s*&\s*Défauts/i),
        "le doublon ne doit plus figurer dans le menu").toHaveCount(0);
    });

    test("…mais la page reste accessible, et depuis « Signaux »", async ({ page }) => {
      await brancherFixtures(page, { compte: ADMIN });

      /* 1. Le raccourci de « Signaux » existe et pointe au bon endroit. */
      await page.goto("/?mode=dashboard", { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1500);
      const lien = page.locator('a[href="/admin/pieces-defauts"]');
      await expect(lien.first(), "la ligne « Pièces & défauts » doit rester dans Signaux")
        .toHaveCount(1, { timeout: 15_000 });

      /* 2. Et la page répond toujours, avec ses droits. */
      const r = await page.goto("/admin/pieces-defauts", { waitUntil: "domcontentloaded" });
      expect(r?.status(), "la page ne doit pas avoir été supprimée").toBeLessThan(400);
      await expect(page.locator("body")).not.toContainText("404", { timeout: 5000 });
    });
  });
}

/* ── Et pour un MONTEUR ────────────────────────────────────────────────────
   Lui ne passe pas par un menu avant de monter dans la camionnette : le
   nuage reste dans la barre du haut, à portée de pouce. C'est la demande du
   18 octobre, et ces deux tests sont là pour qu'on ne le lui reprenne pas
   par inadvertance. */
test.describe("le nuage hors ligne, côté monteur · signal", () => {
  test.beforeEach(async ({ context }) => {
    await sansServiceWorker(context);
    await context.addInitScript(() => {
      try { localStorage.setItem("tm-ui-mode", "signal"); } catch { /* ignore */ }
      document.documentElement.setAttribute("data-ui", "signal");
    });
    await seConnecter(context, MONTEUR);
  });

  test("reste dans la barre du haut", async ({ page }) => {
    await brancherFixtures(page, { compte: MONTEUR });
    await page.goto("/?mode=dashboard", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    await expect(page.locator("header .sgh-off"),
      "le monteur doit le garder sous le pouce").toHaveCount(1);
  });

  test("et n'apparaît PAS une seconde fois dans son menu", async ({ page }) => {
    /* Un même bouton en double est un bouton dont on ne sait plus lequel
       est le bon. */
    await brancherFixtures(page, { compte: MONTEUR });
    await page.goto("/?mode=dashboard", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    await page.locator('button[aria-label="Mon compte"]').click();
    await expect(page.locator(MENU)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(MENU).getByText("Journée hors ligne")).toHaveCount(0);
  });
});
