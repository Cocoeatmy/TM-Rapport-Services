import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

interface PieceRequest {
  id: string;
  projectId: string;
  projectName: string;
  user: string;
  description: string;
  reference: string;
  photoUrl: string;
  status: "demande" | "commande" | "recu";
  timestamp: number;
}

const DATA_DIR = join(process.cwd(), "data");
const PIECES_FILE = join(DATA_DIR, "pieces.json");

function loadPieces(): PieceRequest[] {
  if (!existsSync(PIECES_FILE)) return [];
  try { return JSON.parse(readFileSync(PIECES_FILE, "utf-8")); } catch { return []; }
}
function savePieces(pieces: PieceRequest[]) {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(PIECES_FILE, JSON.stringify(pieces, null, 2));
  } catch {
    console.warn("Cannot write pieces file (serverless)");
  }
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const projectId = request.nextUrl.searchParams.get("projectId");
  const pieces = loadPieces();
  return NextResponse.json(projectId ? pieces.filter((p) => p.projectId === projectId) : pieces);
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const body = await request.json();
  const pieces = loadPieces();
  pieces.push({
    id: Math.random().toString(36).slice(2),
    ...body,
    user: user.name,
    status: "demande",
    timestamp: Date.now(),
  });
  savePieces(pieces);
  return NextResponse.json({ success: true });
}

export async function PATCH(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { id, status } = await request.json();
  const pieces = loadPieces();
  const idx = pieces.findIndex((p) => p.id === id);
  if (idx === -1) return NextResponse.json({ error: "Non trouvé" }, { status: 404 });
  pieces[idx].status = status;
  savePieces(pieces);
  return NextResponse.json({ success: true });
}
