import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { notion } from "@/lib/notion";

const STORAGE_PAGE_ID = "3431895b9179804eb9bfc51868936cf2";

export const dynamic = "force-dynamic";

// Simple in-memory cache with Notion page backup
// The key insight: store activities as a JSON string in a dedicated Notion page's title
const BACKUP_PAGE_TITLE = "[DATA] user-activity";

interface UserActivity {
  email: string;
  name: string;
  lastSeen: string;
}

// In-memory store
let activities: UserActivity[] = [];
let lastLoadTime = 0;
const CACHE_TTL = 30_000; // 30 seconds

async function findBackupPage(): Promise<string | null> {
  try {
    const children = await notion.blocks.children.list({
      block_id: STORAGE_PAGE_ID,
      page_size: 100,
    });
    for (const block of children.results) {
      const b = block as any;
      if (b.type === "child_page" && b.child_page?.title === BACKUP_PAGE_TITLE) {
        return b.id;
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function loadActivities(): Promise<UserActivity[]> {
  // Return cache if fresh
  if (activities.length > 0 && Date.now() - lastLoadTime < CACHE_TTL) {
    return activities;
  }

  try {
    const pageId = await findBackupPage();
    if (!pageId) return activities;

    // Read blocks from the page
    const res = await notion.blocks.children.list({ block_id: pageId, page_size: 100 });
    let text = "";
    for (const block of res.results) {
      const b = block as any;
      if (b.type === "paragraph" && b.paragraph?.rich_text) {
        for (const rt of b.paragraph.rich_text) {
          text += rt.plain_text || "";
        }
      }
    }

    if (text.trim()) {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        activities = parsed;
        lastLoadTime = Date.now();
      }
    }
  } catch (err) {
    console.error("[user-activity] Load error:", err);
  }

  return activities;
}

async function saveActivities(data: UserActivity[]): Promise<void> {
  activities = data;
  lastLoadTime = Date.now();

  try {
    let pageId = await findBackupPage();

    if (!pageId) {
      // Create the backup page
      const page = await notion.pages.create({
        parent: { page_id: STORAGE_PAGE_ID },
        properties: {
          title: { title: [{ text: { content: BACKUP_PAGE_TITLE } }] },
        },
      });
      pageId = page.id;
    }

    // Clear existing blocks
    const existing = await notion.blocks.children.list({ block_id: pageId, page_size: 100 });
    for (const block of existing.results) {
      try { await notion.blocks.delete({ block_id: block.id }); } catch {}
    }

    // Write JSON as paragraph blocks (max 2000 chars per rich_text)
    const json = JSON.stringify(data);
    const chunks: string[] = [];
    for (let i = 0; i < json.length; i += 1900) {
      chunks.push(json.slice(i, i + 1900));
    }

    await notion.blocks.children.append({
      block_id: pageId,
      children: [{
        object: "block" as const,
        type: "paragraph" as const,
        paragraph: {
          rich_text: chunks.map((chunk) => ({
            type: "text" as const,
            text: { content: chunk },
          })),
        },
      }],
    });
  } catch (err) {
    console.error("[user-activity] Save error:", err);
  }
}

// POST: record user activity
export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("auth-token")?.value;
    if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    const user = await verifyToken(token);
    if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

    const current = await loadActivities();
    const entry: UserActivity = {
      email: user.email,
      name: user.name,
      lastSeen: new Date().toISOString(),
    };

    const idx = current.findIndex((a) => a.email === user.email);
    if (idx >= 0) {
      current[idx] = entry;
    } else {
      current.push(entry);
    }

    await saveActivities(current);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[user-activity] POST error:", error);
    return NextResponse.json({ success: true });
  }
}

// GET: get all user activities (admin only)
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("auth-token")?.value;
    if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    const user = await verifyToken(token);
    if (!user || user.role !== "admin") return NextResponse.json({ error: "Non autorisé" }, { status: 403 });

    const data = await loadActivities();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("[user-activity] GET error:", error);
    return NextResponse.json([]);
  }
}
