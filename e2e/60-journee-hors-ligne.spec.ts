/**
 * Une journée entière de monteur SANS RÉSEAU, puis la synchronisation —
 * interrompue — qui doit tout livrer, exactement une fois.
 *
 * ── Le moteur ───────────────────────────────────────────────────────────
 *
 * WebKit au gabarit d'un iPhone : le moteur des applications Apple (iPhone,
 * iPad, Mac) qui affichent ce site. Le contexte est PERSISTANT, avec un
 * profil sur disque. Ce n'est pas un détail : la session éphémère que
 * Playwright ouvre par défaut se comporte comme une navigation privée de
 * Safari, qui refuse les `Blob` dans IndexedDB. Avec un profil sur disque,
 * comme Safari ou une WKWebView d'application, les octets des photos sont
 * acceptés (vérifié le 18 octobre 2026 avec ce WebKit : `put` d'un Blob →
 * erreur en éphémère, succès en persistant).
 *
 * ── Ce qui est simulé, et ce qui ne l'est pas ──────────────────────────
 *
 * Le « serveur » est un banc en mémoire, branché sur les routes `/api/**` et
 * Cloudinary. Il reproduit les règles des vraies routes qui comptent ici :
 * le rattachement d'une photo ignore une URL ou un nom déjà présents
 * (src/app/api/photos/attach), un signalement déjà reçu sous le même
 * identifiant n'est pas recréé (src/app/api/defauts). Rien ne sort vers
 * Notion, Cloudinary, Redis ou la production.
 *
 * L'absence de réseau est simulée en faisant échouer toutes les requêtes
 * `/api/**` et Cloudinary par une erreur réseau. `context.setOffline(true)`
 * bloquerait aussi la navigation, que le service worker — écarté ici pour
 * que Playwright voie les appels — assure en production. Conséquence :
 * `navigator.onLine` reste vrai pendant toute la coupure. C'est le cas le
 * plus traître du terrain — une barre de réseau qui ne fait rien passer —
 * et l'application doit le tenir.
 *
 * Tout le reste est le vrai code du client, compilé : IndexedDB, la file
 * des écritures, la compression des photos, le pavé de signature, les
 * reprises et leurs délais.
 *
 * ── Les quatre tests ───────────────────────────────────────────────────
 *
 *   1. La journée sans réseau, chantier A puis chantier B : tout est gardé
 *      sur le téléphone, l'écran dit « en attente », rien ne part.
 *   2. Le retour du réseau, perturbé (trois 503, un rechargement en plein
 *      envoi, une réponse perdue) : tout arrive, exactement une fois.
 *      ÉCHEC ATTENDU dans WebKit — voir DEFAUT_SYNCHRO_FIGEE_WEBKIT.
 *   3. Le défaut, refait au retour du réseau — hors ligne il est impossible,
 *      voir le test 1 — avec sa réponse perdue : créé une seule fois.
 *   4. Deux versions du rapport écrites hors ligne : la correction doit
 *      l'emporter. ÉCHEC ATTENDU — voir DEFAUT_ORDRE_DES_ECRITURES.
 *
 * Les tests 1 et 2 se suivent sur le même téléphone (même profil).
 */
import { test, expect, devices, type BrowserContext, type Page, type Route, type Request } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brancherFixtures, projetFictif, sansServiceWorker, seConnecter, PROJET_ID } from "./harnais";

const BASE = "http://127.0.0.1:3137";
const A = PROJET_ID;
const B = "22222222-3333-4444-5555-666666666666";
const NOM_A = "Chantier A — Immeuble des Tilleuls";
const NOM_B = "Chantier B — Villa du Lac";

/** La colonne Notion (libellé reçu au rattachement) → la clé du projet. */
const CHAMP_DU_LIBELLE: Record<string, string> = {
  "Photos avant montage": "photosAvant",
  "Photos démontage": "photosDemontage",
  "Photos montage terminé": "photosMontage",
  "Photos QR Code": "photosQRCode",
  "Photos garanties": "photosGaranties",
};

/* ══════════════════════════════════════════════════════════════════════════
   Le banc : un serveur en mémoire, et l'état du réseau
   ══════════════════════════════════════════════════════════════════════════ */

type Reseau = "ok" | "coupe" | "instable";
type Issue = "coupee" | "refusee-503" | "acceptee" | "reponse-perdue" | "interrompue";
interface Fichier { name: string; url: string }
interface Passage {
  n: number;
  methode: string;
  chemin: string;
  donnees: boolean;
  issue: Issue;
  corps?: unknown;
}

class Banc {
  reseau: Reseau = "ok";
  /** En réseau instable : combien d'écritures de données refuser (503). */
  refusRestants = 0;
  /** Une fois : la requête est TRAITÉE, puis la réponse est coupée. */
  perdreLaReponse: ((p: Passage) => boolean) | null = null;
  /** Une fois : la requête reste suspendue, jamais traitée. */
  retenir: ((p: Passage) => boolean) | null = null;
  retenues = 0;
  private liberer: () => void = () => {};
  private liberation = new Promise<void>((r) => { this.liberer = r; });

  readonly projets: Record<string, Record<string, unknown>> = {};
  readonly defauts = new Map<string, Record<string, unknown>>();
  /** Fichiers reçus par « Cloudinary », dans l'ordre. */
  readonly cloudinary: { nom: string; url: string; taille: number; sha: string | null; jpeg: boolean }[] = [];
  /** Les octets tels que la PAGE les confie au réseau (voir brancher). */
  readonly envoisPage: { nom: string; taille: number; sha: string; jpeg: boolean }[] = [];
  readonly pdf: { projet: string; params: string }[] = [];
  readonly journal: Passage[] = [];
  private compteur = 0;

  constructor(projets: Record<string, unknown>[]) {
    for (const p of projets) this.projets[p.id as string] = structuredClone(p);
  }

  libererLesRetenues() { this.liberer(); }

  /** Écritures de DONNÉES (ce qui finit dans Notion ou Cloudinary). */
  static estDonnee(methode: string, url: URL): boolean {
    const c = url.pathname;
    if (url.hostname.includes("cloudinary")) return methode === "POST";
    if (methode === "PATCH" && /^\/api\/projects\/[^/]+$/.test(c)) return true;
    if (methode === "POST" && (c === "/api/photos/attach" || c === "/api/defauts" || c === "/api/upload")) return true;
    if (c.startsWith("/api/pdf/") && url.searchParams.get("send") === "1") return true;
    return false;
  }

  acceptees(filtre: (p: Passage) => boolean = () => true) {
    return this.journal.filter((p) => p.issue === "acceptee" && filtre(p));
  }

  /**
   * Le portier : décide du sort d'une requête selon l'état du réseau, puis
   * la confie au traitement, qui rend faux s'il la laisse au harnais commun
   * (elle sort alors du journal : ce n'est pas une donnée).
   */
  async intercepter(route: Route, traiter: (p: Passage) => Promise<boolean>): Promise<void> {
    const req = route.request();
    const url = new URL(req.url());
    const p: Passage = {
      n: ++this.compteur,
      methode: req.method(),
      chemin: url.hostname.includes("cloudinary") ? `cloudinary:${url.pathname}` : url.pathname + url.search,
      donnees: Banc.estDonnee(req.method(), url),
      issue: "acceptee",
      corps: lireCorpsJson(req),
    };
    this.journal.push(p);

    if (this.reseau === "coupe") {
      p.issue = "coupee";
      await route.abort("internetdisconnected").catch(() => {});
      return;
    }
    if (this.reseau === "instable" && p.donnees) {
      if (this.retenir?.(p)) {
        this.retenir = null;
        this.retenues++;
        p.issue = "interrompue";
        await this.liberation;
        /* La page a été rechargée entre-temps : la requête n'existe plus. */
        await route.abort("connectionreset").catch(() => {});
        return;
      }
      if (this.refusRestants > 0) {
        this.refusRestants--;
        p.issue = "refusee-503";
        await route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"Notion indisponible"}' }).catch(() => {});
        return;
      }
    }
    const perdre = p.donnees && !!this.perdreLaReponse?.(p);
    if (perdre) {
      this.perdreLaReponse = null;
      p.issue = "reponse-perdue";
      /* Le serveur fait son travail… */
      await traiter(p).catch(() => {});
      /* …mais la réponse n'arrive jamais au téléphone. */
      return;
    }
    const pris = await traiter(p);
    if (!pris) this.journal.splice(this.journal.indexOf(p), 1);
  }

  /* ── Les routes du serveur simulé ─────────────────────────────────────── */

  async brancher(page: Page): Promise<void> {
    /* Le harnais commun sert l'authentification, les droits et les menus ;
       ce banc passe devant lui pour tout ce qui porte des données. */
    await brancherFixtures(page, { projet: this.projets[A] });

    /* Ce que la page envoie VRAIMENT à Cloudinary. Dans WebKit, Playwright
       ne voit pas les octets d'un Blob construit en mémoire (il ne voit que
       les champs du formulaire) : son relevé dirait « 0 octet » alors que la
       photo part entière. La page relève donc elle-même les octets qu'elle
       confie à fetch, au moment de l'envoi. */
    await page.context().exposeBinding("__tmEnvoiCloudinary", (_s, info: { nom: string; taille: number; sha: string; jpeg: boolean }) => {
      this.envoisPage.push(info);
    }).catch(() => { /* déjà branché sur ce contexte */ });
    await page.context().addInitScript(() => {
      const w = window as unknown as { fetch: typeof fetch; __tmEnvoiCloudinary?: (i: unknown) => Promise<void> };
      const origine = w.fetch.bind(window);
      w.fetch = (async (entree: RequestInfo | URL, init?: RequestInit) => {
        try {
          const url = typeof entree === "string" ? entree : entree instanceof URL ? entree.href : entree.url;
          if (url.includes("api.cloudinary.com") && init?.body instanceof FormData) {
            const f = init.body.get("file");
            if (f instanceof Blob) {
              const buf = await f.arrayBuffer();
              const h = await crypto.subtle.digest("SHA-256", buf);
              const u = new Uint8Array(buf);
              await w.__tmEnvoiCloudinary?.({
                nom: (f as File).name || "inconnu", taille: buf.byteLength,
                sha: [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join(""),
                jpeg: u[0] === 0xff && u[1] === 0xd8,
              });
            }
          }
        } catch { /* le relevé ne doit jamais gêner l'envoi */ }
        return origine(entree, init);
      }) as typeof fetch;
    });

    const json = (route: Route, corps: unknown, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(corps) });

    await page.route("**/api/**", (route) => this.intercepter(route, async (p) => {
      const req = route.request();
      const url = new URL(req.url());
      const c = url.pathname;
      const corps = p.corps as Record<string, unknown> | undefined;
      const perdue = p.issue === "reponse-perdue";
      const repondre = async (val: unknown, status = 200) => {
        if (perdue) { await route.abort("connectionreset").catch(() => {}); return true; }
        await json(route, val, status).catch(() => {});
        return true;
      };

      const m = /^\/api\/projects\/([^/]+)(\/.*)?$/.exec(c);
      if (m && this.projets[m[1]]) {
        const projet = this.projets[m[1]];
        if (m[2]) return repondre(req.method() === "GET" ? [] : { ok: true });
        if (req.method() === "GET") return repondre(projet);
        if (req.method() === "PATCH" && corps) {
          Object.assign(projet, corps);
          projet.lastEditedTime = new Date().toISOString();
          return repondre({ ok: true });
        }
      }
      if (c === "/api/projects" || /^\/api\/projects\/[a-z-]+$/.test(c) && !c.includes("field-options")) {
        return repondre(Object.values(this.projets));
      }
      if (c === "/api/photos/attach" && corps) {
        /* La règle de la vraie route : une URL ou un nom déjà présents ne
           sont jamais ajoutés une seconde fois. */
        const projet = this.projets[corps.projectId as string];
        const cle = CHAMP_DU_LIBELLE[corps.notionField as string];
        if (!projet || !cle) return repondre({ error: "champ inconnu" }, 400);
        const liste = (projet[cle] as Fichier[]) ?? [];
        for (const ph of corps.photos as Fichier[]) {
          if (liste.some((f) => f.url === ph.url || f.name === ph.name)) continue;
          liste.push({ name: ph.name, url: ph.url });
        }
        projet[cle] = liste;
        return repondre({ ok: true });
      }
      if (c === "/api/defauts") {
        if (req.method() === "GET") return repondre([...this.defauts.values()]);
        if (req.method() === "POST" && corps) {
          /* La règle de la vraie route : même identifiant = déjà enregistré. */
          const id = String(corps.id || "");
          if (id && this.defauts.has(id)) return repondre({ success: true, deja: true });
          this.defauts.set(id || `srv-${this.defauts.size + 1}`, { ...corps, status: "signale", timestamp: Date.now() });
          return repondre({ success: true });
        }
      }
      if (c === "/api/photos/sign") {
        return repondre({ signature: "x", timestamp: 1, apiKey: "k", cloudName: "banc-e2e", folder: "e2e" });
      }
      if (c === "/api/upload") {
        return repondre({ files: [{ name: "defaut.jpg", url: `https://res.cloudinary.test/e2e/defaut-${p.n}.jpg` }] });
      }
      if (c.startsWith("/api/pdf/")) {
        this.pdf.push({ projet: c.split("/")[3], params: url.search });
        return repondre({ ok: true });
      }
      /* Le reste — authentification, droits, menus — au harnais commun. */
      await route.fallback().catch(() => {});
      return false;
    }));

    const cloudinary = (route: Route) => this.intercepter(route, async (p) => {
      const req = route.request();
      const fichier = partieFichier(req);
      let nom = fichier?.nom ?? "inconnu";
      /* Octets invisibles pour Playwright (Blob en mémoire) : on prend le
         relevé fait par la page pour cet envoi. */
      const vuParLaPage = (!fichier || fichier.octets.length === 0)
        ? [...this.envoisPage].reverse().find((e) => fichier ? e.nom === fichier.nom : true)
        : undefined;
      if (vuParLaPage) nom = vuParLaPage.nom;
      if (process.env.E2E_DIAG && (!fichier || fichier.octets.length === 0)) {
        console.log(`DIAG cloudinary vide: nom=${nom} content-length=${req.headers()["content-length"]} corps=${req.postDataBuffer()?.length ?? "null"} n=${p.n}`);
      }
      const url = `https://res.cloudinary.test/e2e/${p.n}/${encodeURIComponent(nom)}`;
      this.cloudinary.push({
        nom, url,
        taille: vuParLaPage ? vuParLaPage.taille : (fichier?.octets.length ?? -1),
        sha: vuParLaPage ? vuParLaPage.sha : (fichier ? createHash("sha256").update(fichier.octets).digest("hex") : null),
        jpeg: vuParLaPage ? vuParLaPage.jpeg : (!!fichier && fichier.octets[0] === 0xff && fichier.octets[1] === 0xd8),
      });
      p.corps = { nom };
      if (p.issue === "reponse-perdue") { await route.abort("connectionreset").catch(() => {}); return true; }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ secure_url: url }) }).catch(() => {});
      return true;
    });
    await page.route("**api.cloudinary.com/**", cloudinary);
    await page.route("**res.cloudinary.com/**", (route) => route.fulfill({ status: 404, body: "" }).catch(() => {}));
    /* Les vignettes des photos rattachées pointent vers ce domaine fictif. */
    await page.route("**res.cloudinary.test/**", (route) => route.fulfill({ status: 404, body: "" }).catch(() => {}));
  }
}

function lireCorpsJson(req: Request): unknown {
  try {
    const brut = req.postData();
    return brut ? JSON.parse(brut) : undefined;
  } catch {
    return undefined;
  }
}

/** Extrait le fichier d'un envoi multipart vers Cloudinary. */
function partieFichier(req: Request): { nom: string; octets: Buffer } | null {
  const type = req.headers()["content-type"] || "";
  const borne = /boundary=(?:"([^"]+)"|([^;]+))/.exec(type);
  const buf = req.postDataBuffer();
  if (!borne || !buf) return null;
  const sep = Buffer.from(`--${borne[1] || borne[2]}`);
  let debut = buf.indexOf(sep);
  while (debut !== -1) {
    const suivant = buf.indexOf(sep, debut + sep.length);
    if (suivant === -1) break;
    const partie = buf.subarray(debut + sep.length + 2, suivant - 2);
    const finEntete = partie.indexOf("\r\n\r\n");
    const entete = partie.subarray(0, finEntete).toString("utf8");
    const m = /name="file"; filename="([^"]*)"/.exec(entete);
    if (m) return { nom: m[1], octets: partie.subarray(finEntete + 4) };
    debut = suivant;
  }
  return null;
}

/* ══════════════════════════════════════════════════════════════════════════
   Ce que le téléphone garde : les deux files
   ══════════════════════════════════════════════════════════════════════════ */

interface ElementIdb {
  id: string;
  projectId: string;
  category: string;
  notionField?: string;
  champTexte?: string;
  status?: string;
  files: { name: string; taille: number; sha: string; uploadedUrl?: string }[];
}
interface EcritureEnFile { id: string; url: string; method: string; body?: Record<string, unknown>; statut?: string; retryCount?: number }

/** Une entrée de `pendingUploads` telle qu'IndexedDB la rend. */
interface EntreeBrute {
  id: string; projectId: string; category: string; notionField?: string; champTexte?: string;
  status?: string; retryCount?: number;
  files?: { name: string; blob: Blob; uploadedUrl?: string }[];
}

/** Les entrées de la file des photos, sans lire les octets (rapide). */
async function entreesPhotos(page: Page): Promise<{ id: string; projectId: string; champTexte?: string; notionField?: string; status?: string; retryCount?: number }[]> {
  return page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((res, rej) => {
      const r = indexedDB.open("tm-rapport-uploads");
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    if (!db.objectStoreNames.contains("pendingUploads")) { db.close(); return []; }
    const items: EntreeBrute[] = await new Promise((res) => {
      const q = db.transaction("pendingUploads", "readonly").objectStore("pendingUploads").getAll();
      q.onsuccess = () => res(q.result);
      q.onerror = () => res([]);
    });
    db.close();
    return items.map((it) => ({ id: it.id, projectId: it.projectId, champTexte: it.champTexte,
                                notionField: it.notionField, status: it.status, retryCount: it.retryCount }));
  });
}

async function filePhotos(page: Page): Promise<ElementIdb[]> {
  return page.evaluate(async () => {
    /* Une lecture peut croiser une réécriture de la même entrée par la file
       (compteur d'essais, délai) : WebKit range alors les octets dans un
       nouveau fichier et la référence qu'on tenait devient illisible
       (NotFoundError, « WebKitBlobResource error 1 »). On relit dans ce cas. Si les octets restent
       illisibles après plusieurs relectures, on le DIT (taille -1) au lieu
       de lever : ce serait une vraie perte, et le test doit la voir. */
    const lireUneFois = async (dernier: boolean) => {
      const db: IDBDatabase = await new Promise((res, rej) => {
        const r = indexedDB.open("tm-rapport-uploads");
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      if (!db.objectStoreNames.contains("pendingUploads")) { db.close(); return []; }
      const items: EntreeBrute[] = await new Promise((res) => {
        const q = db.transaction("pendingUploads", "readonly").objectStore("pendingUploads").getAll();
        q.onsuccess = () => res(q.result);
        q.onerror = () => res([]);
      });
      db.close();
      const out = [];
      for (const it of items) {
        const files = [];
        for (const f of it.files || []) {
          let taille = -1;
          let sha = "ILLISIBLE";
          try {
            const buf = await f.blob.arrayBuffer();
            const h = await crypto.subtle.digest("SHA-256", buf);
            taille = buf.byteLength;
            sha = [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
          } catch {
            if (!dernier) return null;
          }
          files.push({ name: f.name, taille, sha, uploadedUrl: f.uploadedUrl });
        }
        out.push({ id: it.id, projectId: it.projectId, category: it.category, notionField: it.notionField,
                   champTexte: it.champTexte, status: it.status, files });
      }
      return out;
    };
    /* Jusqu'à une vingtaine de secondes : pendant que la file réessaie, elle
       réécrit ses entrées en rafale (constaté dans ce WebKit : plusieurs
       secondes d'octets illisibles, puis tout redevient lisible). */
    for (let essai = 0; essai < 100; essai++) {
      const r = await lireUneFois(false);
      if (r) return r;
      await new Promise((ok) => setTimeout(ok, 200));
    }
    return (await lireUneFois(true))!;
  });
}

async function fileEcritures(page: Page): Promise<EcritureEnFile[]> {
  return page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem("tm-rapport-queue") || "[]"); } catch { return []; }
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   Les gestes du monteur
   ══════════════════════════════════════════════════════════════════════════ */

/** De petites images JPEG, toutes différentes, fabriquées par le navigateur. */
async function fabriquerJpegs(page: Page, n: number): Promise<Buffer[]> {
  const b64: string[] = await page.evaluate((combien) => {
    const out: string[] = [];
    for (let i = 0; i < combien; i++) {
      const c = document.createElement("canvas");
      c.width = 96; c.height = 72;
      const g = c.getContext("2d")!;
      g.fillStyle = `hsl(${(i * 37) % 360} 70% 50%)`;
      g.fillRect(0, 0, 96, 72);
      g.fillStyle = "#fff";
      g.font = "28px sans-serif";
      g.fillText(String(i + 1), 30, 48);
      out.push(c.toDataURL("image/jpeg", 0.9).split(",")[1]);
    }
    return out;
  }, n);
  return b64.map((s) => Buffer.from(s, "base64"));
}

async function ouvrirLeChantier(page: Page, id: string, nom: string) {
  await page.goto(`/projet/${id}?mode=cmd`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText(nom).first()).toBeVisible({ timeout: 40_000 });
  await page.getByText(/Consulter le rapport de montage|Démarrer le rapport de montage/).first().click();
  await expect(page.locator("#signature-card")).toBeVisible({ timeout: 20_000 });
}

async function ongletPhotos(page: Page) {
  await page.getByRole("button", { name: "Photos", exact: true }).click();
  await expect(page.locator("label", { hasText: /^Photos montage$/ })).toBeVisible();
}

async function ongletRapport(page: Page) {
  await page.getByRole("button", { name: "Rapport", exact: true }).click();
  await expect(page.getByPlaceholder("Précisions supplémentaires...").first()).toBeVisible();
}

/**
 * Une photo, choisie dans la galerie d'une planche, comme au doigt. On
 * attend qu'elle soit DANS IndexedDB avant de rendre la main : c'est ce qui
 * la fait exister sur le téléphone.
 */
async function photographier(page: Page, planche: string, jpeg: Buffer, projet: string) {
  const avant = (await entreesPhotos(page)).filter((x) => x.projectId === projet && !x.champTexte).length;
  const champ = page.locator(`xpath=//label[normalize-space()="${planche}"]/parent::div//input[@type="file" and @multiple]`);
  await expect(champ).toHaveCount(1);
  await champ.setInputFiles({ name: `IMG_${Date.now()}.jpg`, mimeType: "image/jpeg", buffer: jpeg });
  await expect
    .poll(async () => (await entreesPhotos(page)).filter((x) => x.projectId === projet && !x.champTexte).length,
          { timeout: 15_000, message: `la photo « ${planche} » doit entrer dans IndexedDB` })
    .toBe(avant + 1);
  /* L'anti double-déclenchement iOS ignore une 2e sélection < 600 ms. */
  await page.waitForTimeout(700);
}

/** Fait signer le client sur le pavé, au doigt. */
async function fairesigner(page: Page) {
  const carte = page.locator("#signature-card");
  await carte.scrollIntoViewIfNeeded();
  await carte.locator("button").first().click();
  await expect(page.getByText("Signez ici")).toBeVisible({ timeout: 15_000 });
  const boite = await carte.locator("canvas").boundingBox();
  if (!boite) throw new Error("pavé de signature introuvable");
  await page.mouse.move(boite.x + 30, boite.y + 60);
  await page.mouse.down();
  await page.mouse.move(boite.x + 100, boite.y + 110, { steps: 8 });
  await page.mouse.move(boite.x + 180, boite.y + 60, { steps: 8 });
  await page.mouse.up();
  await page.getByText(/Valider la signature/).click();
  await expect(page.getByText(/en attente d'envoi/i).first()).toBeVisible({ timeout: 15_000 });
}

async function lancerIphone(playwright: typeof import("playwright"), profil: string, use: Record<string, unknown>) {
  /* Les réglages du projet (iPhone 13), appliqués au contexte persistant. */
  const iphone = { ...devices["iPhone 13"], ...use } as Record<string, unknown>;
  delete iphone.defaultBrowserType;
  /* Outil de diagnostic : E2E_JOURNEE_MOTEUR=chromium rejoue le même scénario
     dans Chromium, pour séparer ce qui tient au moteur de ce qui tient à
     l'application. Par défaut, et dans la suite : WebKit. */
  const ctx: BrowserContext = process.env.E2E_JOURNEE_MOTEUR === "chromium"
    ? await playwright.chromium.launchPersistentContext(profil, { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, baseURL: BASE })
    : await playwright.webkit.launchPersistentContext(profil, { ...(iphone as object), baseURL: BASE });
  await sansServiceWorker(ctx);
  await seConnecter(ctx);
  return ctx;
}

/* ══════════════════════════════════════════════════════════════════════════
   Le scénario : une journée, en trois temps qui se suivent
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * DÉFAUT CONSTATÉ LE 18 OCTOBRE 2026 — la synchronisation se fige dans WebKit.
 *
 * Au retour du réseau, la première photo part chez Cloudinary, puis la file
 * veut réécrire son entrée IndexedDB pour y noter l'URL obtenue. Dans ce
 * WebKit, la référence au `Blob` relue juste avant est devenue illisible
 * (NotFoundError) et la réécriture échoue :
 *     UnknownError: Error preparing Blob/File data to be stored in object store
 * Le même scénario passe dans Chromium (E2E_JOURNEE_MOTEUR=chromium).
 *
 * Ce qui relève de l'APPLICATION, et vaut quel que soit le moteur :
 *   - dans `_processOneItem` (src/lib/idb-uploads.ts), la seconde écriture —
 *     celle qui note l'échec — n'est pas protégée : son rejet remonte et fait
 *     rejeter `processPendingUploads` ;
 *   - `autoSync` (src/components/sync-button.tsx) n'a pas de try/finally :
 *     `autoSyncingRef.current` reste à `true` et PLUS AUCUNE synchronisation
 *     automatique ne part — ni les photos, ni les écritures du rapport —
 *     jusqu'au rechargement de l'application. Au rechargement, la même
 *     erreur se reproduit : les octets repartent chez Cloudinary, le
 *     rattachement n'est jamais fait.
 * Rien n'est perdu : tout reste dans IndexedDB et dans `tm-rapport-queue`.
 * Mais rien n'arrive non plus.
 *
 * Le test 2 vérifie le comportement ATTENDU ; il est marqué « échec attendu »
 * tant que ce défaut existe. Le jour où il passe, Playwright le signalera :
 * il suffira alors de passer cette constante à `false`.
 */
/* Corrigé le 18.10.2026 (src/lib/idb-uploads.ts : octets recopiés avant
   réécriture ; sync-button : verrou toujours relâché). */
const DEFAUT_SYNCHRO_FIGEE_WEBKIT = false;

test.describe.serial("une journée de monteur sans réseau, puis la synchronisation", () => {
  const PHRASE = "Silicone refait côté mur, joint de seuil remplacé — essai d'eau concluant.";
  const DESCRIPTION_DEFAUT = "Éclat sur la paroi fixe, angle bas gauche.";
  let attenduDefaut: { projet: string; nom: string; sha: string }[] = [];
  let banc: Banc;
  let profil: string;
  let ctx: BrowserContext;
  let page: Page;
  let jpegs: Buffer[];
  const erreursDeLaPage: string[] = [];
  /* Ce que le monteur a laissé sur le téléphone : la référence de la fin. */
  let attenduPhotos: { projet: string; champ: string; nom: string; sha: string; taille: number }[] = [];
  let attenduSignatures: { projet: string; nom: string; sha: string }[] = [];
  let dernierRapportA: Record<string, unknown> = {};

  test.beforeAll(async ({ playwright }, testInfo) => {
    banc = new Banc([
      projetFictif({ id: A, projet: NOM_A, ofrTM: "TM-6000001", nomChantier: "Immeuble des Tilleuls" }),
      projetFictif({ id: B, projet: NOM_B, ofrTM: "TM-6000002", nomChantier: "Villa du Lac",
                     adresseChantier: "Chemin du Lac 4, 1007 Lausanne" }),
    ]);
    profil = mkdtempSync(join(tmpdir(), "tm-e2e-journee-"));
    ctx = await lancerIphone(playwright as never, profil, testInfo.project.use as Record<string, unknown>);
    page = ctx.pages()[0] ?? (await ctx.newPage());
    page.on("pageerror", (e) => erreursDeLaPage.push(String(e?.message ?? e)));
    page.on("console", (m) => { if (m.type() === "error" && /IndexedDB|Blob|Unhandled/i.test(m.text())) erreursDeLaPage.push(m.text().slice(0, 200)); });
    await banc.brancher(page);
  });

  /* Le journal du banc accompagne chaque résultat : ce qui est passé, ce qui
     a été refusé, coupé, perdu — de quoi lire un échec sans le rejouer. */
  test.afterEach(async ({}, testInfo) => {
    await testInfo.attach("journal-du-banc.json", {
      contentType: "application/json",
      body: JSON.stringify(banc.journal.map(({ n, methode, chemin, issue }) => ({ n, methode, chemin, issue })), null, 1),
    });
  });

  test.afterAll(async () => {
    await ctx?.close().catch(() => {});
    if (profil) rmSync(profil, { recursive: true, force: true });
  });

  test("1 — sans réseau, chantier A puis chantier B : tout est gardé, rien ne part", async () => {
    test.setTimeout(3 * 60_000);

    /* ── 1. Le matin, avec réseau : on ouvre les deux chantiers ───────── */
    /* D'abord l'accueil, comme chaque matin : c'est lui qui garde les listes
       de chantiers sur le téléphone (`tm-projects-cache`), et c'est là que
       la fiche ira chercher B quand il n'y aura plus de réseau. (En
       production, le service worker en garde aussi une copie.) */
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect
      .poll(() => page.evaluate((id) => (localStorage.getItem("tm-projects-cache") || "").includes(id), B),
            { timeout: 40_000, message: "l'accueil doit garder les chantiers du jour sur le téléphone" })
      .toBe(true);
    await ouvrirLeChantier(page, B, NOM_B);
    await ouvrirLeChantier(page, A, NOM_A);
    jpegs = await fabriquerJpegs(page, 10);
    expect(banc.acceptees((p) => p.donnees), "le matin, rien n'est encore écrit").toHaveLength(0);

    /* ── 2. Chantier A, plus de réseau ─────────────────────────────────── */
    banc.reseau = "coupe";
    const debutCoupure = banc.journal.length;

    // 2a. Les sept photos exigées à l'envoi : 2 avant, 3 montage, 2 après.
    await ongletPhotos(page);
    await photographier(page, "Photos avant intervention", jpegs[0], A);
    await photographier(page, "Photos avant intervention", jpegs[1], A);
    await photographier(page, "Photos montage", jpegs[2], A);
    await photographier(page, "Photos montage", jpegs[3], A);
    await photographier(page, "Photos montage", jpegs[4], A);
    await photographier(page, "Photos après intervention", jpegs[5], A);
    await photographier(page, "Photos après intervention", jpegs[6], A);
    /* L'écran les montre comme gardées sur l'appareil, pas comme envoyées. */
    await expect(page.locator('[title^="Enregistrée sur l\'appareil"]')).toHaveCount(7);

    // 2b. Le rapport du monteur.
    await ongletRapport(page);
    await page.getByPlaceholder("Précisions supplémentaires...").first().fill(PHRASE);
    await page.getByRole("button", { name: /^Client présent lors du montage/ }).first().click();
    /* L'enregistrement automatique part 2 s après le dernier geste. */
    await expect
      .poll(async () => (await fileEcritures(page)).filter((e) => {
        const r = String(e.body?.rapportMonteur ?? "");
        return r.includes(PHRASE) && r.includes("Client présent lors du montage");
      }).length, { timeout: 15_000, message: "le texte du rapport doit entrer dans la file" })
      .toBeGreaterThan(0);

    // 2c. Le défaut, avec sa photo obligatoire.
    /* Sans réseau, le défaut et sa photo vont dans la file des photos
       (correction du 18.10.2026 : avant, le formulaire envoyait la photo en
       direct et refusait le défaut hors ligne). Il partira au retour du
       réseau : la photo d'abord, puis le signalement avec son URL, une
       seule fois grâce à son identifiant. */
    await page.getByRole("button", { name: "Signalements", exact: true }).click();
    await page.getByRole("button", { name: /^Signaler un défaut$/ }).click();
    await page.getByRole("button", { name: "Défaut d'usine" }).click();
    await page.getByPlaceholder("Décrivez le défaut constaté...").fill(DESCRIPTION_DEFAUT);
    await page.locator("div.glass-card", { hasText: "Description du défaut" }).locator('input[type="file"][multiple]')
      .setInputFiles({ name: "defaut.jpg", mimeType: "image/jpeg", buffer: jpegs[7] });
    await expect(page.getByAltText("Défaut 1")).toBeVisible();
    await page.getByRole("button", { name: "Enregistrer le signalement" }).click();
    await expect(page.getByText(/Défaut enregistré sur l'appareil/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByAltText("Défaut 1"), "le formulaire se referme").toHaveCount(0);
    const defautEnFile = (await filePhotos(page)).filter((x) => x.category === "signalements-hors-ligne");
    expect(defautEnFile, "le défaut est dans la file des photos").toHaveLength(1);
    expect(defautEnFile[0].projectId).toBe(A);
    expect(defautEnFile[0].files[0].taille, "avec les octets de sa photo").toBeGreaterThan(0);
    expect(banc.journal.some((p) => p.chemin === "/api/defauts" && p.methode === "POST" && p.issue !== "coupee"),
           "aucun défaut n'a atteint le serveur").toBe(false);

    // 2d. La signature du client.
    await ongletRapport(page);
    await fairesigner(page);

    // 2e. Finaliser et envoyer le rapport — l'écran le permet hors ligne.
    await page.getByRole("button", { name: "Envoyer rapport clients" }).click();
    await expect(page.getByRole("heading", { name: "Rapport finalisé" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Tout est enregistré sur votre téléphone/)).toBeVisible();
    await expect(page.getByText(/\d+ photos? en attente/)).toBeVisible();
    await page.getByRole("button", { name: "OK", exact: true }).click();
    await expect(page.getByText("Rapport finalisé — Synchronisation en attente").first()).toBeVisible();

    // Les files tiennent TOUT, et rien n'a atteint le serveur.
    const photosA = await filePhotos(page);
    const ecrituresA = await fileEcritures(page);
    const photosDeA = photosA.filter((x) => x.projectId === A && !x.champTexte && x.category !== "signalements-hors-ligne");
    expect(photosDeA, "7 photos de A en file").toHaveLength(7);
    expect(photosDeA.map((x) => x.notionField).sort()).toEqual([
      "Photos avant montage", "Photos avant montage",
      "Photos montage terminé", "Photos montage terminé", "Photos montage terminé",
      "Photos montage terminé", "Photos montage terminé",
    ]);
    expect(photosDeA.map((x) => x.files[0].name.split(".")[0]).sort(), "chaque photo dans sa planche").toEqual([
      "Apres intervention", "Apres intervention", "Avant intervention", "Avant intervention",
      "Montage gauche", "Montage gauche", "Montage gauche",
    ]);
    for (const x of photosDeA) expect(x.files[0].taille, `octets de ${x.files[0].name}`).toBeGreaterThan(0);
    expect(photosA.filter((x) => x.projectId === A && x.champTexte === "signatureUrl"), "signature de A en file").toHaveLength(1);
    const rapportsEnFile = ecrituresA.filter((e) => e.url === `/api/projects/${A}` && typeof e.body?.rapportMonteur === "string");
    expect(rapportsEnFile.length, "le rapport de A en file").toBeGreaterThan(0);
    expect(String(rapportsEnFile.at(-1)!.body!.rapportMonteur)).toContain(PHRASE);
    expect(await page.evaluate((id) => JSON.parse(localStorage.getItem(`tm-rapport-finalise-${id}`) || "null"), A),
           "le rapport est marqué finalisé, pas envoyé").toMatchObject({ envoye: false, client: true });
    const pendantLaCoupure = banc.journal.slice(debutCoupure);
    expect(pendantLaCoupure.length, "l'application a bien essayé le réseau").toBeGreaterThan(0);
    expect(pendantLaCoupure.filter((p) => p.issue !== "coupee"), "aucune requête n'est passée").toHaveLength(0);
    expect(banc.acceptees((p) => p.donnees), "aucune écriture n'a atteint le serveur").toHaveLength(0);

    /* ── 3. Chantier B, toujours sans réseau ───────────────────────────── */
    await ouvrirLeChantier(page, B, NOM_B);
    await ongletPhotos(page);
    await photographier(page, "Photos montage", jpegs[8], B);
    await ongletRapport(page);
    await fairesigner(page);
    const avantSynchro = await filePhotos(page);
    expect(avantSynchro.filter((x) => x.projectId === B), "photo + signature de B en file").toHaveLength(2);
    expect(avantSynchro, "8 photos, 1 défaut et 2 signatures en file").toHaveLength(11);
    for (const x of avantSynchro) {
      expect(x.files[0].taille, `les octets de « ${x.files[0].name} » sont lisibles sur le téléphone`).toBeGreaterThan(0);
    }
    expect(banc.acceptees((p) => p.donnees), "toujours rien sur le serveur").toHaveLength(0);

    attenduDefaut = avantSynchro.filter((x) => x.category === "signalements-hors-ligne").map((x) => ({
      projet: x.projectId, nom: x.files[0].name, sha: x.files[0].sha,
    }));
    attenduPhotos = avantSynchro.filter((x) => !x.champTexte && x.category !== "signalements-hors-ligne").map((x) => ({
      projet: x.projectId, champ: CHAMP_DU_LIBELLE[x.notionField!], nom: x.files[0].name,
      sha: x.files[0].sha, taille: x.files[0].taille,
    }));
    attenduSignatures = avantSynchro.filter((x) => x.champTexte === "signatureUrl").map((x) => ({
      projet: x.projectId, nom: x.files[0].name, sha: x.files[0].sha,
    }));
    dernierRapportA = [...(await fileEcritures(page))].reverse()
      .find((e) => e.url === `/api/projects/${A}` && typeof e.body?.rapportMonteur === "string")!.body!;
  });

  test("2 — le réseau revient, mal (503, rechargement, réponse perdue) : tout arrive, une fois", async () => {
    test.fail(DEFAUT_SYNCHRO_FIGEE_WEBKIT, "défaut du 18.10.2026 : la synchronisation se fige (voir DEFAUT_SYNCHRO_FIGEE_WEBKIT)");
    test.setTimeout(5 * 60_000);
    expect(attenduPhotos, "le test 1 a laissé 8 photos sur le téléphone").toHaveLength(8);

    /* ── 4. Le réseau revient… mal ─────────────────────────────────────── */
    banc.reseau = "instable";
    banc.refusRestants = 3;                                              // 3 écritures refusées (503)
    banc.retenir = (p) => p.chemin.startsWith("cloudinary:");            // 1 envoi d'octets coupé par le rechargement
    banc.perdreLaReponse = (p) => p.chemin === "/api/photos/attach";     // 1 rattachement fait, réponse perdue
    const debutSynchro = banc.journal.length;
    /* `navigator.onLine` n'a jamais changé (voir l'en-tête) : on émet
       l'événement que le téléphone émettrait en retrouvant le réseau. */
    await page.evaluate(() => window.dispatchEvent(new Event("online")));

    /* Au milieu de la synchronisation, l'application est rechargée. */
    await expect.poll(() => banc.retenues, { timeout: 30_000, message: "un envoi doit être en vol" }).toBe(1);
    await page.reload({ waitUntil: "domcontentloaded" });
    banc.libererLesRetenues();
    await expect(page.getByText(NOM_B).first()).toBeVisible({ timeout: 40_000 });

    /* Puis tout finit par passer — y compris les écritures refusées, qui
       attendent leur délai de reprise (une minute pour les écritures). */
    try {
      await expect
        .poll(async () => {
          const [ph, ec] = [await entreesPhotos(page), await fileEcritures(page)];
          return ph.length + ec.length;
        }, { timeout: 180_000, intervals: [2_000] })
        .toBe(0);
    } catch {
      /* Un constat précis plutôt qu'un simple « délai dépassé ». */
      const restent = (await entreesPhotos(page)).length + (await fileEcritures(page)).length;
      throw new Error(
        `les deux files ne se vident pas : ${restent} entrées restent sur le téléphone. ` +
        `Reçu côté serveur : ${banc.acceptees((p) => p.chemin.startsWith("cloudinary:")).length} envois d'octets, ` +
        `${banc.acceptees((p) => p.chemin === "/api/photos/attach").length} rattachements. ` +
        `Erreurs de la page : ${erreursDeLaPage.slice(-3).join(" | ") || "aucune"}`);
    }
    /* Et le rapport finalisé de A part, une fois tout arrivé. */
    await expect.poll(() => banc.pdf.length, { timeout: 60_000, message: "le rapport de A doit partir" }).toBeGreaterThan(0);

    /* ── 5. Les comptes ────────────────────────────────────────────────── */
    const synchro = banc.journal.slice(debutSynchro);
    // Les perturbations ont bien eu lieu — sinon ce test ne prouverait rien.
    expect(synchro.filter((p) => p.issue === "refusee-503"), "3 refus 503").toHaveLength(3);
    expect(synchro.filter((p) => p.issue === "interrompue"), "1 envoi coupé par le rechargement").toHaveLength(1);
    expect(synchro.filter((p) => p.issue === "reponse-perdue"), "1 réponse perdue").toHaveLength(1);

    // Les files sont vides, et rien n'a été abandonné.
    expect(await entreesPhotos(page)).toHaveLength(0);
    expect(await fileEcritures(page)).toHaveLength(0);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("tm-offline-abandons") || "[]")),
           "aucune écriture abandonnée").toHaveLength(0);

    // Chaque photo : rattachée exactement une fois, au bon projet, au bon
    // champ, avec les octets pris sur le chantier.
    for (const ph of attenduPhotos) {
      const partout = Object.entries(banc.projets).flatMap(([id, pr]) =>
        Object.values(CHAMP_DU_LIBELLE).flatMap((cle) =>
          ((pr[cle] as Fichier[]) ?? []).filter((f) => f.name === ph.nom).map(() => `${id}/${cle}`)));
      expect(partout, `« ${ph.nom} » rattachée une seule fois, au bon endroit`).toEqual([`${ph.projet}/${ph.champ}`]);
      const recus = banc.cloudinary.filter((f) => f.nom === ph.nom);
      expect(recus.length, `octets de « ${ph.nom} » reçus`).toBeGreaterThan(0);
      for (const r of recus) {
        expect(r.jpeg, `« ${ph.nom} » est un JPEG (reçu ${r.taille} octets, attendu ${ph.taille} ; ${recus.length} envoi(s) : ${recus.map((x) => x.taille).join(", ")})`).toBe(true);
        expect(r.sha, `octets de « ${ph.nom} » identiques à ceux du téléphone`).toBe(ph.sha);
      }
    }
    const totalRattache = Object.values(banc.projets).reduce((s, pr) =>
      s + Object.values(CHAMP_DU_LIBELLE).reduce((t, cle) => t + ((pr[cle] as Fichier[]) ?? []).length, 0), 0);
    expect(totalRattache, "8 photos rattachées, pas une de plus").toBe(8);
    // La reprise après réponse perdue n'a pas renvoyé les octets : même URL.
    const rattachements = banc.journal.filter((p) => p.chemin === "/api/photos/attach" &&
                                                     (p.issue === "acceptee" || p.issue === "reponse-perdue"));
    expect(rattachements, "8 rattachements + 1 rejeu de la réponse perdue").toHaveLength(9);
    const perdu = rattachements.find((p) => p.issue === "reponse-perdue")!;
    const memePhotos = (p: Passage) => JSON.stringify((p.corps as { photos?: unknown }).photos);
    expect(rattachements.filter((p) => p !== perdu && memePhotos(p) === memePhotos(perdu)),
           "le rejeu porte exactement la même photo et la même URL").toHaveLength(1);

    // Le défaut saisi hors ligne : créé une seule fois, avec sa photo.
    expect(attenduDefaut, "le test 1 a laissé un défaut en file").toHaveLength(1);
    const defauts = [...banc.defauts.values()] as { description?: string; projectId?: string; photoUrls?: string[] }[];
    expect(defauts, "un seul défaut créé").toHaveLength(1);
    expect(defauts[0].description).toBe(DESCRIPTION_DEFAUT);
    expect(defauts[0].projectId).toBe(attenduDefaut[0].projet);
    expect(defauts[0].photoUrls, "le défaut porte sa photo").toHaveLength(1);
    const octetsDefaut = banc.cloudinary.find((f) => f.url === defauts[0].photoUrls![0]);
    expect(octetsDefaut?.sha, "octets de la photo du défaut identiques à ceux du téléphone").toBe(attenduDefaut[0].sha);

    // Chaque signature : écrite une fois par projet, avec les octets du pavé.
    expect(attenduSignatures).toHaveLength(2);
    for (const sig of attenduSignatures) {
      const ecrites = banc.acceptees((p) => p.chemin === `/api/projects/${sig.projet}` && p.methode === "PATCH" &&
                                            typeof (p.corps as Record<string, unknown>)?.signatureUrl === "string");
      expect(ecrites, `signature de ${sig.projet === A ? "A" : "B"} écrite une fois`).toHaveLength(1);
      const url = String((ecrites[0].corps as Record<string, unknown>).signatureUrl);
      expect(banc.projets[sig.projet].signatureUrl).toBe(url);
      const octets = banc.cloudinary.find((f) => f.url === url)!;
      expect(octets.nom).toBe(sig.nom);
      expect(octets.sha, "octets de la signature identiques à ceux du pavé").toBe(sig.sha);
    }

    // Le texte du rapport : arrivé, une fois, dans sa dernière version.
    const rapportServeur = String(banc.projets[A].rapportMonteur);
    expect(rapportServeur.split(PHRASE).length - 1, "la phrase du monteur figure une fois").toBe(1);
    expect(rapportServeur).toContain("Client présent lors du montage");
    expect(rapportServeur, "le serveur garde la DERNIÈRE version écrite").toBe(String(dernierRapportA.rapportMonteur));
    // Ce qui était à A est resté à A.
    expect(banc.acceptees((p) => p.chemin === `/api/projects/${B}` &&
                                 String((p.corps as Record<string, unknown>)?.rapportMonteur ?? "").includes(PHRASE))).toHaveLength(0);

    // Le rapport de A est parti une fois, en version client ; B n'a rien envoyé.
    expect(banc.pdf, "un seul envoi de rapport").toHaveLength(1);
    expect(banc.pdf[0].projet).toBe(A);
    expect(banc.pdf[0].params).toContain("send=1");
    expect(banc.pdf[0].params).toContain("client=1");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   Le défaut, signalé au retour du réseau : la réponse se perd
   ══════════════════════════════════════════════════════════════════════════ */

test("3 — le défaut refait au retour du réseau n'est créé qu'une fois, même si la réponse se perd", async ({ playwright }, testInfo) => {
  test.setTimeout(3 * 60_000);
  /* Un téléphone propre : ce test ne dépend pas de la file des photos (voir
     DEFAUT_SYNCHRO_FIGEE_WEBKIT), seulement de celle des écritures. */
  const banc = new Banc([projetFictif({ id: A, projet: NOM_A }), projetFictif({ id: B, projet: NOM_B })]);
  const profil = mkdtempSync(join(tmpdir(), "tm-e2e-defaut-"));
  const ctx = await lancerIphone(playwright as never, profil, testInfo.project.use as Record<string, unknown>);
  try {
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    await banc.brancher(page);
    await ouvrirLeChantier(page, A, NOM_A);
    const [jpeg] = await fabriquerJpegs(page, 1);

    /* Le réseau est revenu ; le serveur enregistre le défaut, mais sa
       réponse ne revient jamais au téléphone. */
    banc.reseau = "instable";
    banc.perdreLaReponse = (p) => p.chemin === "/api/defauts" && p.methode === "POST";

    await page.getByRole("button", { name: "Signalements", exact: true }).click();
    await page.getByRole("button", { name: /^Signaler un défaut$/ }).click();
    await page.getByRole("button", { name: "Défaut d'usine" }).click();
    await page.getByPlaceholder("Décrivez le défaut constaté...").fill("Éclat sur la paroi fixe, angle bas gauche.");
    await page.locator("div.glass-card", { hasText: "Description du défaut" }).locator('input[type="file"][multiple]')
      .setInputFiles({ name: "defaut.jpg", mimeType: "image/jpeg", buffer: jpeg });
    await expect(page.getByAltText("Défaut 1")).toBeVisible();
    await page.getByRole("button", { name: "Enregistrer le signalement" }).click();
    await expect(page.getByText("Défaut signalé").first()).toBeVisible({ timeout: 15_000 });

    /* La réponse perdue range l'envoi dans la file, qui le rejoue. */
    const envois = () => banc.journal.filter((p) => p.chemin === "/api/defauts" && p.methode === "POST");
    await expect
      .poll(() => envois().length, { timeout: 120_000, intervals: [1_000], message: "le défaut doit être rejoué" })
      .toBeGreaterThanOrEqual(2);
    await expect.poll(async () => (await fileEcritures(page)).length, { timeout: 30_000 }).toBe(0);

    expect(envois().filter((p) => p.issue === "reponse-perdue"), "la 1re réponse s'est bien perdue").toHaveLength(1);
    expect(new Set(envois().map((p) => (p.corps as Record<string, unknown>)?.id)).size,
           "toutes les tentatives portent le MÊME identifiant").toBe(1);
    expect(banc.defauts.size, "le défaut est créé une seule fois").toBe(1);
    const defaut = [...banc.defauts.values()][0];
    expect(defaut.projectId).toBe(A);
    expect(defaut.photoUrls as string[], "avec sa photo").toHaveLength(1);
    expect(banc.acceptees((p) => p.chemin === "/api/upload"), "la photo du défaut envoyée une fois").toHaveLength(1);
  } finally {
    await ctx.close().catch(() => {});
    rmSync(profil, { recursive: true, force: true });
  }
});

/* ══════════════════════════════════════════════════════════════════════════
   L'ordre des corrections du rapport, au retour du réseau
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * DÉFAUT CONSTATÉ LE 18 OCTOBRE 2026 — une correction perdue, écrasée par la
 * version d'avant. Indépendant du moteur (même résultat dans Chromium).
 *
 * La file des écritures (`passeDeFile`, src/lib/offline.ts) rejoue ses
 * entrées une par une, mais saute celles dont le délai de reprise n'est pas
 * échu et passe aux SUIVANTES. Deux enregistrements du même rapport faits
 * hors ligne n'ont pas le même délai : le premier a déjà échoué (repoussé
 * d'une minute, puis deux, quatre…), la correction n'a pas encore été
 * essayée. Au retour du réseau, la correction part d'abord ; une minute
 * plus tard, l'ancienne version part à son tour et l'écrase. Le serveur
 * (PATCH /api/projects/[id]) écrit ce qu'il reçoit, sans notion d'ordre.
 * Aucune erreur, aucun abandon : la correction du monteur a simplement
 * disparu. Le même effet se produit si la première écriture reçoit un 503
 * (limite de débit Notion) et la suivante un 200.
 *
 * Le test vérifie le comportement ATTENDU et reste en « échec attendu »
 * tant que ce défaut existe.
 */
/* Corrigé le 18.10.2026 (src/lib/offline.ts : ordre par fiche respecté). */
const DEFAUT_ORDRE_DES_ECRITURES = false;

test("4 — une correction du rapport faite hors ligne n'est pas écrasée par la version d'avant", async ({ playwright }, testInfo) => {
  test.fail(DEFAUT_ORDRE_DES_ECRITURES, "défaut du 18.10.2026 : la file rejoue les écritures dans le désordre (voir DEFAUT_ORDRE_DES_ECRITURES)");
  test.setTimeout(4 * 60_000);
  const banc = new Banc([projetFictif({ id: A, projet: NOM_A }), projetFictif({ id: B, projet: NOM_B })]);
  const profil = mkdtempSync(join(tmpdir(), "tm-e2e-ordre-"));
  const ctx = await lancerIphone(playwright as never, profil, testInfo.project.use as Record<string, unknown>);
  try {
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    await banc.brancher(page);
    await ouvrirLeChantier(page, A, NOM_A);
    await ongletRapport(page);
    const champ = page.getByPlaceholder("Précisions supplémentaires...").first();
    const V1 = "Première version : joint de seuil à reprendre demain.";
    const V2 = "Version corrigée : joint de seuil repris, essai d'eau concluant.";
    const versions = async () => (await fileEcritures(page))
      .filter((e) => e.url === `/api/projects/${A}` && typeof e.body?.rapportMonteur === "string");

    /* Sans réseau, le monteur écrit une première version… */
    banc.reseau = "coupe";
    await champ.fill(V1);
    await expect.poll(async () => (await versions()).filter((e) => String(e.body!.rapportMonteur).includes(V1)).length,
                      { timeout: 15_000 }).toBe(1);
    /* …que l'application essaie d'envoyer, sans succès (barre de réseau
       qui ne fait rien passer) : elle repousse ce premier envoi d'une
       minute. */
    await expect.poll(async () => (await versions())[0]?.retryCount ?? 0, { timeout: 30_000 }).toBeGreaterThan(0);
    /* Une demi-minute plus tard, il la corrige. */
    await page.waitForTimeout(25_000);
    await champ.fill(V2);
    await expect.poll(async () => (await versions()).filter((e) => String(e.body!.rapportMonteur).includes(V2)).length,
                      { timeout: 15_000 }).toBe(1);

    /* Le réseau revient, franchement : pas une erreur serveur. */
    banc.reseau = "ok";
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect.poll(async () => (await fileEcritures(page)).length,
                      { timeout: 150_000, intervals: [2_000], message: "la file doit se vider" }).toBe(0);

    const ecrites = banc.acceptees((p) => p.chemin === `/api/projects/${A}` && p.methode === "PATCH" &&
                                          typeof (p.corps as Record<string, unknown>)?.rapportMonteur === "string")
      .map((p) => String((p.corps as Record<string, unknown>).rapportMonteur));
    expect(ecrites.some((r) => r.includes(V1)) && ecrites.some((r) => r.includes(V2)), "les deux versions sont parties").toBe(true);
    /* LA vérification : le serveur garde la correction. */
    expect(String(banc.projets[A].rapportMonteur), `ordre d'arrivée : ${ecrites.map((r) => (r.includes(V2) ? "V2" : "V1")).join(" puis ")}`)
      .toContain(V2);
  } finally {
    await ctx.close().catch(() => {});
    rmSync(profil, { recursive: true, force: true });
  }
});
