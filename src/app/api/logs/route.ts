import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

export interface LogEntry {
  id: string;
  timestamp: number;
  user: string;
  projectId: string;
  projectName: string;
  action: string;
  details: string;
}

const DATA_DIR = join(process.cwd(), "data");
const LOGS_FILE = join(DATA_DIR, "logs.json");

function loadLogs(): LogEntry[] {
  if (!existsSync(LOGS_FILE)) return [];
  try { return JSON.parse(readFileSync(LOGS_FILE, "utf-8")); } catch { return []; }
}

function saveLogs(logs: LogEntry[]) {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(LOGS_FILE, JSON.stringify(logs, null, 2));
  } catch {
    console.warn("Cannot write logs file (serverless)");
  }
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const logs = loadLogs();
  return NextResponse.json(logs);
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const body = await request.json();
  const logs = loadLogs();
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
  saveLogs(logs.slice(0, 500));
  return NextResponse.json({ success: true });
}
