import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getData, setData } from "@/lib/kv-store";

interface PieceComment {
  user: string;
  message: string;
  timestamp: number;
}

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
  comments: PieceComment[];
}

const KEY = "pieces";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const projectId = request.nextUrl.searchParams.get("projectId");
  const pieces = await getData<PieceRequest>(KEY);
  return NextResponse.json(projectId ? pieces.filter((p) => p.projectId === projectId) : pieces);
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const body = await request.json();
  const pieces = await getData<PieceRequest>(KEY);
  pieces.push({
    id: Math.random().toString(36).slice(2),
    ...body,
    user: user.name,
    status: "demande",
    timestamp: Date.now(),
    comments: [],
  });
  await setData(KEY, pieces);
  return NextResponse.json({ success: true });
}

export async function PATCH(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const body = await request.json();
  const { id, status, comment } = body;
  const pieces = await getData<PieceRequest>(KEY);
  const idx = pieces.findIndex((p) => p.id === id);
  if (idx === -1) return NextResponse.json({ error: "Non trouvé" }, { status: 404 });

  if (comment) {
    if (!pieces[idx].comments) pieces[idx].comments = [];
    pieces[idx].comments.push({
      user: user.name,
      message: comment,
      timestamp: Date.now(),
    });
  }

  if (status) {
    pieces[idx].status = status;
  }

  await setData(KEY, pieces);
  return NextResponse.json({ success: true });
}
