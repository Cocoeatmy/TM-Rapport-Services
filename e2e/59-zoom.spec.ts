import { test } from "@playwright/test";
import { brancherFixtures, seConnecter, sansServiceWorker, ADMIN, projetFictif, PROJET_ID } from "./harnais";
import { projetsDenses } from "./fixtures-denses";
import { GABARITS, type NomGabarit } from "./sonde-affichage";

const GAB = (process.env.TM_GAB || "ipad-11-portrait") as NomGabarit;
const SEL = process.env.TM_SEL || ".sg-dispo";
const OUT = process.env.TM_OUT || "e2e-rapport/zoom.png";

test.skip(!process.env.TM_SEL && !process.env.TM_ZOOM, "outil de loupe : lancer avec TM_SEL=<sélecteur>");

test("zoom sur un bloc", async ({ page, context }) => {
  test.setTimeout(180_000);
  await sansServiceWorker(context);
  if (process.env.TM_THEME) {
    await context.addInitScript((t) => {
      try { localStorage.setItem("tm-ui-mode", t); } catch { /* ignore */ }
      document.documentElement.setAttribute("data-ui", t);
    }, process.env.TM_THEME);
  }
  await seConnecter(context, ADMIN);
  const principal = projetFictif({ id: PROJET_ID, nbCabines: 4 });
  await brancherFixtures(page, { projet: principal, compte: ADMIN });
  const projets = projetsDenses(30);
  await page.route("**/api/**", async (route) => {
    const u = new URL(route.request().url()).pathname;
    const j = (c: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(c) });
    if (u.startsWith("/api/projects/") && u.split("/").length === 4) {
      return route.request().method() === "GET" ? j(principal) : j({ ok: true });
    }
    if (u.startsWith("/api/projects")) return j([principal, ...projets]);
    return route.fallback();
  });
  const g = GABARITS[GAB];
  await page.setViewportSize({ width: g.width, height: g.height });
  await page.goto(process.env.TM_URL || "/?mode=dashboard", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.addStyleTag({ content: `*,*::before,*::after{animation:none!important;transition:none!important}` }).catch(() => {});
  const diag = await page.evaluate(() => ({
    largeur: window.innerWidth,
    coarse: matchMedia('(pointer: coarse)').matches,
    boutonsEnTete: document.querySelectorAll('header button').length,
    nuageEnTete: !!document.querySelector('header .sgh-off'),
    piecesDansMenu: Array.from(document.querySelectorAll('button')).some((b) => /Pi.ces . D.fauts/.test(b.textContent || '')),
    horsLigneDansMenu: Array.from(document.querySelectorAll('button')).some((b) => /Journ.e hors ligne/.test(b.textContent || '')),
  }));
  console.log('  diag :', JSON.stringify(diag));
  /* TM_CLIC : ouvrir un sous-menu avant de photographier. */
  if (process.env.TM_CLIC) {
    await page.locator(process.env.TM_CLIC).first().click().catch(() => {});
    await page.waitForTimeout(600);
  }
  const el = page.locator(SEL).first();
  if (await el.count()) {
    await el.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await el.screenshot({ path: OUT });
    console.log("  capturé :", OUT);
  } else {
    console.log("  SÉLECTEUR ABSENT :", SEL);
  }
});
