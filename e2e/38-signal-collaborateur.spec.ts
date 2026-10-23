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

/* Le jour que le tableau de bord montre DÉPLIÉ, quel que soit le jour du
   test : aujourd'hui en semaine, le lundi qui vient le week-end (« Mes
   interventions » va du lundi au vendredi). Avec son titre dans l'agenda.
   Le test fixait tout à « demain » : un vendredi, demain est un samedi, hors
   de la semaine affichée — d'où des échecs selon le jour (23.10.2026). */
function jourAffiche(): { iso: string; titre: string } {
  const d = new Date();
  const dow = d.getDay();
  const ajout = dow === 6 ? 2 : dow === 0 ? 1 : 0;
  d.setDate(d.getDate() + ajout);
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { iso, titre: ["Aujourd'hui", "Demain", "Après-demain"][ajout] };
}
const demain = () => jourAffiche().iso;

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
    /* … ni les onglets de rangement (Tout, Le jour même…) ni leur grille de
       tuiles : réservés à Micael depuis le 23.10.2026. */
    await expect(page.locator(".sg-cats")).toHaveCount(0);
    await expect(page.locator(".dash-grid")).toHaveCount(0);
    /* « Déjà fixés » passe avant « À planifier » pour un collaborateur. */
    const sections = await page.locator(".sg-section-head > span:first-child").allInnerTexts();
    expect(sections.findIndex((t) => /déjà fixés/i.test(t))).toBeLessThan(sections.findIndex((t) => /à planifier/i.test(t)));
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

  test.describe("chacun ses interventions", () => {
    const CLAUDIO = { email: "claudio@test.local", name: "Claudio Test", role: "monteur" as const };
    const jour = demain();
    const chantiers = [
      projetFictif({ id: "aaaaaaaa-0000-0000-0000-000000000001", projet: "Binome Jacobo Claudio", ofrTM: "TM-9000001", collaborateurs: "Jacobo & Claudio", dateMontage: `${jour}T08:00:00.000+02:00`, etatCMD: "RDV - fixé", nbCabines: 3 }),
      projetFictif({ id: "aaaaaaaa-0000-0000-0000-000000000002", projet: "Chantier de Miguel", ofrTM: "TM-9000002", collaborateurs: "Miguel", dateMontage: `${jour}T10:00:00.000+02:00`, etatCMD: "RDV - fixé", nbCabines: 4 }),
      projetFictif({ id: "aaaaaaaa-0000-0000-0000-000000000003", projet: "Mesure de Jacobo", ofrTM: "TM-9000003", collaborateurs: "", dateMontage: null, mesuresTraiteePar: "Jacobo", dateMesures: `${jour}T13:30:00.000+02:00`, etatCMD: "En attente de mesures", etatMesures: "RDV - Fixé", nbCabines: 2 }),
    ];

    async function ouvrirAvec(page: Page, context: BrowserContext, compte: typeof ADMIN) {
      await sansServiceWorker(context);
      await seConnecter(context, compte);
      await context.addInitScript(() => { try { localStorage.setItem("tm-ui-mode", "signal"); } catch { /* ignore */ } });
      await brancherFixtures(page, { compte });
      await page.route(/\/api\/projects(\/[a-z-]+)?(\?.*)?$/, async (route) => {
        const chemin = new URL(route.request().url()).pathname;
        const corps = chemin === "/api/projects" ? chantiers.slice(0, 2)
          : chemin === "/api/projects/mesures" ? chantiers.slice(2)
          : chemin === "/api/projects/periode" || chemin === "/api/projects/all-active" ? chantiers
          : [];
        await route.fulfill({ contentType: "application/json", body: JSON.stringify(corps) });
      });
      if (compte.role !== "admin") {
        await page.route("**/api/droits/moi", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({
          email: compte.email, nom: compte.name, profil: "collaborateur", perimetre: "tous",
          droits: Object.fromEntries(TOUS_LES_DROITS.map((id) => [id, REFUSES_AU_COLLABORATEUR.has(id) ? "non" : "oui"])) }) }));
      }
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await expect(page.locator(".sg-agenda")).toBeVisible({ timeout: 30_000 });
    }
    /* La carte du jour : sur iPhone elle est repliée par défaut, on l'ouvre. */
    const carteDuJour = (page: Page) =>
      page.locator(".sg-agenda .sg-card", { has: page.locator(".sg-card-title", { hasText: new RegExp(`^${jourAffiche().titre}$`) }) });
    const ouvrirCarte = async (page: Page) => {
      const bouton = carteDuJour(page).locator(".sg-day-toggle");
      if ((await bouton.count()) && (await bouton.getAttribute("aria-expanded")) === "false") await bouton.click();
    };
    const ligneDemain = (page: Page, metier: string) =>
      carteDuJour(page).locator(".sg-row", { hasText: metier }).locator(".sg-row-unit");

    test("Jacobo : son binôme et sa mesure, pas le chantier de Miguel", async ({ page, context }) => {
      await ouvrirAvec(page, context, MONTEUR);
      /* Un collaborateur n'a plus l'agenda de l'équipe (20.10.2026) : « Mes
         interventions » le remplace — le jour affiché compte SES deux lignes. */
      const mes = page.locator(".sg-mes-interventions");
      await expect(mes.getByRole("button", { name: new RegExp(`^${jourAffiche().titre}|^\\w+ 2 `) }).first()).toBeVisible();
      await expect(mes).toContainText("Binome Jacobo Claudio");
      await expect(mes).toContainText("Mesure de Jacobo");
      await expect(mes).not.toContainText("Chantier de Miguel");
    });

    test("Claudio : le même chantier en binôme, ni la mesure de Jacobo ni le chantier de Miguel", async ({ page, context }) => {
      await ouvrirAvec(page, context, CLAUDIO);
      const mes = page.locator(".sg-mes-interventions");
      await expect(mes).toContainText("Binome Jacobo Claudio");
      await expect(mes).not.toContainText("Mesure de Jacobo");
      await expect(mes).not.toContainText("Chantier de Miguel");
    });

    test("administrateur : toute l'activité", async ({ page, context }) => {
      await ouvrirAvec(page, context, ADMIN);
      await ouvrirCarte(page);
      await expect(ligneDemain(page, "Montages")).toHaveText("2 projets");
      await expect(ligneDemain(page, "Mesures")).toHaveText("1 projet");
    });
  });
});
