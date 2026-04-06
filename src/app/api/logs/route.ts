import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getData, setData } from "@/lib/kv-store";

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

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const logs = await getData<LogEntry>(KEY);
  return NextResponse.json(logs);
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const body = await request.json();
  const logs = await getData<LogEntry>(KEY);
  logs.unshift({
    id: Math.random().toString(36).slice(2),
    timestamp: Date.now(),
    user: user.name,
    projectId: body.projectId || "",
    projectName: body.projectName || "",
    action: body.action || "",
    details: body.details || "",
  });
  // Garder les 500 derniers logs
  await setData(KEY, logs.slice(0, 500));
  return NextResponse.json({ success: true });
}
