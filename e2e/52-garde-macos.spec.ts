/**
 * Le garde-fou macOS : que rien ne se dégrade là où tout allait bien.
 *
 * Son jumeau `51-garde-affichage.spec.ts` surveille l'iPad et l'iPhone.
 * Celui-ci surveille le Mac, et il est tout aussi nécessaire : les
 * corrections tactiles ont été écrites pour ne jamais l'atteindre, mais
 * une règle mal rangée le ferait un jour. Mieux vaut qu'un test le dise.
 *
 * Le contexte n'a PAS de tactile (`hasTouch: false` dans le projet
 * `affichage-mac`) : le navigateur répond donc `pointer: fine`, comme un
 * Mac, et aucune règle de `tactile.css` ne s'y applique. C'est précisément
 * ce qu'on veut mesurer.
 */
import { test, expect } from "@playwright/test";
import { brancherFixtures, seConnecter, sansServiceWorker, PROJET_ID, projetFictif, ADMIN } from "./harnais";
import { projetsDenses, signalementsDenses } from "./fixtures-denses";
import { ausculter, GABARITS, type NomGabarit } from "./sonde-affichage";

const ECRANS = [
  { nom: "dashboard", url: "/?mode=dashboard" },
  { nom: "services", url: "/?mode=services" },
  { nom: "kanban", url: "/?mode=kanban" },
  { nom: "chantiers", url: "/?mode=chantiers" },
  { nom: "projet", url: `/projet/${PROJET_ID}?mode=cmd` },
  { nom: "devis-attente", url: "/devis-attente" },
  { nom: "admin-droits", url: "/admin/droits" },
];

for (const theme of ["", "signal"]) {
  for (const gab of ["mac-1440", "mac-1680"] as NomGabarit[]) {
    test(`${gab}${theme ? " · " + theme : " · classique"} — aucun défaut d'affichage`, async ({ page, context }) => {
      test.setTimeout(180_000);
      await sansServiceWorker(context);
      if (theme) {
        await context.addInitScript((t) => {
          try { localStorage.setItem("tm-ui-mode", t); } catch { /* ignore */ }
          document.documentElement.setAttribute("data-ui", t);
        }, theme);
      }
      await seConnecter(context, ADMIN);
      const principal = projetFictif({ id: PROJET_ID, nbCabines: 4 });
      await brancherFixtures(page, { projet: principal, compte: ADMIN });
      const projets = projetsDenses(30);
      await page.route("**/api/**", async (route) => {
        const u = new URL(route.request().url()).pathname;
        const j = (c: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(c) });
        if (u === "/api/defauts") return j(signalementsDenses(PROJET_ID, 14));
        if (u === "/api/pieces") return j(signalementsDenses(PROJET_ID, 9));
        if (u.startsWith("/api/projects/") && u.split("/").length === 4) {
          return route.request().method() === "GET" ? j(principal) : j({ ok: true });
        }
        if (u.startsWith("/api/projects")) return j([principal, ...projets]);
        return route.fallback();
      });

      /* Le Mac n'est pas tactile : on le vérifie plutôt que de le supposer.
         Si cette ligne tombait, tout le reste du fichier mesurerait un iPad
         en croyant mesurer un Mac. */
      expect(await page.evaluate(() => matchMedia("(pointer: fine)").matches),
             "le contexte doit être celui d'une souris").toBe(true);

      const g = GABARITS[gab];
      await page.setViewportSize({ width: g.width, height: g.height });

      const defauts: string[] = [];
      for (const e of ECRANS) {
        await page.goto(e.url, { waitUntil: "domcontentloaded", timeout: 40_000 });
        await page.waitForTimeout(900);
        for (const d of await ausculter(page, false)) {
          defauts.push(`${e.nom} · ${d.genre} · ${d.detail}${d.a ? ` · A=${d.a}` : ""}${d.b ? ` · B=${d.b}` : ""}`);
        }
      }
      expect(defauts, `l'affichage macOS doit rester intact :\n  ${defauts.join("\n  ")}`).toEqual([]);
    });
  }
}
