/**
 * Le parcours de la signature, dans un vrai navigateur, sans réseau.
 *
 * C'est la priorité numéro un du cahier des charges, et la seule chose que
 * ni les tests unitaires ni les tests de composants ne pouvaient démontrer :
 * ce qui se passe quand on signe hors réseau, qu'on ferme l'application, et
 * qu'on revient.
 *
 * Ce qui s'exécute ici est la VERSION COMPILÉE de l'application, dans WebKit
 * au gabarit d'un iPhone. Seuls Notion, Cloudinary et Redis sont remplacés
 * par des fixtures : IndexedDB, la file d'envoi, le pavé de signature et les
 * statuts sont ceux de production.
 */
import { test, expect } from "@playwright/test";
import { brancherFixtures, sansServiceWorker, seConnecter, PROJET_ID } from "./harnais";

/** Ce que la file d'envoi contient, lu directement dans IndexedDB. */
async function fileDEnvoi(page: import("@playwright/test").Page) {
  return page.evaluate(async () => {
    const ouvrir = () => new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open("tm-rapport-uploads");
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const db = await ouvrir();
    if (!db.objectStoreNames.contains("pendingUploads")) return [];
    return new Promise<{ projectId: string; champTexte?: string; category: string; files: { name: string }[] }[]>((res) => {
      const tx = db.transaction("pendingUploads", "readonly");
      const req = tx.objectStore("pendingUploads").getAll();
      req.onsuccess = () => res(req.result.map((x) => ({
        projectId: x.projectId, champTexte: x.champTexte, category: x.category,
        files: (x.files || []).map((f: { name: string }) => ({ name: f.name })),
      })));
      req.onerror = () => res([]);
    });
  });
}

async function ouvrirLaFiche(page: import("@playwright/test").Page) {
  await page.goto(`/projet/${PROJET_ID}?mode=cmd`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Chantier de test E2E").first()).toBeVisible({ timeout: 30_000 });
}

/*
 * Important : on ouvre la carte AVANT de couper le réseau.
 *
 * Le pavé de signature est chargé à la demande, en fragment séparé. En
 * production, le service worker l'a déjà en réserve ; ici il est désactivé
 * pour que Playwright puisse observer les appels, et un fragment manquant ne
 * se télécharge pas hors ligne. L'ordre reflète d'ailleurs la réalité : on
 * ouvre son rapport avec du réseau, on le perd en descendant au sous-sol.
 */
async function ouvrirLaSignature(page: import("@playwright/test").Page) {
  /* La fiche s'ouvre repliée : on déplie d'abord le rapport de montage, qui
     contient la carte de signature. */
  await page.getByText(/Consulter le rapport de montage|Démarrer le rapport de montage/).first().click();
  const carte = page.locator("#signature-card");
  await expect(carte).toBeVisible({ timeout: 15_000 });
  await carte.scrollIntoViewIfNeeded();
  await carte.locator("button").first().click();
  await expect(page.getByText("Signez ici")).toBeVisible({ timeout: 10_000 });
}

/** Trace un trait sur le pavé, comme un doigt. */
async function signer(page: import("@playwright/test").Page) {
  const canvas = page.locator("#signature-card canvas");
  const boite = await canvas.boundingBox();
  if (!boite) throw new Error("pavé de signature introuvable");
  await page.mouse.move(boite.x + 30, boite.y + 60);
  await page.mouse.down();
  await page.mouse.move(boite.x + 90, boite.y + 110, { steps: 8 });
  await page.mouse.move(boite.x + 160, boite.y + 70, { steps: 8 });
  await page.mouse.up();
  await page.getByText(/Valider la signature/).click();
}

test.describe("Scénario A — signer sans aucun réseau", () => {
  test("la signature est gardée sur l'appareil et le dit", async ({ page, context }) => {
    await sansServiceWorker(context);
    await seConnecter(context);
    const trace = await brancherFixtures(page);
    await ouvrirLaFiche(page);
    await ouvrirLaSignature(page);

    /* Plus de réseau : exactement le sous-sol d'un chantier. */
    await context.setOffline(true);
    await signer(page);

    /* 1. L'écran dit la vérité : gardée ici, pas encore partie. */
    await expect(page.getByText(/en attente d'envoi/i)).toBeVisible({ timeout: 15_000 });

    /* 2. Et c'est vrai : elle est dans la file, dans IndexedDB. */
    const file = await fileDEnvoi(page);
    const signature = file.find((x) => x.champTexte === "signatureUrl");
    expect(signature, "la signature doit être en file").toBeDefined();
    expect(signature!.projectId).toBe(PROJET_ID);
    expect(signature!.files[0].name).toMatch(/^signature-\d+\.png$/);

    /* 3. Rien n'a été envoyé : aucun rattachement pendant la coupure. */
    expect(trace.appels.filter((a) => a.url === "/api/photos/attach")).toHaveLength(0);

    await context.setOffline(false);
  });
});

test.describe("Scénario B — fermer puis rouvrir l'application", () => {
  test("la signature survit à un rechargement complet de la page", async ({ page, context }) => {
    await sansServiceWorker(context);
    await seConnecter(context);
    /* Le serveur refuse les écritures : la file ne peut pas se vider, et on
       peut donc observer ce qu'un rechargement en fait.

       Pourquoi ne pas recharger hors ligne, comme sur le chantier : sans
       service worker — désactivé ici pour que Playwright voie les appels —
       le navigateur ne peut pas recharger une page qu'il n'a pas en réserve.
       Ce que ce test démontre reste l'essentiel : la file vit dans
       IndexedDB, pas dans la mémoire de l'onglet, et traverse une
       destruction complète de la page. */
    let refuse = true;
    await brancherFixtures(page, { refuserEcritures: () => refuse });
    await ouvrirLaFiche(page);
    await ouvrirLaSignature(page);
    await context.setOffline(true);
    await signer(page);
    await expect(page.getByText(/en attente d'envoi/i)).toBeVisible({ timeout: 15_000 });
    await context.setOffline(false);

    /* On détruit la page et on la reconstruit. */
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByText("Chantier de test E2E").first()).toBeVisible({ timeout: 30_000 });

    const file = await fileDEnvoi(page);
    expect(file.some((x) => x.champTexte === "signatureUrl"),
           "la signature doit survivre au rechargement").toBe(true);

    /* Et dès que le serveur accepte, elle part : rien n'est resté coincé. */
    refuse = false;
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect
      .poll(async () => (await fileDEnvoi(page)).filter((x) => x.champTexte === "signatureUrl").length,
            { timeout: 30_000 })
      .toBe(0);
  });
});

test.describe("Scénario C — le réseau revient", () => {
  test("la signature part toute seule et quitte la file", async ({ page, context }) => {
    await sansServiceWorker(context);
    await seConnecter(context);
    const trace = await brancherFixtures(page);
    await ouvrirLaFiche(page);
    await ouvrirLaSignature(page);
    await context.setOffline(true);
    await signer(page);
    await expect(page.getByText(/en attente d'envoi/i)).toBeVisible({ timeout: 15_000 });
    expect((await fileDEnvoi(page)).some((x) => x.champTexte === "signatureUrl")).toBe(true);

    /* Le réseau revient. L'application doit s'en apercevoir seule. */
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));

    /* La file se vide : plus de signature en attente. */
    await expect
      .poll(async () => (await fileDEnvoi(page)).filter((x) => x.champTexte === "signatureUrl").length,
            { timeout: 30_000, message: "la signature doit quitter la file" })
      .toBe(0);

    /* Et elle a bien été écrite dans le champ du bon projet. */
    const ecriture = trace.appels.find(
      (a) => a.methode === "PATCH" &&
             a.url === `/api/projects/${PROJET_ID}` &&
             !!(a.corps as Record<string, unknown>)?.signatureUrl,
    );
    expect(ecriture, "un PATCH signatureUrl doit partir").toBeDefined();
  });
});
