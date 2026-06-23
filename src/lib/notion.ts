import { Client } from "@notionhq/client";

// ── Limiteur de débit global pour l'API Notion ──────────────────────────────
// Notion plafonne à ~3 requêtes/seconde en moyenne (petite tolérance de burst).
// Sans limiteur, un pic — full-sync qui recharge tous les projets, ou plusieurs
// monteurs simultanés — dépasse la limite → 429 → la route renvoie 503 (incident
// du 23 juin 2026). Deux protections appliquées à CHAQUE appel HTTP Notion :
//   1. Token-bucket par instance : lisse les appels sous ~3 req/s.
//   2. Retry sur 429 : respecte l'en-tête Retry-After (utile quand plusieurs
//      instances Vercel, chacune avec son bucket, dépassent collectivement le seuil).
const NOTION_BUCKET_MAX = 4;      // tolérance de burst (un getProject ≈ 2-3 appels)
const NOTION_REFILL_PER_SEC = 3;  // débit soutenu visé
let notionTokens = NOTION_BUCKET_MAX;
let notionLastRefill = Date.now();

async function takeNotionToken(): Promise<void> {
  for (;;) {
    const now = Date.now();
    notionTokens = Math.min(
      NOTION_BUCKET_MAX,
      notionTokens + ((now - notionLastRefill) / 1000) * NOTION_REFILL_PER_SEC,
    );
    notionLastRefill = now;
    if (notionTokens >= 1) { notionTokens -= 1; return; }
    const waitMs = ((1 - notionTokens) / NOTION_REFILL_PER_SEC) * 1000;
    await new Promise((r) => setTimeout(r, Math.max(20, waitMs)));
  }
}

const rateLimitedFetch = (async (url: unknown, init: unknown) => {
  for (let attempt = 0; ; attempt++) {
    await takeNotionToken();
    const res = await fetch(url as RequestInfo, init as RequestInit);
    if (res.status !== 429 || attempt >= 4) return res;
    // 429 : on attend (Retry-After plafonné) puis on retente.
    const retryAfter = Number(res.headers.get("retry-after")) || 1;
    const waitMs = Math.min(retryAfter * 1000, 8000) + attempt * 250;
    console.warn(`[notion] 429 rate-limited, retry ${attempt + 1}/4 dans ${waitMs}ms`);
    await new Promise((r) => setTimeout(r, waitMs));
  }
}) as unknown as typeof fetch;

export const notion = new Client({
  auth: process.env.NOTION_TOKEN,
  // Relevé à 25 s (route maxDuration = 30 s) : un appel mis en file par le
  // token-bucket ou réessayé après un 429 ne doit pas être avorté trop tôt.
  timeoutMs: 25000,
  fetch: rateLimitedFetch,
});

export const databaseId = process.env.NOTION_DATABASE_ID!;

/**
 * Cache du schéma de la base Notion (types des propriétés). Permet
 * d'écrire dans le bon format pour des champs dont la configuration
 * varie selon les bases (URL vs Files & media vs Text).
 *
 * Notion impose strictement le format à l'écriture : si le champ est
 * "URL" et qu'on envoie `{ files: [...] }`, l'API rejette toute la
 * requête PATCH.
 *
 * Le cache est mémoire-only et survit le temps de vie du process
 * serverless. Si une nouvelle propriété est ajoutée côté Notion, on
 * peut l'invalider via `invalidateSchemaCache()`.
 */
let schemaCache: Record<string, string> | null = null;
let rawPropsCache: Record<string, any> | null = null;

async function fetchAndCacheSchema() {
  const db: any = await notion.databases.retrieve({ database_id: databaseId });
  schemaCache = {};
  rawPropsCache = {};
  for (const [key, val] of Object.entries(db.properties || {})) {
    schemaCache[key] = (val as any).type;
    rawPropsCache[key] = val;
  }
}

async function getPropertyType(propName: string): Promise<string | null> {
  if (!schemaCache) {
    try {
      await fetchAndCacheSchema();
    } catch (err) {
      console.error("[notion] Failed to retrieve database schema:", err);
      schemaCache = {};
      rawPropsCache = {};
    }
  }
  return schemaCache![propName] ?? null;
}

/** Retourne la liste des options d'un champ select / multi_select / status. */
export async function getSelectOptions(propName: string): Promise<string[]> {
  if (!rawPropsCache) {
    try {
      await fetchAndCacheSchema();
    } catch (err) {
      console.error("[notion] Failed to retrieve database schema:", err);
      schemaCache = {};
      rawPropsCache = {};
    }
  }
  const prop = rawPropsCache![propName];
  if (!prop) return [];
  if (prop.type === "select") return (prop.select?.options ?? []).map((o: any) => o.name as string);
  if (prop.type === "multi_select") return (prop.multi_select?.options ?? []).map((o: any) => o.name as string);
  if (prop.type === "status") return (prop.status?.options ?? []).map((o: any) => o.name as string);
  return [];
}

export function invalidateSchemaCache() { schemaCache = null; rawPropsCache = null; }

// Plus de cache interne ici : la mise en cache (avec stale-while-revalidate)
// est gérée au niveau des routes API via `@/lib/server-cache`. Cela garantit
// une seule source de vérité et une invalidation cohérente après PATCH/POST.

export interface Project {
  id: string;
  projet: string;
  ofrTM: string;
  emplacementCabine: string;
  nbCabines: number | null;
  fournisseurs: string[];
  seriesCabines: string[];
  nomChantier: string;
  adresseChantier: string;
  dateMontage: string | null;
  dateMontageEnd: string | null;
  dateDemandeProjet: string | null;
  dateMesuresRecue: string | null;
  dateOffre: string | null;
  dateCMDRecue: string | null;
  dateCMDUsine: string | null;
  collaborateurs: string;
  documentsMontagee: FileItem[];
  documentsMesures: FileItem[];
  heureArrivee: string;
  heureDepart: string;
  commentairesMontages: string;
  rapportMonteur: string;
  photosAvant: FileItem[];
  photosDemontage: FileItem[];
  photosMontage: FileItem[];
  photosQRCode: FileItem[];
  photosGaranties: FileItem[];
  photosCartons: FileItem[];
  rapportDeMontage: string;
  facturations: string;
  etatCMD: string;
  typeServices: string[];
  cmdGrossiste: string;
  cmdTM: string;
  cmdTMUsine: string;
  cmdFournisseurs: string;
  servCmdFournisseurs: string;
  etatMesures: string;
  ofrGrossiste: string;
  servMesuresFournisseurs: string;
  mesuresTraiteePar: string;
  dateMesures: string | null;
  photosSituations: FileItem[];
  photosMesures: FileItem[];
  photosLocalite: FileItem[];
  contacts: string;
  contactsRDV: string;
  commentairesMesures: string;
  soucisMontage: boolean;
  causeSoucis: string;
  causeSAV: string;
  etatSAV: string;
  dateRDVSAV: string | null;
  dateSAVRecu: string | null;
  sav: boolean;
  bonLivraison: string;
  signatureUrl: string;
  typeClient: string;
  grossistesRelation: string[];
  grossistesNames: string[];
  fournisseursRelation: string[];
  fournisseursNames: string[];
  sanitaireRelation: string[]; // IDs Sanitaire (Entreprise)
  sanitaireNames: string[];
  contactsProjetRelation: string[]; // IDs Contacts projet
  contactsProjetNames: string[];
  infoPiecesManquantes: string;
  infoDefautsSignale: string;
  photosPiecesManquantes: FileItem[];
  photosDefautsSignale: FileItem[];
  arrivageTM: string | null;
  arrivageGrossiste: string | null;
  nbCartons: number | null;
  /** Noms des cabines encodés : "Cab1:Apt 28F 1er | Cab2:Apt 28A 2ème | ..." */
  nomsCabines: string;
  /** Monteurs responsables par cabine : "Cab1:Micael | Cab2:Claudio | ..." */
  attributionCabines: string;
  /** Nombre de cabines dont le montage est terminé (photos uploadées) */
  nbCabinesInstallees: number | null;
}

export interface FileItem {
  name: string;
  url: string;
}

function extractText(prop: any): string {
  if (!prop) return "";
  // Types texte natifs
  if (prop.type === "title") {
    return prop.title?.map((t: any) => t.plain_text).join("") || "";
  }
  if (prop.type === "rich_text") {
    return prop.rich_text?.map((t: any) => t.plain_text).join("") || "";
  }
  // Fallbacks : certaines colonnes Notion qu'on attend en texte sont en
  // réalité d'un autre type (number, phone, formula, rollup, select…).
  // Sans ces cas, extractText renvoyait "" et la valeur n'apparaissait jamais.
  if (prop.type === "number") {
    return prop.number != null ? String(prop.number) : "";
  }
  if (prop.type === "phone_number") {
    return prop.phone_number || "";
  }
  if (prop.type === "email") {
    return prop.email || "";
  }
  if (prop.type === "url") {
    return prop.url || "";
  }
  if (prop.type === "select") {
    return prop.select?.name || "";
  }
  if (prop.type === "status") {
    return prop.status?.name || "";
  }
  if (prop.type === "formula") {
    const f = prop.formula;
    if (!f) return "";
    if (f.type === "string") return f.string || "";
    if (f.type === "number") return f.number != null ? String(f.number) : "";
    if (f.type === "boolean") return f.boolean != null ? String(f.boolean) : "";
    return "";
  }
  if (prop.type === "rollup") {
    const r = prop.rollup;
    if (!r) return "";
    if (r.type === "number") return r.number != null ? String(r.number) : "";
    if (r.type === "array") {
      return (r.array || [])
        .map((item: any) => extractText(item))
        .filter(Boolean)
        .join(", ");
    }
    return "";
  }
  return "";
}

function extractSelect(prop: any): string {
  if (!prop || prop.type !== "select") return "";
  return prop.select?.name || "";
}

function extractMultiSelect(prop: any): string[] {
  if (!prop || prop.type !== "multi_select") return [];
  return prop.multi_select?.map((s: any) => s.name) || [];
}

function extractStatus(prop: any): string {
  if (!prop || prop.type !== "status") return "";
  return prop.status?.name || "";
}

function extractNumber(prop: any): number | null {
  if (!prop || prop.type !== "number") return null;
  return prop.number;
}

function extractRelationIds(prop: any): string[] {
  if (!prop || prop.type !== "relation") return [];
  return prop.relation?.map((r: any) => r.id) || [];
}

function extractDate(prop: any): string | null {
  if (!prop || prop.type !== "date" || !prop.date) return null;
  return prop.date.start || null;
}

function extractDateEnd(prop: any): string | null {
  if (!prop || prop.type !== "date" || !prop.date) return null;
  return prop.date.end || null;
}

function extractFiles(prop: any): FileItem[] {
  if (!prop || prop.type !== "files") return [];
  // Dédup par URL : Notion peut stocker la même URL deux fois si une
  // requête a été rejouée (retry réseau, double-tap, instances Vercel
  // concurrentes). On nettoie ici une bonne fois pour toutes.
  const seenUrls = new Set<string>();
  return (prop.files?.map((f: any) => ({
    name: f.name || "file",
    url: f.type === "external" ? f.external?.url : f.file?.url || "",
  })) || []).filter((f: FileItem) => {
    if (!f.url || f.url.length === 0) return false;
    if (seenUrls.has(f.url)) return false;
    seenUrls.add(f.url);
    return true;
  });
}

function extractPlace(prop: any): string {
  if (!prop) return "";
  if (prop.type === "place" && prop.place) {
    return prop.place.address || prop.place.name || "";
  }
  return "";
}

function extractFormula(prop: any): string {
  if (!prop || prop.type !== "formula") return "";
  const f = prop.formula;
  if (f.type === "string") return f.string || "";
  if (f.type === "number") return f.number?.toString() || "";
  return "";
}

export function mapPageToProject(page: any): Project {
  const p = page.properties;
  return {
    id: page.id,
    projet: extractText(p["Projet"]),
    ofrTM: extractText(p["N° OFR TM"]),
    emplacementCabine: extractMultiSelect(p["Emplacement de cabine"]).join(", "),
    nbCabines: extractNumber(p["Nb. Cabines"]),
    fournisseurs: extractMultiSelect(p["n8n Fournisseurs"]),
    seriesCabines: extractMultiSelect(p["n8n Séries Cabines"]),
    nomChantier: extractText(p["Nom chantier"]),
    adresseChantier: extractPlace(p["Adresse chantier"]) || extractFormula(p["n8n - Adresse chantier"]) || extractText(p["Adresse chantier texte"]),
    dateMontage: extractDate(p["Date Montage"]),
    dateMontageEnd: extractDateEnd(p["Date Montage"]),
    dateDemandeProjet: extractDate(p["Demande projet reçue le"]),
    dateMesuresRecue: extractDate(p["Date Mesures reçue le"]),
    dateOffre: extractDate(p["Date Offre"]),
    dateCMDRecue: extractDate(p["CMD reçue le"]),
    dateCMDUsine: extractDate(p["Date CMD – Usine"]),
    collaborateurs: extractMultiSelect(p["Collaborateurs montages"]).join(" & "),
    documentsMontagee: extractFiles(p["Documents pour Montage"]),
    documentsMesures: extractFiles(p["Documents pour prise de mesures"]),
    heureArrivee: extractText(p["Heure arrivée"]),
    heureDepart: extractText(p["Heure départ"]),
    nomsCabines: extractText(p["Lot (nom de cabine)"]),
    attributionCabines: extractText(p["Monteur responsable"]),
    nbCabinesInstallees: extractNumber(p["Nb. Cabines installées"]),
    commentairesMontages: extractText(p["Commentaires Montages"]),
    rapportMonteur: extractText(p["Rapport monteur"]),
    photosAvant: extractFiles(p["Photos avant montage"]),
    photosDemontage: extractFiles(p["Photos démontage"]),
    photosMontage: extractFiles(p["Photos montage terminé"]),
    photosQRCode: extractFiles(p["Photos QR Code"]),
    photosGaranties: extractFiles(p["Photos garanties"]),
    photosCartons: extractFiles(p["État des cartons réceptionnés"]),
    rapportDeMontage: extractSelect(p["Rapport de montage"]),
    facturations: extractStatus(p["Facturations"]),
    etatCMD: extractStatus(p["État - CMD"]),
    typeServices: extractMultiSelect(p["Type de services"]),
    cmdGrossiste: extractText(p["N° CMD Grossiste"]),
    cmdTM: extractText(p["N° CMD TM"]),
    cmdTMUsine: extractText(p["N° CMD TM - Usine"]),
    cmdFournisseurs: extractText(p["n° CMD Fournisseurs"]),
    servCmdFournisseurs: extractText(p["N° Serv. CMD Fournisseurs"]),
    etatMesures: extractStatus(p["État - Mesures"]),
    ofrGrossiste: extractText(p["N° OFR Grossiste"]),
    servMesuresFournisseurs: extractText(p["N° Serv. Mesures Fournisseurs"]),
    mesuresTraiteePar: extractSelect(p["Mesures traitée par"]),
    dateMesures: extractDate(p["Mesures traitée le"]),
    photosSituations: extractFiles(p["Photos situations"]),
    photosMesures: extractFiles(p["Photos mesures"]),
    photosLocalite: extractFiles(p["Photos localité"]),
    contacts: extractText(p["Contacts projet"]),
    contactsRDV: extractText(p["Contacts pour RDV"]),
    commentairesMesures: extractText(p["Commentaires Mesures"]),
    soucisMontage: p["Soucis montage"]?.checkbox || false,
    causeSoucis: extractSelect(p["Cause Soucis montages"]),
    causeSAV: extractSelect(p["Cause SAV"]),
    etatSAV: extractStatus(p["État - SAV"]),
    dateRDVSAV: extractDate(p["Date - RDV SAV"]),
    dateSAVRecu: extractDate(p["Date - SAV reçu le"]),
    sav: p["SAV"]?.checkbox || false,
    bonLivraison: (() => {
      const bl = p["Bon de livraison"];
      if (!bl) return "";
      // Support both text and files type
      if (bl.type === "files" && bl.files?.length > 0) {
        const f = bl.files[0];
        return f.type === "external" ? f.external?.url || "" : f.file?.url || "";
      }
      if (bl.type === "rich_text") return bl.rich_text?.map((t: any) => t.plain_text).join("") || "";
      return "";
    })(),
    signatureUrl: (() => {
      // Lecture tolérante : on accepte le champ Notion qu'il soit
      // configuré en "Files & media", "URL", ou "Text" — en pratique
      // les rapports peuvent avoir été créés avec n'importe lequel.
      const sig = p["Signature clients"];
      if (!sig) return "";
      if (sig.type === "files" && sig.files?.length > 0) {
        const f = sig.files[0];
        return f.type === "external" ? f.external?.url || "" : f.file?.url || "";
      }
      if (sig.type === "url") return sig.url || "";
      if (sig.type === "rich_text") return sig.rich_text?.map((t: any) => t.plain_text).join("") || "";
      if (sig.type === "title") return sig.title?.map((t: any) => t.plain_text).join("") || "";
      return "";
    })(),
    typeClient: extractSelect(p["Type de client"]) || extractStatus(p["Type de client"]) || extractText(p["Type de client"]),
    grossistesRelation: extractRelationIds(p["Grossistes"]),
    fournisseursRelation: extractRelationIds(p["Fournisseurs"]),
    grossistesNames: [],
    fournisseursNames: [],
    sanitaireRelation: extractRelationIds(p["Sanitaire (Entreprise)"]),
    sanitaireNames: [],
    contactsProjetRelation: extractRelationIds(p["Contact Projet"]).length > 0 ? extractRelationIds(p["Contact Projet"]) : extractRelationIds(p["Contacts projet"]),
    contactsProjetNames: [],
    infoPiecesManquantes: extractText(p["Infos - Pièces manquantes"]),
    infoDefautsSignale: extractText(p["Infos - Défauts signalé"]),
    photosPiecesManquantes: extractFiles(p["Photos - Pièces manquante"]),
    photosDefautsSignale: extractFiles(p["Photos - Défauts signalé"]),
    arrivageTM: extractDate(p["Arrivage TM"]),
    arrivageGrossiste: extractDate(p["Arrivage Grossiste"]),
    nbCartons: extractNumber(p["Nb. de cartons"]),
  };
}

// Cache des titres de pages liées (grossistes, fournisseurs, etc.).
//
// Stratégie de cache à 2 niveaux :
//   1. In-memory (relationNameCache) : ultra-rapide tant que le worker
//      Vercel est chaud (~5 min d'idle). Sur cold start, vide.
//   2. Persistant via kv-store (clé "relation-names-cache") : survit
//      aux cold starts. Lu paresseusement au 1er besoin, écrit en
//      arrière-plan dès qu'un nouvel id est résolu.
//
// Avantage : avant ce fix, chaque cold start déclenchait jusqu'à 200
// `notion.pages.retrieve()` parallèles pour résoudre les noms — coût
// 400-800 ms même en burst rate-limité par Notion. Maintenant, le
// premier projet qui a besoin de relations charge la totale du KV
// en une lecture (~30 ms), et tout est instantané.
const relationNameCache: Record<string, string> = {};
const relationInflight: Record<string, Promise<string>> = {};

let kvHydrated = false;
let kvHydrationPromise: Promise<void> | null = null;

async function hydrateRelationCacheFromKV(): Promise<void> {
  if (kvHydrated) return;
  if (kvHydrationPromise) return kvHydrationPromise;
  kvHydrationPromise = (async () => {
    try {
      // Import dynamique pour éviter la dépendance circulaire entre
      // notion.ts et kv-store.ts (qui dépend lui-même de notion.ts).
      const { getData } = await import("@/lib/kv-store");
      const stored = await getData<{ id: string; name: string }>("relation-names-cache");
      // On filtre les entrées corrompues : si name === id (UUID brut en guise de nom,
      // causé par un rate-limit passé), on les ignore — elles seront re-résolues au
      // prochain accès avec le nouveau retry robuste.
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      for (const entry of stored || []) {
        if (entry?.id && entry?.name && !relationNameCache[entry.id]) {
          // Ignorer les entrées où name est un UUID (données corrompues)
          if (UUID_RE.test(entry.name)) continue;
          relationNameCache[entry.id] = entry.name;
        }
      }
    } catch {
      /* non-bloquant : si KV est down, le cache reste vide et on
         retombe sur l'ancien comportement (résolution per-id). */
    } finally {
      kvHydrated = true;
    }
  })();
  return kvHydrationPromise;
}

let kvWriteScheduled = false;
let pendingKvWrite = false;
function scheduleKVWrite() {
  pendingKvWrite = true;
  if (kvWriteScheduled) return;
  kvWriteScheduled = true;
  // Debounce : on attend 2 s qu'un éventuel batch de résolutions
  // s'accumule avant d'écrire le snapshot complet du cache. Évite
  // un write KV par id résolu, qui exploserait les coûts et la
  // latence.
  setTimeout(async () => {
    kvWriteScheduled = false;
    pendingKvWrite = false;
    try {
      const { setData } = await import("@/lib/kv-store");
      const snapshot = Object.entries(relationNameCache).map(([id, name]) => ({ id, name }));
      await setData("relation-names-cache", snapshot);
    } catch {
      /* silencieux : la prochaine résolution réessaiera */
    }
  }, 2000);
}

/**
 * Force l'écriture immédiate du cache relations vers KV. Utilisé par
 * le cron sync : on ne peut pas compter sur le setTimeout debouncé
 * pour exécuter, parce qu'en Vercel serverless le worker peut être
 * gelé / tué après la réponse HTTP. La cron appelle explicitement
 * cette fonction en fin de run pour persister le cache fraîchement
 * réchauffé.
 */
export async function flushRelationCacheToKV(): Promise<void> {
  if (!pendingKvWrite && Object.keys(relationNameCache).length === 0) return;
  try {
    const { setData } = await import("@/lib/kv-store");
    const snapshot = Object.entries(relationNameCache).map(([id, name]) => ({ id, name }));
    await setData("relation-names-cache", snapshot);
    pendingKvWrite = false;
  } catch {
    /* silencieux */
  }
}

async function fetchRelationName(id: string): Promise<string> {
  const cached = relationNameCache[id];
  if (cached) return cached;
  const pending = relationInflight[id];
  if (pending) return pending;
  const p = (async () => {
    // Retry exponentiel sur les 429 — critique : on ne doit JAMAIS cacher
    // l'UUID brut comme "nom" à cause d'un rate-limit temporaire. Sans retry,
    // la valeur corrompue (UUID) se retrouve dans le cache KV et s'affiche
    // dans l'app jusqu'à la prochaine résolution réussie.
    const MAX_RETRIES = 3;
    let lastErr: unknown;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const page = await notion.pages.retrieve({ page_id: id });
        const props = (page as any).properties;
        for (const val of Object.values(props) as any[]) {
          if (val?.type === "title") {
            const name = val.title?.map((t: any) => t.plain_text).join("") || id;
            relationNameCache[id] = name;
            scheduleKVWrite();
            delete relationInflight[id];
            return name;
          }
        }
        // Page trouvée mais pas de titre → on met l'ID (cas permanent, on cache)
        relationNameCache[id] = id;
        delete relationInflight[id];
        return id;
      } catch (err: any) {
        const isRateLimit = err?.status === 429 || err?.code === "rate_limited";
        if (isRateLimit && attempt < MAX_RETRIES - 1) {
          lastErr = err;
          const delay = Math.min(1000 * Math.pow(2, attempt), 6000); // 1s, 2s, 4s
          console.warn(`[notion] Rate limited on relation ${id} (attempt ${attempt + 1}/${MAX_RETRIES}), retry in ${delay}ms`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        // Erreur permanente (page supprimée, accès refusé…) → cache l'ID
        // mais UNIQUEMENT si ce n'est PAS un rate-limit (sinon risque de
        // polluer le cache KV avec une valeur fausse).
        if (!isRateLimit) {
          relationNameCache[id] = id;
          scheduleKVWrite();
        }
        // Si c'est un rate-limit et qu'on a épuisé les retries → on ne cache
        // pas, on retourne l'ID pour cet appel uniquement. Le prochain appel
        // retenterra (pas de cache corrompu).
        delete relationInflight[id];
        return id;
      }
    }
    // Tous les retries épuisés sur rate-limit
    delete relationInflight[id];
    return id;
  })();
  relationInflight[id] = p;
  return p;
}

async function resolveRelationNames(ids: string[]): Promise<Record<string, string>> {
  await hydrateRelationCacheFromKV();
  const uniqueIds = [...new Set(ids)];
  const uncached = uniqueIds.filter((id) => !relationNameCache[id]);
  if (uncached.length > 0) {
    await Promise.all(uncached.map((id) => fetchRelationName(id)));
  }
  const result: Record<string, string> = {};
  ids.forEach((id) => { result[id] = relationNameCache[id] || id; });
  return result;
}

/**
 * Exécute un appel Notion avec retry exponentiel sur les erreurs 429
 * (rate-limit). Évite de propager immédiatement une erreur temporaire.
 */
async function notionQueryWithRetry(params: Parameters<typeof notion.databases.query>[0], maxRetries = 3): Promise<any> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await notion.databases.query(params);
    } catch (err: any) {
      const isRateLimit = err?.status === 429 || err?.code === "rate_limited";
      if (!isRateLimit) throw err;
      lastErr = err;
      const delay = Math.min(1000 * Math.pow(2, attempt), 8000); // 1s, 2s, 4s
      console.warn(`[notion] Rate limited (attempt ${attempt + 1}/${maxRetries}), retry in ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

/**
 * Exécute un `notion.pages.retrieve()` avec retry exponentiel sur les erreurs 429.
 * Évite que "Projet introuvable" apparaisse à cause d'un rate-limit temporaire.
 */
async function notionRetrieveWithRetry(pageId: string, maxRetries = 4): Promise<any> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await notion.pages.retrieve({ page_id: pageId });
    } catch (err: any) {
      const isRateLimit = err?.status === 429 || err?.code === "rate_limited";
      if (!isRateLimit) throw err;
      lastErr = err;
      const delay = Math.min(1500 * Math.pow(2, attempt), 12000); // 1.5s, 3s, 6s, 12s
      console.warn(`[notion] Rate limited on retrieve (attempt ${attempt + 1}/${maxRetries}), retry in ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

/**
 * Exécute un `notion.pages.update()` avec retry exponentiel sur les erreurs 429.
 * Même logique que notionQueryWithRetry, mais pour les mutations.
 */
async function notionUpdateWithRetry(params: Parameters<typeof notion.pages.update>[0], maxRetries = 4): Promise<any> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await notion.pages.update(params);
    } catch (err: any) {
      const isRateLimit = err?.status === 429 || err?.code === "rate_limited";
      if (!isRateLimit) throw err;
      lastErr = err;
      const delay = Math.min(1500 * Math.pow(2, attempt), 12000); // 1.5s, 3s, 6s, 12s
      console.warn(`[notion] Rate limited on update (attempt ${attempt + 1}/${maxRetries}), retry in ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

async function queryAll(filter: any, sorts?: any[]): Promise<Project[]> {
  const allResults: any[] = [];
  let cursor: string | undefined = undefined;
  do {
    const response: any = await notionQueryWithRetry({
      database_id: databaseId,
      filter,
      sorts,
      page_size: 100,
      start_cursor: cursor,
    });
    allResults.push(...response.results);
    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);
  const projects = allResults.map(mapPageToProject).filter((p) => !p.projet.startsWith("[DATA]"));

  // Résolution des noms de relations EN PARALLÈLE.
  // Avant : 2 awaits séquentiels (grossistes puis fournisseurs/sanitaires/
  // contacts) → 2 round-trips. Maintenant : un seul Promise.all qui fait
  // tout en simultané → 1 round-trip latency. Sur cold start avec relations
  // non cachées, gain mesuré 200-400 ms.
  const allGrossisteIds = [...new Set(projects.flatMap((p) => p.grossistesRelation))];
  const allOtherIds = [...new Set([
    ...projects.flatMap((p) => p.fournisseursRelation),
    ...projects.flatMap((p) => p.sanitaireRelation),
    ...projects.flatMap((p) => p.contactsProjetRelation),
  ])];
  const [grossisteNames, otherNames] = await Promise.all([
    allGrossisteIds.length > 0 ? resolveRelationNames(allGrossisteIds) : Promise.resolve({} as Record<string, string>),
    allOtherIds.length > 0 ? resolveRelationNames(allOtherIds) : Promise.resolve({} as Record<string, string>),
  ]);
  if (allGrossisteIds.length > 0) {
    projects.forEach((p) => {
      p.grossistesNames = p.grossistesRelation.map((id) => grossisteNames[id] || id);
    });
  }
  if (allOtherIds.length > 0) {
    projects.forEach((p) => {
      p.fournisseursNames = p.fournisseursRelation.map((id) => otherNames[id] || id);
      p.sanitaireNames = p.sanitaireRelation.map((id) => otherNames[id] || id);
      p.contactsProjetNames = p.contactsProjetRelation.map((id) => otherNames[id] || id);
    });
  }

  return projects;
}

export async function getProjects(): Promise<Project[]> {
  return queryAll(
    {
      or: [
        // Étape mesures → commande
        { property: "État - CMD", status: { equals: "OFR envoyées sans mesures" } },
        { property: "État - CMD", status: { equals: "Cabines mesurées" } },
        // Étape commande
        { property: "État - CMD", status: { equals: "Cabines en CMD" } },
        { property: "État - CMD", status: { equals: "Cabines à recevoir" } },
        { property: "État - CMD", status: { equals: "Livraison partielle" } },
        { property: "État - CMD", status: { equals: "Cabine à aller chercher" } },
        // Étape montage
        { property: "État - CMD", status: { equals: "Récéptionné - RDV à fixer" } },
        { property: "État - CMD", status: { equals: "RDV - fixé" } },
        { property: "État - CMD", status: { equals: "RDV - Attendre news" } },
        { property: "État - CMD", status: { equals: "Montage partiel" } },
        { property: "État - CMD", status: { equals: "Soucis montage" } },
      ],
    },
    [{ property: "Date Montage", direction: "descending" }]
  );
}

export async function getProjectsMesures(): Promise<Project[]> {
  return queryAll(
    {
      and: [
        { property: "État - CMD", status: { equals: "En attente de mesures" } },
        {
          or: [
            { property: "État - Mesures", status: { equals: "Pas contacté" } },
            { property: "État - Mesures", status: { equals: "Contact sans réponse" } },
            { property: "État - Mesures", status: { equals: "OFR envoyée sans mesures" } },
            { property: "État - Mesures", status: { equals: "Mesures non relevées - attendre news" } },
            { property: "État - Mesures", status: { equals: "RDV - Fixé" } },
            { property: "État - Mesures", status: { equals: "RDV - Attendre news" } },
            { property: "État - Mesures", status: { equals: "Mesures partielles" } },
            { property: "État - Mesures", status: { equals: "Mesures relevées - attente news" } },
          ],
        },
      ],
    },
    [{ property: "Date Montage", direction: "descending" }]
  );
}

/** Mesures terminées avec CMD = "Cabines mesurées" — projets dont la commande n'a pas encore été passée */
export async function getProjectsMesuresSansCommande(): Promise<Project[]> {
  return queryAll(
    {
      and: [
        { property: "État - Mesures", status: { equals: "Terminé" } },
        { property: "État - CMD", status: { equals: "Cabines mesurées" } },
      ],
    },
    [{ property: "Mesures traitée le", direction: "descending" }]
  );
}

/** Mesures terminées avec CMD = "Annulé" — pour historique des mesures sur projets annulés */
export async function getProjectsMesuresAnnulees(): Promise<Project[]> {
  return queryAll(
    {
      and: [
        { property: "État - Mesures", status: { equals: "Terminé" } },
        { property: "État - CMD", status: { equals: "Annulé" } },
      ],
    },
    [{ property: "Mesures traitée le", direction: "descending" }]
  );
}

export async function getProjectsServices(): Promise<Project[]> {
  return queryAll(
    {
      and: [
        { property: "Type de services", multi_select: { contains: "Services" } },
        { property: "État - CMD", status: { does_not_equal: "Annulé" } },
        { property: "État - CMD", status: { does_not_equal: "Terminé" } },
      ],
    },
    [{ property: "Date Montage", direction: "descending" }]
  );
}

export async function getProjectsSAV(): Promise<Project[]> {
  return queryAll(
    {
      and: [
        { property: "État - SAV", status: { does_not_equal: "Aucun SAV" } },
        { property: "État - SAV", status: { does_not_equal: "Terminé" } },
        { property: "SAV Clôturé", checkbox: { equals: false } },
      ],
    },
    [{ property: "Date Montage", direction: "descending" }]
  );
}

// Tous les projets non terminés/non annulés (pour les vues Grossistes/Fournisseurs)
export async function getAllActiveProjects(): Promise<Project[]> {
  return queryAll(
    {
      and: [
        { property: "État - CMD", status: { does_not_equal: "Annulé" } },
        { property: "État - CMD", status: { does_not_equal: "Terminé" } },
      ],
    },
    [{ property: "Date Montage", direction: "descending" }]
  );
}

// Vraiment tous les projets, sans filtre d'état (admin uniquement).
// Inclut donc aussi les Terminé, Annulé et tous les autres statuts.
export async function getAllProjectsRaw(): Promise<Project[]> {
  return queryAll(
    undefined,
    [{ property: "Date Montage", direction: "descending" }]
  );
}

// Projets dont l'état CMD est "Terminé" (archivage CMD).
export async function getProjectsCmdTermine(): Promise<Project[]> {
  return queryAll(
    { property: "État - CMD", status: { equals: "Terminé" } },
    [{ property: "Date Montage", direction: "descending" }]
  );
}

export async function getProject(pageId: string): Promise<Project> {
  const page = await notionRetrieveWithRetry(pageId);
  const project = mapPageToProject(page);
  // Résolution des noms de relations ET fusion du débordement photo EN
  // PARALLÈLE (deux lectures indépendantes) — réduit la latence d'ouverture
  // d'un projet, surtout sur instance froide (cold start) où chaque lecture
  // Notion compte. Le débordement mute project.photos* en place.
  const allRelIds = [...new Set([...project.grossistesRelation, ...project.fournisseursRelation, ...project.sanitaireRelation, ...project.contactsProjetRelation])];
  const [names] = await Promise.all([
    allRelIds.length > 0 ? resolveRelationNames(allRelIds) : Promise.resolve({} as Record<string, string>),
    (async () => {
      try {
        const { mergeOverflowIntoProject } = await import("@/lib/photo-overflow");
        await mergeOverflowIntoProject(project);
      } catch {}
    })(),
  ]);
  if (allRelIds.length > 0) {
    project.grossistesNames = project.grossistesRelation.map((id) => names[id] || id);
    project.fournisseursNames = project.fournisseursRelation.map((id) => names[id] || id);
    project.sanitaireNames = project.sanitaireRelation.map((id) => names[id] || id);
    project.contactsProjetNames = project.contactsProjetRelation.map((id) => names[id] || id);
  }
  return project;
}

/**
 * Découpe une chaîne en blocs de `rich_text` compatibles Notion.
 *
 * Notion impose une limite de 2000 caractères par bloc `text.content`.
 * Un rapport rempli à la main + plusieurs dictées vocales dépasse
 * facilement cette limite, et dans ce cas la requête PATCH est rejetée
 * en entier par l'API Notion (Error 400 "body.properties...text.content
 * should be ≤ 2000 characters"). Résultat : la sauvegarde échoue, la
 * personne voit peut-être passer le toast d'erreur et en tout cas tout
 * est perdu au prochain fetch.
 *
 * Ce helper renvoie un tableau de blocs `rich_text` qui ensemble
 * contiennent tout le texte, découpé tous les 1900 caractères pour se
 * laisser une marge. Quand on lit la page depuis Notion, les blocs
 * sont concaténés naturellement (plain_text.join("")).
 */
function toRichText(content: string | null | undefined): { text: { content: string } }[] {
  if (!content) return [{ text: { content: "" } }];
  const CHUNK = 1900;
  if (content.length <= CHUNK) return [{ text: { content } }];
  const parts: { text: { content: string } }[] = [];
  for (let i = 0; i < content.length; i += CHUNK) {
    parts.push({ text: { content: content.slice(i, i + CHUNK) } });
  }
  return parts;
}

export async function updateProject(
  pageId: string,
  data: {
    heureArrivee?: string;
    heureDepart?: string;
    nomsCabines?: string;
    attributionCabines?: string;
    nbCabinesInstallees?: number;
    commentairesMontages?: string;
    rapportMonteur?: string;
    dateMontage?: string | null;
    dateMesures?: string | null;
    dateDemandeProjet?: string | null;
    dateMesuresRecue?: string | null;
    dateOffre?: string | null;
    dateCMDRecue?: string | null;
    dateCMDUsine?: string | null;
    arrivageGrossiste?: string | null;
    arrivageTM?: string | null;
    adresseChantier?: string;
    collaborateurs?: string;
    mesuresTraiteePar?: string;
    bonLivraison?: string;
    etatCMD?: string;
    etatMesures?: string;
    etatSAV?: string;
    dateSAVRecu?: string | null;
    contacts?: string;
    contactsRDV?: string;
    commentairesMesures?: string;
    nomChantier?: string;
    nbCabines?: number;
  }
) {
  const properties: any = {};

  if (data.heureArrivee !== undefined) {
    properties["Heure arrivée"] = {
      rich_text: toRichText(data.heureArrivee),
    };
  }
  if (data.heureDepart !== undefined) {
    properties["Heure départ"] = {
      rich_text: toRichText(data.heureDepart),
    };
  }
  if (data.nomsCabines !== undefined) {
    properties["Lot (nom de cabine)"] = {
      rich_text: toRichText(data.nomsCabines),
    };
  }
  if (data.attributionCabines !== undefined) {
    properties["Monteur responsable"] = {
      rich_text: toRichText(data.attributionCabines),
    };
  }
  if (data.nbCabinesInstallees !== undefined) {
    properties["Nb. Cabines installées"] = {
      number: data.nbCabinesInstallees,
    };
  }
  if (data.commentairesMontages !== undefined) {
    properties["Commentaires Montages"] = {
      rich_text: toRichText(data.commentairesMontages),
    };
  }
  if (data.rapportMonteur !== undefined) {
    properties["Rapport monteur"] = {
      rich_text: toRichText(data.rapportMonteur),
    };
  }
  if (data.dateMontage !== undefined) {
    properties["Date Montage"] = {
      date: data.dateMontage ? { start: data.dateMontage } : null,
    };
  }
  if (data.dateMesures !== undefined) {
    properties["Mesures traitée le"] = {
      date: data.dateMesures ? { start: data.dateMesures } : null,
    };
  }
  if (data.dateDemandeProjet !== undefined) {
    properties["Demande projet reçue le"] = {
      date: data.dateDemandeProjet ? { start: data.dateDemandeProjet } : null,
    };
  }
  if (data.dateMesuresRecue !== undefined) {
    properties["Date Mesures reçue le"] = {
      date: data.dateMesuresRecue ? { start: data.dateMesuresRecue } : null,
    };
  }
  if (data.dateOffre !== undefined) {
    properties["Date Offre"] = {
      date: data.dateOffre ? { start: data.dateOffre } : null,
    };
  }
  if (data.dateCMDRecue !== undefined) {
    properties["CMD reçue le"] = {
      date: data.dateCMDRecue ? { start: data.dateCMDRecue } : null,
    };
  }
  if (data.dateCMDUsine !== undefined) {
    properties["Date CMD – Usine"] = {
      date: data.dateCMDUsine ? { start: data.dateCMDUsine } : null,
    };
  }
  if (data.arrivageGrossiste !== undefined) {
    properties["Arrivage Grossiste"] = {
      date: data.arrivageGrossiste ? { start: data.arrivageGrossiste } : null,
    };
  }
  if (data.arrivageTM !== undefined) {
    properties["Arrivage TM"] = {
      date: data.arrivageTM ? { start: data.arrivageTM } : null,
    };
  }
  if (data.adresseChantier !== undefined) {
    // "Adresse chantier" est un champ Place (non écrivable via API).
    // On tente d'écrire dans "Adresse chantier texte" (rich_text parallèle)
    // si ce champ existe dans la base. Sinon on skip silencieusement
    // plutôt que de faire échouer tout le PATCH.
    const addrType = await getPropertyType("Adresse chantier texte");
    if (addrType === "rich_text" || addrType === "text") {
      properties["Adresse chantier texte"] = {
        rich_text: toRichText(data.adresseChantier),
      };
    }
    // Si le champ n'existe pas → pas d'erreur, les autres champs sont quand même sauvegardés
  }
  if (data.collaborateurs !== undefined) {
    // "Collaborateurs montages" est un multi_select dans Notion.
    // Le champ collaborateurs est stocké en string "Nom1 & Nom2" → on éclate par " & ".
    const collabNames = data.collaborateurs
      ? data.collaborateurs.split(" & ").map((n) => n.trim()).filter(Boolean).map((name) => ({ name }))
      : [];
    properties["Collaborateurs montages"] = { multi_select: collabNames };
  }
  if (data.mesuresTraiteePar !== undefined) {
    properties["Mesures traitée par"] = {
      select: data.mesuresTraiteePar ? { name: data.mesuresTraiteePar } : null,
    };
  }
  if (data.bonLivraison !== undefined) {
    if (data.bonLivraison && data.bonLivraison.startsWith("http")) {
      // Store as file (external URL)
      properties["Bon de livraison"] = {
        files: [{
          type: "external" as const,
          name: "bon-de-livraison.jpg",
          external: { url: data.bonLivraison },
        }],
      };
    } else {
      // Clear the field
      properties["Bon de livraison"] = { files: [] };
    }
  }
  if (data.etatCMD !== undefined) {
    properties["État - CMD"] = {
      status: { name: data.etatCMD },
    };
  }
  if (data.etatMesures !== undefined) {
    properties["État - Mesures"] = {
      status: { name: data.etatMesures },
    };
  }
  if (data.etatSAV !== undefined) {
    properties["État - SAV"] = {
      status: { name: data.etatSAV },
    };
  }
  if (data.dateSAVRecu !== undefined) {
    properties["Date - SAV reçu le"] = {
      date: data.dateSAVRecu ? { start: data.dateSAVRecu } : null,
    };
  }
  if (data.contacts !== undefined) {
    // Vérifier que le champ existe bien en tant que rich_text.
    // "Contact Projet" est souvent une relation dans Notion, pas du texte.
    // On évite de crasher tout le PATCH si le champ est absent ou mal typé.
    const contactsType = await getPropertyType("Contacts projet");
    if (contactsType === "rich_text" || contactsType === "text") {
      properties["Contacts projet"] = {
        rich_text: toRichText(data.contacts),
      };
    }
    // Champ absent ou relation → skip silencieux
  }
  if (data.contactsRDV !== undefined) {
    properties["Contacts pour RDV"] = {
      rich_text: toRichText(data.contactsRDV),
    };
  }
  if (data.commentairesMesures !== undefined) {
    properties["Commentaires Mesures"] = {
      rich_text: toRichText(data.commentairesMesures),
    };
  }
  if ((data as any).infoPiecesManquantes !== undefined) {
    properties["Infos - Pièces manquantes"] = {
      rich_text: toRichText((data as any).infoPiecesManquantes),
    };
  }
  if ((data as any).infoDefautsSignale !== undefined) {
    properties["Infos - Défauts signalé"] = {
      rich_text: toRichText((data as any).infoDefautsSignale),
    };
  }
  if (data.nomChantier !== undefined) {
    properties["Nom chantier"] = {
      rich_text: toRichText(data.nomChantier),
    };
  }
  if (data.nbCabines !== undefined) {
    properties["Nb. Cabines"] = {
      number: data.nbCabines,
    };
  }
  if ((data as any).nbCartons !== undefined) {
    properties["Nb. de cartons"] = {
      number: (data as any).nbCartons,
    };
  }
  // === Champs éditables par l'admin depuis l'app ===
  if ((data as any).projet !== undefined) {
    properties["Projet"] = {
      title: [{ text: { content: (data as any).projet || "" } }],
    };
  }
  if ((data as any).ofrTM !== undefined) {
    properties["N° OFR TM"] = { rich_text: toRichText((data as any).ofrTM) };
  }
  if ((data as any).cmdTM !== undefined) {
    properties["N° CMD TM"] = { rich_text: toRichText((data as any).cmdTM) };
  }
  if ((data as any).cmdTMUsine !== undefined) {
    properties["N° CMD TM - Usine"] = { rich_text: toRichText((data as any).cmdTMUsine) };
  }
  if ((data as any).ofrGrossiste !== undefined) {
    properties["N° OFR Grossiste"] = { rich_text: toRichText((data as any).ofrGrossiste) };
  }
  if ((data as any).cmdGrossiste !== undefined) {
    properties["N° CMD Grossiste"] = { rich_text: toRichText((data as any).cmdGrossiste) };
  }
  if ((data as any).cmdFournisseurs !== undefined) {
    properties["n° CMD Fournisseurs"] = { rich_text: toRichText((data as any).cmdFournisseurs) };
  }
  if ((data as any).servMesuresFournisseurs !== undefined) {
    properties["N° Serv. Mesures Fournisseurs"] = { rich_text: toRichText((data as any).servMesuresFournisseurs) };
  }
  if ((data as any).servCmdFournisseurs !== undefined) {
    properties["N° Serv. CMD Fournisseurs"] = { rich_text: toRichText((data as any).servCmdFournisseurs) };
  }
  if ((data as any).typeClient !== undefined) {
    // Le champ "Type de client" peut être un select, un status ou un rich_text
    // selon la configuration de la base Notion.
    const tcType = await getPropertyType("Type de client");
    if (tcType === "status") {
      properties["Type de client"] = { status: { name: (data as any).typeClient } };
    } else if (tcType === "rich_text") {
      properties["Type de client"] = { rich_text: toRichText((data as any).typeClient) };
    } else {
      // Par défaut : select
      properties["Type de client"] = {
        select: (data as any).typeClient ? { name: (data as any).typeClient } : null,
      };
    }
  }
  if ((data as any).emplacementCabine !== undefined) {
    // Ce champ est de type multi_select dans Notion (extractMultiSelect en lecture).
    // La valeur lue est une string jointe par ", " — on re-sépare pour écrire
    // les options individuelles. Ex: "Salle de bain, WC" → [{name:"Salle de bain"},{name:"WC"}]
    const val: string = (data as any).emplacementCabine || "";
    const items = val
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((name) => ({ name }));
    properties["Emplacement de cabine"] = { multi_select: items };
  }
  if ((data as any).signatureUrl !== undefined) {
    const sigUrl = (data as any).signatureUrl;
    if (sigUrl) {
      // Détection dynamique du type du champ "Signature clients" dans
      // Notion : la base d'un client peut avoir Files, URL ou Text.
      // On adapte le payload sinon Notion rejette la requête entière.
      const sigType = await getPropertyType("Signature clients");
      if (sigType === "url") {
        properties["Signature clients"] = { url: sigUrl };
      } else if (sigType === "rich_text") {
        properties["Signature clients"] = { rich_text: toRichText(sigUrl) };
      } else if (sigType === null) {
        // Champ pas trouvé dans le schéma — on log côté serveur pour
        // que l'admin sache qu'il faut le créer dans Notion. On écrit
        // tout de même en files (comportement historique) au cas où
        // la propriété aurait été ajoutée juste après le 1er fetch.
        console.warn("[notion] Champ 'Signature clients' introuvable dans la base — créez-le (type Files & media ou URL).");
        properties["Signature clients"] = {
          files: [{ type: "external" as const, name: "signature.png", external: { url: sigUrl } }],
        };
      } else {
        // Type "files" ou autre → format Files par défaut.
        properties["Signature clients"] = {
          files: [{ type: "external" as const, name: "signature.png", external: { url: sigUrl } }],
        };
      }
    }
  }
  // Helper unifié pour écrire un champ Notion de type Files. Accepte
  // un tableau de FileItem ({name, url}) ou de simples URLs string.
  // PRÉSERVATION DES NOMS : critique pour les photos rapport, parce
  // que le bucket (avant intervention / montage gauche / etc.) est
  // encodé dans le préfixe du nom de fichier. Si on régénère un nom
  // générique, la détection de bucket est perdue au prochain read.
  const writeFilesField = (key: string, propName: string, defaultName: string) => {
    if ((data as any)[key] === undefined) return;
    const list: any[] = (data as any)[key] || [];
    const files = list
      .map((item, i) => {
        const url = typeof item === "string" ? item : item?.url;
        if (!url) return null;
        const name =
          (typeof item === "object" && item?.name) ||
          url.split("/").pop()?.slice(0, 100) ||
          `${defaultName}-${i + 1}.jpg`;
        return { type: "external" as const, name: String(name).slice(0, 100), external: { url } };
      })
      .filter(Boolean);
    properties[propName] = { files };
  };
  writeFilesField("photosCartons", "État des cartons réceptionnés", "carton");
  writeFilesField("photosAvant", "Photos avant montage", "avant");
  writeFilesField("photosDemontage", "Photos démontage", "demontage");
  writeFilesField("photosMontage", "Photos montage terminé", "montage");
  writeFilesField("photosQRCode", "Photos QR Code", "qrcode");
  writeFilesField("photosGaranties", "Photos garanties", "garantie");
  writeFilesField("photosPiecesManquantes", "Photos - Pièces manquante", "piece");
  writeFilesField("photosDefautsSignale", "Photos - Défauts signalé", "defaut");

  await notionUpdateWithRetry({
    page_id: pageId,
    properties,
  });
}

export async function createProject(data: {
  projet: string;
  ofrTM?: string;
  cmdTM?: string;
  cmdTMUsine?: string;
  nomChantier?: string;
  adresseChantier?: string;
  nbCabines?: number;
  dateMontage?: string;
  dateMesures?: string;
  collaborateurs?: string;
  mesuresTraiteePar?: string;
  etatCMD?: string;
  etatMesures?: string;
  contacts?: string;
  contactsRDV?: string;
  typeClient?: string;
  commentairesMesures?: string;
}): Promise<string> {
  const properties: any = {
    Projet: {
      title: [{ text: { content: data.projet } }],
    },
  };

  if (data.ofrTM) {
    properties["N° OFR TM"] = { rich_text: toRichText(data.ofrTM) };
  }
  if (data.cmdTM) {
    properties["N° CMD TM"] = { rich_text: toRichText(data.cmdTM) };
  }
  if (data.cmdTMUsine) {
    properties["N° CMD TM - Usine"] = { rich_text: toRichText(data.cmdTMUsine) };
  }
  if (data.nomChantier) {
    properties["Nom chantier"] = { rich_text: toRichText(data.nomChantier) };
  }
  if (data.contactsRDV) {
    properties["Contacts pour RDV"] = { rich_text: toRichText(data.contactsRDV) };
  }
  if (data.typeClient) {
    // Essaie select par défaut — adapté dynamiquement si nécessaire
    properties["Type de client"] = { select: { name: data.typeClient } };
  }
  if (data.adresseChantier) {
    properties["Adresse chantier"] = {
      rich_text: toRichText(data.adresseChantier),
    };
  }
  if (data.nbCabines !== undefined && data.nbCabines !== null) {
    properties["Nb. Cabines"] = {
      number: data.nbCabines,
    };
  }
  if (data.dateMontage) {
    properties["Date Montage"] = {
      date: { start: data.dateMontage },
    };
  }
  if (data.dateMesures) {
    properties["Mesures traitée le"] = {
      date: { start: data.dateMesures },
    };
  }
  if (data.collaborateurs) {
    const collabNames = data.collaborateurs
      .split(" & ").map((n: string) => n.trim()).filter(Boolean).map((name: string) => ({ name }));
    properties["Collaborateurs montages"] = { multi_select: collabNames };
  }
  if (data.mesuresTraiteePar) {
    properties["Mesures traitée par"] = {
      select: { name: data.mesuresTraiteePar },
    };
  }
  if (data.etatCMD) {
    properties["État - CMD"] = {
      status: { name: data.etatCMD },
    };
  }
  if (data.etatMesures) {
    properties["État - Mesures"] = {
      status: { name: data.etatMesures },
    };
  }
  if (data.contacts) {
    properties["Contacts projet"] = {
      rich_text: toRichText(data.contacts),
    };
  }
  if (data.commentairesMesures) {
    properties["Commentaires Mesures"] = {
      rich_text: toRichText(data.commentairesMesures),
    };
  }
  if (data.nomChantier) {
    properties["Nom chantier"] = {
      rich_text: toRichText(data.nomChantier),
    };
  }
  if (data.nbCabines !== undefined) {
    properties["Nb. Cabines"] = {
      number: data.nbCabines,
    };
  }

  const page = await notion.pages.create({
    parent: { database_id: databaseId },
    properties,
  });

  return page.id;
}

export async function deleteProject(pageId: string): Promise<void> {
  await notionUpdateWithRetry({
    page_id: pageId,
    archived: true,
  });
}
