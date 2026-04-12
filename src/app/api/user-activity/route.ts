import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

// In-memory store (survives between requests on same serverless instance)
// + backup to Notion via kv-store
const activityMap = new Map<string, { email: string; name: string; lastSeen: string }>();

// Also try to load from Notion on first GET
let loadedFromNotion = false;

async function loadFromNotion() {
  if (loadedFromNotion) return;
  loadedFromNotion = true;
  try {
    const { getData } = await import("@/lib/kv-store");
    const data = await getData<any>("user-activity");
    if (Array.isArray(data)) {
      data.forEach((a: any) => {
        if (a.email && a.lastSeen) {
          // Only set if we don't have a more recent entry
          const existing = activityMap.get(a.email);
          if (!existing || new Date(a.lastSeen) > new Date(existing.lastSeen)) {
            activityMap.set(a.email, a);
          }
        }
      });
    }
  } catch {}
}

// POST: record user activity (called on app open)
export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("auth-token")?.value;
    if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    const user = await verifyToken(token);
    if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

    const entry = {
      email: user.email,
      name: user.name,
      lastSeen: new Date().toISOString(),
    };

    // Save in memory (instant)
    activityMap.set(user.email, entry);

    // Backup to Notion in background (async, don't wait)
    import("@/lib/kv-store").then(({ setData }) => {
      const all = Array.from(activityMap.values());
      setData("user-activity", all as any).catch(() => {});
    }).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// GET: get all user activities (admin only)
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("auth-token")?.value;
    if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    const user = await verifyToken(token);
    if (!user || user.role !== "admin") return NextResponse.json({ error: "Non autorisé" }, { status: 403 });

    // Load from Notion if first time
    await loadFromNotion();

    const activities = Array.from(activityMap.values());
    return NextResponse.json(activities);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
