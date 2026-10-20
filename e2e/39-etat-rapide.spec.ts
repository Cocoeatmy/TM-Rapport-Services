/**
 * « RDV Mesures à fixer » : l'état se change d'un clic, et chaque état de la
 * colonne Notion est proposé en filtre.
 */
import { test, expect } from "@playwright/test";
import { brancherFixtures, seConnecter, sansServiceWorker, projetFictif, ADMIN } from "./harnais";

const ETATS = ["Pas contacté", "Contact sans réponse", "OFR envoyée sans mesures", "Mesures non relevées - attendre news",
  "RDV - Fixé", "RDV - Attendre news", "Mesures partielles", "Mesures relevées - attente news", "Annulé", "Projet sans mesures", "Terminé"];

test("état cliquable, enregistré dans Notion, et tous les états en filtre", async ({ page, context }) => {
  test.setTimeout(60_000);
  await sansServiceWorker(context);
  await seConnecter(context, ADMIN);
  await context.addInitScript(() => { try { localStorage.setItem("tm-ui-mode", "signal"); } catch { /* ignore */ } });
  const trace = await brancherFixtures(page, { compte: ADMIN, projet: projetFictif({
    etatMesures: "Pas contacté", etatCMD: "En attente de mesures", dateMesuresRecue: "2026-10-10", dateMontage: null,
  }) });
  await page.route("**/api/notion/schema**", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({
    champs: [{ nom: "État - Mesures", options: ETATS.map((nom) => ({ nom })) }] }) }));
  let refuser = false;
  await page.route(/\/api\/projects\/[0-9a-f-]{36}$/, async (r) => {
    if (r.request().method() !== "PATCH") return r.fallback();
    if (refuser) return r.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: 'Invalid status option. Status option "Rappeler lundi" does not exist' }) });
    trace.appels.push({ methode: "PATCH", url: new URL(r.request().url()).pathname, corps: JSON.parse(r.request().postData() || "{}") });
    return r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator(".sg-tile", { hasText: "RDV Mesures à fixer" }).first().click();

  /* Tous les états de la colonne, en filtre. */
  for (const e of ["Pas contacté", "Mesures partielles", "Projet sans mesures", "Terminé"]) {
    await expect(page.locator(".sg-chips .sg-chip", { hasText: e }).first()).toBeVisible({ timeout: 15_000 });
  }

  /* La pastille de la ligne : un clic, le menu des états, un choix. */
  const pastille = page.locator(".sg-state-btn", { hasText: "Pas contacté" }).first();
  await pastille.click();
  await expect(page.locator(".sg-etatsav-menu")).toBeVisible();
  await page.locator(".sg-etatsav-item", { hasText: "Contact sans réponse" }).click();
  await expect(page.locator(".sg-state-btn", { hasText: "Contact sans réponse" }).first()).toBeVisible();
  const patch = trace.appels.find((a) => a.methode === "PATCH" && (a.corps as { etatMesures?: string })?.etatMesures);
  expect((patch?.corps as { etatMesures: string }).etatMesures).toBe("Contact sans réponse");

  /* Valeur libre inconnue de la colonne « statut » : l'explication, pas un code d'erreur. */
  refuser = true;
  await page.locator(".sg-state-btn", { hasText: "Contact sans réponse" }).first().click();
  await page.getByLabel("Autre état").fill("Rappeler lundi");
  await page.getByLabel("Autre état").press("Enter");
  await expect(page.getByText(/n'existe pas dans la colonne « État - Mesures » de Notion/)).toBeVisible();
});
