"use client";

/**
 * Upload DIRECT client → Cloudinary, puis rattachement Notion.
 *
 * Pourquoi : l'ancienne route /api/upload faisait transiter les octets par
 * Vercel (limite 4,5 Mo, requête lourde) ET écrivait Notion dans la même
 * requête. Sur réseau mobile, ça « gelait » (timeout) et la photo restait
 * bloquée « en attente de synchro » pendant des minutes.
 *
 * Nouveau flux, en 2 étapes découplées :
 *   1. uploadToCloudinary : les octets vont DIRECTEMENT du téléphone à
 *      Cloudinary (robuste, CDN mondial, pas de limite Vercel). Une fois
 *      réussi, la photo est SÛRE et ne sera jamais re-uploadée.
 *   2. attachPhotos : petit JSON vers /api/photos/attach pour lier l'URL au
 *      champ Notion. Réessayable indéfiniment SANS renvoyer les octets.
 */

export interface UploadedPhoto {
  name: string;
  url: string;
}

/** Erreur réseau/temporaire (à réessayer) vs permanente (4xx). */
export class UploadError extends Error {
  permanent: boolean;
  constructor(message: string, permanent = false) {
    super(message);
    this.permanent = permanent;
  }
}

const API_TIMEOUT_MS = 20_000;        // appels Vercel (sign / attach) : petits JSON

/**
 * Combien de temps on laisse aux octets, selon leur poids.
 *
 * Une photo compressée fait 400 Ko et part en deux secondes ; une vidéo de
 * montage d'une minute pèse 60 Mo et demande plusieurs minutes sur un réseau
 * de chantier. Un délai fixe de 60 s convenait aux unes et condamnait les
 * autres : la vidéo était coupée en plein envoi, repartait dans la file des
 * différés, et y tournait. On compte donc 60 s d'amorçage plus une seconde
 * par tranche de 50 Ko (soit un débit de 400 kbit/s, pessimiste mais réel en
 * sous-sol), plafonné à un quart d'heure.
 */
function delaiPourOctets(octets: number): number {
  const estime = 60_000 + Math.ceil(octets / (50 * 1024)) * 1000;
  return Math.min(estime, 15 * 60_000);
}

/* Les envois en vol, pour pouvoir les abandonner quand le réseau change. */
const envoisEnVol = new Set<{ abort: () => void }>();

/**
 * Abandonne les envois en cours. Appelé au retour du réseau : un envoi lancé
 * pendant la coupure attendait sinon son délai (jusqu'à une minute) avant
 * d'échouer, et bloquait toute la synchronisation pendant ce temps. Sans
 * danger : la photo reste en file, le serveur écarte les doublons par nom et
 * par URL, le signalement par son identifiant.
 */
export function abandonnerEnvoisEnVol(): number {
  const n = envoisEnVol.size;
  for (const e of [...envoisEnVol]) { try { e.abort(); } catch { /* déjà fini */ } }
  envoisEnVol.clear();
  return n;
}

async function fetchWithTimeout(input: RequestInfo, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  const enVol = { abort: () => ctrl.abort() };
  envoisEnVol.add(enVol);
  try {
    return await fetch(input, { ...init, signal: ctrl.signal });
  } finally {
    envoisEnVol.delete(enVol);
    clearTimeout(to);
  }
}

/**
 * Upload un blob directement vers Cloudinary (signé). Retourne l'URL sécurisée.
 * Lève UploadError(permanent=false) sur échec réseau (à réessayer).
 */
/* La signature d'envoi, gardée dix minutes par projet et par dossier :
   Cloudinary l'accepte pendant une heure. Sans cela, chaque photo coûtait un
   aller-retour de plus vers le serveur avant même d'envoyer ses octets. */
type Signature = { signature: string; timestamp: number; folder: string; apiKey: string; cloudName: string };
const signatures = new Map<string, { sign: Signature; jusqua: number }>();
const DUREE_SIGNATURE_MS = 10 * 60_000;

async function signatureDEnvoi(projectId: string, category: string, fraiche = false): Promise<Signature> {
  const cle = `${projectId}::${category}`;
  const memo = signatures.get(cle);
  if (!fraiche && memo && memo.jusqua > Date.now()) return memo.sign;
  let sign: Signature;
  try {
    const res = await fetchWithTimeout(
      "/api/photos/sign",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId, category }) },
      API_TIMEOUT_MS,
    );
    if (!res.ok) throw new UploadError(`sign ${res.status}`, res.status >= 400 && res.status < 500 && res.status !== 429);
    sign = await res.json();
  } catch (e: any) {
    if (e instanceof UploadError) throw e;
    throw new UploadError(e?.name === "AbortError" ? "signature timeout" : "réseau (signature)");
  }
  signatures.set(cle, { sign, jusqua: Date.now() + DUREE_SIGNATURE_MS });
  return sign;
}

/** Au-delà, on suit la progression de l'envoi (vidéos, gros documents). */
const SEUIL_PROGRESSION = 2 * 1024 * 1024;

/**
 * Envoi des octets avec progression, pour les gros fichiers. Mêmes règles que
 * fetchWithTimeout : délai, abandon possible, réponse lue en JSON.
 */
function envoyerAvecProgression(
  url: string, corps: FormData, timeoutMs: number, surProgression: (pct: number) => void,
): Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const enVol = { abort: () => xhr.abort() };
    envoisEnVol.add(enVol);
    const fin = () => envoisEnVol.delete(enVol);
    xhr.open("POST", url);
    xhr.timeout = timeoutMs;
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) surProgression(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      fin();
      const texte = xhr.responseText;
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, json: async () => JSON.parse(texte) });
    };
    const erreur = (nom: string) => () => { fin(); const e = new Error(nom); e.name = nom; reject(e); };
    xhr.onerror = erreur("NetworkError");
    xhr.ontimeout = erreur("AbortError");
    xhr.onabort = erreur("AbortError");
    xhr.send(corps);
  });
}

export async function uploadToCloudinary(
  blob: Blob,
  name: string,
  projectId: string,
  category: string,
  surProgression?: (pct: number) => void,
): Promise<string> {
  /* Jamais de photo vide : une référence d'octets périmée (WebKit, après une
     réécriture de la file) se lit comme un fichier de 0 octet. L'envoyer, ce
     serait rattacher une photo vide au rapport et croire la vraie partie. On
     échoue « passagèrement » : la file réessaiera avec des octets relus. */
  if (!blob || blob.size === 0) throw new UploadError("photo illisible sur l'appareil (0 octet)", false);
  // 1. Signature (petit appel Vercel, gardé dix minutes)
  let sign = await signatureDEnvoi(projectId, category);
  let signatureMemorisee = true;

  // 2. Upload direct vers Cloudinary (les octets ne passent PAS par Vercel)
  // Choix du resource_type Cloudinary :
  //  - image/vidéo → `auto` (Cloudinary détecte).
  //  - PDF & autres documents → `raw`. En `image`, Cloudinary BLOQUE par défaut
  //    la diffusion des PDF (HTTP 401) ; en `raw`, le fichier est servi tel quel
  //    sans cette restriction. La signature ne dépend pas du resource_type.
  const mime = blob.type || "";
  const isMedia = (mime.startsWith("image/") || mime.startsWith("video/")) && !/\.pdf$/i.test(name);
  const resourceType = isMedia ? "auto" : "raw";
  let res: { ok: boolean; status: number; json: () => Promise<unknown> };
  for (;;) {
    const fd = new FormData();
    fd.append("file", new File([blob], name, { type: blob.type || "image/jpeg" }));
    fd.append("api_key", sign.apiKey);
    fd.append("timestamp", String(sign.timestamp));
    fd.append("signature", sign.signature);
    fd.append("folder", sign.folder);
    const url = `https://api.cloudinary.com/v1_1/${sign.cloudName}/${resourceType}/upload`;
    try {
      res = surProgression && blob.size > SEUIL_PROGRESSION
        ? await envoyerAvecProgression(url, fd, delaiPourOctets(blob.size), surProgression)
        : await fetchWithTimeout(url, { method: "POST", body: fd }, delaiPourOctets(blob.size));
    } catch (e: any) {
      throw new UploadError(e?.name === "AbortError" ? "Cloudinary timeout" : "réseau (Cloudinary)");
    }
    /* Refus avec une signature gardée en mémoire : elle a pu vieillir (horloge,
       mise en veille). Une signature fraîche, une seule fois, avant de
       conclure à un refus définitif. */
    if (!res.ok && res.status >= 400 && res.status < 500 && signatureMemorisee) {
      signatureMemorisee = false;
      sign = await signatureDEnvoi(projectId, category, true);
      continue;
    }
    break;
  }
  if (!res.ok) {
    // 4xx Cloudinary (signature périmée, fichier invalide…) = permanent.
    const permanent = res.status >= 400 && res.status < 500;
    throw new UploadError(`Cloudinary ${res.status}`, permanent);
  }
  const data = (await res.json()) as { secure_url?: string } | null;
  if (!data?.secure_url) throw new UploadError("Cloudinary: pas d'URL");
  return data.secure_url as string;
}

/**
 * Rattache des URLs Cloudinary à un champ Notion (petit JSON, réessayable).
 * Lève UploadError(permanent) sur 4xx.
 */
async function _attachPhotos(
  projectId: string,
  notionField: string,
  photos: UploadedPhoto[],
): Promise<void> {
  let res: Response;
  try {
    res = await fetchWithTimeout(
      "/api/photos/attach",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId, notionField, photos }) },
      API_TIMEOUT_MS,
    );
  } catch (e: any) {
    throw new UploadError(e?.name === "AbortError" ? "attach timeout" : "réseau (attach)");
  }
  if (!res.ok) {
    const permanent = res.status >= 400 && res.status < 500 && res.status !== 429;
    let msg = `attach ${res.status}`;
    try { const d = await res.json(); if (d?.error) msg = String(d.error).slice(0, 140); } catch {}
    throw new UploadError(msg, permanent);
  }
}

/**
 * Associe une URL déjà sur Cloudinary à une propriété TEXTE du projet.
 *
 * La signature du client suit ce chemin : ce n'est pas un champ « fichiers »
 * mais une URL, et `attachPhotos` ne sait pas l'écrire. Même forme que lui —
 * petit JSON, réessayable sans jamais renvoyer les octets — pour que la file
 * des photos puisse le rejouer exactement comme un rattachement.
 */
export async function attacherChampTexte(
  projectId: string,
  champ: string,
  valeur: string,
): Promise<void> {
  let res: Response;
  try {
    res = await fetchWithTimeout(
      `/api/projects/${projectId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [champ]: valeur }),
      },
      API_TIMEOUT_MS,
    );
  } catch (e: any) {
    throw new UploadError(e?.name === "AbortError" ? "timeout (champ)" : "réseau (champ)");
  }
  if (!res.ok) {
    const permanent = res.status >= 400 && res.status < 500 && res.status !== 429;
    let msg = `champ ${res.status}`;
    try { const d = await res.json(); if (d?.error) msg = String(d.error).slice(0, 140); } catch {}
    throw new UploadError(msg, permanent);
  }
}

/**
 * Crée un signalement de défaut (POST /api/defauts), une fois ses photos sur
 * Cloudinary. Le corps porte son identifiant, fabriqué à la saisie : un
 * renvoi après une coupure ne crée pas de second signalement.
 */
export async function envoyerSignalement(corps: Record<string, unknown>): Promise<void> {
  let res: Response;
  try {
    res = await fetchWithTimeout(
      "/api/defauts",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) },
      API_TIMEOUT_MS,
    );
  } catch (e: any) {
    throw new UploadError(e?.name === "AbortError" ? "timeout (signalement)" : "réseau (signalement)");
  }
  if (!res.ok) {
    const permanent = res.status >= 400 && res.status < 500 && res.status !== 429 && res.status !== 408;
    let msg = `signalement ${res.status}`;
    try { const d = await res.json(); if (d?.error) msg = String(d.error).slice(0, 140); } catch {}
    throw new UploadError(msg, permanent);
  }
}

// SÉRIALISATION CLIENT par (projet + champ Notion). Le rattachement fait un
// read-modify-write côté serveur ; deux appels PARALLÈLES au MÊME champ (ex.
// photos ajoutées à plusieurs lots à la fois → même « Photos montage terminé »)
// peuvent s'écraser si le verrou distribué (Redis) n'est pas actif. En les
// enchaînant ici, les requêtes partent une à une → aucune course dans l'onglet.
const attachChains = new Map<string, Promise<unknown>>();
export function attachPhotos(
  projectId: string,
  notionField: string,
  photos: UploadedPhoto[],
): Promise<void> {
  const key = `${projectId}::${notionField}`;
  const prev = attachChains.get(key) ?? Promise.resolve();
  const run = prev
    .catch(() => {}) // un échec précédent ne bloque pas la suite de la file
    .then(() => _attachPhotos(projectId, notionField, photos));
  // Le maillon suivant attend une version qui n'échoue JAMAIS ; on RENVOIE `run`
  // (qui peut rejeter → la gestion d'erreur de l'appelant reste intacte).
  attachChains.set(key, run.catch(() => {}));
  return run as Promise<void>;
}
