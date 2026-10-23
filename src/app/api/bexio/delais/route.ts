import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { peutVoirBexio } from "@/lib/bexio";
import { lireCopieBexio, lirePaiements } from "@/lib/bexio-donnees";
import { delaisParClient } from "@/lib/delais-paiement";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Délais de paiement par client (bexio) — propriétaire des accès bexio seul. */
export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  const user = token ? await verifyToken(token) : null;
  if (!user || user.role !== "admin" || !(await peutVoirBexio(user))) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }
  const [copie, paiements] = await Promise.all([lireCopieBexio(), lirePaiements()]);
  const payees = copie.factures.filter((f) => f.total > 0 && f.restant <= 0.009);
  return NextResponse.json({
    lignes: delaisParClient(copie.factures, paiements),
    couverture: { payees: payees.length, datees: payees.filter((f) => paiements[String(f.id)]).length },
    copieLe: copie.le,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
