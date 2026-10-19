/**
 * Les écrans chargés À LA DEMANDE s'ouvrent aussi sans réseau.
 *
 * Constaté en production sur TEST 5 le 19.10.2026 : l'étape « photos » de
 * l'assistant d'un lot, ouverte pour la première fois hors ligne, tombait en
 * « ChunkLoadError ». Le pré-cache ne gardait que le code déjà chargé, et la
 * liste injectée au build ne sert à rien sur Vercel (adresses d'un ancien
 * build, en 404).
 *
 * Ce test sert donc le service worker SANS sa liste injectée — exactement
 * comme en production — et vérifie qu'après une seule visite du tableau de
 * bord, tout le code que l'application peut réclamer est en réserve, y compris
 * des fragments que la page n'a jamais chargés.
 */
import { test, expect } from "@playwright/test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { brancherFixtures, seConnecter } from "./harnais";

const RE_FRAGMENT = /["'](?:\/_next\/)?(static\/(?:immutable\/)?(?:chunks|media|css)\/[A-Za-z0-9_.~\-/]+\.(?:js|css|woff2))["']/g;
const STATIQUE = join(process.cwd(), ".next");

function surDisque(chemin: string): string | null {
  try { return readFileSync(join(STATIQUE, chemin), "utf8"); } catch { return null; }
}

/** La fermeture, calculée sur les fichiers du build : ce qu'on attend en réserve. */
function fermeture(html: string): Set<string> {
  const vus = new Set<string>();
  const aSuivre = [...html.matchAll(RE_FRAGMENT)].map((m) => m[1]);
  while (aSuivre.length) {
    const f = aSuivre.shift()!;
    if (vus.has(f)) continue;
    vus.add(f);
    if (!f.endsWith(".js")) continue;
    const texte = surDisque(f);
    if (texte) for (const m of texte.matchAll(RE_FRAGMENT)) aSuivre.push(m[1]);
  }
  return vus;
}

function toutLeJs(dir: string, base = "static"): string[] {
  const out: string[] = [];
  for (const nom of readdirSync(dir)) {
    const plein = join(dir, nom);
    if (statSync(plein).isDirectory()) out.push(...toutLeJs(plein, `${base}/${nom}`));
    else if (nom.endsWith(".js")) out.push(`${base}/${nom}`);
  }
  return out;
}

test("après une visite du tableau de bord, le code chargé à la demande est en réserve", async ({ page, context, baseURL }) => {
  await seConnecter(context);
  await brancherFixtures(page);

  /* Le service worker tel qu'il tourne sur Vercel : sans liste injectée. */
  await context.route("**/sw.js", async (route) => {
    const r = await route.fetch();
    const code = (await r.text()).replace(/const PRECACHE_MANIFEST = .*?; \/\/ MANIFEST_INJECT/, 'const PRECACHE_MANIFEST = ["/"]; // MANIFEST_INJECT');
    await route.fulfill({ response: r, body: code, headers: { ...r.headers(), "content-type": "application/javascript" } });
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker?.controller), { timeout: 30_000 }).toBe(true);

  /* Le pré-cache part 3,5 s après le chargement ; on attend qu'il l'annonce. */
  await page.reload({ waitUntil: "domcontentloaded" });
  const termine = await page.evaluate(() => new Promise<boolean>((ok) => {
    navigator.serviceWorker.addEventListener("message", (e) => { if (e.data?.type === "PRECACHE_DONE") ok(true); });
    setTimeout(() => ok(false), 45_000);
  }));
  expect(termine, "le service worker doit annoncer la fin du pré-cache").toBe(true);

  const html = await (await page.request.get(`${baseURL}/`)).text();
  const attendus = fermeture(html);
  const charges = await page.evaluate(() => performance.getEntriesByType("resource").map((e) => e.name));
  const enReserve = new Set(await page.evaluate(async () => {
    const out: string[] = [];
    for (const n of await caches.keys()) for (const r of await (await caches.open(n)).keys()) out.push(new URL(r.url).pathname);
    return out;
  }));

  const jamaisCharges = [...attendus].filter((f) => f.endsWith(".js") && !charges.some((c) => c.endsWith(f)));
  expect(jamaisCharges.length, "le scénario doit contenir des fragments que la page n'a pas chargés").toBeGreaterThan(0);
  const manquants = [...attendus].filter((f) => !enReserve.has(`/_next/${f}`));
  expect(manquants, "tout le code atteignable doit être en réserve").toEqual([]);
  /* Repère : quelle part du build cela représente. */
  test.info().annotations.push({ type: "couverture", description: `${attendus.size} fichiers atteignables, ${toutLeJs(join(STATIQUE, "static")).length} JS dans le build, ${jamaisCharges.length} jamais chargés par la page` });
});
