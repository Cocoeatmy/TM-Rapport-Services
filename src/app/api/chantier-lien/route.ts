/**
 * /api/chantier-lien?sig=<signature d'adresse>
 *
 * Fabrique le lien de suivi PUBLIC d'un chantier. La signature HMAC ne peut
 * être calculée que par le serveur, qui seul détient la clé : le navigateur
 * demande donc le lien plutôt que de le composer.
 *
 * Route authentifiée — c'est le lien PRODUIT qui est public, pas sa création.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { signChantier } from "@/lib/doc-link";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  try { if (!(await verifyToken(token))) throw new Error(); }
  catch { return NextResponse.json({ error: "Non autorisé" }, { status: 401 }); }

  const sig = (req.nextUrl.searchParams.get("sig") || "").trim();
  if (!sig) return NextResponse.json({ error: "signature manquante" }, { status: 400 });

  const jeton = Buffer.from(sig, "utf8").toString("base64url");
  const url = `${req.nextUrl.origin}/ch/${jeton}?s=${signChantier(sig)}`;
  return NextResponse.json({ url });
}
