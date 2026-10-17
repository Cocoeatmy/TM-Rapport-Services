/**
 * Les captures — pour regarder, pas pour juger.
 *
 * Un relevé automatique dit « recouvrement de 12 pixels ». Une image dit
 * si c'est gênant. Ce fichier produit les deux séries : macOS, la référence
 * à ne pas abîmer, et iPadOS/iOS, celles à corriger.
 */
import { test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { brancherFixtures, seConnecter, sansServiceWorker, PROJET_ID, projetFictif, ADMIN } from "./harnais";
import { projetsDenses, signalementsDenses } from "./fixtures-denses";
import { GABARITS, type NomGabarit } from "./sonde-affichage";

/** Les écrans qui comptent, onglets compris. */
export const VUES: { nom: string; url: string; attendre?: string }[] = [
  { nom: "01-dashboard", url: "/?mode=dashboard" },
  { nom: "02-services", url: "/?mode=services" },
  { nom: "03-crm", url: "/?mode=crm" },
  { nom: "04-kanban", url: "/?mode=kanban" },
  { nom: "05-destockage", url: "/?mode=destockage" },
  { nom: "06-fournisseurs", url: "/?mode=fournisseurs" },
  { nom: "07-grossistes", url: "/?mode=grossistes" },
  { nom: "08-sanitaires", url: "/?mode=sanitaires" },
  { nom: "09-rapport", url: "/?mode=rapport" },
  { nom: "10-chantiers", url: "/?mode=chantiers" },
  { nom: "11-stats", url: "/?mode=stats" },
  { nom: "12-projet", url: `/projet/${PROJET_ID}?mode=cmd`, attendre: "Immeuble d'essai" },
  { nom: "13-projet-mesures", url: `/projet/${PROJET_ID}?mode=mesures` },
  { nom: "14-carnet", url: "/carnet" },
  { nom: "15-garanties", url: "/garanties" },
  { nom: "16-relances", url: "/relances" },
  { nom: "17-devis", url: "/devis-attente" },
  { nom: "18-admin-droits", url: "/admin/droits" },
  { nom: "19-admin-stocks", url: "/admin/stocks" },
  { nom: "20-admin-sauvegardes", url: "/admin/sauvegardes" },
  { nom: "21-admin-pieces", url: "/admin/pieces-defauts" },
  { nom: "22-admin-heures", url: "/admin/heures" },
  { nom: "23-rapport-quotidien", url: "/rapport-quotidien" },
];

/** Quel lot capturer : passé par la variable d'environnement TM_CAPTURES. */
const LOT = (process.env.TM_CAPTURES || "ipad-11-portrait").split(",") as NomGabarit[];
const DOSSIER = process.env.TM_CAPTURES_DIR || `e2e-rapport/captures${process.env.TM_THEME ? "-" + process.env.TM_THEME : ""}`;

test.skip(!process.env.TM_CAPTURES_ON && !process.env.TM_CAPTURES, "captures : lancer avec TM_CAPTURES=<gabarits>");

test("captures", async ({ page, context }) => {
  test.setTimeout(900_000);
  await sansServiceWorker(context);
  /* Le thème : l'application en a plusieurs, et ils ne se ressemblent pas.
     `TM_THEME=signal` éprouve celui du rail ; sans rien, le thème classique. */
  const theme = process.env.TM_THEME || "";
  if (theme) {
    await context.addInitScript((t) => {
      try { localStorage.setItem("tm-ui-mode", t); } catch { /* ignore */ }
      document.documentElement.setAttribute("data-ui", t);
    }, theme);
  }
  const compte = ADMIN;
  await seConnecter(context, compte);

  const projets = projetsDenses(30);
  const principal = projetFictif({ id: PROJET_ID, nbCabines: 4 });
  await brancherFixtures(page, { projet: principal, compte });
  /* On enrichit par-dessus : listes denses et signalements nombreux. */
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

  /* ── Figer ce qui bouge ───────────────────────────────────────────────
     Les fonds de l'application sont des dégradés animés en boucle, et le
     curseur clignote. Deux captures du MÊME code diffèrent donc toujours
     un peu, et une comparaison avant/après ne voudrait rien dire. On gèle
     animations et transitions le temps de la photographie. */
  await page.addStyleTag({ content: `
    *, *::before, *::after {
      animation: none !important;
      transition: none !important;
      caret-color: transparent !important;
    }
    .lg-bg, body { background-attachment: initial !important; }
  ` }).catch(() => {});

  for (const gab of LOT) {
    const g = GABARITS[gab];
    if (!g) continue;
    await page.setViewportSize({ width: g.width, height: g.height });
    mkdirSync(`${DOSSIER}/${gab}`, { recursive: true });
    for (const v of VUES) {
      try {
        await page.goto(v.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
        if (v.attendre) await page.getByText(v.attendre).first().waitFor({ timeout: 10_000 }).catch(() => {});
        await page.waitForTimeout(1200);
        await page.addStyleTag({ content: `
          *, *::before, *::after {
            animation: none !important; transition: none !important;
            caret-color: transparent !important;
          }` }).catch(() => {});
        await page.waitForTimeout(150);
        await page.screenshot({ path: `${DOSSIER}/${gab}/${v.nom}.png`, fullPage: false });
      } catch { /* un écran inaccessible se verra à l'image manquante */ }
    }
    console.log(`  ${gab} : ${VUES.length} captures`);
  }
});
