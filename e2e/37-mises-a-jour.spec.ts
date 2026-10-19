/**
 * Les mises à jour de l'application, avec le VRAI service worker.
 *
 * Le serveur de test est compilé comme une production fictive (déploiement
 * `dpl_E2E_A`). Une « nouvelle version » `dpl_E2E_B` est simulée en
 * réécrivant la balise `tm-version` des pages servies et la réponse de
 * /api/build — le code, lui, reste celui de la compilation : c'est la
 * mécanique de mise à jour qu'on éprouve, pas un second build.
 *
 * Ce qui est vérifié :
 *  - les trois versions (exécutée, disponible, prête) ne se confondent pas ;
 *  - la préparation est tout-ou-rien : un fragment manquant → rien ne bouge ;
 *  - l'application ne vide AUCUN cache ;
 *  - jamais de rechargement automatique sur une fiche projet en saisie ;
 *  - le rechargement automatique a lieu sur une page calme ;
 *  - un nouveau service worker ne renavigue plus les pages ouvertes, et un
 *    ancien pré-cache confie ses fichiers avant de disparaître ;
 *  - le nettoyage ne retire que ce que plus rien ne cite.
 *
 * Chromium seulement (projet mobile-idb) : Playwright n'intercepte les
 * requêtes d'un service worker que sur ce moteur.
 */
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { brancherFixtures, seConnecter, PROJET_ID } from "./harnais";

const A = "dpl_E2E_A";
const B = "dpl_E2E_B";
const FANTOME = "/_next/static/immutable/chunks/fantome-e2e.js";

interface Simulation { nouvelle: boolean; fragmentManquant: boolean }

/**
 * Simule le déploiement B : /api/build l'annonce, et les pages servies par
 * le réseau portent sa balise. Optionnellement, la coquille B cite un
 * fragment qui n'existe pas (préparation vouée à l'échec).
 */
async function simulerDeploiements(page: Page, context: BrowserContext, sim: Simulation) {
  const build = async (route: import("@playwright/test").Route) => {
    const r = await route.fetch();
    const j = await r.json();
    if (sim.nouvelle && j.version) j.version = { ...j.version, deploiement: B, compile: new Date().toISOString() };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(j) });
  };
  /* Sur la page (après le harnais : prioritaire) ET sur le contexte (requêtes du service worker). */
  await page.route("**/api/build", build);
  await context.route("**/api/build", build);
  const pages = (url: URL) => {
    const p = url.pathname;
    return !p.startsWith("/api/") && !p.startsWith("/_next/") && !p.includes(".");
  };
  const reecrire = async (route: import("@playwright/test").Route) => {
    if (route.request().method() !== "GET") return route.continue();
    const r = await route.fetch();
    const type = r.headers()["content-type"] || "";
    if (!sim.nouvelle || !type.includes("text/html")) return route.fulfill({ response: r });
    let html = (await r.text()).split(A).join(B);
    if (sim.fragmentManquant) html = html.replace("</head>", `<script src="${FANTOME}" async></script></head>`);
    const entetes = { ...r.headers() };
    delete entetes["content-encoding"]; delete entetes["content-length"]; delete entetes["etag"];
    await route.fulfill({ status: r.status(), body: html, headers: entetes });
  };
  await page.route(pages, reecrire);
  await context.route(pages, reecrire);
}

async function attendreLeServiceWorker(page: Page) {
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker?.controller), { timeout: 30_000 }).toBe(true);
}

/** Tous les caches, avec leurs adresses. */
async function inventaire(page: Page): Promise<Record<string, string[]>> {
  return page.evaluate(async () => {
    const out: Record<string, string[]> = {};
    for (const n of await caches.keys()) out[n] = (await (await caches.open(n)).keys()).map((r) => new URL(r.url).pathname + new URL(r.url).search);
    return out;
  });
}

/** La version inscrite dans la coquille `/` gardée par le service worker. */
async function versionCoquilleEnCache(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    for (const n of await caches.keys()) {
      if (!n.startsWith("tm-rapport-")) continue;
      const r = await (await caches.open(n)).match("/");
      if (!r) continue;
      const m = /dpl_E2E_[AB]/.exec(await r.text());
      return m ? m[0] : "sans balise";
    }
    return null;
  });
}

async function demarrer(page: Page, context: BrowserContext, chemin = "/informations", sim?: Simulation) {
  await seConnecter(context);
  await brancherFixtures(page);
  if (sim) await simulerDeploiements(page, context, sim);
  await page.goto(chemin, { waitUntil: "domcontentloaded" });
  await page.reload({ waitUntil: "domcontentloaded" });
  await attendreLeServiceWorker(page);
  await page.waitForTimeout(1500);
}

test.describe("les mises à jour", () => {
  test("Informations : exécutée ≠ disponible, préparation vérifiée, application sans rien vider", async ({ page, context }) => {
    test.setTimeout(120_000);
    const sim: Simulation = { nouvelle: false, fragmentManquant: false };
    await demarrer(page, context, "/informations", sim);

    await expect(page.getByTestId("info-executee")).toContainText(A);
    await expect(page.getByTestId("info-etat")).toHaveText("À jour", { timeout: 20_000 });
    await expect(page.getByTestId("info-natif")).toContainText("Navigateur");

    /* B est déployée. */
    sim.nouvelle = true;
    const avant = await inventaire(page);
    await page.getByRole("button", { name: "Vérifier maintenant" }).click();
    await expect(page.getByTestId("info-disponible")).toContainText(B, { timeout: 20_000 });
    await expect(page.getByTestId("info-executee"), "la page exécute toujours A").toContainText(A);

    /* MajAuto fait préparer B par le service worker : « prête ». */
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect(page.getByTestId("info-etat")).toHaveText(/prête|Synchronisation en attente/, { timeout: 60_000 });
    expect(await versionCoquilleEnCache(page), "la coquille B est en cache, vérifiée").toBe(B);
    const prepares = Object.keys(await inventaire(page)).filter((n) => n.startsWith("tm-prep-"));
    expect(prepares, "le cache temporaire de préparation a disparu").toEqual([]);

    /* Appliquer : un rechargement, sur B. */
    await page.evaluate(() => { (window as unknown as { __marqueur: number }).__marqueur = 1; });
    await page.getByTestId("info-appliquer").click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __marqueur?: number }).__marqueur ?? null), { timeout: 30_000 }).toBeNull();
    await expect(page.getByTestId("info-executee")).toContainText(B, { timeout: 30_000 });
    await expect(page.getByTestId("info-etat")).toHaveText("À jour", { timeout: 20_000 });

    /* Rien n'a été vidé : chaque cache d'avant existe encore, chaque fichier
       de code d'avant y est encore. */
    const apres = await inventaire(page);
    for (const [nom, entrees] of Object.entries(avant)) {
      if (nom.startsWith("tm-api-")) continue; // données : vivent leur vie
      expect(apres[nom], `le cache ${nom} existe encore`).toBeTruthy();
      for (const e of entrees.filter((x) => x.startsWith("/_next/static/"))) {
        expect(apres[nom], `${e} toujours dans ${nom}`).toContain(e);
      }
    }
  });

  test("préparation tout-ou-rien : un fragment manquant ne modifie aucun cache", async ({ page, context }) => {
    test.setTimeout(120_000);
    const sim: Simulation = { nouvelle: false, fragmentManquant: true };
    await demarrer(page, context, "/informations", sim);
    expect(await versionCoquilleEnCache(page)).toBe(A);
    const avant = await inventaire(page);

    sim.nouvelle = true;
    await page.getByRole("button", { name: "Vérifier maintenant" }).click();
    await expect(page.getByTestId("info-disponible")).toContainText(B, { timeout: 20_000 });
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    /* La préparation échoue : l'état revient à « disponible », jamais « prête ». */
    await page.waitForTimeout(8000);
    await expect(page.getByTestId("info-etat")).toHaveText(/Mise à jour disponible|en préparation/);

    expect(await versionCoquilleEnCache(page), "l'ancienne coquille est intacte").toBe(A);
    const apres = await inventaire(page);
    expect(Object.keys(apres).filter((n) => n.startsWith("tm-prep-")), "aucun reste de préparation").toEqual([]);
    const principal = Object.keys(avant).find((n) => n.startsWith("tm-rapport-"))!;
    for (const e of avant[principal]) expect(apres[principal]).toContain(e);
    expect(apres[principal]).not.toContain(FANTOME);

    /* Et l'application manuelle reste possible en ligne (rechargement par le réseau). */
    await page.evaluate(() => { (window as unknown as { __marqueur: number }).__marqueur = 1; });
    await page.getByTestId("info-appliquer").click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __marqueur?: number }).__marqueur ?? null), { timeout: 30_000 }).toBeNull();
  });

  test("fiche projet en saisie : jamais de rechargement automatique", async ({ page, context }) => {
    test.setTimeout(120_000);
    const sim: Simulation = { nouvelle: false, fragmentManquant: false };
    await demarrer(page, context, `/projet/${PROJET_ID}?mode=cmd`, sim);
    await expect(page.getByText("Chantier de test E2E").first()).toBeVisible({ timeout: 30_000 });
    await page.evaluate(() => { (window as unknown as { __marqueur: number }).__marqueur = 1; });

    sim.nouvelle = true;
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    /* La version est préparée, mais retenue : la pastille discrète le dit. */
    await expect(page.getByText("Mise à jour prête").first()).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(3000);
    expect(await page.evaluate(() => (window as unknown as { __marqueur?: number }).__marqueur), "la fiche n'a pas été rechargée").toBe(1);
  });

  test("page calme : rechargement automatique sur la version préparée", async ({ page, context }) => {
    test.setTimeout(180_000);
    const sim: Simulation = { nouvelle: false, fragmentManquant: false };
    await demarrer(page, context, "/informations", sim);
    await page.evaluate(() => { (window as unknown as { __marqueur: number }).__marqueur = 1; });

    sim.nouvelle = true;
    /* Aucun geste pendant plus d'une minute, puis un contrôle. */
    await page.waitForTimeout(62_000);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect.poll(() => page.evaluate(() => (window as unknown as { __marqueur?: number }).__marqueur ?? null), { timeout: 60_000 }).toBeNull();
    await expect(page.getByTestId("info-executee")).toContainText(B, { timeout: 30_000 });
  });

  test("hors ligne : vérification impossible, application refusée", async ({ page, context }) => {
    test.setTimeout(90_000);
    const sim: Simulation = { nouvelle: false, fragmentManquant: false };
    await demarrer(page, context, "/informations", sim);
    await expect(page.getByTestId("info-etat")).toHaveText("À jour", { timeout: 20_000 });

    await context.setOffline(true);
    await page.getByRole("button", { name: "Vérifier maintenant" }).click();
    await expect(page.getByTestId("info-etat")).toHaveText("Vérification impossible hors ligne", { timeout: 15_000 });
    await expect(page.getByTestId("info-verification"), "la dernière vérification réussie reste affichée").not.toHaveText("Non disponible");
    await context.setOffline(false);
  });

  test("nouveau service worker : aucune page renaviguée, ancien pré-cache recopié avant suppression", async ({ page, context }) => {
    test.setTimeout(120_000);
    /* Un « nouveau » service worker : le fichier servi change sur le disque le
       temps du test (next start relit public/), puis il est restauré. */
    const chemin = join(process.cwd(), "public", "sw.js");
    const original = readFileSync(chemin, "utf8");
    await demarrer(page, context);

    /* Une page qui comptait sur un fichier de l'ancien pré-cache. */
    const ancien = await page.evaluate(async () => {
      const nom = (await caches.keys()).find((n) => n.startsWith("tm-precache-"))!;
      await (await caches.open(nom)).put("/_next/static/e2e/sentinelle.js", new Response("/* sentinelle */", { headers: { "content-type": "text/javascript" } }));
      return nom;
    });
    await page.evaluate(() => { (window as unknown as { __marqueur: number }).__marqueur = 1; });

    try {
      writeFileSync(chemin, original.replace(/const PRECACHE_VERSION = "[^"]+"/, 'const PRECACHE_VERSION = "E2E_NOUVEAU"'));
      await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())!.update(); });
    await expect.poll(async () => (await page.evaluate(() => caches.keys())).includes("tm-precache-E2E_NOUVEAU"), { timeout: 30_000 }).toBe(true);
    await expect.poll(async () => (await page.evaluate(() => caches.keys())).includes(ancien), { timeout: 30_000 }).toBe(false);

    const inv = await inventaire(page);
    const principal = Object.keys(inv).find((n) => n.startsWith("tm-rapport-"))!;
    expect(inv[principal], "le fichier de l'ancien pré-cache a été recopié").toContain("/_next/static/e2e/sentinelle.js");
    expect(await page.evaluate(() => (window as unknown as { __marqueur?: number }).__marqueur), "la page n'a pas été renaviguée").toBe(1);
    } finally {
      writeFileSync(chemin, original);
    }
  });

  test("nettoyage : seuls les fichiers que plus rien ne cite disparaissent", async ({ page, context }) => {
    test.setTimeout(120_000);
    await demarrer(page, context, "/informations");
    const S = "/_next/static/immutable";
    const { principal, codeDeLaPage } = await page.evaluate(async (S) => {
      const principal = (await caches.keys()).find((n) => n.startsWith("tm-rapport-"))!;
      const c = await caches.open(principal);
      const js = (t: string) => new Response(t, { headers: { "content-type": "text/javascript" } });
      /* Un fichier que plus rien ne cite. */
      await c.put(`${S}/chunks/orphelin-e2e.js`, js("/* orphelin */"));
      /* Une ANCIENNE version, encore ouverte dans un autre onglet : son code,
         une feuille de style, et une police que SEULE la feuille cite. */
      await c.put(`${S}/chunks/ancien-e2e.js`, js(`import("static/immutable/chunks/ancien-paresseux-e2e.js")`));
      await c.put(`${S}/chunks/ancien-paresseux-e2e.js`, js("/* chargé à la demande */"));
      await c.put(`${S}/chunks/ancien-e2e.css`, new Response("@font-face{src:url(../media/police-e2e.woff2)}", { headers: { "content-type": "text/css" } }));
      await c.put(`${S}/media/police-e2e.woff2`, new Response("woff2", { headers: { "content-type": "font/woff2" } }));
      navigator.serviceWorker.controller!.postMessage({
        type: "VERSION_EN_USAGE", deploiement: "dpl_E2E_ANCIEN",
        racines: [location.origin + `${S}/chunks/ancien-e2e.js`, location.origin + `${S}/chunks/ancien-e2e.css`],
      });
      await new Promise((r) => setTimeout(r, 1000));
      /* Le nettoyage n'a lieu qu'une fois par jour : on remet l'horloge à zéro. */
      await (await caches.open("tm-versions-meta")).put("/__tm-meta/nettoyage", new Response(JSON.stringify({ quand: 0 })));
      const codeDeLaPage = [...document.querySelectorAll<HTMLScriptElement>("script[src]")]
        .map((s) => new URL(s.src).pathname).filter((p) => p.startsWith("/_next/static/"));
      /* Un signal d'usage déclenche le nettoyage. */
      navigator.serviceWorker.controller!.postMessage({ type: "VERSION_EN_USAGE", deploiement: "dpl_E2E_A", racines: [] });
      return { principal, codeDeLaPage };
    }, S);

    await expect.poll(async () => (await inventaire(page))[principal]?.includes(`${S}/chunks/orphelin-e2e.js`), { timeout: 30_000 }).toBe(false);
    const garde = (await inventaire(page))[principal];
    for (const f of ["chunks/ancien-e2e.js", "chunks/ancien-paresseux-e2e.js", "chunks/ancien-e2e.css", "media/police-e2e.woff2"]) {
      expect(garde, `${f} (version ancienne encore signalée) est conservé`).toContain(`${S}/${f}`);
    }
    const tout = new Set(Object.values(await inventaire(page)).flat());
    for (const p of codeDeLaPage) expect(tout.has(p), `le code de la page ouverte (${p}) est conservé`).toBe(true);
  });

  test("métadonnées illisibles : rien n'est supprimé, et le nettoyage s'abstient pendant la rétention", async ({ page, context }) => {
    test.setTimeout(90_000);
    await demarrer(page, context, "/informations");
    const S = "/_next/static/immutable";
    const principal = await page.evaluate(async (S) => {
      const principal = (await caches.keys()).find((n) => n.startsWith("tm-rapport-"))!;
      await (await caches.open(principal)).put(`${S}/chunks/orphelin-e2e.js`, new Response("/* orphelin */"));
      const meta = await caches.open("tm-versions-meta");
      await meta.put("/__tm-meta/versions", new Response("{ illisible"));
      await meta.put("/__tm-meta/nettoyage", new Response(JSON.stringify({ quand: 0 })));
      navigator.serviceWorker.controller!.postMessage({ type: "VERSION_EN_USAGE", deploiement: "dpl_E2E_A", racines: [] });
      return principal;
    }, S);
    await page.waitForTimeout(3000);
    expect((await inventaire(page))[principal], "aucune suppression sur métadonnées illisibles").toContain(`${S}/chunks/orphelin-e2e.js`);
    /* Reconstruites, mais la reconstruction est notée : pendant la durée de
       rétention, le nettoyage s'abstient (les autres onglets n'ont pas tous
       redit ce qu'ils utilisent). */
    const meta = await page.evaluate(async () => {
      const c = await caches.open("tm-versions-meta");
      return {
        versions: await (await c.match("/__tm-meta/versions"))!.text(),
        reconstruction: await (await c.match("/__tm-meta/reconstruction"))?.json(),
      };
    });
    expect(meta.reconstruction?.quand, "reconstruction notée").toBeGreaterThan(Date.now() - 60_000);
    expect(JSON.parse(meta.versions)).toHaveProperty("dpl_E2E_A");
    /* Un second signal, le lendemain du point de vue du nettoyage : toujours rien. */
    await page.evaluate(async () => {
      await (await caches.open("tm-versions-meta")).put("/__tm-meta/nettoyage", new Response(JSON.stringify({ quand: 0 })));
      navigator.serviceWorker.controller!.postMessage({ type: "VERSION_EN_USAGE", deploiement: "dpl_E2E_A", racines: [] });
    });
    await page.waitForTimeout(3000);
    expect((await inventaire(page))[principal]).toContain(`${S}/chunks/orphelin-e2e.js`);
  });

  test("ancien message de purge (pages d'avant) : réponse donnée, rien n'est vidé", async ({ page, context }) => {
    test.setTimeout(60_000);
    await demarrer(page, context, "/informations");
    const avant = await inventaire(page);
    const repondu = await page.evaluate(() => new Promise<boolean>((fini) => {
      const t = setTimeout(() => fini(false), 5000);
      navigator.serviceWorker.addEventListener("message", (e) => { if (e.data?.type === "APP_SHELL_PURGED") { clearTimeout(t); fini(true); } });
      navigator.serviceWorker.controller!.postMessage({ type: "PURGE_APP_SHELL" });
    }));
    expect(repondu, "l'ancienne page reçoit sa réponse").toBe(true);
    const apres = await inventaire(page);
    for (const [nom, entrees] of Object.entries(avant)) {
      if (nom.startsWith("tm-api-")) continue;
      expect(apres[nom], `${nom} existe encore`).toBeTruthy();
      expect(apres[nom].length, `${nom} n'a pas été vidé`).toBeGreaterThanOrEqual(entrees.length);
    }
  });

  test("réseau coupé pendant le rechargement : une version complète s'ouvre depuis le cache", async ({ page, context }) => {
    test.setTimeout(120_000);
    const sim: Simulation = { nouvelle: false, fragmentManquant: false };
    await demarrer(page, context, "/informations", sim);
    sim.nouvelle = true;
    await page.getByRole("button", { name: "Vérifier maintenant" }).click();
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect(page.getByTestId("info-etat")).toHaveText(/prête|Synchronisation en attente/, { timeout: 60_000 });

    await context.setOffline(true);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toContainText(/Dashboard|Services|Kanban/, { timeout: 30_000 });
    const balise = await page.evaluate(() => document.querySelector('meta[name="tm-version"]')?.getAttribute("content") || "");
    expect(balise, "la coquille ouverte est la nouvelle, préparée").toContain(B);
    await context.setOffline(false);
  });

  test("fenêtre ouverte sans rôle de dialogue : pas de rechargement automatique", async ({ page, context }) => {
    test.setTimeout(180_000);
    const sim: Simulation = { nouvelle: false, fragmentManquant: false };
    await demarrer(page, context, "/informations", sim);
    /* Un éditeur comme « Nouveau projet » : un calque plein écran, sans rôle,
       un brouillon tapé puis le champ quitté. */
    await page.evaluate(() => {
      const fond = document.createElement("div");
      fond.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:50";
      fond.innerHTML = "<div style='background:#fff;margin:40px;padding:16px'><input id='brouillon'></div>";
      document.body.appendChild(fond);
      (window as unknown as { __marqueur: number }).__marqueur = 1;
    });
    await page.locator("#brouillon").fill("Projet non enregistré");
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    sim.nouvelle = true;
    await page.waitForTimeout(62_000);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect(page.getByText("Mise à jour prête").first()).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(2000);
    expect(await page.evaluate(() => (window as unknown as { __marqueur?: number }).__marqueur), "le brouillon n'a pas été perdu").toBe(1);
    await expect(page.locator("#brouillon")).toHaveValue("Projet non enregistré");
  });
});
