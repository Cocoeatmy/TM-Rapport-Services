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
    expect(b.x).toBeGreaterThanOrEqual(0); expect(b.x + b.width).toBeLessThanOrEqual(390); expect(b.width).toBeGreaterThan(340);
    expect(b.y + b.height).toBeLessThanOrEqual(844);
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

  test("« Projets en cours » (l'ancien Planning) est dans Projets, sans rechargement", async ({ page, context }) => {
    await ouvrir(page, context, MONTEUR);
    await marquer(page);
    await barre(page).getByText("Projets").click();
    await page.locator(".tm-ios-rubrique", { hasText: "Projets en cours" }).click();
    await expect(page).toHaveURL(/mode=calendrier/);
    await expect(barre(page).locator(".tm-ios-onglet.is-actif")).toContainText("Projets");
    await barre(page).getByText("Accueil").click();
    await expect(page).not.toHaveURL(/mode=/);
    expect(await marque(page), "aucun rechargement").toBe(1);
  });

  test("Projets : les rubriques, puis une sous-rubrique avec ses sous-onglets", async ({ page, context }) => {
    await ouvrir(page, context, MONTEUR);
    await marquer(page);
    await barre(page).getByText("Projets").click();
    const feuille = page.locator(".tm-ios-feuille");
    for (const r of ["Projets en cours", "Services", "CRM", "Grossistes", "Fournisseurs", "Kanban", "Déstockage", "Chantiers PPE"]) {
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

test.describe("app iPhone — menu Profil puis un autre bouton", () => {
  test.use({ userAgent: UA_APP, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("le menu se ferme et la page demandée s'ouvre (Planning, Accueil, Projets)", async ({ page, context }) => {
    await ouvrir(page, context, ADMIN);
    const menu = page.locator(".tm-menu-profil");
    const profil = barre(page).locator(".tm-ios-onglet", { hasText: "Profil" });

    await profil.click();
    await expect(menu).toBeVisible();
    await expect(profil).toHaveClass(/is-actif/);
    await barre(page).getByText("Planning").click();
    await expect(menu).toHaveCount(0);
    await expect(page).toHaveURL(/\/planning/);
    await expect(barre(page).locator(".tm-ios-onglet.is-actif")).toContainText("Planning");

    await profil.click();
    await expect(menu).toBeVisible();
    await barre(page).getByText("Accueil").click();
    await expect(menu).toHaveCount(0);
    await expect(page).not.toHaveURL(/planning/);

    await profil.click();
    await expect(menu).toBeVisible();
    await barre(page).getByText("Projets").click();
    await expect(menu).toHaveCount(0);
    await expect(page.locator(".tm-ios-feuille")).toBeVisible();
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

/* ── Planning : l'agenda des rendez-vous ─────────────────────────────── */
const lundi = (decalage = 0) => {
  const d = new Date(); d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + decalage * 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const jourIso = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

async function servirPlanning(page: Page, voitTout: boolean) {
  const demandes: string[] = [];
  await page.route("**/api/planning**", async (route) => {
    const u = new URL(route.request().url());
    demandes.push(u.search);
    const du = u.searchParams.get("du")!;
    const auj = jourIso();
    const rdv = du === lundi(0) ? [
      { cle: "a", projetId: "11111111-2222-3333-4444-555555555555", type: "montage", jour: auj, heure: "08:30", projet: "Montage du jour", ofr: "TM-1", adresse: "Lausanne", collaborateurs: "Jacobo & Claudio", cabines: 3, mode: "cmd", etape: null },
      { cle: "b", projetId: "p2", type: "sav", jour: auj, heure: "13:30", projet: "SAV du jour", ofr: "TM-2", adresse: "Genève", collaborateurs: "Jacobo", cabines: 1, mode: "sav", etape: "lot 1" },
    ] : [
      { cle: "c", projetId: "p3", type: "mesures", jour: du, heure: "10:00", projet: "Mesure semaine suivante", ofr: "TM-3", adresse: "", collaborateurs: "Jacobo", cabines: 2, mode: "mesures", etape: null },
    ];
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ du, au: du, voitTout, collab: u.searchParams.get("collab"), collaborateurs: voitTout ? ["Micael", "Claudio", "Jacobo"] : [], rdv }) });
  });
  return demandes;
}

test.describe("Planning", () => {
  test.use({ userAgent: UA_APP, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("collaborateur : le jour même d'abord, semaines, filtres, ouverture d'une fiche", async ({ page, context }) => {
    await ouvrir(page, context, MONTEUR);
    const demandes = await servirPlanning(page, false);
    await barre(page).getByText("Planning").click();
    await expect(page).toHaveURL(/\/planning/);
    await expect(barre(page).locator(".tm-ios-onglet.is-actif")).toContainText("Planning");
    const jour = page.locator(".tm-planning-jour.is-aujourdhui");
    await expect(jour).toContainText("Montage du jour");
    await expect(jour).toContainText("08:30");
    await expect(jour).toContainText("SAV du jour");
    await expect(page.locator(".tm-planning-collab"), "pas de choix de collaborateur").toHaveCount(0);
    /* Filtre : SAV seulement, puis tout. */
    await page.locator(".tm-planning-puce", { hasText: "SAV" }).click();
    await expect(jour).not.toContainText("Montage du jour");
    await expect(jour).toContainText("SAV du jour");
    await page.locator(".tm-planning-puce", { hasText: "SAV" }).click();
    await expect(jour).toContainText("Montage du jour");
    /* Semaine suivante, puis retour. */
    await page.getByLabel("Semaine suivante").click();
    await expect(page.locator(".tm-planning")).toContainText("Mesure semaine suivante");
    expect(demandes.some((q) => q.includes(`du=${lundi(1)}`))).toBe(true);
    await page.getByRole("button", { name: "Aujourd'hui" }).click();
    await expect(page.locator(".tm-planning-jour.is-aujourdhui")).toContainText("Montage du jour");
    /* Semaine passée : consultable. */
    await page.getByLabel("Semaine précédente").click();
    expect(demandes.some((q) => q.includes(`du=${lundi(-1)}`))).toBe(true);
    await page.getByRole("button", { name: "Aujourd'hui" }).click();
    /* Un appui ouvre la fiche. */
    await page.locator(".tm-planning-rdv", { hasText: "Montage du jour" }).click();
    await expect(page).toHaveURL(/\/projet\/11111111-2222-3333-4444-555555555555\?mode=cmd/);
  });

  test("administrateur : « Tous les collaborateurs », puis un seul", async ({ page, context }) => {
    await ouvrir(page, context, ADMIN);
    const demandes = await servirPlanning(page, true);
    await barre(page).getByText("Planning").click();
    const choix = page.locator(".tm-planning-collab select");
    await expect(choix).toHaveValue("");
    await expect(choix.locator("option").first()).toHaveText("Tous les collaborateurs");
    await choix.selectOption("Claudio");
    await expect.poll(() => demandes.some((q) => q.includes("collab=Claudio"))).toBe(true);
  });

  test("lisibilité du verre : la barre reste opaque à plus de 50 % et le texte blanc contraste", async ({ page, context }) => {
    await ouvrir(page, context, MONTEUR);
    const style = await page.evaluate(() => {
      const b = getComputedStyle(document.querySelector("nav.tm-ios-barre")!);
      return { fond: b.backgroundColor, flou: b.backdropFilter || (b as unknown as { webkitBackdropFilter: string }).webkitBackdropFilter, rayon: b.borderRadius };
    });
    const alpha = Number((/rgba?\([^)]*,\s*([0-9.]+)\)/.exec(style.fond) || [])[1] ?? 1);
    expect(alpha).toBeGreaterThanOrEqual(0.5);
    expect(style.flou).toContain("blur");
    expect(parseFloat(style.rayon)).toBeGreaterThan(16);
  });
});


/* ── L'app web de l'écran d'accueil (comme les monteurs l'utilisent) ── */
const standalone = (context: BrowserContext) => context.addInitScript(() => {
  Object.defineProperty(navigator, "standalone", { get: () => true, configurable: true });
});

test.describe("app web de l'écran d'accueil (iPhone)", () => {
  test.use({ userAgent: UA_SAFARI, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("collaborateur : même navigation, même verre, Planning et menus — avec ses droits", async ({ page, context }) => {
    await standalone(context);
    await ouvrir(page, context, MONTEUR);
    await expect(page.locator("html")).toHaveAttribute("data-app", "ios");
    await expect(page.locator("html")).toHaveAttribute("data-app-source", "ecran-accueil");
    await expect(barre(page)).toBeVisible();
    /* En-tête et barre du bas : la même surface de verre. */
    const verre = await page.evaluate(() => {
      const lire = (el: Element) => { const c = getComputedStyle(el); return { fond: c.backgroundColor, flou: c.backdropFilter || (c as unknown as { webkitBackdropFilter: string }).webkitBackdropFilter }; };
      const h = document.getElementById("main-header")!;
      return { haut: lire(h), bas: lire(document.querySelector("nav.tm-ios-barre")!), rayon: getComputedStyle(h).borderBottomLeftRadius };
    });
    expect(verre.haut.fond).toBe(verre.bas.fond);
    expect(verre.haut.flou).toBe(verre.bas.flou);
    expect(verre.haut.flou).toContain("blur");
    expect(parseFloat(verre.rayon)).toBeGreaterThan(16);
    /* La barre laisse la place de la barre d'accueil d'iOS. */
    const b = (await barre(page).boundingBox())!;
    expect(844 - (b.y + b.height)).toBeGreaterThanOrEqual(20);
    /* Droits : pas de création, pas de Statistiques. */
    await barre(page).getByLabel("Nouveau projet").click();
    await expect(page.getByText("La création de projets est réservée aux comptes autorisés.")).toBeVisible();
    await barre(page).getByText("Profil").click();
    await expect(page.locator(".tm-menu-profil")).not.toContainText("Statistiques");
    await page.keyboard.press("Escape");
    await barre(page).getByText("Profil").click();
    /* Planning : ses rendez-vous (filtrés par le serveur), sans choix de collaborateur. */
    await servirPlanning(page, false);
    await barre(page).getByText("Planning").click();
    await expect(page.locator(".tm-planning-jour.is-aujourdhui")).toContainText("Montage du jour");
    await expect(page.locator(".tm-planning-collab")).toHaveCount(0);
  });

  test("administrateur : la même interface, avec le choix du collaborateur", async ({ page, context }) => {
    await standalone(context);
    await ouvrir(page, context, ADMIN);
    await expect(page.locator("html")).toHaveAttribute("data-app", "ios");
    await servirPlanning(page, true);
    await barre(page).getByText("Planning").click();
    await expect(page.locator(".tm-planning-collab select")).toHaveValue("");
  });
});

test.describe("iPad en mode écran d'accueil", () => {
  test.use({ userAgent: "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true });
  test("rien ne change sur l'iPad", async ({ page, context }) => {
    await standalone(context);
    await ouvrir(page, context, MONTEUR);
    await expect(page.locator("html")).not.toHaveAttribute("data-app", /.*/);
    await expect(barre(page)).toHaveCount(0);
  });
});

/* 20.10.2026 — iPhone 18 Pro Max : angles de la barre coupés par l'écran,
   barre qui doit se replier en descendant, « tirer pour actualiser » qui
   rechargeait la page sur un simple défilement rapide. */
test.describe("app iPhone : barre du bas et tirer pour actualiser", () => {
  test.use({ userAgent: UA_APP, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("la barre garde 22 px sous elle, se replie en descendant, revient en remontant ou au toucher", async ({ page, context }) => {
    await ouvrir(page, context, ADMIN);
    const b = (await barre(page).boundingBox())!;
    expect(844 - (b.y + b.height)).toBeGreaterThanOrEqual(21.5); // au-dessus des coins de l'écran
    // Une page assez longue pour défiler.
    await page.evaluate(() => { document.body.style.minHeight = "4000px"; });
    for (const y of [200, 600, 1000]) { await page.evaluate((v) => window.scrollTo(0, v), y); await page.waitForTimeout(60); }
    await expect(barre(page)).toHaveClass(/is-replie/);
    await page.waitForTimeout(450); // fin de l'animation
    const r = (await barre(page).boundingBox())!;
    expect(r.width).toBeLessThan(70);
    expect(r.x).toBeLessThan(20);
    /* Les autres onglets ont glissé derrière le bouton actif : effacés. */
    const opacites = await barre(page).locator(".tm-ios-onglet").evaluateAll((els) =>
      els.map((e) => (e.classList.contains("is-repr") ? "repr" : getComputedStyle(e).opacity)));
    expect(opacites.filter((o) => o === "repr")).toHaveLength(1);
    expect(opacites.filter((o) => o !== "repr").every((o) => Number(o) < 0.05)).toBe(true);
    /* La largeur s'anime (transition sur « right »), elle ne saute pas. */
    expect(await barre(page).evaluate((el) => getComputedStyle(el).transitionProperty)).toContain("right");
    // Toucher le rond : il déplie, il n'ouvre rien.
    const avant = page.url();
    await barre(page).click();
    await expect(barre(page)).not.toHaveClass(/is-replie/);
    expect(page.url()).toBe(avant);
    // Repliée de nouveau, puis remonter : elle revient.
    for (const y of [1300, 1700]) { await page.evaluate((v) => window.scrollTo(0, v), y); await page.waitForTimeout(60); }
    await expect(barre(page)).toHaveClass(/is-replie/);
    for (const y of [1500, 1300]) { await page.evaluate((v) => window.scrollTo(0, v), y); await page.waitForTimeout(60); }
    await expect(barre(page)).not.toHaveClass(/is-replie/);
  });

  test("tirer pour actualiser : rien sur un glissement ordinaire ni juste après un défilement ; un tirer franc arme le rechargement", async ({ page, context }) => {
    await ouvrir(page, context, ADMIN);
    /* Un geste tactile complet, de y0 à y1, sur le milieu de la page. */
    const geste = (y0: number, y1: number, relacher = false) => page.evaluate(async ([a, b, fin]) => {
      const cible = document.querySelector("main") || document.body;
      const t = (y: number) => new Touch({ identifier: 1, target: cible, clientX: 200, clientY: y });
      cible.dispatchEvent(new TouchEvent("touchstart", { touches: [t(a)], bubbles: true }));
      for (let y = a; y <= b; y += 20) cible.dispatchEvent(new TouchEvent("touchmove", { touches: [t(y)], bubbles: true }));
      if (fin) cible.dispatchEvent(new TouchEvent("touchend", { touches: [], bubbles: true }));
      await new Promise((r) => setTimeout(r, 150)); // le temps que React redessine
      return !!document.querySelector(".z-\\[100\\] .bg-green-500");
    }, [y0, y1, relacher] as const);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(600);
    // 200 px : l'ancien seuil — n'arme plus.
    expect(await geste(150, 350, true)).toBe(false);
    // Juste après un défilement (la page remonte sur son élan) : rien.
    await page.evaluate(() => { document.body.style.minHeight = "4000px"; window.scrollTo(0, 300); });
    await page.waitForTimeout(100);
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(await geste(150, 500)).toBe(false);
    await page.evaluate(() => document.dispatchEvent(new TouchEvent("touchend", { bubbles: true })));
    // Page immobile, tirer franc (~320 px) : la pastille passe au vert (on ne relâche pas : pas de rechargement).
    await page.waitForTimeout(600);
    expect(await geste(120, 440)).toBe(true);
  });
});

/* 20.10.2026 — lisibilité au téléphone : les jours du tableau de bord
   s'ouvrent dans le Planning, titres entiers, états en boutons, IA en couleur. */
test.describe("app iPhone : lisibilité", () => {
  test.use({ userAgent: UA_APP, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("le bouton de l'assistant IA est en couleur", async ({ page, context }) => {
    await ouvrir(page, context, ADMIN);
    const fond = await page.locator(".tm-ai-entete").first().evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(fond).toContain("linear-gradient");
  });

  test("« Montages » d'un jour du tableau de bord ouvre le Planning sur ce jour, filtré", async ({ page, context }) => {
    await ouvrir(page, context, ADMIN);
    /* Un montage fixé aujourd'hui, pour que la ligne « Montages » soit active. */
    const [base] = await page.evaluate(() => fetch("/api/projects").then((r) => r.json()));
    const jour = await page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; });
    const montage = { ...base, id: "p-montage", projet: "Régie du Lac - Dupont, Rue des Alpes 12 à 1400 Yverdon-les-Bains, salle de bains du premier étage", etatCMD: "RDV - fixé", dateMontage: `${jour}T08:30:00.000+02:00`, collaborateurs: "Claudio & Jacobo", nbCabines: 2 };
    await page.route(/\/api\/projects(\?|$|\/all-active|\/all\b)/, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify([montage]) }));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const ligne = page.locator(".sg-row:not(.sg-row-static)", { hasText: "Montages" }).first();
    if (!(await ligne.isVisible().catch(() => false))) {
      await page.locator(".sg-day-toggle, button:has(.sg-day-chev)").first().click().catch(() => {});
    }
    await page.locator(".sg-row:not(.sg-row-static)", { hasText: "Montages" }).first().click();
    await expect(page).toHaveURL(/\/planning\?jour=\d{4}-\d{2}-\d{2}&type=montage/);
    await expect(page.locator(".tm-planning-puce.is-on")).toHaveCount(1);
    await expect(page.locator(".tm-planning-puce.is-on")).toContainText("Montages");
    await page.screenshot({ path: "test-results/ios-planning-jour.png" });
    /* Le titre n'est plus coupé : aucune limite de lignes. */
    const titre = page.locator(".tm-planning-projet").first();
    if (await titre.count()) expect(await titre.evaluate((el) => getComputedStyle(el).webkitLineClamp || "none")).toMatch(/none|^$/);
  });

  test("« Projets en cours » : des boutons d'état avec leur nombre filtrent la liste", async ({ page, context }) => {
    await ouvrir(page, context, ADMIN, "/");
    /* Trois projets dans deux états, à partir du projet fictif du banc. */
    const [base] = await page.evaluate(() => fetch("/api/projects").then((r) => r.json()));
    const liste = [
      { ...base, id: "p-a", projet: "Chantier A", etatCMD: "En attente de mesures", dateMontage: null },
      { ...base, id: "p-b", projet: "Chantier B", etatCMD: "En attente de mesures", dateMontage: null },
      { ...base, id: "p-c", projet: "Chantier C", etatCMD: "Récéptionné - RDV à fixer", dateMontage: null },
    ];
    await page.route("**/api/projects/all-active**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify(liste) }));
    await page.goto("/?mode=calendrier", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    const boutons = page.locator(".tm-etats-boutons .tm-etat-bouton");
    await expect(boutons).toHaveCount(3);
    await expect(boutons.nth(1)).toContainText("En attente de mesures");
    await expect(boutons.nth(1).locator("b")).toHaveText("2");
    await expect(boutons.first()).toBeVisible();
    expect(await boutons.count()).toBeGreaterThan(1);
    const second = boutons.nth(1);
    const nombre = Number(await second.locator("b").innerText());
    await second.click();
    await expect(second).toHaveClass(/is-actif/);
    await expect(page.getByText(new RegExp(`^${nombre} intervention`))).toBeVisible();
    await page.screenshot({ path: "test-results/ios-projets-etats.png" });
    await second.click();
    await expect(boutons.first()).toHaveClass(/is-actif/);
  });
});
