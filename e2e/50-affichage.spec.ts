/**
 * L'état des lieux de l'affichage, gabarit par gabarit.
 *
 * Ce fichier ne juge pas : il RELÈVE. Il parcourt les écrans de
 * l'application à treize tailles — de l'iPhone SE à l'écran du Mac — et
 * écrit tout ce qu'il voit dans un rapport. C'est ce rapport qui dit où
 * sont les défauts, au lieu de les deviner.
 *
 * Il ne tombe pas en échec : un relevé n'échoue pas, il constate. Les
 * garde-fous, eux, vivent dans `51-affichage-regression.spec.ts`.
 */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import { brancherFixtures, seConnecter, sansServiceWorker, PROJET_ID, ADMIN } from "./harnais";
import { ausculter, GABARITS, resumer, type Defaut } from "./sonde-affichage";
import { projetsDenses, signalementsDenses } from "./fixtures-denses";
import { projetFictif } from "./harnais";

/** Les écrans qu'un collaborateur ou un administrateur ouvre pour de vrai. */
/** Les écrans qu'un collaborateur ou un administrateur ouvre pour de vrai,
 *  onglets compris : ils ne sont pas des pages, mais ce sont des écrans. */
export const ECRANS: { nom: string; url: string; attendre?: string }[] = [
  { nom: "dashboard", url: "/?mode=dashboard" },
  { nom: "services", url: "/?mode=services" },
  { nom: "crm", url: "/?mode=crm" },
  { nom: "kanban", url: "/?mode=kanban" },
  { nom: "destockage", url: "/?mode=destockage" },
  { nom: "fournisseurs", url: "/?mode=fournisseurs" },
  { nom: "grossistes", url: "/?mode=grossistes" },
  { nom: "sanitaires", url: "/?mode=sanitaires" },
  { nom: "rapport", url: "/?mode=rapport" },
  { nom: "chantiers", url: "/?mode=chantiers" },
  { nom: "stats", url: "/?mode=stats" },
  { nom: "projet", url: `/projet/${PROJET_ID}?mode=cmd`, attendre: "Immeuble d'essai" },
  { nom: "projet-mesures", url: `/projet/${PROJET_ID}?mode=mesures` },
  { nom: "projet-sav", url: `/projet/${PROJET_ID}?mode=sav` },
  { nom: "carnet", url: "/carnet" },
  { nom: "garanties", url: "/garanties" },
  { nom: "relances", url: "/relances" },
  { nom: "devis-attente", url: "/devis-attente" },
  { nom: "rapport-quotidien", url: "/rapport-quotidien" },
  { nom: "admin-anomalies", url: "/admin/anomalies" },
  { nom: "admin-droits", url: "/admin/droits" },
  { nom: "admin-stocks", url: "/admin/stocks" },
  { nom: "admin-pieces-defauts", url: "/admin/pieces-defauts" },
  { nom: "admin-utilisateurs", url: "/admin/utilisateurs" },
  { nom: "admin-rapports", url: "/admin/rapports" },
  { nom: "admin-heures", url: "/admin/heures" },
  { nom: "admin-finances", url: "/admin/finances" },
  { nom: "admin-sauvegardes", url: "/admin/sauvegardes" },
  { nom: "login", url: "/login" },
];

const DOSSIER = `e2e-rapport${process.env.TM_THEME ? "-" + process.env.TM_THEME : ""}${process.env.TM_SUFFIXE || ""}`;

test.skip(!process.env.TM_RELEVE, "relevé long : lancer avec TM_RELEVE=1");

test.describe("relevé d'affichage", () => {
  test("parcourt tous les écrans à tous les gabarits", async ({ page, context }) => {
    test.setTimeout(900_000);
    await sansServiceWorker(context);
    const theme = process.env.TM_THEME || "";
    if (theme) {
      await context.addInitScript((t) => {
        try { localStorage.setItem("tm-ui-mode", t); } catch { /* ignore */ }
        document.documentElement.setAttribute("data-ui", t);
      }, theme);
    }
    /* Administrateur : c'est le compte qui voit le plus d'écrans, donc
       celui qui expose le plus de défauts. */
    const compte = ADMIN;
    await seConnecter(context, compte);
    const projets = projetsDenses(30);
    const principal = projetFictif({ id: PROJET_ID, nbCabines: 4 });
    await brancherFixtures(page, { projet: principal, compte });
    /* Des données DENSES : un tableau vide ne déborde jamais, et le premier
       relevé n'avait donc presque rien trouvé. */
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

    mkdirSync(DOSSIER, { recursive: true });
    const releve: Record<string, Record<string, Defaut[]>> = {};

    /* `TM_GABARITS` restreint le relevé : huit minutes pour les treize
       gabarits, quelques dizaines de secondes pour un seul. */
    const demandes = (process.env.TM_GABARITS || "").split(",").filter(Boolean);
    /* Le contexte est tactile ou il ne l'est pas — `hasTouch` se fixe à la
       création. On ne relève donc ici que les gabarits de la bonne famille :
       le projet « affichage-mac » mesure macOS avec une souris, le projet
       « affichage-tactile » mesure iPad et iPhone avec un doigt. Mélanger
       les deux reviendrait à mesurer un Mac qui reçoit les styles de
       l'iPad — c'est l'erreur que ce commentaire existe pour empêcher. */
    const contexteTactile = await page.evaluate(() => matchMedia("(pointer: coarse)").matches);
    for (const [nomGabarit, g] of Object.entries(GABARITS)) {
      if (demandes.length && !demandes.includes(nomGabarit)) continue;
      if (g.tactile !== contexteTactile) continue;
      await page.setViewportSize({ width: g.width, height: g.height });
      releve[nomGabarit] = {};
      for (const ecran of ECRANS) {
        try {
          await page.goto(ecran.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
          if (ecran.attendre) {
            await page.getByText(ecran.attendre).first().waitFor({ timeout: 15_000 }).catch(() => {});
          }
          await page.waitForTimeout(700); // le temps que la mise en page se pose
          const d = await ausculter(page, g.tactile);
          releve[nomGabarit][ecran.nom] = d;
          if (d.length) {
            console.log(`  ${nomGabarit.padEnd(20)} ${ecran.nom.padEnd(22)} ${resumer(d)}`);
          }
        } catch (e) {
          releve[nomGabarit][ecran.nom] = [
            { genre: "debordement", detail: `écran inaccessible : ${e instanceof Error ? e.message.split("\n")[0] : String(e)}` },
          ];
        }
      }
    }

    writeFileSync(`${DOSSIER}/releve.json`, JSON.stringify(releve, null, 1));

    /* Un résumé lisible, trié par gravité. */
    const lignes: string[] = [];
    for (const [gab, ecrans] of Object.entries(releve)) {
      const total = Object.values(ecrans).reduce((n, d) => n + d.length, 0);
      lignes.push(`\n### ${gab} — ${total} défaut(s)`);
      for (const [ecran, d] of Object.entries(ecrans)) {
        if (!d.length) continue;
        lignes.push(`  ${ecran} : ${resumer(d)}`);
        for (const x of d.slice(0, 6)) {
          lignes.push(`      [${x.genre}] ${x.detail}${x.a ? `\n         A: ${x.a}` : ""}${x.b ? `\n         B: ${x.b}` : ""}`);
        }
        if (d.length > 6) lignes.push(`      … et ${d.length - 6} autres`);
      }
    }
    writeFileSync(`${DOSSIER}/releve.txt`, lignes.join("\n"));
    console.log(`\nRelevé écrit dans ${DOSSIER}/releve.txt`);
  });
});
