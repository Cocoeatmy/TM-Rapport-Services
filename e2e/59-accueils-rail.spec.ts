/**
 * Mac (thème Signal, rail) : chaque rubrique du rail ouvre sa PAGE D'ACCUEIL
 * en cartes (20.10.2026) — Projets (rubriques + états), CRM (4 carnets),
 * Grossistes et Fournisseurs (logos) — et les cartes mènent aux listes.
 */
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { brancherFixtures, seConnecter, sansServiceWorker, ADMIN } from "./harnais";

async function ouvrir(page: Page, context: BrowserContext) {
  await sansServiceWorker(context);
  await seConnecter(context, ADMIN);
  await context.addInitScript(() => { try { localStorage.setItem("tm-ui-mode", "signal"); } catch { /* ignore */ } });
  await brancherFixtures(page, { compte: ADMIN });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
}
const rail = (page: Page, label: string) => page.locator(`nav.signal-rail button[aria-label="${label}"]`);

test.describe("rail Signal : pages d'accueil en cartes", () => {
  test("Projets : rubriques puis états ; une carte ouvre sa liste, « États » revient", async ({ page, context }) => {
    await ouvrir(page, context);
    await expect(rail(page, "Services")).toHaveCount(0);
    await rail(page, "Projets").click();
    await expect(page.locator(".tm-accueil-titre h2", { hasText: "Projets" })).toBeVisible();
    for (const r of ["Mesures", "Montages", "Services", "SAV"]) await expect(page.locator(".tm-etat-bouton.is-rubrique", { hasText: r })).toBeVisible();
    await expect(page.locator(".tm-etat-bouton.is-tous")).toBeVisible();
    await page.waitForTimeout(700);
    await page.screenshot({ path: "test-results/mac-projets.png" });
    await page.locator(".tm-etat-bouton.is-tous").click();
    await expect(page.locator(".tm-etats-retour")).toBeVisible();
    await page.locator(".tm-etats-retour").click();
    await expect(page.locator(".tm-etat-bouton.is-tous")).toBeVisible();
    /* Une rubrique : la liste des mesures, comme avant. */
    await page.locator(".tm-etat-bouton.is-rubrique", { hasText: "Mesures" }).click();
    await expect(page).toHaveURL(/mode=mesures/);
  });

  test("CRM : quatre cartes qui ouvrent chaque carnet", async ({ page, context }) => {
    await ouvrir(page, context);
    await rail(page, "CRM").click();
    const cartes = page.locator(".tm-accueil[aria-label='CRM'] .tm-etat-bouton");
    await expect(cartes).toHaveCount(4);
    await page.waitForTimeout(700);
    await page.screenshot({ path: "test-results/mac-crm.png" });
    await cartes.filter({ hasText: "Entreprises" }).click();
    await expect(page).toHaveURL(/mode=clients-entreprises/);
  });

  test("Grossistes et Fournisseurs : les logos en cartes, avec leurs icônes d'entrepôt et d'usine", async ({ page, context }) => {
    await ouvrir(page, context);
    await rail(page, "Grossistes").click();
    await expect(page.locator(".tm-etat-bouton.is-logo")).toHaveCount(5);
    await page.waitForTimeout(700);
    await page.screenshot({ path: "test-results/mac-grossistes.png" });
    await page.locator(".tm-etat-bouton.is-logo[aria-label='Dubat']").click();
    await expect(page).toHaveURL(/mode=grossistes-dubat/);
    /* La rangée de logos ne double plus la page d'accueil en logos. */
    await page.waitForTimeout(300);
    await expect(page.locator(".nav-submenu img")).toHaveCount(0);
    await rail(page, "Fournisseurs").click();
    await expect(page.locator(".tm-etat-bouton.is-logo")).toHaveCount(9);
    await page.waitForTimeout(700);
    await page.screenshot({ path: "test-results/mac-fournisseurs.png" });
    await expect(rail(page, "Grossistes").locator("svg")).toHaveClass(/lucide-warehouse/);
    await expect(rail(page, "Fournisseurs").locator("svg")).toHaveClass(/lucide-factory/);
  });
});
