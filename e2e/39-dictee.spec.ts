/**
 * La dictée vocale ne perd plus rien (24.10.2026) : texte versé et enregistré
 * sans bouton, audio gardé sur l'appareil sans réseau ou en cas d'échec,
 * repris à la réouverture sans doublon, et saisie envoyée dès que la page
 * passe en arrière-plan.
 */
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { brancherFixtures, seConnecter, sansServiceWorker, PROJET_ID, ADMIN, type Trace } from "./harnais";

const FAUX_MICRO = () => {
  const md = (navigator.mediaDevices || {}) as MediaDevices;
  (md as unknown as { getUserMedia: unknown }).getUserMedia = async () => ({ getTracks: () => [{ stop() {} }] });
  if (!navigator.mediaDevices) Object.defineProperty(navigator, "mediaDevices", { value: md, configurable: true });
  class FauxMR {
    state = "inactive"; mimeType = "audio/webm";
    ondataavailable: ((e: { data: Blob }) => void) | null = null; onstop: (() => void) | null = null;
    start() { this.state = "recording"; }
    stop() { this.state = "inactive"; this.ondataavailable?.({ data: new Blob(["son"], { type: "audio/webm" }) }); setTimeout(() => this.onstop?.(), 10); }
  }
  (window as unknown as { MediaRecorder: unknown }).MediaRecorder = FauxMR;
};

let transcription: { status: number; texte: string } = { status: 200, texte: "" };

async function preparer(page: Page, context: BrowserContext): Promise<Trace> {
  await sansServiceWorker(context);
  await seConnecter(context, ADMIN);
  await context.addInitScript(FAUX_MICRO);
  const trace = await brancherFixtures(page, { compte: ADMIN });
  await page.route("**/api/transcribe", (r) => r.fulfill({ status: transcription.status, contentType: "application/json",
    body: JSON.stringify(transcription.status === 200 ? { text: transcription.texte } : { error: "indisponible" }) }));
  return trace;
}

async function ouvrirRapport(page: Page) {
  await page.goto(`/projet/${PROJET_ID}?mode=cmd`, { waitUntil: "domcontentloaded" });
  await page.getByText(/Consulter le rapport de montage|Démarrer le rapport de montage/).first().click({ timeout: 40_000 });
  await page.getByRole("button", { name: "Rapport", exact: true }).click();
  await expect(page.getByPlaceholder("Précisions supplémentaires...").first()).toBeVisible();
}

const rapportsEnvoyes = (t: Trace) => t.appels.filter((a) => a.methode === "PATCH")
  .map((a) => (a.corps as Record<string, unknown> | undefined)?.rapportMonteur).filter((r): r is string => typeof r === "string");

async function dicter(page: Page) {
  await page.getByRole("button", { name: "Démarrer la dictée" }).first().click();
  await page.getByRole("button", { name: "Arrêter l'enregistrement" }).click();
}

test("dictée : versée dans le rapport ET enregistrée tout de suite, sans bouton à presser", async ({ page, context }) => {
  test.setTimeout(90_000);
  const trace = await preparer(page, context);
  await ouvrirRapport(page);
  transcription = { status: 200, texte: "Joint refait côté gauche." };
  await dicter(page);
  await expect(page.locator('[data-dictee-etat="enregistre"]')).toBeVisible({ timeout: 5_000 });
  await expect(page.getByPlaceholder("Précisions supplémentaires...").first()).toHaveValue(/Pose effectuée sans difficulté\.\nJoint refait côté gauche\./);
  await expect.poll(() => rapportsEnvoyes(trace).some((r) => r.includes("Joint refait côté gauche.")), { timeout: 1_500 }).toBe(true);
});

test("transcription en échec : la dictée est gardée, puis versée à la réouverture de la fiche", async ({ page, context }) => {
  test.setTimeout(90_000);
  const trace = await preparer(page, context);
  await ouvrirRapport(page);
  transcription = { status: 503, texte: "" };
  await dicter(page);
  await expect(page.locator('[data-dictee-etat="gardee"]')).toBeVisible({ timeout: 5_000 });
  expect(rapportsEnvoyes(trace).some((r) => r.includes("Silicone"))).toBe(false);
  /* Le monteur ferme ; plus tard, le réseau va bien. */
  transcription = { status: 200, texte: "Silicone à reprendre demain." };
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect.poll(() => rapportsEnvoyes(trace).some((r) => r.includes("Silicone à reprendre demain.")), { timeout: 30_000 }).toBe(true);
  const n = await page.evaluate(() => new Promise<number>((res) => {
    const r = indexedDB.open("tm-dictees"); r.onsuccess = () => { const q = r.result.transaction("dictees").objectStore("dictees").count(); q.onsuccess = () => res(q.result); };
  }));
  expect(n, "plus rien en attente sur l'appareil").toBe(0);
  /* Une seconde réouverture ne la verse pas deux fois. */
  const avant = rapportsEnvoyes(trace).length;
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4_000);
  expect(rapportsEnvoyes(trace).slice(avant).filter((r) => r.includes("Silicone")).length).toBe(0);
});

test("sans réseau : gardée, puis transcrite et enregistrée au retour du réseau", async ({ page, context }) => {
  test.setTimeout(90_000);
  const trace = await preparer(page, context);
  await ouvrirRapport(page);
  transcription = { status: 200, texte: "Client absent, clé chez le concierge." };
  await context.setOffline(true);
  await dicter(page);
  await expect(page.locator('[data-dictee-etat="gardee"]')).toBeVisible({ timeout: 5_000 });
  await context.setOffline(false);
  await expect.poll(() => rapportsEnvoyes(trace).some((r) => r.includes("Client absent, clé chez le concierge.")), { timeout: 20_000 }).toBe(true);
  await expect(page.getByPlaceholder("Précisions supplémentaires...").first()).toHaveValue(/Client absent, clé chez le concierge\./);
});

test("saisie au clavier puis téléphone verrouillé : elle part sans attendre les 2 s", async ({ page, context }) => {
  test.setTimeout(90_000);
  const trace = await preparer(page, context);
  await ouvrirRapport(page);
  await page.getByPlaceholder("Précisions supplémentaires...").first().fill("Pose effectuée sans difficulté. Verrouillé aussitôt.");
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => rapportsEnvoyes(trace).some((r) => r.includes("Verrouillé aussitôt.")), { timeout: 800 }).toBe(true);
});

test("assistant pas à pas : micro sous le champ manuel, dictée ajoutée et enregistrée", async ({ page, context }) => {
  test.setTimeout(120_000);
  const trace = await preparer(page, context);
  await page.goto(`/projet/${PROJET_ID}?mode=cmd`, { waitUntil: "domcontentloaded" });
  await page.getByText(/Consulter le rapport de montage|Démarrer le rapport de montage/).first().click({ timeout: 40_000 });
  await page.getByRole("button", { name: /Consulter le rapport|Remplir pas à pas/ }).first().click();
  const champ = page.getByPlaceholder("Précisions supplémentaires…");
  for (let i = 0; i < 20 && !(await champ.isVisible()); i++) {
    await page.getByRole("button", { name: /^Suivant/ }).first().click();
    await page.waitForTimeout(300);
  }
  await expect(champ).toBeVisible();
  await page.screenshot({ path: "test-results/dictee-assistant.png", fullPage: false });
  transcription = { status: 200, texte: "Bonde changée, tout est propre." };
  await dicter(page);
  await expect(page.locator('[data-dictee-etat="enregistre"]')).toBeVisible({ timeout: 5_000 });
  await expect(champ).toHaveValue(/Bonde changée, tout est propre\./);
  await expect.poll(() => rapportsEnvoyes(trace).some((r) => r.includes("Bonde changée")), { timeout: 1_500 }).toBe(true);
  /* Le champ manuel reste utilisable comme avant. */
  await champ.fill((await champ.inputValue()) + " Ajout à la main.");
  await expect.poll(() => rapportsEnvoyes(trace).some((r) => r.includes("Ajout à la main.")), { timeout: 5_000 }).toBe(true);
  await page.screenshot({ path: "test-results/dictee-assistant-apres.png", fullPage: false });
});
