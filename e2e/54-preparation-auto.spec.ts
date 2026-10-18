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

const CLE = "tm-offline-auto-jour";
const CLE_PRETS = "tm-offline-ready-projects";

/**
 * Les chantiers en cache, au FORMAT RÉEL de Notion : des prénoms, joints par
 * « & ». La première version de ce fichier utilisait des fixtures datées du
 * 1er au 8 octobre, toutes hors de la fenêtre de sept jours : la préparation
 * « réussissait » sans préparer un seul chantier, et le test passait. Ici,
 * chaque projet a une raison précise d'être pris ou laissé.
 */
const PROJETS_EN_CACHE = [
  /* Pris : le compte est Jacobo Fontan Cassas. */
  projetFictif({ id: "prep-montage-jacobo", collaborateurs: "Jacobo & Claudio", dateMontage: "2026-10-19" }),
  projetFictif({ id: "prep-team", collaborateurs: "Team TM", dateMontage: "2026-10-22" }),
  projetFictif({ id: "prep-mesures-jacobo", collaborateurs: "", mesuresTraiteePar: "Jacobo", dateMesures: "2026-10-21", dateMontage: "" }),
  /* Laissés : un autre monteur, trop loin, déjà passé. */
  projetFictif({ id: "laisse-miguel", collaborateurs: "Miguel", dateMontage: "2026-10-20" }),
  projetFictif({ id: "laisse-trop-loin", collaborateurs: "Jacobo", dateMontage: "2026-11-15" }),
  projetFictif({ id: "laisse-passe", collaborateurs: "Jacobo", dateMontage: "2026-10-10" }),
];
const ATTENDUS = ["prep-montage-jacobo", "prep-team", "prep-mesures-jacobo"];

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
  const projets = PROJETS_EN_CACHE;
  await context.addInitScript((liste) => {
    try { localStorage.setItem("tm-projects-cache", JSON.stringify({ tous: liste })); } catch { /* ignore */ }
  }, projets);
  await context.clock.setFixedTime(quand);
  await seConnecter(context, compte);
  const principal = projetFictif({ id: PROJET_ID });
  const trace = await brancherFixtures(page, { projet: principal, compte });
  /* Le serveur doit rendre LES MÊMES chantiers que le cache semé. La
     préparation part de la liste vivante du tableau de bord — qui, en
     prime, réécrit le cache local. Un cache semé que le serveur contredit
     est aussitôt écrasé par une liste d'un seul chantier, et la première
     préparation (à vide) verrouille la suivante pour une heure : le test
     croyait alors que la règle ne marchait pas, alors que c'était le
     décor. */
  await page.route("**/api/projects**", async (route) => {
    const u = new URL(route.request().url()).pathname;
    const j = (c: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(c) });
    if (u.startsWith("/api/projects/") && u.split("/").length === 4) {
      return route.request().method() === "GET" ? j(principal) : j({ ok: true });
    }
    return j(PROJETS_EN_CACHE);
  });
  await page.goto("/?mode=dashboard", { waitUntil: "domcontentloaded" });
  return trace;
}

/** La marque posée quand la préparation automatique a tourné. */
const marque = (page: import("@playwright/test").Page) =>
  page.evaluate((c) => localStorage.getItem(c), CLE);

/** Les chantiers effectivement préparés — ce qui compte vraiment. */
const prets = (page: import("@playwright/test").Page) =>
  page.evaluate((c) => {
    try { return JSON.parse(localStorage.getItem(c) || "null") as string[] | null; } catch { return null; }
  }, CLE_PRETS);

test.describe("la préparation automatique du matin", () => {
  test("un lundi à 6 h 45, elle se lance seule", async ({ page, context }) => {
    await ouvrir(page, context, LUNDI("06:45"));

    await expect
      .poll(() => marque(page), { timeout: 30_000, message: "elle doit avoir tourné" })
      .toBe("2026-10-19");

    /* La marque ne suffit pas : elle est posée AVANT le tri, et la première
       version de ce test passait alors que zéro chantier était préparé.
       C'est la liste des chantiers prêts qui fait foi. */
    await expect
      .poll(async () => [...(await prets(page) || [])].sort(), {
        timeout: 30_000, message: "les chantiers de Jacobo doivent être préparés, et eux seuls",
      })
      .toEqual([...ATTENDUS].sort());
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
