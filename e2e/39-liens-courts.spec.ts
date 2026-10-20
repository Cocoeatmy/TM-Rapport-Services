/**
 * Les liens courts du calendrier (/f, /s, /sav, /sig) partent tout de suite.
 *
 * Constaté le 20.10.2026 : le lien du rendez-vous mettait souvent plusieurs
 * secondes à ouvrir la fiche — la page attendait d'avoir chargé tout le code
 * de l'app (qui change à chaque mise en ligne) avant de rediriger. La
 * redirection part désormais dès la lecture de la page.
 */
import { test, expect } from "@playwright/test";
import { PROJET_ID } from "./harnais";

const jeton = Buffer.from(PROJET_ID).toString("base64url");

test("navigateur : redirection vers le PDF sans attendre le code de l'app", async ({ page }) => {
  /* Le code de l'app ne se charge PAS : seule la redirection immédiate peut agir. */
  await page.route("**/_next/static/**", (r) => r.abort());
  let demande = "";
  await page.route("**/api/fiche/**", (r) => { demande = r.request().url(); return r.fulfill({ contentType: "application/pdf", body: "%PDF-1.4\n%%EOF" }); });
  const debut = Date.now();
  await page.goto(`/f/${jeton}`, { waitUntil: "commit" });
  await expect.poll(() => demande, { timeout: 10_000 }).toContain(`/api/fiche/${PROJET_ID}?s=`);
  expect(Date.now() - debut).toBeLessThan(5_000);
});

test("app de l'écran d'accueil : la page reste, avec le document et le chantier", async ({ page, context }) => {
  await context.addInitScript(() => { Object.defineProperty(navigator, "standalone", { get: () => true, configurable: true }); });
  let demande = "";
  await page.route("**/api/fiche/**", (r) => { demande = r.request().url(); return r.fulfill({ contentType: "application/pdf", body: "%PDF-1.4\n%%EOF" }); });
  await page.goto(`/f/${jeton}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Ouvrir le document (PDF)")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Ouvrir le chantier dans l'app")).toBeVisible();
  expect(demande, "aucune redirection en fenêtre autonome").toBe("");
});
