/**
 * /sig/<token>  → redirige vers le Rapport des signalements (PDF) du projet.
 *
 * Lien COURT pour les notes des RDV du calendrier. `token` = base64url de l'id
 * Notion du projet (même jeton que /client/<token>). Signature HMAC calculée
 * côté serveur → redirige vers /api/rapport-signalements/<id>?s=<sig>.
 * Route publique.
 */
import { NextRequest, NextResponse } from "next/server";
import { signSignalements } from "@/lib/doc-link";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let id = "";
  try { id = Buffer.from(token, "base64url").toString("utf8"); } catch {}
  if (!id) return new NextResponse("not found", { status: 404 });
  const url = `${req.nextUrl.origin}/api/rapport-signalements/${encodeURIComponent(id)}?s=${signSignalements(id)}`;
  return NextResponse.redirect(url, 302);
}
