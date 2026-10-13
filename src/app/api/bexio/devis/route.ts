/**
 * Les devis restés sans réponse, rapprochés des dossiers Notion.
 *
 * Le signal du tableau de bord n'en donnait qu'un compte et les soixante
 * premiers ; cette adresse-ci rend la liste entière, enrichie de ce qui
 * permet de décider : le relevé de mesures a-t-il eu lieu, le chantier
 * est-il encore vivant, a-t-on déjà relancé et combien de fois.
 *
 * Réservée au propriétaire des accès bexio, comme tout ce qui porte un
 * montant.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { peutVoirBexio } from "@/lib/bexio";
import { lireCopieBexio } from "@/lib/bexio-donnees";
import { getAllProjectsRaw } from "@/lib/notion";
import { cachedOrFetch } from "@/lib/server-cache";
import { devisEnAttente, ageEnJours } from "@/lib/signaux";
import { lireHistorique } from "@/lib/relances-historique";
import { enrichirDevis, indexerParOffre, type DossierLie } from "@/lib/devis-attente";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  const user = token ? await verifyToken(token) : null;
  if (!user || user.role !== "admin" || !(await peutVoirBexio(user))) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  try {
    const aujourdhui = new Date().toISOString().slice(0, 10);
    const [copie, projets, historique] = await Promise.all([
      lireCopieBexio(),
      cachedOrFetch("projects-all-raw", getAllProjectsRaw),
      lireHistorique().catch(() => ({})),
    ]);

    const dossiers: DossierLie[] = projets.map((p) => ({
      id: p.id, projet: p.projet, ofrTM: p.ofrTM,
      dateMesures: p.dateMesures, etatCMD: p.etatCMD,
      typeClient: p.typeClient, nbCabines: p.nbCabines,
    }));

    const offres = devisEnAttente(copie.offres, aujourdhui).map((o) => ({
      nr: o.nr, titre: o.titre, client: (o as { client?: string }).client || "",
      total: o.total, date: o.date, jours: ageEnJours(o.date, aujourdhui),
      contactId: (o as { contactId?: number | null }).contactId ?? null,
    }));

    return NextResponse.json({
      le: copie.le,
      lignes: enrichirDevis(offres, indexerParOffre(dossiers), historique),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
