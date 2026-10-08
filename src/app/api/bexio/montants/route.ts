import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { peutVoirBexio } from "@/lib/bexio";
import { lireCopieBexio } from "@/lib/bexio-donnees";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Montant de chaque offre, par numéro TM — pour l'afficher à côté des
 * chantiers dans le tableau de bord.
 *
 * Une seule requête pour toute la table : l'alternative, interroger bexio
 * chantier par chantier, ferait une centaine d'appels pour afficher une
 * semaine. Trente kilo-octets suffisent à couvrir mille huit cents offres.
 *
 * Refusée à tout compte autre que le propriétaire des accès : c'est ce
 * refus qui fait que les montants n'apparaissent chez personne d'autre.
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  const user = token ? await verifyToken(token) : null;
  if (!user || user.role !== "admin" || !(await peutVoirBexio(user))) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }
  try {
    const copie = await lireCopieBexio();
    const montants: Record<string, number> = {};
    for (const o of copie.offres) {
      const nr = (o.nr || "").trim().toUpperCase();
      if (!nr.startsWith("TM-")) continue;
      montants[nr] = Math.round((o.total || 0) * 100) / 100;
    }
    return NextResponse.json({ le: copie.le, montants });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
