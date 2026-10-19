/**
 * Le thème Signal est le même pour tous — réduit aux droits de chacun.
 *
 * Constaté le 19.10.2026 : sur le téléphone d'un collaborateur, Signal
 * n'était que le tableau de bord collaborateur aux couleurs de Signal ; le
 * vrai rendu Signal était réservé au compte administrateur. Désormais le
 * collaborateur reçoit le tableau de bord Signal de référence, sans ce que
 * ses droits lui refusent — et sans même appeler les routes réservées.
 */
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { brancherFixtures, seConnecter, sansServiceWorker, projetFictif, ADMIN, MONTEUR } from "./harnais";
import { TOUS_LES_DROITS } from "../src/lib/droits";

/** Les droits par défaut du profil « collaborateur » (src/lib/droits.ts). */
const REFUSES_AU_COLLABORATEUR = new Set([
  "projets.creer", "projets.supprimer", "carnet.supprimer", "tableau.activite", "stats.voir",
  "argent.voir", "argent.relances", "administration.comptes", "administration.droits",
]);

const ROUTES_RESERVEES = ["/api/admin/appareils", "/api/bexio/signaux", "/api/controles", "/api/user-activity", "/api/relance/trace", "/api/absences"];

function demain(): string {
  const d = new Date(); d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function ouvrir(page: Page, context: BrowserContext, compte: typeof ADMIN, theme: "signal" | "classic") {
  await sansServiceWorker(context);
  await seConnecter(context, compte);
  await context.addInitScript((t) => { try { localStorage.setItem("tm-ui-mode", t); } catch { /* ignore */ } }, theme);
  const trace = await brancherFixtures(page, {
    compte,
    projet: projetFictif({ collaborateurs: "Jacobo", dateMontage: `${demain()}T08:30:00.000+02:00`, etatCMD: "RDV fixé", nbCabines: 2 }),
  });
  if (compte.role !== "admin") {
    /* Le profil collaborateur, tel qu'il est défini — pas « tout accordé ». */
    await page.route("**/api/droits/moi", async (route) => {
      const ids = TOUS_LES_DROITS;
      const droits = Object.fromEntries(ids.map((id) => [id, REFUSES_AU_COLLABORATEUR.has(id) ? "non" : "oui"]));
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ email: compte.email, nom: compte.name, profil: "collaborateur", perimetre: "tous", droits }) });
    });
  }
  await page.goto("/", { waitUntil: "domcontentloaded" });
  return trace;
}

test.describe("thème Signal pour tous", () => {
  test("collaborateur en Signal : le tableau de bord Signal, sans ce qui lui est refusé", async ({ page, context }) => {
    test.setTimeout(60_000);
    const trace = await ouvrir(page, context, MONTEUR, "signal");
    await expect(page.locator("html")).toHaveAttribute("data-ui", "signal");
    await expect(page.locator(".sg-dash .sg-h1")).toHaveText("Tableau de bord", { timeout: 30_000 });
    /* Sa particularité : ses interventions d'abord. */
    await expect(page.locator(".sg-mes-interventions")).toContainText("Chantier de test E2E");
    /* Le reste de la référence Signal : agenda et rendez-vous à planifier. */
    await expect(page.locator(".sg-agenda")).toBeVisible();
    await expect(page.getByText("À planifier").first()).toBeVisible();
    /* Ce que ses droits refusent n'est pas affiché… */
    await expect(page.locator(".sg-card-title", { hasText: "Signaux" })).toHaveCount(0);
    await expect(page.getByText("Charge de la semaine")).toHaveCount(0);
    await expect(page.getByText("Disponibilité par collaborateur")).toHaveCount(0);
    /* … ni les tuiles réservées, quand on ouvre la grille complète. */
    await page.locator(".sg-cat", { hasText: "Tout" }).click();
    await expect(page.locator(".dash-grid")).toBeVisible();
    await expect(page.locator(".dash-grid").getByText("À facturer")).toHaveCount(0);
    await expect(page.locator(".dash-grid").getByText("Monteurs actifs")).toHaveCount(0);
    /* … et les routes réservées ne sont même pas appelées. */
    await page.waitForTimeout(2000);
    /* Les LECTURES : « user-activity » reçoit aussi, en POST, le signe de vie
       de chaque utilisateur — légitime, et sans rapport avec le tableau. */
    const lues = trace.appels.filter((a) => a.methode === "GET").map((a) => a.url);
    for (const r of ROUTES_RESERVEES) expect(lues, `${r} non lue`).not.toContain(r);
    /* Ni l'ancien écran collaborateur. */
    await expect(page.getByText(/^Bonjour Jacobo/)).toBeHidden();
  });

  test("collaborateur en Classique : son écran habituel, inchangé", async ({ page, context }) => {
    test.setTimeout(60_000);
    await ouvrir(page, context, MONTEUR, "classic");
    await expect(page.getByText(/Bonjour Jacobo/).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(".sg-dash")).toHaveCount(0);
  });

  test("administrateur en Signal : la référence, complète", async ({ page, context }) => {
    test.setTimeout(60_000);
    await ouvrir(page, context, ADMIN, "signal");
    await expect(page.locator(".sg-dash .sg-h1")).toHaveText("Tableau de bord", { timeout: 30_000 });
    await expect(page.locator(".sg-card-title", { hasText: "Signaux" })).toHaveCount(1);
    await expect(page.getByText("Charge de la semaine").first()).toBeVisible();
    await expect(page.locator(".sg-mes-interventions")).toHaveCount(0);
  });
});
