/**
 * /sav/<token>  → redirige vers le Rapport SAV (PDF) du projet.
 *
 * Lien COURT pour les notes des RDV du calendrier. `token` = base64url de l'id
 * Notion du projet (même jeton que /client/<token>). Signature HMAC calculée
 * côté serveur → redirige vers /api/sav/<id>?s=<sig>. Route publique.
 */
import { NextRequest, NextResponse } from "next/server";
import { signSav } from "@/lib/doc-link";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let id = "";
  try { id = Buffer.from(token, "base64url").toString("utf8"); } catch {}
  if (!id) return new NextResponse("not found", { status: 404 });
  const url = `${req.nextUrl.origin}/api/sav/${encodeURIComponent(id)}?s=${signSav(id)}`;
  return NextResponse.redirect(url, 302);
}
