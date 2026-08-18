import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getData, setData } from "@/lib/kv-store";
import { redisEnabled, redisLPush, redisLTrim, redisLRange } from "@/lib/redis-cache";

export interface LogEntry {
  id: string;
  timestamp: number;
  user: string;
  projectId: string;
  projectName: string;
  action: string;
  details: string;
}

const KEY = "logs";
// Journal en LISTE Redis : append O(1), pas de réécriture de gros blob (le KV
// Notion réécrivait TOUT à chaque log → coûteux, d'où l'ancien plafond de 500
// partagé qui évinçait l'historique en ~1 jour). On garde beaucoup plus.
const REDIS_KEY = "logs";
const REDIS_MAX = 20000;

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const projectId = request.nextUrl.searchParams.get("projectId");

  // Fusion : Redis (nouveaux logs, forte rétention) + KV (legacy, avant migration).
  // Dédup par id, tri décroissant. Le KV reste lisible sans jamais être réécrit.
  const out: LogEntry[] = [];
  const seen = new Set<string>();
  const push = (l: LogEntry) => {
    if (!l || !l.id || seen.has(l.id)) return;
    if (projectId && l.projectId !== projectId) return;
    seen.add(l.id);
    out.push(l);
  };

  if (redisEnabled) {
    const raw = await redisLRange(REDIS_KEY, 0, -1);
    for (const s of raw) {
      try { push(JSON.parse(s) as LogEntry); } catch {}
    }
  }
  try {
    const kv = await getData<LogEntry>(KEY);
    for (const l of kv) push(l);
  } catch {}

  out.sort((a, b) => b.timestamp - a.timestamp);
  return NextResponse.json(out);
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const body = await request.json();
  const entry: LogEntry = {
    id: Math.random().toString(36).slice(2),
    timestamp: Date.now(),
    user: user.name,
    projectId: body.projectId || "",
    projectName: body.projectName || "",
    action: body.action || "",
    details: body.details || "",
  };

  if (redisEnabled) {
    // Append efficace + plafond élevé. Aucune réécriture de blob.
    await redisLPush(REDIS_KEY, JSON.stringify(entry));
    await redisLTrim(REDIS_KEY, 0, REDIS_MAX - 1);
  } else {
    // Repli KV (dev local sans Redis) : ancien comportement, plafond 500.
    const logs = await getData<LogEntry>(KEY);
    logs.unshift(entry);
    await setData(KEY, logs.slice(0, 500));
  }
  return NextResponse.json({ success: true });
}
