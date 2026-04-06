import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { notion, databaseId } from "./notion";

const DATA_DIR = join(process.cwd(), "data");

// In-memory cache of Notion page IDs for each data key
const pageIdCache: Record<string, string> = {};

// Notion has a 2000 character limit per rich_text block
const NOTION_BLOCK_CHAR_LIMIT = 2000;

/**
 * Find or create a Notion page that stores backup data for a given key.
 * Pages are identified by a title prefix "[DATA] <key>".
 */
async function getOrCreateBackupPageId(key: string): Promise<string> {
  if (pageIdCache[key]) return pageIdCache[key];

  const title = `[DATA] ${key}`;

  try {
    // Search for existing backup page in the database
    const response = await notion.databases.query({
      database_id: databaseId,
      filter: {
        property: "Projet",
        title: { equals: title },
      },
      page_size: 1,
    });

    if (response.results.length > 0) {
      pageIdCache[key] = response.results[0].id;
      return pageIdCache[key];
    }

    // Create the page if it doesn't exist
    const page = await notion.pages.create({
      parent: { database_id: databaseId },
      properties: {
        Projet: {
          title: [{ text: { content: title } }],
        },
      },
    });

    pageIdCache[key] = page.id;
    return pageIdCache[key];
  } catch (err) {
    console.error(`[kv-store] Failed to get/create backup page for "${key}":`, err);
    throw err;
  }
}

/**
 * Write JSON data into the content blocks of a Notion page.
 * Clears existing blocks first, then writes the JSON string chunked into
 * paragraph blocks (each <= 2000 chars).
 */
async function writeToNotion(key: string, jsonString: string): Promise<void> {
  try {
    const pageId = await getOrCreateBackupPageId(key);

    // Delete all existing child blocks
    const existingBlocks = await notion.blocks.children.list({
      block_id: pageId,
      page_size: 100,
    });

    for (const block of existingBlocks.results) {
      try {
        await notion.blocks.delete({ block_id: block.id });
      } catch {
        // Ignore delete errors for individual blocks
      }
    }

    // Chunk the JSON string and create paragraph blocks
    const chunks: string[] = [];
    for (let i = 0; i < jsonString.length; i += NOTION_BLOCK_CHAR_LIMIT) {
      chunks.push(jsonString.slice(i, i + NOTION_BLOCK_CHAR_LIMIT));
    }

    // If data is empty, write a single block with "[]"
    if (chunks.length === 0) {
      chunks.push("[]");
    }

    // Notion API allows appending up to 100 blocks at a time
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
  } catch (err) {
    console.error(`[kv-store] Failed to write to Notion for "${key}":`, err);
  }
}

/**
 * Read JSON data from the content blocks of a Notion page.
 * Concatenates all paragraph block text content and parses as JSON.
 */
async function readFromNotion<T>(key: string): Promise<T[]> {
  try {
    const pageId = await getOrCreateBackupPageId(key);

    let allText = "";
    let cursor: string | undefined;

    // Paginate through all blocks
    do {
      const response = await notion.blocks.children.list({
        block_id: pageId,
        page_size: 100,
        start_cursor: cursor,
      });

      for (const block of response.results) {
        const b = block as any;
        if (b.type === "paragraph" && b.paragraph?.rich_text) {
          for (const rt of b.paragraph.rich_text) {
            allText += rt.plain_text || "";
          }
        }
      }

      cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
    } while (cursor);

    if (!allText || allText.trim() === "") return [];
    return JSON.parse(allText);
  } catch (err) {
    console.error(`[kv-store] Failed to read from Notion for "${key}":`, err);
    return [];
  }
}

/**
 * Read data for a given key.
 * Tries the local filesystem first; falls back to Notion backup.
 */
export async function getData<T>(key: string): Promise<T[]> {
  const filePath = join(DATA_DIR, `${key}.json`);

  // Try local file first
  if (existsSync(filePath)) {
    try {
      const content = readFileSync(filePath, "utf-8").trim();
      if (content) {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {
      // File exists but couldn't be parsed, fall through to Notion
    }
  }

  // Fallback: read from Notion
  console.log(`[kv-store] Local file missing/empty for "${key}", fetching from Notion...`);
  const data = await readFromNotion<T>(key);

  // Write back to local file for next fast read
  if (data.length > 0) {
    try {
      if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
      writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch {
      // Serverless may not allow writing
    }
  }

  return data;
}

/**
 * Write data for a given key.
 * Writes to local filesystem, then syncs to Notion in the background.
 */
export async function setData<T>(key: string, data: T[]): Promise<void> {
  const filePath = join(DATA_DIR, `${key}.json`);
  const jsonString = JSON.stringify(data, null, 2);

  // Write to local file (fast)
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(filePath, jsonString);
  } catch {
    console.warn(`[kv-store] Cannot write local file for "${key}" (serverless)`);
  }

  // Sync to Notion in the background (don't await)
  // Use compact JSON for Notion to minimize block count
  const compactJson = JSON.stringify(data);
  writeToNotion(key, compactJson).catch((err) => {
    console.error(`[kv-store] Background Notion sync failed for "${key}":`, err);
  });
}
