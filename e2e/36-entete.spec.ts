/**
 * L'en-tête sur chaque taille d'écran : mesures réelles, sans données.
 *
 * Relevé (et garde-fou) du 20.10.2026 : bouton Accueil rond et du même
 * diamètre que les autres pastilles, bouton IA juste à sa droite, plus de
 * bouton IA flottant, espacements, aucun débordement, et la barre « Dashboard
 * / Services / CRM / Grossistes » immobile pendant le défilement.
 */
import { test, expect, type Page } from "@playwright/test";
import { brancherFixtures, seConnecter, sansServiceWorker, ADMIN } from "./harnais";

const ECRANS = [
  { nom: "iPhone SE", largeur: 375, hauteur: 667, tactile: true },
  { nom: "iPhone 15 Pro Max", largeur: 430, hauteur: 932, tactile: true },
  { nom: "iPad portrait", largeur: 820, hauteur: 1180, tactile: true },
  { nom: "iPad paysage", largeur: 1180, hauteur: 820, tactile: true },
  { nom: "ordinateur", largeur: 1440, hauteur: 900, tactile: false },
];

async function releve(page: Page) {
  return page.evaluate(() => {
    const r = (el: Element | null) => (el ? el.getBoundingClientRect() : null);
    const accueil = r(document.querySelector('a[aria-label="Accueil"]'));
    const ia = r(document.querySelector('button[aria-label="Assistant IA"]'));
    const ronds = [...document.querySelectorAll("#main-header button, #main-header a[aria-label]")]
      .map((e) => e.getBoundingClientRect()).filter((b) => b.width > 20 && b.width < 60 && b.height > 20)
      .map((b) => [Math.round(b.width), Math.round(b.height), Math.round(b.left)]);
    const entete = r(document.getElementById("main-header")?.parentElement ?? null);
    const nav = r(document.getElementById("main-navbar"));
    const premierOnglet = r(document.querySelector("#main-navbar .nav-stack button, #main-navbar .nav-stack a"));
    return {
      accueil: accueil && [Math.round(accueil.width), Math.round(accueil.height)],
      ia: ia && [Math.round(ia.left), Math.round(ia.width), Math.round(ia.height)],
      accueilDroite: accueil && Math.round(accueil.right),
      ronds,
      enteteBas: entete && Math.round(entete.bottom),
      navHaut: nav && Math.round(nav.top), navBas: nav && Math.round(nav.bottom),
      ongletHaut: premierOnglet && Math.round(premierOnglet.top),
      flottant: !!document.querySelector(".tm-ai-fab"),
      debordement: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      enteteDebordement: (() => { const h = document.querySelector("#main-header > div"); return h ? h.scrollWidth - h.clientWidth : 0; })(),
      coarse: matchMedia("(pointer: coarse)").matches,
      boutons: [...document.querySelectorAll("#main-header button, #main-header a[aria-label]")]
        .filter((el) => (el as HTMLElement).offsetWidth > 20)
        .map((el) => (el.getAttribute("aria-label") || el.getAttribute("title") || "?").slice(0, 28)),
    };
  });
}

for (const e of ECRANS) {
  test(`en-tête — ${e.nom}`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: e.largeur, height: e.hauteur }, hasTouch: e.tactile, isMobile: e.tactile && e.largeur < 600 });
    await sansServiceWorker(ctx);
    await seConnecter(ctx, ADMIN);
    const page = await ctx.newPage();
    await brancherFixtures(page, { compte: ADMIN });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#main-navbar")).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1500);
    const avant = await releve(page);
    await page.screenshot({ path: test.info().outputPath(`${e.nom}-haut.png`) });
    /* Défilement : la barre doit rester exactement à sa place. */
    const positions: number[] = [];
    for (const y of [40, 120, 300, 600, 300, 0]) {
      await page.evaluate((v) => window.scrollTo(0, v), y);
      await page.waitForTimeout(250);
      positions.push(await page.evaluate(() => Math.round(document.getElementById("main-navbar")!.getBoundingClientRect().top)));
    }
    console.log(`RELEVE ${e.nom} ${JSON.stringify({ ...avant, positionsNav: positions })}`);

    /* Accueil : un rond, du même diamètre que ses voisines. */
    const [lA, hA] = avant.accueil!;
    expect(lA, "bouton Accueil rond").toBe(hA);
    const diametres = new Set(avant.ronds.map(([l, h]) => `${l}x${h}`));
    expect([...diametres], "toutes les pastilles ont le même diamètre").toEqual([`${lA}x${hA}`]);
    /* IA : juste à droite de l'Accueil, plus de bouton flottant. */
    expect(avant.ia, "bouton IA présent dans l'en-tête").not.toBeNull();
    expect(avant.ia![0] - avant.accueilDroite!, "IA immédiatement à droite de l'Accueil").toBeLessThanOrEqual(10);
    expect(avant.flottant, "plus de bouton IA flottant").toBe(false);
    /* Rien ne déborde. */
    expect(avant.debordement, "pas de défilement horizontal de la page").toBe(0);
    expect(avant.enteteDebordement, "la ligne de l'en-tête tient").toBe(0);
    /* La barre d'onglets ne bouge pas d'un pixel en défilant. */
    expect(new Set(positions).size, `barre immobile (positions : ${positions.join(", ")})`).toBe(1);
    expect(positions[0], "collée sous l'en-tête").toBe(avant.enteteBas);

    /* Repli : sur un écran étroit, « ⋯ » ouvre les pastilles qui n'ont pas tenu. */
    const plus = page.getByRole("button", { name: "Autres actions" });
    if (await plus.count()) {
      await plus.click();
      const panneau = page.locator("#main-header-repli");
      await expect(panneau).toBeVisible();
      await expect(panneau.getByRole("button").first()).toBeVisible();
      await page.screenshot({ path: test.info().outputPath(`${e.nom}-repli.png`) });
      const dedans = await panneau.evaluate((p) => {
        const r = p.getBoundingClientRect();
        return r.left >= 0 && r.right <= innerWidth + 0.5;
      });
      expect(dedans, "le panneau reste dans l'écran").toBe(true);
    }
    await ctx.close();
  });
}

test("repli puis dépli (rotation) : les pastilles ne sont jamais remontées", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await sansServiceWorker(ctx);
  await seConnecter(ctx, ADMIN);
  const page = await ctx.newPage();
  await brancherFixtures(page, { compte: ADMIN });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Autres actions" })).toBeVisible({ timeout: 30_000 });
  /* On retient l'élément lui-même : un remontage en créerait un autre. */
  await page.evaluate(() => { (window as unknown as { __sync: Element | null }).__sync = document.querySelector('[aria-label="Synchroniser"]'); });
  await page.setViewportSize({ width: 1300, height: 844 }); // paysage large : tout tient
  await expect(page.getByRole("button", { name: "Autres actions" })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 }); // retour au portrait
  await expect(page.getByRole("button", { name: "Autres actions" })).toBeVisible();
  const meme = await page.evaluate(() => {
    const avant = (window as unknown as { __sync: Element | null }).__sync;
    return !!avant && avant === document.querySelector('[aria-label="Synchroniser"]') && avant.isConnected;
  });
  expect(meme, "le même bouton Synchroniser, jamais remonté").toBe(true);
  await ctx.close();
});
