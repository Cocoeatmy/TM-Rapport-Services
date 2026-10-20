/** Mes conversations avec l'assistant (les siennes seulement), les plus récentes d'abord. */
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { listerConversations } from "@/lib/conversations-ia";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  const user = token ? await verifyToken(token) : null;
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const conversations = await listerConversations(user.email);
  return NextResponse.json({ conversations }, { headers: { "Cache-Control": "private, no-store" } });
}
