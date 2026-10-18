/**
 * Les tests de bout en bout.
 *
 * ── Isolation, avant tout ─────────────────────────────────────────────────
 *
 * Le serveur de test démarre avec un jeton Notion VOLONTAIREMENT invalide et
 * une clé de session propre aux tests. Deux conséquences voulues : aucun
 * appel ne peut atteindre l'espace Notion de l'entreprise, et le jeton de
 * session fabriqué ici ne vaut rien en production.
 *
 * Les appels d'API sont par ailleurs interceptés dans le navigateur et
 * servis par des fixtures : ce qui s'exécute pour de bon, c'est le CODE DU
 * CLIENT — le service worker, IndexedDB, la file d'envoi, le pavé de
 * signature — c'est-à-dire précisément ce que les tests unitaires ne
 * pouvaient pas atteindre.
 */
import { defineConfig, devices } from "@playwright/test";

const PORT = 3137;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    /* WebKit au gabarit d'un iPhone : c'est le moteur de Safari, donc le
       rendu et les gestes les plus proches du terrain. */
    {
      name: "iphone",
      use: { ...devices["iPhone 13"] },
      /* Tout sauf les parcours qui écrivent des photos dans IndexedDB :
         ce WebKit ne sait pas y stocker de `Blob`. Ce qu'il couvre ici —
         rendu, gestes tactiles, et le comportement quand le stockage
         refuse — vaut précisément parce qu'il est le moteur de Safari. */
      testMatch: /(00|20)-.*\.spec\.ts$/,
    },
    /* Chromium, même gabarit, pour les parcours qui ont besoin d'IndexedDB :
       le WebKit embarqué par Playwright ne sait pas y stocker de `Blob`
       (vérifié : le même enregistrement passe avec un Uint8Array). Safari
       sur un vrai iPhone le fait, et l'application s'en sert tous les jours
       pour ses photos — c'est donc une limite de l'outil, pas du logiciel. */
    {
      name: "mobile-idb",
      /* Les parcours hors ligne, qui ont besoin de stocker des octets, et
         ceux qui exigent le vrai service worker : Playwright n'intercepte
         les requêtes d'un service worker que sur Chromium. */
      testMatch: /(00|10|3[0-9]|40)-.*\.spec\.ts$/,
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 390, height: 844 },
        serviceWorkers: "allow",
      },
    },
    /* ── L'affichage : DEUX projets, et c'est capital ────────────────────
       `hasTouch` est une option de contexte : elle ne se change pas en cours
       de test. Or elle décide de ce que le navigateur répond à
       `pointer: coarse` — c'est-à-dire de l'application ou non des règles
       tactiles. Un seul projet avec `hasTouch: true` aurait donc mesuré un
       « macOS » qui reçoit les styles de l'iPad : la comparaison de
       non-régression n'aurait rien voulu dire. (Elle a commencé par cela,
       et c'est ainsi qu'on l'a vu.) */
    {
      name: "affichage-tactile",
      /* Le garde-fou tactile (51), le relevé (50) et les captures (59).
         Pas le garde-fou macOS (52) : il exige un pointeur fin. */
      testMatch: /(50|51|53|54|55|59)-.*\.spec\.ts$/,
      use: { viewport: { width: 820, height: 1060 }, hasTouch: true, isMobile: false },
    },
    {
      /* Le Mac : souris, survol, pointeur fin. Aucune règle tactile. */
      name: "affichage-mac",
      /* Le garde-fou macOS (52), et les mêmes outils d'enquête. */
      testMatch: /(50|52|59)-.*\.spec\.ts$/,
      use: { viewport: { width: 1440, height: 900 }, hasTouch: false },
    },
    /* ── La journée complète sans réseau, dans WebKit ─────────────────────
       Le moteur des applications Apple, au gabarit d'un iPhone. Le test
       ouvre lui-même un contexte PERSISTANT (profil sur disque) avec ces
       réglages : c'est la session ÉPHÉMÈRE de Playwright, pas WebKit, qui
       refuse les `Blob` dans IndexedDB — un profil sur disque les accepte,
       comme Safari et les WKWebView des apps (vérifié le 18.10.2026). */
    {
      /* Banc de MESURE de la synchronisation (e2e/61) : WebKit, gabarit
         iPhone, latences simulées fixes. Long : lancé à la demande. */
      name: "vitesse-webkit",
      testMatch: /61-.*\.spec\.ts$/,
      use: { ...devices["iPhone 13"] },
    },
    {
      name: "journee-webkit",
      testMatch: /60-.*\.spec\.ts$/,
      use: { ...devices["iPhone 13"] },
    },
  ],
  webServer: {
    /* La version COMPILÉE, pas le serveur de développement : celui-ci
       ouvre un WebSocket de rechargement à chaud qui échoue sous WebKit, et
       la page n'atteint jamais son état « chargée ». Tester la version
       compilée est de toute façon plus fidèle à ce qui tourne en ligne. */
    command: `npm run start -- --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      /* Clé de session propre aux tests : le jeton qu'on fabrique ici
         n'ouvre rien ailleurs. */
      JWT_SECRET: "cle-de-test-e2e-sans-valeur-ailleurs",
      /* Jeton Notion inutilisable : si un appel serveur échappait à
         l'interception, il échouerait au lieu d'atteindre l'entreprise. */
      NOTION_TOKEN: "secret_invalide_tests_e2e",
      NOTION_DATABASE_ID: "00000000000000000000000000000000",
      /* Pas de Redis, pas de Cloudinary, pas de mail. */
      UPSTASH_REDIS_REST_URL: "",
      UPSTASH_REDIS_REST_TOKEN: "",
      NODE_ENV: "development",
    },
  },
});
