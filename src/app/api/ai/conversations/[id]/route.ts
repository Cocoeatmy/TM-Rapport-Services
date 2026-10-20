/** Une de mes conversations avec l'assistant. La clé porte l'e-mail : impossible de lire celle d'un autre. */
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { lireConversation } from "@/lib/conversations-ia";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = request.cookies.get("auth-token")?.value;
  const user = token ? await verifyToken(token) : null;
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const { id } = await params;
  const conversation = await lireConversation(user.email, id);
  if (!conversation) return NextResponse.json({ error: "Conversation introuvable" }, { status: 404 });
  return NextResponse.json({ conversation }, { headers: { "Cache-Control": "private, no-store" } });
}
