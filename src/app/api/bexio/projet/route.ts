import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { peutVoirBexio } from "@/lib/bexio";
import { lireCopieBexio } from "@/lib/bexio-donnees";
import { indexerFacturation, rapprocher } from "@/lib/bexio-rapprochement";
import { lireReglages, MOTIFS } from "@/lib/bexio-reglages";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Facturation d'UN chantier, pour la fiche projet.
 *
 * Réservé au propriétaire des accès bexio : la route répond 403 à tout autre
 * compte, et le bloc ne s'affiche alors pas du tout. Un monteur qui ouvre la
 * même fiche ne voit ni prix, ni facture, ni même qu'il existe quelque chose
 * à cet endroit.
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  const user = token ? await verifyToken(token) : null;
  if (!user || user.role !== "admin" || !(await peutVoirBexio(user))) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }
  const ofr = request.nextUrl.searchParams.get("ofr") || "";
  const id = request.nextUrl.searchParams.get("id") || "";
  if (!ofr) return NextResponse.json({ error: "ofr requis" }, { status: 400 });

  try {
    const [copie, reglages] = await Promise.all([lireCopieBexio(), lireReglages()]);
    const r = rapprocher(ofr, indexerFacturation(copie.offres, copie.factures));
    const reglage = id ? reglages.get(id) : undefined;
    return NextResponse.json({
      etat: reglage ? "regle" : r.etat,
      reglage: reglage
        ? { motif: reglage.motif, libelle: MOTIFS[reglage.motif], detail: reglage.detail || "" }
        : null,
      offre: r.offre ? { nr: r.offre.nr, total: r.offre.total, date: r.offre.date } : null,
      factures: r.factures.map((f) => ({ nr: f.nr, total: f.total, restant: f.restant, date: f.date })),
      facture: r.facture,
      restant: r.restant,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
