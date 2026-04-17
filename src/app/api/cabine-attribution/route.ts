import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getData, setData } from "@/lib/kv-store";

interface CabineAttribution {
  projectId: string;
  attribution: string[]; // index = cabin number - 1, value = monteur name
  updatedAt: number;
}

const KEY = "cabine-attributions";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const projectId = request.nextUrl.searchParams.get("projectId");
  const all = await getData<CabineAttribution>(KEY);
  if (projectId) {
    const found = all.find((a) => a.projectId === projectId);
    return NextResponse.json(found || null);
  }
  return NextResponse.json(all);
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { projectId, attribution } = await request.json();
  if (!projectId || !Array.isArray(attribution)) {
    return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });
  }

  const all = await getData<CabineAttribution>(KEY);
  const idx = all.findIndex((a) => a.projectId === projectId);
  const entry: CabineAttribution = { projectId, attribution, updatedAt: Date.now() };
  if (idx >= 0) all[idx] = entry; else all.push(entry);
  await setData(KEY, all);

  return NextResponse.json({ success: true });
}
