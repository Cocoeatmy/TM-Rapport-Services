import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

interface DefautRequest {
  id: string;
  projectId: string;
  projectName: string;
  user: string;
  types: string[];
  typesLabel: string;
  description: string;
  photoUrls: string[];
  status: "signale" | "en-cours" | "resolu";
  timestamp: number;
}

const DATA_DIR = join(process.cwd(), "data");
const DEFAUTS_FILE = join(DATA_DIR, "defauts.json");

function loadDefauts(): DefautRequest[] {
  if (!existsSync(DEFAUTS_FILE)) return [];
  try { return JSON.parse(readFileSync(DEFAUTS_FILE, "utf-8")); } catch { return []; }
}

function saveDefauts(defauts: DefautRequest[]) {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(DEFAUTS_FILE, JSON.stringify(defauts, null, 2));
  } catch {
    console.warn("Cannot write defauts file (serverless)");
  }
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const projectId = request.nextUrl.searchParams.get("projectId");
  const defauts = loadDefauts();
  return NextResponse.json(projectId ? defauts.filter((d) => d.projectId === projectId) : defauts);
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const body = await request.json();
  const defauts = loadDefauts();
  defauts.push({
    id: Math.random().toString(36).slice(2),
    ...body,
    user: user.name,
    status: "signale",
    timestamp: Date.now(),
  });
  saveDefauts(defauts);
  return NextResponse.json({ success: true });
}

export async function PATCH(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { id, status } = await request.json();
  const defauts = loadDefauts();
  const idx = defauts.findIndex((d) => d.id === id);
  if (idx === -1) return NextResponse.json({ error: "Non trouvé" }, { status: 404 });
  defauts[idx].status = status;
  saveDefauts(defauts);
  return NextResponse.json({ success: true });
}
