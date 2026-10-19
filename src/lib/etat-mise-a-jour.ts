"use client";

/**
 * Où en est la mise à jour de CETTE page.
 *
 * Trois versions à ne jamais confondre :
 *  - EXÉCUTÉE : celle de ce document, lue dans sa propre balise `tm-version`.
 *    Elle vit en mémoire de la page — deux onglets peuvent en exécuter deux.
 *  - DISPONIBLE : celle que le serveur annonce (/api/build). C'est une
 *    observation datée, la seule chose partagée entre onglets (localStorage).
 *  - TÉLÉCHARGÉE (« prête ») : le service worker a récupéré la nouvelle
 *    coquille et TOUT ce qu'elle cite, vérifié, dans un cache à part, puis
 *    l'a installée sans rien effacer. Elle ne devient « exécutée » qu'au
 *    rechargement.
 *
 * ── Ce qui ne doit jamais arriver ───────────────────────────────────────
 *
 * Recharger sous les doigts de quelqu'un. L'application automatique exige
 * donc TOUT à la fois : page visible, réseau présent, hors d'une fiche
 * projet, aucun champ actif, aucune interaction depuis une minute, aucune
 * saisie ni photo en attente, aucune synchro en cours, aucun rapport
 * finalisé en attente d'envoi, aucune boîte de dialogue ouverte. Sinon une
 * pastille discrète propose « appliquer maintenant ».
 *
 * Et l'on n'efface plus rien : l'ancienne coquille et ses fichiers restent
 * en cache. Si le réseau tombe pendant le rechargement, l'appareil rouvre
 * une version complète — l'ancienne, ou la nouvelle si elle était prête.
 */
import { compterSaisiesStrict, isOnline, saisiesEnCoursDEnvoi } from "./offline";
import { getPendingUploads, photosEnCoursDEnvoi } from "./idb-uploads";
import { rapportsEnAttente } from "./envois-differes";
import {
  memeVersion, normaliserVersion, versionAppDepuisAgent, versionDuDocument,
  versionNativePlusAncienne, type VersionWeb,
} from "./version-web";

export type EtatMaj =
  | "a-jour"
  | "disponible"
  | "preparation"
  | "prete"
  | "en-attente-synchro"
  | "hors-ligne"
  | "inconnu";

export interface Observation {
  version: VersionWeb | null;
  coqueAppleMinimum: string | null;
  /** Quand le serveur a répondu (horloge de l'appareil). */
  verifieLe: number;
}

export interface EtatMiseAJour {
  etat: EtatMaj;
  executee: VersionWeb | null;
  disponible: VersionWeb | null;
  /** Dernière réponse réussie du serveur (peut dater d'avant une coupure). */
  derniereVerification: number | null;
  /** Dernière tentative, réussie ou non. */
  derniereTentative: number | null;
  /** Ce qui retient l'application automatique, en clair. */
  retenuePar: string[];
  /** La version de l'app Apple est-elle sous le minimum ? null = pas l'app, ou inconnu. */
  natifObsolete: boolean | null;
  coqueAppleMinimum: string | null;
}

const CLE_OBSERVATION = "tm-maj-observation";
const EVENEMENT = "tm-maj-etat";
export const INACTIVITE_MS = 60_000;

/* ── État de CE document, en mémoire ─────────────────────────────────── */

let etatCourant: EtatMiseAJour = {
  etat: "inconnu", executee: null, disponible: null, derniereVerification: null,
  derniereTentative: null, retenuePar: [], natifObsolete: null, coqueAppleMinimum: null,
};
let prepareePour: string | null = null; // identité de la version prête
let preparationEnCours: Promise<boolean> | null = null;
/* Au chargement, on compte comme si l'on venait d'agir : une app qu'on
   ouvre est une app qu'on va utiliser. Idem au retour au premier plan. */
let derniereInteraction = typeof window !== "undefined" ? Date.now() : 0;

/* Les brouillons qu'une page sait non enregistrés (cases cochées, édition en
   ligne…) : aucun champ n'a le focus, aucune fenêtre n'est ouverte, et
   pourtant recharger les perdrait. Chaque éditeur se déclare ici. */
const travauxNonEnregistres = new Set<string>();
export function marquerTravailNonEnregistre(id: string, actif: boolean): void {
  if (actif) travauxNonEnregistres.add(id);
  else travauxNonEnregistres.delete(id);
}

export function etatMiseAJour(): EtatMiseAJour {
  return etatCourant;
}

function publier(partiel: Partial<EtatMiseAJour>): void {
  etatCourant = { ...etatCourant, ...partiel };
  if (typeof window !== "undefined") {
    try { window.dispatchEvent(new CustomEvent(EVENEMENT, { detail: etatCourant })); } catch { /* sans effet */ }
  }
}

export function ecouterMiseAJour(f: (e: EtatMiseAJour) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const h = (e: Event) => f((e as CustomEvent<EtatMiseAJour>).detail);
  window.addEventListener(EVENEMENT, h);
  return () => window.removeEventListener(EVENEMENT, h);
}

/** Les gestes de l'utilisateur, pour ne jamais recharger juste après l'un d'eux. */
export function suivreInteractions(): () => void {
  if (typeof window === "undefined") return () => {};
  const noter = () => { derniereInteraction = Date.now(); };
  const types = ["pointerdown", "keydown", "touchstart", "input", "wheel"] as const;
  for (const t of types) window.addEventListener(t, noter, { passive: true, capture: true });
  const auRetour = () => { if (document.visibilityState === "visible") noter(); };
  document.addEventListener("visibilitychange", auRetour);
  return () => {
    for (const t of types) window.removeEventListener(t, noter, { capture: true });
    document.removeEventListener("visibilitychange", auRetour);
  };
}

/* ── Observation partagée (seule donnée commune aux onglets) ─────────── */

export function lireObservation(): Observation | null {
  try {
    const o = JSON.parse(localStorage.getItem(CLE_OBSERVATION) || "null");
    if (!o || typeof o.verifieLe !== "number") return null;
    return {
      version: normaliserVersion(o.version),
      coqueAppleMinimum: typeof o.coqueAppleMinimum === "string" ? o.coqueAppleMinimum : null,
      verifieLe: o.verifieLe,
    };
  } catch {
    return null;
  }
}

function ecrireObservation(o: Observation): void {
  try { localStorage.setItem(CLE_OBSERVATION, JSON.stringify(o)); } catch { /* confort seulement */ }
}

/* ── Les conditions ──────────────────────────────────────────────────── */

export interface Conditions {
  visible: boolean;
  enLigne: boolean;
  surFicheProjet: boolean;
  champActif: boolean;
  inactifDepuisMs: number;
  saisiesEnAttente: number;
  photosEnAttente: number;
  synchroEnCours: boolean;
  finalisationsEnAttente: number;
  dialogueOuvert: boolean;
  travauxNonEnregistres: number;
}

/**
 * Peut-on appliquer ? Fonction pure, testée une condition à la fois.
 * `auto` : toutes les conditions. `manuel` : en ligne, hors champ actif ;
 * les opérations en attente sont persistées et reprennent après.
 */
export function motifsDeRetenue(c: Conditions, mode: "auto" | "manuel"): string[] {
  const m: string[] = [];
  if (!c.enLigne) m.push("hors ligne");
  if (c.champActif) m.push("saisie en cours");
  if (c.travauxNonEnregistres > 0) m.push("modifications non enregistrées");
  if (mode === "manuel") return m;
  if (!c.visible) m.push("page en arrière-plan");
  if (c.surFicheProjet) m.push("fiche projet ouverte");
  if (c.inactifDepuisMs < INACTIVITE_MS) m.push("utilisation en cours");
  if (c.saisiesEnAttente > 0) m.push(`${c.saisiesEnAttente} saisie(s) en attente`);
  if (c.photosEnAttente > 0) m.push(`${c.photosEnAttente} photo(s) en attente`);
  if (c.synchroEnCours) m.push("synchronisation en cours");
  if (c.finalisationsEnAttente > 0) m.push(`${c.finalisationsEnAttente} rapport(s) en attente d'envoi`);
  if (c.dialogueOuvert) m.push("fenêtre ouverte");
  return m;
}

function champActif(): boolean {
  const actif = document.activeElement as HTMLElement | null;
  if (!actif) return false;
  const t = actif.tagName;
  return t === "INPUT" || t === "TEXTAREA" || t === "SELECT" || actif.isContentEditable;
}

/**
 * Une fenêtre est-elle ouverte ? Les boîtes de dialogue déclarées, mais aussi
 * toutes les autres : plusieurs éditeurs de l'app (nouveau projet,
 * préférences…) sont de simples calques plein écran, sans rôle. On les
 * reconnaît à leur fond : un élément fixe, visible, qui capte le toucher et
 * couvre l'écran. (Le fond animé de l'app est fixe aussi, mais ne capte rien.)
 */
export function fenetreOuverte(doc: Document = document): boolean {
  if (doc.querySelector('[role="dialog"], [role="alertdialog"], [aria-modal="true"], dialog[open]')) return true;
  const vw = doc.defaultView?.innerWidth || 0, vh = doc.defaultView?.innerHeight || 0;
  if (!vw || !vh) return false;
  for (const el of Array.from(doc.body?.querySelectorAll<HTMLElement>("*") || [])) {
    const st = doc.defaultView!.getComputedStyle(el);
    if (st.position !== "fixed" || st.pointerEvents === "none" || st.visibility === "hidden" || st.display === "none" || Number(st.opacity) === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width >= vw * 0.9 && r.height >= vh * 0.9) return true;
  }
  return false;
}

export async function lireConditions(): Promise<Conditions> {
  /* Une file ILLISIBLE n'est pas une file vide : on compte alors un élément,
     ce qui retient l'application automatique. */
  let saisies = 0, photos = 0, finalisations = 0;
  try { saisies = compterSaisiesStrict(); } catch { saisies = 1; }
  try { photos = (await getPendingUploads({ status: "pending" })).length; } catch { photos = 1; }
  try { finalisations = (await rapportsEnAttente()).length; } catch { finalisations = 1; }
  return {
    visible: document.visibilityState === "visible",
    enLigne: isOnline(),
    surFicheProjet: location.pathname.startsWith("/projet/"),
    champActif: champActif(),
    inactifDepuisMs: Date.now() - derniereInteraction,
    saisiesEnAttente: saisies,
    photosEnAttente: photos,
    synchroEnCours: saisiesEnCoursDEnvoi() || photosEnCoursDEnvoi(),
    finalisationsEnAttente: finalisations,
    dialogueOuvert: fenetreOuverte(),
    travauxNonEnregistres: travauxNonEnregistres.size,
  };
}

/* ── Vérifier ────────────────────────────────────────────────────────── */

function natifObsolete(minimum: string | null): boolean | null {
  const installee = versionAppDepuisAgent(typeof navigator !== "undefined" ? navigator.userAgent : "");
  return installee ? versionNativePlusAncienne(installee, minimum) : null;
}

/** Interroge le serveur. Rend l'observation, ou null (hors ligne, session expirée…). */
export async function interrogerServeur(delaiMs = 10_000): Promise<Observation | null> {
  const ctrl = new AbortController();
  const minuterie = setTimeout(() => ctrl.abort(), delaiMs);
  try {
    const r = await fetch("/api/build", { cache: "no-store", signal: ctrl.signal });
    if (!r.ok) return null;
    const j = await r.json();
    const version = normaliserVersion(j?.version)
      ?? (typeof j?.build === "string" && j.build !== "dev"
        ? { numero: null, sha: j.build, deploiement: null, env: "production", compile: null, dateCommit: null }
        : null);
    return {
      version,
      coqueAppleMinimum: typeof j?.coqueAppleMinimum === "string" ? j.coqueAppleMinimum : null,
      verifieLe: Date.now(),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(minuterie);
  }
}

/**
 * Une vérification complète : interroge, compare par identité, met l'état à
 * jour. Ne recharge jamais.
 */
export async function verifier(): Promise<EtatMiseAJour> {
  const executee = versionDuDocument();
  const tentative = Date.now();
  if (!isOnline()) {
    const obs = lireObservation();
    publier({
      etat: "hors-ligne", executee, derniereTentative: tentative,
      disponible: obs?.version ?? etatCourant.disponible,
      derniereVerification: obs?.verifieLe ?? etatCourant.derniereVerification,
    });
    return etatCourant;
  }
  const obs = await interrogerServeur();
  if (!obs) {
    const ancienne = lireObservation();
    publier({
      etat: isOnline() ? "inconnu" : "hors-ligne", executee, derniereTentative: tentative,
      disponible: ancienne?.version ?? etatCourant.disponible,
      derniereVerification: ancienne?.verifieLe ?? etatCourant.derniereVerification,
    });
    return etatCourant;
  }
  ecrireObservation(obs);
  const meme = memeVersion(executee, obs.version);
  const base = {
    executee, disponible: obs.version, derniereVerification: obs.verifieLe, derniereTentative: tentative,
    coqueAppleMinimum: obs.coqueAppleMinimum, natifObsolete: natifObsolete(obs.coqueAppleMinimum),
  };
  if (meme !== false) {
    publier({ ...base, etat: meme === true ? "a-jour" : "inconnu", retenuePar: [] });
    return etatCourant;
  }
  const cible = obs.version?.deploiement || obs.version?.sha || null;
  const prete = !!cible && prepareePour === cible;
  publier({ ...base, etat: prete ? "prete" : (preparationEnCours ? "preparation" : "disponible") });
  return etatCourant;
}

/* ── Préparer (télécharger) ──────────────────────────────────────────── */

/**
 * Demande au service worker de télécharger et vérifier la nouvelle coquille
 * et tout ce qu'elle cite, dans un cache à part. Tout ou rien : un échec ne
 * modifie aucun cache existant. Rend `true` si la version est prête.
 */
export function preparer(cible: VersionWeb | null, delaiMs = 180_000): Promise<boolean> {
  const id = cible?.deploiement || cible?.sha || null;
  if (!id) return Promise.resolve(false);
  if (prepareePour === id) return Promise.resolve(true);
  if (preparationEnCours) return preparationEnCours;
  preparationEnCours = (async () => {
    const reg = await navigator.serviceWorker?.getRegistration().catch(() => null);
    const sw = reg?.active;
    if (!sw) return false;
    publier({ etat: "preparation" });
    const ok = await new Promise<boolean>((fini) => {
      const secours = setTimeout(() => { nettoyer(); fini(false); }, delaiMs);
      const ecoute = (e: MessageEvent) => {
        const d = e.data || {};
        if (d.deploiement !== id) return;
        if (d.type === "VERSION_PRETE") { nettoyer(); fini(true); }
        if (d.type === "VERSION_NON_PREPAREE") { nettoyer(); fini(false); }
      };
      const nettoyer = () => {
        clearTimeout(secours);
        navigator.serviceWorker.removeEventListener("message", ecoute);
      };
      navigator.serviceWorker.addEventListener("message", ecoute);
      sw.postMessage({ type: "PREPARER_VERSION", deploiement: id, champ: cible?.deploiement ? "deploiement" : "sha" });
    });
    if (ok) prepareePour = id;
    return ok;
  })().finally(() => { preparationEnCours = null; });
  return preparationEnCours.then((ok) => {
    publier({ etat: ok ? "prete" : "disponible" });
    return ok;
  });
}

/* ── Appliquer ───────────────────────────────────────────────────────── */

let tentativeAuto: string | null = null;

/**
 * Recharger sur la nouvelle version — sans rien effacer. Recontrôle tout
 * juste avant, dont un aller-retour au serveur qui confirme encore la
 * version visée. Rend le motif de refus, ou null si la page se recharge.
 */
export async function appliquer(mode: "auto" | "manuel"): Promise<string | null> {
  const cible = etatCourant.disponible;
  const id = cible?.deploiement || cible?.sha || null;
  if (!id) return "aucune nouvelle version connue";
  if (mode === "auto" && prepareePour !== id) return "nouvelle version pas encore téléchargée";
  if (mode === "auto") {
    try { if (sessionStorage.getItem("tm-maj") === id) return "déjà tentée sur cet onglet"; } catch { /* ignore */ }
  }
  const motifs = motifsDeRetenue(await lireConditions(), mode);
  if (motifs.length) {
    if (mode === "auto") publier({ etat: "en-attente-synchro", retenuePar: motifs });
    return motifs.join(", ");
  }
  const confirmee = await interrogerServeur(5_000);
  if (!confirmee) return "serveur injoignable";
  if (memeVersion(confirmee.version, cible) !== true) {
    ecrireObservation(confirmee);
    publier({ disponible: confirmee.version, etat: "disponible" });
    return "la version disponible vient de changer";
  }
  /* Dernier contrôle, juste avant : rien n'a bougé pendant l'aller-retour. */
  const derniers = motifsDeRetenue(await lireConditions(), mode);
  if (derniers.length) return derniers.join(", ");
  if (mode === "auto") {
    if (tentativeAuto === id) return "déjà tentée";
    tentativeAuto = id;
    try { sessionStorage.setItem("tm-maj", id); } catch { /* ignore */ }
  }
  location.reload();
  return null;
}

/** Pour les tests : repartir d'un état neuf. */
export function _reinitialiser(): void {
  prepareePour = null;
  preparationEnCours = null;
  tentativeAuto = null;
  derniereInteraction = 0;
  travauxNonEnregistres.clear();
  etatCourant = {
    etat: "inconnu", executee: null, disponible: null, derniereVerification: null,
    derniereTentative: null, retenuePar: [], natifObsolete: null, coqueAppleMinimum: null,
  };
}
