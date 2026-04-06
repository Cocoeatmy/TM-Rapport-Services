import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getData, setData } from "@/lib/kv-store";

interface DefautComment {
  user: string;
  message: string;
  timestamp: number;
}

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
  comments: DefautComment[];
}

const KEY = "defauts";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const projectId = request.nextUrl.searchParams.get("projectId");
  const defauts = await getData<DefautRequest>(KEY);
  return NextResponse.json(projectId ? defauts.filter((d) => d.projectId === projectId) : defauts);
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const body = await request.json();
  const defauts = await getData<DefautRequest>(KEY);
  defauts.push({
    id: Math.random().toString(36).slice(2),
    ...body,
    user: user.name,
    status: "signale",
    timestamp: Date.now(),
    comments: [],
  });
  await setData(KEY, defauts);
  return NextResponse.json({ success: true });
}

export async function PATCH(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const body = await request.json();
  const { id, status, comment } = body;
  const defauts = await getData<DefautRequest>(KEY);
  const idx = defauts.findIndex((d) => d.id === id);
  if (idx === -1) return NextResponse.json({ error: "Non trouvé" }, { status: 404 });

  if (comment) {
    if (!defauts[idx].comments) defauts[idx].comments = [];
    defauts[idx].comments.push({
      user: user.name,
      message: comment,
      timestamp: Date.now(),
    });
  }

  if (status) {
    defauts[idx].status = status;
  }

  await setData(KEY, defauts);
  return NextResponse.json({ success: true });
}
