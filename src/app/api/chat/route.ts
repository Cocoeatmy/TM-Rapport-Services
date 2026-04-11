import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getData, setData } from "@/lib/kv-store";

interface ChatMessage {
  id: string;
  projectId: string;
  user: string;
  email: string;
  message: string;
  timestamp: number;
}

/** Each project's messages are stored under a separate kv key. */
function chatKey(projectId: string) {
  return `chat-${projectId}`;
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorise" }, { status: 401 });

  const projectId = request.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId requis" }, { status: 400 });

  const messages = await getData<ChatMessage>(chatKey(projectId));
  return NextResponse.json(messages);
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorise" }, { status: 401 });

  const user = await verifyToken(token);
  if (!user) return NextResponse.json({ error: "Non autorise" }, { status: 401 });

  const { projectId, message } = await request.json();
  if (!projectId || !message) return NextResponse.json({ error: "Champs requis" }, { status: 400 });

  const messages = await getData<ChatMessage>(chatKey(projectId));
  messages.push({
    id: Math.random().toString(36).slice(2),
    projectId,
    user: user.name,
    email: user.email,
    message,
    timestamp: Date.now(),
  });
  await setData(chatKey(projectId), messages);

  return NextResponse.json({ success: true });
}
