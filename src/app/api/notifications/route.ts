import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getData, setData } from "@/lib/kv-store";

export interface AppNotification {
  id: string;
  userId: string; // email
  type: "chat" | "piece" | "rdv" | "sav";
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
}

const KEY = "notifications";

/** Create a notification directly (for server-side use without HTTP). */
export async function createNotification(
  userId: string,
  type: AppNotification["type"],
  title: string,
  message: string,
): Promise<AppNotification> {
  const all = await getData<AppNotification>(KEY);
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

  await setData(KEY, pruned);
  return notif;
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorise" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user) return NextResponse.json({ error: "Non autorise" }, { status: 401 });

  const all = await getData<AppNotification>(KEY);
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

  const notif = await createNotification(userId, type, title, message || "");
  return NextResponse.json(notif);
}

export async function PATCH(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorise" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user) return NextResponse.json({ error: "Non autorise" }, { status: 401 });

  const { id, markAllRead } = await request.json();
  const all = await getData<AppNotification>(KEY);

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

  await setData(KEY, all);
  return NextResponse.json({ success: true });
}
