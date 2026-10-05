import { gunzipSync, gzipSync } from "node:zlib";
import { notion, databaseId } from "./notion";
import { redisEnabled, redisHGetAll, redisHSet, redisLockAcquire, redisLockRelease } from "./redis-cache";

// ---------------------------------------------------------------------------
// In-memory cache  (survives across requests in the same serverless process)
// ---------------------------------------------------------------------------

interface CacheEntry<T = unknown> {
  data: T[];
  expiry: number;
}

const memoryCache = new Map<string, CacheEntry>();
const CACHE_TTL = 60_000; // 1 minute

// Verrou d'écriture PAR CLÉ : sérialise les setData concurrents d'une même clé
// (ex. deux défauts/pièces enregistrés quasi simultanément). Sans ça, deux
// writes peuvent s'entrelacer (append A, append B, delete) → la page Notion
// contient un mélange ancien+nouveau → JSON illisible → perte de données.
const writeLocks = new Map<string, Promise<unknown>>();

function getCached<T>(key: string): T[] | null {
  const entry = memoryCache.get(key);
  if (entry && Date.now() < entry.expiry) return entry.data as T[];
  if (entry) memoryCache.delete(key);
  return null;
}

function setCache<T>(key: string, data: T[]): void {
  memoryCache.set(key, { data, expiry: Date.now() + CACHE_TTL });
}

// ---------------------------------------------------------------------------
// Notion page ID cache  (maps data key -> Notion page ID)
// ---------------------------------------------------------------------------

const pageIdCache: Record<string, string> = {};

const NOTION_BLOCK_CHAR_LIMIT = 2000;

// Storage parent page — all [DATA] pages live here, NOT in the projects database
const STORAGE_PAGE_ID = "3431895b9179804eb9bfc51868936cf2";

/**
 * Find or create a Notion page that stores data for a given key.
 * Pages are children of the TM App Storage page (not in the projects DB).
 */
// Mapping clé→pageId mémorisé dans Redis (HASH « kvpages »), PARTAGÉ entre
// instances et PERSISTANT. C'est LA correction du problème : sans lui, chaque
// instance froide re-listait les pages Notion pour retrouver sa page — et comme
// le magasin a accumulé des MILLIERS de pages en doublon (force-sync-signal,
// chat-*), ce listing devenait très lent (→ requêtes qui expirent, app figée) et
// recréait sans cesse des doublons. Avec Redis, on résout l'ID une seule fois.
let kvPagesRedis: Record<string, string> | null = null;
async function loadKvPagesFromRedis(): Promise<Record<string, string>> {
  if (kvPagesRedis) return kvPagesRedis;
  try {
    kvPagesRedis = redisEnabled ? await redisHGetAll("kvpages") : {};
  } catch {
    kvPagesRedis = {};
  }
  return kvPagesRedis;
}
function rememberPageId(key: string, id: string) {
  pageIdCache[key] = id;
  if (kvPagesRedis) kvPagesRedis[key] = id;
  if (redisEnabled) redisHSet("kvpages", key, id).catch(() => {});
}

/** Titre d'une page Notion, tel que l'API le renvoie. */
function titreDePage(page: any): string {
  const t = page?.properties?.title?.title || [];
  return t.map((x: any) => x.plain_text || "").join("");
}

/**
 * Retrouve la page d'une clé par son titre, où qu'elle soit dans le magasin.
 *
 * Deux précautions tirées de l'état réel du magasin :
 *
 *   • on interroge Notion sur la CLÉ seule, pas sur le titre complet : les
 *     14 500 pages commencent toutes par « [DATA] », et ce préfixe noie la
 *     recherche — le titre entier ne ramenait aucune correspondance exacte.
 *
 *   • une même clé a souvent des centaines de pages homonymes. Presque toutes
 *     sont vides : ce sont celles qu'une LECTURE avait créées pour rien avant
 *     cette correction. Une page qui n'a jamais rien reçu a sa date de
 *     modification égale à sa date de création — on les écarte sur ce critère,
 *     et on garde la plus récente qui porte vraiment quelque chose.
 */
async function chercherPageParTitre(key: string, title: string): Promise<string | null> {
  try {
    const exactes: any[] = [];
    let curseur: string | undefined;
    for (let page = 0; page < 3; page++) {
      const res = (await notion.search({
        query: key,
        filter: { property: "object", value: "page" },
        page_size: 100,
        start_cursor: curseur,
      })) as unknown as { results?: any[]; has_more?: boolean; next_cursor?: string | null };
      for (const p of res.results || []) {
        if (
          !p.archived &&
          p.parent?.type === "page_id" &&
          String(p.parent.page_id || "").replace(/-/g, "") === STORAGE_PAGE_ID &&
          titreDePage(p) === title
        ) exactes.push(p);
      }
      if (!res.has_more) break;
      curseur = res.next_cursor ?? undefined;
    }
    if (exactes.length === 0) return null;

    const ecrites = exactes
      .filter((p) => Date.parse(p.last_edited_time) - Date.parse(p.created_time) > 2000)
      .sort((a, b) => String(b.last_edited_time).localeCompare(String(a.last_edited_time)));

    for (const p of ecrites.slice(0, 3)) {
      const contenu = await notion.blocks.children.list({ block_id: p.id, page_size: 1 });
      if (contenu.results.length > 0) return p.id;
    }
    return ecrites[0]?.id ?? exactes[0]?.id ?? null;
  } catch {
    return null; // recherche indisponible → on retombe sur la création
  }
}

async function getOrCreateBackupPageId(key: string): Promise<string> {
  if (pageIdCache[key]) return pageIdCache[key];

  const title = `[DATA] ${key}`;

  try {
    // 1) Redis (rapide, partagé) : si l'ID est connu, AUCUN listing Notion.
    const redisMap = await loadKvPagesFromRedis();
    if (redisMap[key]) {
      pageIdCache[key] = redisMap[key];
      return redisMap[key];
    }

    // 2) Sinon, on cherche dans les 100 PREMIÈRES pages seulement (les pages
    //    « canoniques » d'origine y figurent — créées tôt). PAS de pagination
    //    complète : le magasin contient des milliers de pages, la parcourir
    //    entièrement fige l'app. Une fois trouvé, on mémorise dans Redis.
    const children = await notion.blocks.children.list({
      block_id: STORAGE_PAGE_ID,
      page_size: 100,
    });
    for (const block of children.results) {
      const b = block as any;
      if (b.type === "child_page" && b.child_page?.title === title) {
        rememberPageId(key, b.id);
        return b.id;
      }
    }

    // 3) Toujours introuvable dans les 100 premières : on DEMANDE à Notion.
    //    Sans cette étape, une clé dont la page a glissé au-delà des 100
    //    premières était jugée inexistante et on en recréait une à CHAQUE
    //    appel — y compris en LECTURE, qui repartait alors d'une page vide
    //    pendant que les données dormaient dans la précédente. Le magasin a
    //    ainsi accumulé 14 500 pages pour 608 clés réelles.
    const trouvee = await chercherPageParTitre(key, title);
    if (trouvee) {
      rememberPageId(key, trouvee);
      return trouvee;
    }

    /* 4) Vraiment inexistante → on la crée. Mais deux serveurs peuvent arriver
          ici en même temps pour la même clé neuve : chacun ne voit rien et
          chacun crée sa page. C'est ce qui donnait trois ou quatre pages pour
          une seule conversation. On prend donc un verrou le temps de la
          création, et une fois pris, on revérifie : si l'autre est passé
          devant, on prend la sienne. */
    const verrou = redisEnabled ? await redisLockAcquire(`lock:kvpage:${key}`, 10_000) : null;
    try {
      if (verrou) {
        const apres = await redisHGetAll("kvpages").catch(() => ({} as Record<string, string>));
        if (apres[key]) {
          pageIdCache[key] = apres[key];
          if (kvPagesRedis) kvPagesRedis[key] = apres[key];
          return apres[key];
        }
      }
      const page = await notion.pages.create({
        parent: { page_id: STORAGE_PAGE_ID },
        properties: { title: { title: [{ text: { content: title } }] } },
      });
      rememberPageId(key, page.id);
      return page.id;
    } finally {
      if (verrou) await redisLockRelease(`lock:kvpage:${key}`, verrou).catch(() => {});
    }
  } catch (err) {
    console.error(`[kv-store] Failed to get/create page for "${key}":`, err);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Notion read / write
// ---------------------------------------------------------------------------

/**
 * Write JSON data into the content blocks of a Notion page.
 *
 * Stratégie write-first pour éviter la perte de données en cas d'interruption
 * (déploiement rapide, timeout serverless, etc.) :
 *
 *  1. Lire les IDs des blocs EXISTANTS (avant tout changement).
 *  2. Écrire les NOUVEAUX blocs (append) — les données sont déjà persistées.
 *  3. Supprimer les anciens blocs.
 *
 * Si le process est tué entre 2 et 3, la page contient les deux versions.
 * `readFromNotion` gère ce cas en extrayant le DERNIER tableau JSON valide.
 */
async function writeToNotion(key: string, jsonString: string): Promise<void> {
  const pageId = await getOrCreateBackupPageId(key);

  // 1. Mémoriser TOUS les IDs des blocs actuels (AVEC pagination) avant d'écrire.
  //    Bug corrigé : sans pagination, au-delà de 100 blocs les anciens n'étaient
  //    pas tous supprimés → accumulation ancien+nouveau → JSON illisible → perte
  //    de données (ex. photoUrls de défauts qui "disparaissent").
  const oldBlockIds: string[] = [];
  let listCursor: string | undefined;
  do {
    const existingBlocks = await notion.blocks.children.list({
      block_id: pageId,
      page_size: 100,
      start_cursor: listCursor,
    });
    for (const b of existingBlocks.results) oldBlockIds.push(b.id);
    listCursor = existingBlocks.has_more ? (existingBlocks.next_cursor ?? undefined) : undefined;
  } while (listCursor);

  // 2. Écrire les nouveaux blocs EN PREMIER (les données sont sûres dès ici)
  const chunks: string[] = [];
  for (let i = 0; i < jsonString.length; i += NOTION_BLOCK_CHAR_LIMIT) {
    chunks.push(jsonString.slice(i, i + NOTION_BLOCK_CHAR_LIMIT));
  }
  if (chunks.length === 0) chunks.push("[]");

  const batchSize = 100;
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    await notion.blocks.children.append({
      block_id: pageId,
      children: batch.map((chunk) => ({
        object: "block" as const,
        type: "paragraph" as const,
        paragraph: {
          rich_text: [{ type: "text" as const, text: { content: chunk } }],
        },
      })),
    });
  }

  // 3. Supprimer les anciens blocs (après que les nouveaux sont écrits)
  for (const blockId of oldBlockIds) {
    try {
      await notion.blocks.delete({ block_id: blockId });
    } catch {
      // Ignorer les erreurs de suppression individuelle
    }
  }
}

/**
 * Read JSON data from the content blocks of a Notion page.
 * Concatenates all paragraph block text content and parses as JSON.
 *
 * ⚠️  Cette fonction PROPAGE les erreurs API Notion (timeout, rate-limit,
 * network failure). Elle ne retourne [] que si la page est réellement vide
 * ou si le contenu n'est pas un JSON valide.
 *
 * Les appelants qui font ensuite un WRITE doivent attraper ces erreurs et
 * avorter l'écriture — sinon un [] de "lecture échouée" remplacerait un
 * tableau valide de N entrées (perte de données catastrophique).
 */
async function readFromNotion<T>(key: string): Promise<T[]> {
  // ── Erreurs API → propagées (pas swallowées) ────────────────────────────
  // Si getOrCreateBackupPageId ou notion.blocks.children.list jettent, on
  // laisse l'exception remonter jusqu'à l'appelant.
  const pageId = await getOrCreateBackupPageId(key);

  let allText = "";
  let cursor: string | undefined;

  do {
    const response = await notion.blocks.children.list({
      block_id: pageId,
      page_size: 100,
      start_cursor: cursor,
    });

    for (const block of response.results) {
      const b = block as Record<string, any>;
      if (b.type === "paragraph" && b.paragraph?.rich_text) {
        for (const rt of b.paragraph.rich_text) {
          allText += rt.plain_text || "";
        }
      }
    }

    cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
  } while (cursor);

  if (!allText || allText.trim() === "") return [];

  // ── Parse JSON ──────────────────────────────────────────────────────────
  try {
    return JSON.parse(allText);
  } catch {
    // La page peut contenir ancienne + nouvelle version (ex: "[...][...]") si
    // un write a été interrompu avant la suppression des anciens blocs.
    // On extrait le DERNIER tableau de PREMIER NIVEAU (équilibrage des crochets
    // depuis la fin) — l'ancien lastIndexOf("[") tombait sur un crochet IMBRIQUÉ
    // (photoUrls, types…) et renvoyait un fragment corrompu.
    const end = allText.lastIndexOf("]");
    if (end !== -1) {
      let depth = 0;
      for (let i = end; i >= 0; i--) {
        const c = allText[i];
        if (c === "]") depth++;
        else if (c === "[") {
          depth--;
          if (depth === 0) {
            try { return JSON.parse(allText.slice(i, end + 1)); } catch {}
            break;
          }
        }
      }
    }
    console.error(`[kv-store] Could not parse content for "${key}", returning []`);
    return []; // Erreur de parse (pas réseau) → [] acceptable
  }
}

/**
 * Variante sécurisée pour les lectures de GET (erreur → [] plutôt que throw).
 * NE PAS utiliser avant un write — utiliser readFromNotion directement
 * pour que les erreurs API soient propagées.
 */
async function readFromNotionSafe<T>(key: string): Promise<T[]> {
  try {
    return await readFromNotion<T>(key);
  } catch (err) {
    console.error(`[kv-store] Notion read failed for "${key}" (safe mode):`, err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Public API  –  Notion is the PRIMARY source of truth
// ---------------------------------------------------------------------------

/**
 * Read data for a given key.
 *
 * 1. Return from in-memory cache if fresh.
 * 2. Otherwise fetch from Notion (the primary store).
 * 3. Populate the in-memory cache for the next fast read.
 */
export async function getData<T>(key: string): Promise<T[]> {
  // 1. In-memory cache (fast, survives within the same process)
  const cached = getCached<T>(key);
  if (cached !== null) return cached;

  // 2. Primary store: Notion (mode safe → erreur réseau → [] sans throw)
  console.log(`[kv-store] Cache miss for "${key}", fetching from Notion...`);
  const data = await readFromNotionSafe<T>(key);

  // 3. Populate cache
  if (data.length > 0) {
    setCache(key, data);
  }

  return data;
}

/**
 * Read data for a given key — ALWAYS from Notion, bypassing the in-memory cache.
 *
 * À utiliser dans les handlers POST/PATCH pour éviter les problèmes de cache
 * stale entre plusieurs instances Vercel simultanées.
 *
 * ⚠️  THROWS si Notion répond avec une erreur réseau ou API (timeout, 429, etc.).
 * L'appelant DOIT attraper l'erreur et retourner 503 plutôt que d'écrire
 * un tableau vide dans Notion (ce qui effacerait toutes les données existantes).
 */
export async function getDataFresh<T>(key: string): Promise<T[]> {
  // readFromNotion propage les erreurs API — l'appelant doit les attraper
  console.log(`[kv-store] Fresh read for "${key}" from Notion...`);
  const data = await readFromNotion<T>(key);

  // Mettre à jour le cache de cette instance avec les données fraîches
  if (data.length > 0) {
    setCache(key, data);
  }

  return data;
}

/**
 * Write data for a given key.
 *
 * 1. Update the in-memory cache immediately.
 * 2. Write to Notion (the primary store) – awaited to ensure persistence.
 */
export async function setData<T>(key: string, data: T[]): Promise<void> {
  // 1. Update in-memory cache immediately
  setCache(key, data);

  // 2. Write to Notion (primary store) – sérialisé par clé pour éviter que deux
  //    écritures concurrentes ne corrompent la page (mélange ancien/nouveau).
  const compactJson = JSON.stringify(data);
  const previous = writeLocks.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(() => writeToNotion(key, compactJson));
  writeLocks.set(key, next);
  next.finally(() => { if (writeLocks.get(key) === next) writeLocks.delete(key); });
  try {
    await next;
  } catch (err) {
    console.error(`[kv-store] Notion write failed for "${key}":`, err);
    throw err; // Re-throw so callers know the write didn't persist
  }
}

// ---------------------------------------------------------------------------
// Gros volumes : stockage COMPRESSÉ, dans un bloc conteneur
// ---------------------------------------------------------------------------
//
// Le stockage normal écrit le JSON brut par tranches de 2 000 caractères, un
// bloc Notion par tranche, et supprime les anciens blocs UN PAR UN. Pour les
// listes de projets, ça faisait 16 000 blocs à écrire puis 16 000 appels à
// supprimer : à la cadence tolérée par Notion (~3 requêtes/s), plus d'une
// heure et demie. La tâche nocturne, limitée à 5 minutes, n'en a plus jamais
// vu le bout depuis le 21 juin — et comme l'horodatage s'écrit en dernier, le
// snapshot est resté figé à cette date.
//
// Ici on fait deux choses :
//   • gzip + base64 → ~15 fois moins de blocs ;
//   • toutes les tranches sous UN SEUL bloc conteneur → supprimer la version
//     précédente coûte UN appel au lieu de quelques milliers.
//
// Réservé aux clés qui se réécrivent en entier (le snapshot). Les données
// vivantes — défauts, pièces, préférences — gardent le chemin éprouvé.


const MARQUEUR_GZ = "gz:";
const ETIQUETTE_CONTENEUR = "données";

/** Écrit une liste entière dans la page d'une clé, compressée. */
export async function setBlob<T>(key: string, data: T[]): Promise<void> {
  const pageId = await getOrCreateBackupPageId(key);
  const charge = MARQUEUR_GZ + gzipSync(Buffer.from(JSON.stringify(data), "utf8")).toString("base64");

  // Les blocs déjà en place, mémorisés AVANT d'écrire (on ne supprime qu'après).
  const anciens: string[] = [];
  let curseur: string | undefined;
  do {
    const r = await notion.blocks.children.list({ block_id: pageId, page_size: 100, start_cursor: curseur });
    for (const b of r.results) anciens.push(b.id);
    curseur = r.has_more ? (r.next_cursor ?? undefined) : undefined;
  } while (curseur);

  // Nouveau conteneur, puis ses tranches.
  const creation = (await notion.blocks.children.append({
    block_id: pageId,
    children: [{
      object: "block",
      type: "toggle",
      toggle: { rich_text: [{ type: "text", text: { content: ETIQUETTE_CONTENEUR } }] },
    }],
  })) as unknown as { results: { id: string }[] };
  const conteneur = creation.results[0].id;

  const tranches: string[] = [];
  for (let i = 0; i < charge.length; i += NOTION_BLOCK_CHAR_LIMIT) {
    tranches.push(charge.slice(i, i + NOTION_BLOCK_CHAR_LIMIT));
  }
  for (let i = 0; i < tranches.length; i += 100) {
    await notion.blocks.children.append({
      block_id: conteneur,
      children: tranches.slice(i, i + 100).map((t) => ({
        object: "block" as const,
        type: "paragraph" as const,
        paragraph: { rich_text: [{ type: "text" as const, text: { content: t } }] },
      })),
    });
  }

  // Les données sont en place : l'ancienne version peut partir (1 appel par
  // conteneur, et non un par tranche).
  for (const id of anciens) {
    try { await notion.blocks.delete({ block_id: id }); } catch { /* sans conséquence */ }
  }
  setCache(key, data);
}

/** Relit une liste écrite par {@link setBlob}. */
export async function getBlob<T>(key: string): Promise<T[]> {
  const cache = getCached<T>(key);
  if (cache !== null) return cache;

  const pageId = await getOrCreateBackupPageId(key);
  let texte = "";
  let curseur: string | undefined;
  do {
    const r = await notion.blocks.children.list({ block_id: pageId, page_size: 100, start_cursor: curseur });
    for (const bloc of r.results) {
      const b = bloc as Record<string, any>;
      if (b.type === "toggle") texte += await lireTranches(b.id);
      else if (b.type === "paragraph") {
        for (const rt of b.paragraph?.rich_text || []) texte += rt.plain_text || "";
      }
    }
    curseur = r.has_more ? (r.next_cursor ?? undefined) : undefined;
  } while (curseur);

  texte = texte.trim();
  if (!texte) return [];
  const debut = texte.lastIndexOf(MARQUEUR_GZ);
  if (debut === -1) return [];
  try {
    const json = gunzipSync(Buffer.from(texte.slice(debut + MARQUEUR_GZ.length), "base64")).toString("utf8");
    const liste = JSON.parse(json);
    const data = Array.isArray(liste) ? (liste as T[]) : [];
    setCache(key, data);
    return data;
  } catch (err) {
    console.error(`[kv-store] blob illisible pour "${key}" :`, err);
    return [];
  }
}

/** Texte des tranches d'un conteneur. */
async function lireTranches(conteneurId: string): Promise<string> {
  let texte = "";
  let curseur: string | undefined;
  do {
    const r = await notion.blocks.children.list({ block_id: conteneurId, page_size: 100, start_cursor: curseur });
    for (const bloc of r.results) {
      const b = bloc as Record<string, any>;
      if (b.type === "paragraph") {
        for (const rt of b.paragraph?.rich_text || []) texte += rt.plain_text || "";
      }
    }
    curseur = r.has_more ? (r.next_cursor ?? undefined) : undefined;
  } while (curseur);
  return texte;
}
