/**
 * Les zones d'envoi acceptent tout fichier : un bon de livraison en PDF part
 * directement vers Cloudinary (« raw »), s'enregistre sur la fiche et
 * s'affiche comme un document — jamais comme une image cassée.
 */
import { test, expect } from "@playwright/test";
import { brancherFixtures, seConnecter, sansServiceWorker, PROJET_ID } from "./harnais";

test("bon de livraison : un PDF est accepté, envoyé en direct et affiché comme document", async ({ page, context }) => {
  test.setTimeout(60_000);
  await sansServiceWorker(context);
  await seConnecter(context);
  const trace = await brancherFixtures(page);
  const cloudinary: string[] = [];
  await page.route("**api.cloudinary.com/**", (r) => {
    cloudinary.push(new URL(r.request().url()).pathname);
    return r.fulfill({ contentType: "application/json", body: JSON.stringify({ secure_url: "https://res.cloudinary.com/c/raw/upload/v1/tm-rapport/x/livraisons/Bon.pdf" }) });
  });
  await page.goto(`/projet/${PROJET_ID}?mode=cmd`, { waitUntil: "domcontentloaded" });
  const bouton = page.getByRole("button", { name: /Scanner ou joindre le bon de livraison/ }).first();
  await expect(bouton).toBeVisible({ timeout: 30_000 });
  /* Le champ n'est plus limité aux images, ni forcé sur l'appareil photo. */
  const champ = bouton.locator("xpath=following-sibling::input[@type='file']");
  await expect(champ).not.toHaveAttribute("accept", /.+/);
  await expect(champ).not.toHaveAttribute("capture", /.+/);
  await champ.setInputFiles({ name: "Bon.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF") });

  await expect(page.getByText("Joint", { exact: true }).first()).toBeVisible({ timeout: 20_000 });
  expect(cloudinary.some((p) => p.endsWith("/raw/upload")), "envoyé en « raw », directement").toBe(true);
  const patch = trace.appels.find((a) => a.methode === "PATCH" && (a.corps as { bonLivraison?: string })?.bonLivraison);
  expect((patch?.corps as { bonLivraison: string }).bonLivraison).toContain("/raw/upload/");
  const vignette = page.locator('img[alt="Bon de livraison"]').first();
  await expect(vignette).toHaveAttribute("src", /^data:image\/svg\+xml/);
});
