"use client";

/**
 * Ce que le site fait de plus quand il tourne dans l'application Apple.
 *
 * Trois choses, et aucune dans un navigateur :
 *
 *  1. RESTAURER. Au démarrage, le site compare ses files au coffre natif de
 *     l'app. Une photo que le coffre garde et que la file a perdue — stockage
 *     de WebKit effacé par le système — y est remise, avec son identifiant
 *     d'origine. Les saisies locales (file des envois, heures, noms de lots)
 *     ne sont remises que si le stockage local a été VIDÉ — jamais par-dessus
 *     des saisies existantes.
 *
 *  2. DOUBLER. À chaque écriture de la file des saisies, et toutes les
 *     trente secondes si quelque chose a changé, les clés que le site
 *     protège déjà (voir vider-caches) partent au coffre.
 *
 *  3. OBÉIR. `window.tmApple.synchroniser()` est ce que l'app appelle quand
 *     iOS lui donne un moment : au départ en arrière-plan, au réveil, au
 *     retour du réseau. C'est exactement le geste « tout renvoyer » du site.
 */
import { dansAppApple, demanderAuPont, depuisBase64, rejouerRetraits, versBase64 } from "./pont-apple";
import { addPendingUpload, getPendingUploads, remettrePendingUpload, type PendingUpload } from "./idb-uploads";
import { estPreservee } from "./vider-caches";
import { instantane, toutRelancer } from "./telemetrie-appareil";

/** Présente tant que le stockage local n'a pas été vidé. */
export const SENTINELLE = "tm-coffre-sentinelle";

export interface EtatPourApp {
  photosEnAttente: number;
  photosEnEchec: number;
  requetesEnAttente: number;
  rapportsNonEnvoyes: number;
  enLigne: boolean;
}

export async function etatPourApp(): Promise<EtatPourApp> {
  const i = await instantane();
  return {
    photosEnAttente: i.photosEnAttente,
    photosEnEchec: i.photosEnEchec,
    requetesEnAttente: i.requetesEnAttente,
    rapportsNonEnvoyes: i.rapportsNonEnvoyes.length,
    enLigne: i.enLigne,
  };
}

/* ── 2. Le double des saisies locales ─────────────────────────────────── */

/** Les clés protégées du stockage local, telles qu'elles sont. */
export function saisiesLocales(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const cle = localStorage.key(i);
      if (!cle || cle === SENTINELLE || !estPreservee(cle)) continue;
      const v = localStorage.getItem(cle);
      if (v !== null) out[cle] = v;
    }
  } catch { /* stockage illisible : rien à doubler */ }
  return out;
}

let dernierDouble = "";
let minuterieDouble: ReturnType<typeof setTimeout> | undefined;

/** Envoie le double au coffre, s'il a changé depuis le dernier. */
export async function doublerMaintenant(): Promise<boolean> {
  const json = JSON.stringify(saisiesLocales());
  if (json === dernierDouble) return true;
  const r = await demanderAuPont<{ ok?: boolean }>({ action: "local", json });
  if (r?.ok) dernierDouble = json;
  return !!r?.ok;
}

function programmerDouble(): void {
  if (minuterieDouble) clearTimeout(minuterieDouble);
  minuterieDouble = setTimeout(() => { void doublerMaintenant(); }, 300);
}

/* ── 1. La restauration ───────────────────────────────────────────────── */

interface Inventaire {
  photos: { id: string; meta: string }[];
  local: string | null;
}

interface PhotoDuCoffre {
  meta: string;
  fichiers: { nom: string; type: string; base64: string }[];
}

export async function restaurerDepuisCoffre(): Promise<{ photos: number; cles: number }> {
  const inv = await demanderAuPont<Inventaire>({ action: "inventaire" }, 15_000);
  if (!inv) return { photos: 0, cles: 0 };

  /* Les saisies locales : seulement si le stockage a été vidé. La sentinelle
     est posée au premier démarrage dans l'app ; si elle manque alors que le
     coffre a un double, c'est que tout a été effacé entre-temps. */
  let cles = 0;
  try {
    if (localStorage.getItem(SENTINELLE) === null && inv.local) {
      const double = JSON.parse(inv.local) as Record<string, unknown>;
      for (const [cle, valeur] of Object.entries(double)) {
        if (typeof valeur !== "string" || !estPreservee(cle)) continue;
        if (localStorage.getItem(cle) !== null) continue; // jamais par-dessus
        localStorage.setItem(cle, valeur);
        cles++;
      }
    }
    localStorage.setItem(SENTINELLE, String(Date.now()));
  } catch { /* stockage plein ou illisible : les photos passent quand même */ }

  /* Les photos : une à une, celles que la file n'a plus. Une photo dont le
     retrait n'a pas encore atteint le coffre est confirmée : on la laisse. */
  let photos = 0;
  const enSouffrance = await rejouerRetraits();
  let presents: Set<string>;
  try {
    presents = new Set((await getPendingUploads({ status: "all" })).map((u) => u.id));
  } catch {
    return { photos: 0, cles }; // file illisible : surtout ne rien remettre à l'aveugle
  }
  for (const p of inv.photos) {
    if (presents.has(p.id) || enSouffrance.has(p.id)) continue;
    const complet = await demanderAuPont<PhotoDuCoffre>({ action: "photo", id: p.id }, 20_000);
    if (!complet) continue;
    try {
      const meta = JSON.parse(complet.meta) as PendingUpload & {
        files?: { name: string; type: string; uploadedUrl?: string }[];
      };
      const item: PendingUpload = {
        ...meta,
        id: p.id,
        files: complet.fichiers.map((f, i) => ({
          name: f.nom,
          type: f.type,
          blob: depuisBase64(f.base64, f.type),
          uploadedUrl: meta.files?.[i]?.uploadedUrl,
        })),
        retryCount: 0,
        nextAttemptAt: undefined,
        status: meta.status === "permanently-failed" ? "permanently-failed" : "pending",
      };
      if (await remettrePendingUpload(item)) photos++;
    } catch (e) {
      console.warn("[app-apple] photo du coffre illisible", p.id, e);
    }
  }

  if (photos || cles) {
    console.warn("[app-apple] restauré depuis le coffre :", { photos, cles });
    try {
      window.dispatchEvent(new CustomEvent("tm-coffre-restaure", { detail: { photos, cles } }));
    } catch { /* sans effet */ }
  }
  return { photos, cles };
}

/* ── 3. La synchronisation demandée par l'app ─────────────────────────── */

let synchroEnCours: Promise<EtatPourApp> | null = null;

export function synchroniser(raison = "app"): Promise<EtatPourApp> {
  if (synchroEnCours) return synchroEnCours;
  synchroEnCours = (async () => {
    try { await toutRelancer(); } catch (e) { console.warn("[app-apple] synchro", raison, e); }
    try { await doublerMaintenant(); } catch { /* le double suivant rattrapera */ }
    return etatPourApp();
  })().finally(() => { synchroEnCours = null; });
  return synchroEnCours;
}

let minuterieEtat: ReturnType<typeof setTimeout> | undefined;

/** Dit à l'app ce qui attend : elle décide s'il faut demander un réveil à iOS. */
function signalerEtat(): void {
  if (minuterieEtat) clearTimeout(minuterieEtat);
  minuterieEtat = setTimeout(async () => {
    try { await demanderAuPont({ action: "etat", etat: await etatPourApp() }); } catch { /* sans effet */ }
  }, 1000);
}

declare global {
  interface Window {
    tmApple?: {
      synchroniser: (raison?: string) => Promise<EtatPourApp>;
      etat: () => Promise<EtatPourApp>;
      restaurer: () => Promise<{ photos: number; cles: number }>;
      essais?: Record<string, (...args: string[]) => Promise<unknown>>;
    };
    __tmEssaisApple?: boolean;
  }
}

let installe = false;

/** À appeler une fois, au démarrage de chaque page. Sans effet hors de l'app. */
export function installerAppApple(): void {
  if (installe || typeof window === "undefined" || !dansAppApple()) return;
  installe = true;
  window.tmApple = { synchroniser, etat: etatPourApp, restaurer: restaurerDepuisCoffre };

  /* Essais automatisés de l'app : seulement quand une compilation de
     DÉVELOPPEMENT de l'app, pointée sur un serveur LOCAL, le demande. Jamais
     dans l'app installée ni dans un navigateur. */
  if (window.__tmEssaisApple === true && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
    window.tmApple.essais = {
      ajouterPhoto: async (base64: string, nom: string) => addPendingUpload({
        projectId: "essai-apple",
        category: "essai",
        files: [{ name: nom, type: "image/jpeg", blob: depuisBase64(base64, "image/jpeg") }],
      }),
      lirePhotos: async () => JSON.stringify(await Promise.all(
        (await getPendingUploads({ status: "all" })).map(async (u) => ({
          id: u.id, nom: u.files[0]?.name, octets: u.files[0] ? await versBase64(u.files[0].blob) : "",
        })),
      )),
      lireSaisie: async (cle: string) => localStorage.getItem(cle) ?? "absente",
      ecrireSaisie: async (cle: string, valeur: string) => {
        localStorage.setItem(cle, valeur);
        return doublerMaintenant();
      },
    };
  }

  void restaurerDepuisCoffre()
    .catch((e) => console.warn("[app-apple] restauration", e))
    .finally(() => {
      void doublerMaintenant();
      signalerEtat();
    });

  window.addEventListener("tm-file-modifiee", programmerDouble);
  for (const ev of ["tm-pending-upload-added", "tm-pending-upload-removed", "tm-file-modifiee"]) {
    window.addEventListener(ev, signalerEtat);
  }
  /* Les autres saisies protégées (heures, noms de lots) n'émettent rien :
     on regarde toutes les trente secondes, et en quittant la page. */
  setInterval(() => { void doublerMaintenant(); }, 30_000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void doublerMaintenant();
  });
}
