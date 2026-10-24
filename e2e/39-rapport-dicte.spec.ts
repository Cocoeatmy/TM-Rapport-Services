/**
 * Le rapport dicté complet (24.10.2026) : rien n'est écrit avant la relecture ;
 * après « Ajouter », rapport et note interne enregistrés, dictée retirée de
 * l'appareil ; pièce proposée = formulaire prérempli ; sans transcription,
 * la dictée attend et revient à la réouverture.
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
const OK = "L'installation s'est déroulée sans encombre.";
const DIT = "Tout s'est bien passé, joint de porte repris, il manque une poignée. Le client était pressé.";
let transcriptionStatus = 200;
let analyses: unknown[] = [];

async function preparer(page: Page, context: BrowserContext): Promise<Trace> {
  await sansServiceWorker(context);
  await seConnecter(context, ADMIN);
  await context.addInitScript(FAUX_MICRO);
  const trace = await brancherFixtures(page, { compte: ADMIN });
  await page.route("**/api/transcribe", (r) => r.fulfill({ status: transcriptionStatus, contentType: "application/json",
    body: JSON.stringify(transcriptionStatus === 200 ? { text: DIT } : { error: "x" }) }));
  await page.route("**/api/rapport-dicte", async (r) => {
    analyses.push(JSON.parse(r.request().postData() || "{}"));
    await r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ secours: false, analyse: {
      parties: [{ numero: 0, coches: [OK], texte: "Le joint de la porte a été repris." }],
      noteInterne: "Client pressé.",
      signalements: [{ numero: 0, type: "piece", description: "Poignée de porte manquante" }],
    } }) });
  });
  return trace;
}

async function etapeRapport(page: Page) {
  await page.goto(`/projet/${PROJET_ID}?mode=cmd`, { waitUntil: "domcontentloaded" });
  await page.getByText(/Consulter le rapport de montage|Démarrer le rapport de montage/).first().click({ timeout: 40_000 });
  await page.getByRole("button", { name: /Consulter le rapport|Remplir pas à pas/ }).first().click();
  const champ = page.getByPlaceholder("Précisions supplémentaires…");
  for (let i = 0; i < 20 && !(await champ.isVisible()); i++) {
    await page.getByRole("button", { name: /^Suivant/ }).first().click();
    await page.waitForTimeout(300);
  }
  await expect(champ).toBeVisible();
}
const patchs = (t: Trace, champ: string) => t.appels.filter((a) => a.methode === "PATCH")
  .map((a) => (a.corps as Record<string, unknown> | undefined)?.[champ]).filter((r): r is string => typeof r === "string");

test("rapport dicté : relu, ajouté au rapport et à la note interne, pièce proposée préremplie", async ({ page, context }) => {
  test.setTimeout(120_000);
  transcriptionStatus = 200; analyses = [];
  const trace = await preparer(page, context);
  await etapeRapport(page);
  await page.getByRole("button", { name: "Dicter tout le rapport" }).click();
  await page.getByRole("button", { name: "Arrêter le rapport dicté" }).click();
  await expect(page.locator('[data-rapport-dicte="relecture"]')).toBeVisible({ timeout: 10_000 });
  expect((analyses[0] as { texte: string }).texte).toBe(DIT);
  /* Rien n'est écrit avant la relecture. */
  expect(patchs(trace, "rapportMonteur").some((r) => r.includes("joint de la porte"))).toBe(false);
  await page.getByRole("button", { name: "Ajouter au rapport" }).click();
  await expect(page.locator('[data-rapport-dicte="fait"] [data-dictee-etat="enregistre"]')).toBeVisible({ timeout: 5_000 });
  const champ = page.getByPlaceholder("Précisions supplémentaires…");
  await expect(champ).toHaveValue(`Pose effectuée sans difficulté.\n${OK}\nLe joint de la porte a été repris.`);
  expect(patchs(trace, "rapportMonteur").some((r) => r.includes("Le joint de la porte a été repris."))).toBe(true);
  expect(patchs(trace, "noteInterneMontage").some((r) => r.includes("Client pressé."))).toBe(true);
  const n = await page.evaluate(() => new Promise<number>((res) => {
    const r = indexedDB.open("tm-dictees"); r.onsuccess = () => { const q = r.result.transaction("dictees").objectStore("dictees").count(); q.onsuccess = () => res(q.result); };
  }));
  expect(n, "la dictée est retirée de l'appareil une fois ajoutée").toBe(0);
  /* La pièce : le formulaire s'ouvre déjà rempli. */
  await page.getByRole("button", { name: "Signaler", exact: true }).click();
  await expect(page.locator("textarea").filter({ hasText: "Poignée de porte manquante" }).first()).toBeVisible({ timeout: 5_000 });
});

test("rapport dicté sans transcription : gardé, puis repris à la réouverture", async ({ page, context }) => {
  test.setTimeout(120_000);
  transcriptionStatus = 503; analyses = [];
  const trace = await preparer(page, context);
  await etapeRapport(page);
  await page.getByRole("button", { name: "Dicter tout le rapport" }).click();
  await page.getByRole("button", { name: "Arrêter le rapport dicté" }).click();
  await expect(page.locator('[data-rapport-dicte="garde"]')).toBeVisible({ timeout: 10_000 });
  transcriptionStatus = 200;
  await etapeRapport(page);
  await expect(page.getByText("Une dictée attend votre relecture")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Reprendre maintenant" }).click();
  await page.getByRole("button", { name: "Ajouter au rapport" }).click();
  await expect.poll(() => patchs(trace, "rapportMonteur").some((r) => r.includes("Le joint de la porte a été repris.")), { timeout: 5_000 }).toBe(true);
});
