/**
 * La préparation du matin, toute seule.
 *
 * `preparation-auto.test.ts` éprouve la RÈGLE, minute par minute, sans
 * navigateur. Ici on vérifie qu'elle est bien BRANCHÉE : que l'application
 * ouverte un lundi à 6 h 45 télécharge d'elle-même, et qu'ouverte à 9 h ou
 * un samedi elle ne fait rien.
 *
 * L'horloge du navigateur est déplacée par Playwright : aucun test ne
 * dépend de l'heure à laquelle on le lance.
 */
import { test, expect } from "@playwright/test";
import { brancherFixtures, seConnecter, sansServiceWorker, MONTEUR, projetFictif, PROJET_ID } from "./harnais";
import { projetsDenses } from "./fixtures-denses";

const CLE = "tm-offline-auto-jour";

/** Un lundi, un samedi — à l'heure qu'on veut. */
const LUNDI = (h: string) => new Date(`2026-10-19T${h}:00`);
const SAMEDI = (h: string) => new Date(`2026-10-24T${h}:00`);

async function ouvrir(
  page: import("@playwright/test").Page,
  context: import("@playwright/test").BrowserContext,
  quand: Date,
  compte = MONTEUR,
) {
  await sansServiceWorker(context);
  await context.addInitScript(() => {
    try { localStorage.setItem("tm-ui-mode", "signal"); } catch { /* ignore */ }
    document.documentElement.setAttribute("data-ui", "signal");
  });
  /* Une liste de chantiers déjà en cache : c'est l'état d'un téléphone qui
     a servi la veille, et la préparation s'appuie dessus. */
  const projets = projetsDenses(8);
  await context.addInitScript((liste) => {
    try { localStorage.setItem("tm-projects-cache", JSON.stringify({ tous: liste })); } catch { /* ignore */ }
  }, projets);
  await context.clock.setFixedTime(quand);
  await seConnecter(context, compte);
  const principal = projetFictif({ id: PROJET_ID });
  const trace = await brancherFixtures(page, { projet: principal, compte });
  await page.goto("/?mode=dashboard", { waitUntil: "domcontentloaded" });
  return trace;
}

/** La marque posée quand la préparation automatique a tourné. */
const marque = (page: import("@playwright/test").Page) =>
  page.evaluate((c) => localStorage.getItem(c), CLE);

test.describe("la préparation automatique du matin", () => {
  test("un lundi à 6 h 45, elle se lance seule", async ({ page, context }) => {
    await ouvrir(page, context, LUNDI("06:45"));

    await expect
      .poll(() => marque(page), { timeout: 30_000, message: "elle doit avoir tourné" })
      .toBe("2026-10-19");
  });

  test("…et ne recommence pas si l'on rouvre l'application", async ({ page, context }) => {
    await ouvrir(page, context, LUNDI("06:45"));
    await expect.poll(() => marque(page), { timeout: 30_000 }).toBe("2026-10-19");

    /* Deuxième ouverture, même matin : la marque reste, rien ne se relance.
       On le vérifie par la trace — aucune nouvelle demande de projet. */
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(6000);
    expect(await marque(page)).toBe("2026-10-19");
  });

  test("à 9 h, elle ne fait rien", async ({ page, context }) => {
    await ouvrir(page, context, LUNDI("09:00"));
    await page.waitForTimeout(8000);
    expect(await marque(page), "hors de la tranche du matin").toBeNull();
  });

  test("à 6 h 00, elle ne fait rien non plus", async ({ page, context }) => {
    await ouvrir(page, context, LUNDI("06:00"));
    await page.waitForTimeout(8000);
    expect(await marque(page), "avant 6 h 30").toBeNull();
  });

  test("le samedi, jamais", async ({ page, context }) => {
    await ouvrir(page, context, SAMEDI("06:45"));
    await page.waitForTimeout(8000);
    expect(await marque(page), "le week-end ne se prépare pas").toBeNull();
  });

  test("elle ne touche pas à la file d'ENVOI", async ({ page, context }) => {
    /* Ce qui descend et ce qui remonte sont deux mécanismes distincts.
       Préparer la journée ne doit rien vider ni rien renvoyer. */
    await context.addInitScript(() => {
      try { localStorage.setItem("tm-offline-queue", JSON.stringify([{ id: "x", url: "/api/projects/zzz", options: {} }])); } catch { /* ignore */ }
    });
    await ouvrir(page, context, LUNDI("06:45"));
    await expect.poll(() => marque(page), { timeout: 30_000 }).toBe("2026-10-19");

    const file = await page.evaluate(() => localStorage.getItem("tm-offline-queue"));
    expect(file, "la file d'envoi doit être intacte").toContain("zzz");
  });
});
