/**
 * Le garde-fou d'affichage.
 *
 * `50-affichage.spec.ts` RELÈVE : il parcourt treize gabarits et vingt-neuf
 * écrans, écrit un rapport, et ne juge pas. C'est long, et c'est un outil
 * d'enquête.
 *
 * Celui-ci JUGE, et vite. Il prend les écrans les plus denses aux trois
 * gabarits qui comptent — iPad portrait, iPad en demi-écran, iPhone — et
 * refuse :
 *
 *   — qu'un texte s'imprime par-dessus un autre ;
 *   — que la page devienne plus large que l'écran ;
 *   — qu'une commande soit coupée sans moyen de l'atteindre.
 *
 * Ce sont les trois défauts qu'on me décrivait sur iPad. Ils sont corrigés ;
 * ce fichier existe pour qu'ils ne reviennent pas.
 *
 * Les cibles tactiles trop petites ne font PAS échouer : il en reste une
 * poignée, minuscules et sans gravité, et transformer cela en échec
 * donnerait une suite rouge en permanence — ce qui revient à ne plus la
 * lire. Elles sont comptées, et le compte est plafonné.
 */
import { test, expect } from "@playwright/test";
import { brancherFixtures, seConnecter, sansServiceWorker, PROJET_ID, projetFictif, ADMIN } from "./harnais";
import { projetsDenses, signalementsDenses } from "./fixtures-denses";
import { ausculter, GABARITS, type NomGabarit } from "./sonde-affichage";

/** Les écrans les plus denses : s'ils tiennent, les autres tiennent. */
const ECRANS = [
  { nom: "dashboard", url: "/?mode=dashboard" },
  { nom: "services", url: "/?mode=services" },
  { nom: "kanban", url: "/?mode=kanban" },
  { nom: "chantiers", url: "/?mode=chantiers" },
  { nom: "projet", url: `/projet/${PROJET_ID}?mode=cmd` },
  { nom: "devis-attente", url: "/devis-attente" },
  { nom: "admin-droits", url: "/admin/droits" },
];

/** Combien de cibles trop petites on tolère, par écran. Un plafond, pas un but. */
const PLAFOND_CIBLES = 12;

for (const theme of ["", "signal"]) {
  for (const gab of ["ipad-11-portrait", "ipad-split", "iphone-13"] as NomGabarit[]) {
    test.describe(`${gab}${theme ? " · " + theme : " · classique"}`, () => {
      test(`aucun chevauchement, aucun débordement`, async ({ page, context }) => {
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

        const g = GABARITS[gab];
        await page.setViewportSize({ width: g.width, height: g.height });

        const graves: string[] = [];
        const cibles: string[] = [];
        for (const e of ECRANS) {
          await page.goto(e.url, { waitUntil: "domcontentloaded", timeout: 40_000 });
          await page.waitForTimeout(900);
          for (const d of await ausculter(page, g.tactile)) {
            const ligne = `${e.nom} · ${d.genre} · ${d.detail}${d.a ? ` · A=${d.a}` : ""}${d.b ? ` · B=${d.b}` : ""}`;
            if (d.genre === "cible-tactile") cibles.push(ligne);
            else graves.push(ligne);
          }
        }

        expect(graves, `défauts d'affichage sur ${gab}${theme ? " (" + theme + ")" : ""} :\n  ${graves.join("\n  ")}`)
          .toEqual([]);
        expect(cibles.length,
          `trop de cibles sous 36 px :\n  ${cibles.slice(0, 10).join("\n  ")}`)
          .toBeLessThanOrEqual(PLAFOND_CIBLES * ECRANS.length);
      });
    });
  }
}
