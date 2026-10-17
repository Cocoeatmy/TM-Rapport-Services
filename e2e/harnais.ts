/**
 * Le harnais des tests de bout en bout.
 *
 * Deux principes, non négociables :
 *
 *   1. AUCUN service réel. Toutes les requêtes `/api/**` sont interceptées
 *      dans le navigateur et servies par des fixtures. Notion, Cloudinary et
 *      Redis ne sont jamais appelés — le serveur de test porte d'ailleurs un
 *      jeton Notion invalide, par sécurité.
 *
 *   2. Le CODE DU CLIENT s'exécute vraiment. Le service worker, IndexedDB, la
 *      file d'envoi, le pavé de signature : tout tourne pour de bon dans
 *      Chromium. C'est précisément ce que les tests unitaires ne pouvaient
 *      pas atteindre.
 */
import { SignJWT } from "jose";
import type { BrowserContext, Page, Route } from "@playwright/test";

/** La même clé que celle passée au serveur de test. Sans valeur ailleurs. */
const CLE_TEST = "cle-de-test-e2e-sans-valeur-ailleurs";

export const PROJET_ID = "11111111-2222-3333-4444-555555555555";

export async function jetonDeTest(
  compte: { email: string; name: string; role: "admin" | "monteur" },
): Promise<string> {
  return new SignJWT({ ...compte })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(new TextEncoder().encode(CLE_TEST));
}

/**
 * Écarte le service worker pour la durée du test.
 *
 * Il s'interpose entre la page et le réseau : les appels d'API ne passent
 * alors plus par Playwright, qui ne peut plus ni les observer ni les servir,
 * et la page reste bloquée sur « Chargement du rapport… ».
 *
 * CONSÉQUENCE ASSUMÉE : le service worker lui-même n'est pas couvert par ces
 * tests. Ce qu'ils couvrent, c'est le code applicatif — IndexedDB, la file
 * d'envoi, la signature, les statuts — qui est l'objet de la mission.
 */
export async function sansServiceWorker(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    /* On ne le SUPPRIME pas : du code appelle `navigator.serviceWorker
       .register(...)` sans vérifier, et l'absence totale lève une erreur qui
       interrompt l'initialisation. On le remplace par une doublure inerte. */
    const inerte = {
      controller: null,
      ready: new Promise(() => {}),
      register: () => Promise.resolve({
        scope: "/", active: null, waiting: null, installing: null,
        addEventListener: () => {}, removeEventListener: () => {},
        update: () => Promise.resolve(), unregister: () => Promise.resolve(true),
      }),
      getRegistration: () => Promise.resolve(undefined),
      getRegistrations: () => Promise.resolve([]),
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    try {
      Object.defineProperty(navigator, "serviceWorker", {
        configurable: true,
        get: () => inerte,
      });
    } catch { /* le navigateur refuse : le test le verra */ }
  });
}

export async function seConnecter(
  context: BrowserContext,
  compte = { email: "e2e@test.local", name: "Jacobo Fontan Cassas", role: "monteur" as const },
): Promise<void> {
  await context.addCookies([{
    name: "auth-token",
    value: await jetonDeTest(compte),
    domain: "127.0.0.1",
    path: "/",
  }]);
}

/** Un projet fictif, assez complet pour que la fiche s'affiche. */
export function projetFictif(o: Record<string, unknown> = {}) {
  return {
    id: PROJET_ID,
    createdTime: "2026-10-01T08:00:00.000Z",
    lastEditedTime: "2026-10-16T08:00:00.000Z",
    projet: "Chantier de test E2E",
    ofrTM: "TM-9999999",
    nomChantier: "Immeuble d'essai",
    adresseChantier: "Rue de l'Essai 1, 1000 Lausanne",
    emplacementCabine: "Dépôt",
    nbCabines: 1,
    collaborateurs: "Jacobo",
    fournisseurs: [], seriesCabines: [],
    dateMontage: "2026-10-16",
    /* Un rapport DÉJÀ entamé : l'assistant pas-à-pas ne s'ouvre alors pas
       de lui-même et la fiche affiche ses onglets classiques, dont la carte
       « Signature du client ». C'est l'écran qu'on veut éprouver ici. */
    heureArrivee: "08:00", heureDepart: "16:30",
    commentairesMontages: "", rapportMonteur: "Pose effectuée sans difficulté.", noteInterneMontage: "",
    photosAvant: [], photosDemontage: [], photosMontage: [], photosQRCode: [],
    photosGaranties: [], photosCartons: [], photosCartonsRecus: [],
    documentsMontagee: [], documentsMesures: [], offresTM: [],
    signatureUrl: "",
    etatCMD: "Récéptionné - RDV à fixer", etatMesures: "Terminé",
    priorite: "", facturations: "", rapportDeMontage: "",
    ...o,
  };
}

export interface Trace {
  /** Ce que le client a tenté d'envoyer, dans l'ordre. */
  appels: { methode: string; url: string; corps?: unknown }[];
}

/**
 * Branche les fixtures. Rend la trace des appels, pour vérifier ensuite ce
 * que le client a réellement tenté — et quand.
 */
export async function brancherFixtures(
  page: Page,
  options: { projet?: Record<string, unknown>; refuserEcritures?: () => boolean } = {},
): Promise<Trace> {
  const trace: Trace = { appels: [] };
  const projet = options.projet ?? projetFictif();
  const refuser = options.refuserEcritures ?? (() => false);

  const json = (route: Route, corps: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(corps) });

  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const chemin = url.pathname;
    let corps: unknown;
    try { corps = req.postData() ? JSON.parse(req.postData() as string) : undefined; } catch { corps = req.postData(); }
    trace.appels.push({ methode: req.method(), url: chemin, corps });

    if (chemin === "/api/auth") {
      return json(route, { user: { email: "e2e@test.local", name: "Jacobo Fontan Cassas", role: "monteur" } });
    }
    if (chemin.startsWith("/api/projects/") && chemin.split("/").length === 4) {
      /* Le serveur peut refuser les écritures à la demande : c'est ainsi
         qu'on garde une file pleine le temps d'un rechargement. */
      if (req.method() !== "GET") {
        return refuser()
          ? json(route, { error: "serveur indisponible" }, 503)
          : json(route, { ok: true });
      }
      return json(route, projet);
    }
    if (chemin === "/api/droits/moi") {
      /* Tout accordé : ces tests portent sur le parcours, pas sur les
         droits — qui ont leurs propres tests. */
      const tout = Object.fromEntries(
        ["tableau.voir","tableau.calendrier","tableau.activite","projets.voir","projets.creer",
         "projets.modifier","projets.supprimer","projets.termines","kanban.voir","kanban.mesures",
         "kanban.cmd","documents.ajouter","documents.supprimer","rapports.heures","rapports.rediger",
         "rapports.envoyer","mesures.voir","mesures.saisir","signalements.voir","signalements.creer",
         "signalements.modifier","signalements.supprimer","stock.voir","stock.modifier","stock.destocker",
         "carnet.voir","carnet.modifier","carnet.supprimer","stats.voir","argent.voir","argent.relances",
         "administration.comptes","administration.droits"].map((d) => [d, "oui"]),
      );
      return json(route, { email: "e2e@test.local", nom: "Jacobo", profil: "collaborateur", perimetre: "tous", droits: tout });
    }
    if (chemin === "/api/photos/sign") {
      return json(route, { signature: "x", timestamp: 1, apiKey: "k", cloudName: "c", folder: "f" });
    }
    if (chemin === "/api/photos/attach") return json(route, { ok: true });
    if (chemin === "/api/upload") return json(route, { files: [{ name: "f", url: "https://c.test/f" }] });
    if (chemin === "/api/build") return json(route, { build: "test" });
    if (chemin === "/api/bexio/projet") return json(route, { etat: "inconnue", factures: [], restant: 0 });
    /* Tout le reste : une liste vide, c'est inoffensif. */
    return json(route, []);
  });

  /* Cloudinary : jamais contacté, mais le client peut essayer. */
  await page.route("**res.cloudinary.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ secure_url: "https://c.test/televerse.png" }) }));
  await page.route("**api.cloudinary.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ secure_url: "https://c.test/televerse.png" }) }));

  return trace;
}
