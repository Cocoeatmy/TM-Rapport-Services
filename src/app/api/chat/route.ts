import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

interface ChatMessage {
  id: string;
  projectId: string;
  user: string;
  email: string;
  message: string;
  timestamp: number;
}

const CHAT_DIR = join(process.cwd(), "data", "chats");

function getChatFile(projectId: string) {
  if (!existsSync(CHAT_DIR)) mkdirSync(CHAT_DIR, { recursive: true });
  return join(CHAT_DIR, `${projectId}.json`);
}

function loadMessages(projectId: string): ChatMessage[] {
  const file = getChatFile(projectId);
  if (!existsSync(file)) return [];
  try {
    return JSON.parse(readFileSync(file, "utf-8"));
  } catch {
    return [];
  }
}

function saveMessages(projectId: string, messages: ChatMessage[]) {
  writeFileSync(getChatFile(projectId), JSON.stringify(messages, null, 2));
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const projectId = request.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId requis" }, { status: 400 });

  return NextResponse.json(loadMessages(projectId));
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const user = await verifyToken(token);
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { projectId, message } = await request.json();
  if (!projectId || !message) return NextResponse.json({ error: "Champs requis" }, { status: 400 });

  const messages = loadMessages(projectId);
  messages.push({
    id: Math.random().toString(36).slice(2),
    projectId,
    user: user.name,
    email: user.email,
    message,
    timestamp: Date.now(),
  });
  saveMessages(projectId, messages);

  return NextResponse.json({ success: true });
}
