import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { bexioConfigure, urlAutorisation, peutVoirBexio } from "@/lib/bexio";
import { randomBytes } from "node:crypto";

export const dynamic = "force-dynamic";

/**
 * Départ du consentement bexio — administrateur seulement.
 *
 * Le `state` est tiré au hasard et déposé dans un cookie : au retour, on
 * vérifie qu'il correspond. Sans lui, n'importe qui pourrait nous faire
 * enregistrer SON compte bexio en nous envoyant un lien de retour fabriqué.
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  const user = token ? await verifyToken(token) : null;
  if (!user || user.role !== "admin" || !(await peutVoirBexio(user))) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }
  if (!bexioConfigure()) {
    return NextResponse.json(
      { error: "BEXIO_CLIENT_ID / BEXIO_CLIENT_SECRET absents des variables d'environnement" },
      { status: 503 },
    );
  }
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(urlAutorisation(request.nextUrl.origin, state));
  res.cookies.set("bexio-state", state, {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600,
  });
  return res;
}
