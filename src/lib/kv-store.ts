import { notion, databaseId } from "./notion";

// ---------------------------------------------------------------------------
// In-memory cache  (survives across requests in the same serverless process)
// ---------------------------------------------------------------------------

interface CacheEntry<T = unknown> {
  data: T[];
  expiry: number;
}

const memoryCache = new Map<string, CacheEntry>();
const CACHE_TTL = 60_000; // 1 minute

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
async function getOrCreateBackupPageId(key: string): Promise<string> {
  if (pageIdCache[key]) return pageIdCache[key];

  const title = `[DATA] ${key}`;

  try {
    // Search for existing child page under storage parent
    const children = await notion.blocks.children.list({
      block_id: STORAGE_PAGE_ID,
      page_size: 100,
    });

    for (const block of children.results) {
      const b = block as any;
      if (b.type === "child_page" && b.child_page?.title === title) {
        pageIdCache[key] = b.id;
        return pageIdCache[key];
      }
    }

    // Create the page as a child of the storage page
    const page = await notion.pages.create({
      parent: { page_id: STORAGE_PAGE_ID },
      properties: {
        title: {
          title: [{ text: { content: title } }],
        },
      },
    });

    pageIdCache[key] = page.id;
    return pageIdCache[key];
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

  // 1. Mémoriser les IDs des blocs actuels AVANT d'écrire quoi que ce soit
  const existingBlocks = await notion.blocks.children.list({
    block_id: pageId,
    page_size: 100,
  });
  const oldBlockIds = existingBlocks.results.map((b) => b.id);

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
    // La page peut contenir ancienne + nouvelle version en cas d'interruption
    // pendant la suppression des anciens blocs (write-first strategy).
    // On cherche le DERNIER tableau JSON valide dans le texte.
    const lastBracket = allText.lastIndexOf("[");
    if (lastBracket !== -1) {
      try {
        return JSON.parse(allText.slice(lastBracket));
      } catch {}
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

  // 2. Write to Notion (primary store) – use compact JSON to minimize blocks
  const compactJson = JSON.stringify(data);
  try {
    await writeToNotion(key, compactJson);
  } catch (err) {
    console.error(`[kv-store] Notion write failed for "${key}":`, err);
    // Re-throw so callers know the write didn't persist
    throw err;
  }
}
