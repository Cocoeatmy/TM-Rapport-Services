import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getData, setData } from "@/lib/kv-store";
import { redisEnabled, redisGetJSON, redisSetJSON } from "@/lib/redis-cache";

// Signal « force-sync » : l'admin demande à tous les clients de resynchroniser.
// Stocké dans REDIS (et non plus dans le KV Notion) : le KV créait une nouvelle
// page à chaque écriture non trouvée → 1134 pages en doublon accumulées, ce qui
// finissait par figer l'app. Redis est atomique, rapide, sans accumulation.
const KEY = "force-sync-signal";

export async function GET() {
  try {
    if (redisEnabled) {
      const v = await redisGetJSON<{ requestedAt: number }>(KEY);
      return NextResponse.json(v || { requestedAt: 0 });
    }
    const data = await getData<{ requestedAt: number }>(KEY);
    return NextResponse.json(data?.[0] || { requestedAt: 0 });
  } catch {
    return NextResponse.json({ requestedAt: 0 });
  }
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  }
  const signal = { requestedAt: Date.now() };
  if (redisEnabled) {
    await redisSetJSON(KEY, signal, 24 * 3600); // 24 h : tous les clients l'auront vu
  } else {
    await setData(KEY, [signal]);
  }
  return NextResponse.json({ ok: true, ...signal });
}
