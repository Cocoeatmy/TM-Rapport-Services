import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getData, setData } from "@/lib/kv-store";

const KEY = "force-sync-signal";

export async function GET() {
  try {
    const data = await getData<{ requestedAt: number }>(KEY);
    if (data && data.length > 0) {
      return NextResponse.json(data[0]);
    }
    return NextResponse.json({ requestedAt: 0 });
  } catch {
    return NextResponse.json({ requestedAt: 0 });
  }
}

export async function POST(request: NextRequest) {
  // Vérification admin
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  }
  const signal = { requestedAt: Date.now() };
  await setData(KEY, [signal]);
  return NextResponse.json({ ok: true, ...signal });
}
