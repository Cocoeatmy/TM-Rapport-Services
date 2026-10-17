import { test, expect } from "@playwright/test";
import { brancherFixtures, seConnecter, PROJET_ID } from "./harnais";

test.describe("le harnais lui-même", () => {
  test("le serveur de test répond et la session fabriquée est acceptée", async ({ page, context }) => {
    await seConnecter(context);
    const trace = await brancherFixtures(page);
    const reponse = await page.goto(`/projet/${PROJET_ID}?mode=cmd`);

    /* Pas de renvoi vers /login : le middleware a bien accepté le jeton. */
    expect(page.url()).not.toContain("/login");
    expect(reponse?.status()).toBeLessThan(400);
    /* Et le client a bien commencé à parler à ses fixtures. */
    await expect.poll(() => trace.appels.length, { timeout: 20_000 }).toBeGreaterThan(0);
  });
});
