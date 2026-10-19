/**
 * La navigation de l'app iPhone (barre du bas) — et seulement d'elle.
 *
 * L'app Apple se signale par « TMRapportApp/1.0 (iOS) » dans l'identité de
 * son navigateur. Un navigateur ordinaire, même au gabarit d'un iPhone, ne
 * doit rien voir changer.
 */
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { brancherFixtures, seConnecter, sansServiceWorker, ADMIN, MONTEUR } from "./harnais";
import { TOUS_LES_DROITS } from "../src/lib/droits";

const UA_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const UA_APP = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) TMRapportApp/1.0 (iOS)";
const REFUSES = new Set(["projets.creer", "projets.supprimer", "carnet.supprimer", "tableau.activite", "stats.voir",
  "argent.voir", "argent.relances", "administration.comptes", "administration.droits"]);

async function ouvrir(page: Page, context: BrowserContext, compte: typeof ADMIN, chemin = "/") {
  await sansServiceWorker(context);
  await seConnecter(context, compte);
  await context.addInitScript(() => { try { localStorage.setItem("tm-ui-mode", "signal"); } catch { /* ignore */ } });
  await brancherFixtures(page, { compte });
  if (compte.role !== "admin") {
    await page.route("**/api/droits/moi", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({
      email: compte.email, nom: compte.name, profil: "collaborateur", perimetre: "tous",
      droits: Object.fromEntries(TOUS_LES_DROITS.map((id) => [id, REFUSES.has(id) ? "non" : "oui"])) }) }));
  }
  await page.goto(chemin, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
}
const barre = (page: Page) => page.locator("nav.tm-ios-barre");
const marquer = (page: Page) => page.evaluate(() => { (window as unknown as { __m: number }).__m = 1; });
const marque = (page: Page) => page.evaluate(() => (window as unknown as { __m?: number }).__m ?? null);

test.describe("app iPhone", () => {
  test.use({ userAgent: UA_APP, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("barre du bas et en-tête simplifié : ✨ … 🔔 🔄 🔍", async ({ page, context }) => {
    await ouvrir(page, context, MONTEUR);
    await expect(page.locator("html")).toHaveAttribute("data-app", "ios");
    await expect(barre(page)).toBeVisible();
    await expect(barre(page).locator(".tm-ios-onglet")).toHaveCount(5);
    for (const l of ["Accueil", "Planning", "Projets", "Profil"]) await expect(barre(page)).toContainText(l);
    /* La barre ne déborde pas, et reste dans l'écran. */
    const b = (await barre(page).boundingBox())!;
    expect(b.x).toBe(0); expect(b.width).toBe(390); expect(b.y + b.height).toBeLessThanOrEqual(844);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    /* En-tête : plus d'Accueil, ni de seconde barre d'onglets. */
    await expect(page.locator(".tm-h-accueil")).toBeHidden();
    await expect(page.locator(".tm-onglets-principaux")).toBeHidden();
    await expect(page.locator(".tm-h-repli")).toBeHidden();
    /* Ordre : notifications, actualiser, recherche — la recherche au bord droit. */
    const x = async (sel: string) => (await page.locator(sel).locator("button").first().boundingBox())!.x;
    const [cloche, actualiser, recherche] = [await x(".tm-h-notifications"), await x(".tm-h-actualiser"), await x(".tm-h-recherche")];
    expect(cloche).toBeLessThan(actualiser);
    expect(actualiser).toBeLessThan(recherche);
  });

  test("Planning puis Accueil : changement de rubrique sans rechargement", async ({ page, context }) => {
    await ouvrir(page, context, MONTEUR);
    await marquer(page);
    await barre(page).getByText("Planning").click();
    await expect(page).toHaveURL(/mode=calendrier/);
    await expect(barre(page).locator(".tm-ios-onglet.is-actif")).toContainText("Planning");
    await barre(page).getByText("Accueil").click();
    await expect(page).not.toHaveURL(/mode=/);
    expect(await marque(page), "aucun rechargement").toBe(1);
  });

  test("Projets : les rubriques, puis une sous-rubrique avec ses sous-onglets", async ({ page, context }) => {
    await ouvrir(page, context, MONTEUR);
    await marquer(page);
    await barre(page).getByText("Projets").click();
    const feuille = page.locator(".tm-ios-feuille");
    for (const r of ["Services", "CRM", "Grossistes", "Fournisseurs", "Kanban", "Déstockage", "Chantiers PPE"]) {
      await expect(feuille.locator(".tm-ios-rubrique", { hasText: r })).toBeVisible();
    }
    await feuille.locator(".tm-ios-rubrique", { hasText: "Services" }).click();
    await feuille.locator(".tm-ios-puce", { hasText: "Montages" }).click();
    await expect(page).toHaveURL(/mode=cmd/);
    await expect(feuille).toHaveCount(0);
    /* Le sous-menu existant (Mesures / Montages / Services / SAV) est là. */
    await expect(page.locator(".nav-sub-chip", { hasText: "Montages" })).toBeVisible();
    expect(await marque(page)).toBe(1);
  });

  test("collaborateur : « + » explique au lieu d'ouvrir ; Profil sans Statistiques ni administration", async ({ page, context }) => {
    await ouvrir(page, context, MONTEUR);
    await barre(page).getByLabel("Nouveau projet").click();
    await expect(page.getByText("La création de projets est réservée aux comptes autorisés.")).toBeVisible();
    await barre(page).getByText("Profil").click();
    const menu = page.locator(".tm-menu-profil");
    await expect(menu).toBeVisible();
    await expect(menu).toContainText("Informations sur l'application");
    await expect(menu).toContainText("Synchronisation");
    await expect(menu).toContainText("Déconnexion");
    await expect(menu).not.toContainText("Statistiques");
    await expect(menu).not.toContainText("Droits d'accès");
    /* Le menu est en feuille au-dessus de la barre, pas sous un bouton caché. */
    const m = (await menu.boundingBox())!, b = (await barre(page).boundingBox())!;
    expect(m.y + m.height).toBeLessThanOrEqual(b.y + 1);
  });

  test("administrateur : « + » ouvre la création existante ; Statistiques dans le profil", async ({ page, context }) => {
    await ouvrir(page, context, ADMIN);
    await barre(page).getByLabel("Nouveau projet").click();
    await expect(page.locator(".fixed.inset-0.z-\\[200\\]")).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press("Escape");
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    await marquer(page);
    await barre(page).getByText("Profil").click();
    await page.locator(".tm-menu-profil").getByText("Statistiques").click();
    await expect(page).toHaveURL(/mode=stats/);
    expect(await marque(page)).toBe(1);
  });
});

test.describe("navigateur ordinaire (Safari iPhone)", () => {
  test.use({ userAgent: UA_SAFARI, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("rien ne change : pas de barre du bas, en-tête et onglets d'aujourd'hui", async ({ page, context }) => {
    await ouvrir(page, context, MONTEUR);
    await expect(page.locator("html")).not.toHaveAttribute("data-app", /.*/);
    await expect(barre(page)).toHaveCount(0);
    await expect(page.locator(".tm-onglets-principaux")).toBeVisible();
    await expect(page.locator(".tm-h-accueil a, .tm-h-accueil button").first()).toBeVisible();
  });
});
