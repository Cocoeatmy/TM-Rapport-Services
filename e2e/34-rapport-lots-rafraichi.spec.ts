/**
 * Le rafraîchissement d'une fiche à plusieurs lots ne dédouble pas le rapport.
 *
 * Constaté en production sur TEST 5 le 19.10.2026 : le rafraîchissement
 * automatique (toutes les 15 s) remettait le texte BRUT du rapport — lignes
 * des lots comprises — dans la zone « Rapport général ». L'enregistrement
 * suivant y rajoutait les lignes des lots : « Cabine 2 : … » deux, puis trois
 * fois dans Notion. Le chargement, lui, découpait correctement : seul le
 * rafraîchissement trahissait.
 */
import { test, expect } from "@playwright/test";
import { brancherFixtures, seConnecter, sansServiceWorker, projetFictif, PROJET_ID } from "./harnais";

const BRUT = "Personne sur site lors du montage.\n\nCabine 2 : L'installation s'est déroulée sans encombre.\n\nSDD : L'installation s'est déroulée sans encombre.";

test("après un rafraîchissement, la zone générale reste générale et rien ne se dédouble", async ({ page, context }) => {
  test.setTimeout(90_000);
  await sansServiceWorker(context);
  await seConnecter(context);
  const trace = await brancherFixtures(page, { projet: projetFictif({
    nbCabines: 3, nomsCabines: "Cab1:Cabine 1 | Cab2:Cabine 2 | Cab3:SDD",
    heureArrivee: "Cab1:2026-10-14:08:00 | Cab2:2026-10-16:08:00 | Cab3:2026-10-18:08:00",
    heureDepart: "Cab1:2026-10-14:12:00 | Cab2:2026-10-16:12:00 | Cab3:2026-10-18:12:00",
    attributionCabines: "Cab1:Micael | Cab2:Micael | Cab3:Micael",
    dateMontage: "2026-10-14", collaborateurs: "Micael", rapportMonteur: BRUT,
  }) });

  await page.goto(`/projet/${PROJET_ID}?mode=cmd`, { waitUntil: "domcontentloaded" });
  await page.getByText(/Consulter le rapport de montage|Démarrer le rapport de montage/).first().click();
  await page.getByRole("button", { name: /Rapport général/ }).first().click();
  const zone = page.locator("textarea[placeholder^='Remarques générales']").first();
  await expect(zone).toHaveValue("Personne sur site lors du montage.");

  /* Le rafraîchissement automatique passe (15 s), relit la même fiche. */
  await page.waitForTimeout(20_000);
  await expect(zone, "le rafraîchissement ne remet pas les lignes des lots dans la zone générale")
    .toHaveValue("Personne sur site lors du montage.");

  /* Une saisie : l'enregistrement automatique part. */
  await zone.fill("Personne sur site lors du montage. Essai.");
  const rapportsEnvoyes = () => trace.appels
    .filter((a) => a.methode === "PATCH")
    .map((a) => (a.corps as Record<string, unknown> | undefined)?.rapportMonteur)
    .filter((r): r is string => typeof r === "string");
  await expect.poll(() => rapportsEnvoyes().length, { timeout: 15_000 }).toBeGreaterThan(0);
  const envoye = rapportsEnvoyes().at(-1)!;
  expect(envoye.match(/Cabine 2 :/g)?.length, `une seule ligne « Cabine 2 » — envoyé : ${JSON.stringify(envoye)}`).toBe(1);
  expect(envoye.match(/SDD :/g)?.length).toBe(1);
  expect(envoye).toContain("Personne sur site lors du montage. Essai.");
});
