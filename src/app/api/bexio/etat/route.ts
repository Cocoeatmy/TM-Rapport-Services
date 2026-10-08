import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { bexioConfigure, lireJeton, jetonAcces, bexioFetch, SCOPES, oublierJeton, peutVoirBexio } from "@/lib/bexio";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Où en est la connexion bexio — administrateur seulement. */
export async function GET(request: NextRequest) {
  const user = await admin(request);
  if (!user) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const j = await lireJeton();
  if (!bexioConfigure()) {
    return NextResponse.json({ configure: false, connecte: false, demande: SCOPES });
  }
  if (!j?.refresh) {
    return NextResponse.json({ configure: true, connecte: false, demande: SCOPES });
  }
  // Un jeton rangé ne prouve rien : on vérifie qu'il ouvre encore la porte.
  try {
    await jetonAcces();
    const societe = await bexioFetch<{ company_name?: string; name?: string }>("/3.0/company_profile")
      .catch(() => null);
    return NextResponse.json({
      configure: true,
      connecte: true,
      societe: (Array.isArray(societe) ? societe[0]?.name : societe?.company_name || societe?.name) || null,
      scopes: j.scopes || "",
      par: j.par || null,
      le: j.le || null,
    });
  } catch (e) {
    return NextResponse.json({
      configure: true, connecte: false, erreur: (e as Error).message, par: j.par, le: j.le,
    });
  }
}

/** Couper la liaison : le jeton est oublié côté app. */
export async function DELETE(request: NextRequest) {
  const user = await admin(request);
  if (!user) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  await oublierJeton();
  return NextResponse.json({ success: true });
}

async function admin(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  const user = token ? await verifyToken(token) : null;
  if (!user || user.role !== "admin") return null;
  return (await peutVoirBexio(user)) ? user : null;
}
