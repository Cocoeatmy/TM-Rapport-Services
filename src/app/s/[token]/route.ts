/**
 * /s/<token>  → redirige vers le Rapport de suivi du chantier (PDF) du projet.
 *
 * Lien COURT pour les notes des RDV du calendrier. `token` = base64url de l'id
 * Notion du projet (même jeton que /client/<token>). On calcule la signature
 * HMAC côté serveur et on redirige vers /api/synthese/<id>?s=<sig>.
 * Route publique (voir middleware.ts).
 */
import { NextRequest, NextResponse } from "next/server";
import { signSynthese } from "@/lib/doc-link";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let id = "";
  try { id = Buffer.from(token, "base64url").toString("utf8"); } catch {}
  if (!id) return new NextResponse("not found", { status: 404 });
  const url = `${req.nextUrl.origin}/api/synthese/${encodeURIComponent(id)}?s=${signSynthese(id)}`;
  return NextResponse.redirect(url, 302);
}
