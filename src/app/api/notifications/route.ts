import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

export interface AppNotification {
  id: string;
  userId: string; // email
  type: "chat" | "piece" | "rdv" | "sav";
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
}

const DATA_DIR = join(process.cwd(), "data");
const NOTIF_FILE = join(DATA_DIR, "notifications.json");

function loadAllNotifications(): AppNotification[] {
  if (!existsSync(NOTIF_FILE)) return [];
  try { return JSON.parse(readFileSync(NOTIF_FILE, "utf-8")); } catch { return []; }
}

function saveAllNotifications(notifs: AppNotification[]) {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(NOTIF_FILE, JSON.stringify(notifs, null, 2));
  } catch {
    console.warn("Cannot write notifications file (serverless)");
  }
}

/** Create a notification directly (for server-side use without HTTP). */
export function createNotification(
  userId: string,
  type: AppNotification["type"],
  title: string,
  message: string,
): AppNotification {
  const all = loadAllNotifications();
  const notif: AppNotification = {
    id: Math.random().toString(36).slice(2) + Date.now().toString(36),
    userId,
    type,
    title,
    message,
    timestamp: Date.now(),
    read: false,
  };
  all.unshift(notif);

  // Keep last 100 per user
  const counts: Record<string, number> = {};
  const pruned = all.filter((n) => {
    counts[n.userId] = (counts[n.userId] || 0) + 1;
    return counts[n.userId] <= 100;
  });

  saveAllNotifications(pruned);
  return notif;
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorise" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user) return NextResponse.json({ error: "Non autorise" }, { status: 401 });

  const all = loadAllNotifications();
  const userNotifs = all.filter((n) => n.userId === user.email);
  return NextResponse.json(userNotifs);
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorise" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user) return NextResponse.json({ error: "Non autorise" }, { status: 401 });

  const { userId, type, title, message } = await request.json();
  if (!userId || !type || !title) {
    return NextResponse.json({ error: "Champs requis: userId, type, title" }, { status: 400 });
  }

  const notif = createNotification(userId, type, title, message || "");
  return NextResponse.json(notif);
}

export async function PATCH(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorise" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user) return NextResponse.json({ error: "Non autorise" }, { status: 401 });

  const { id, markAllRead } = await request.json();
  const all = loadAllNotifications();

  if (markAllRead) {
    for (const n of all) {
      if (n.userId === user.email) n.read = true;
    }
  } else if (id) {
    const notif = all.find((n) => n.id === id && n.userId === user.email);
    if (notif) notif.read = true;
  } else {
    return NextResponse.json({ error: "Fournir id ou markAllRead" }, { status: 400 });
  }

  saveAllNotifications(all);
  return NextResponse.json({ success: true });
}
