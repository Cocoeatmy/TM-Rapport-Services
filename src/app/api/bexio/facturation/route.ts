import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { peutVoirBexio } from "@/lib/bexio";
import { lireCopieBexio } from "@/lib/bexio-donnees";
import { indexerFacturation, rapprocher, type EtatFacturation } from "@/lib/bexio-rapprochement";
import { getAllProjectsRaw } from "@/lib/notion";
import { cachedOrFetch } from "@/lib/server-cache";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * État de facturation des chantiers clôturés — visible par le seul
 * propriétaire des accès bexio.
 *
 * Le croisement ne se fait nulle part ailleurs : Notion ignore la
 * facturation, bexio ignore qu'un chantier a eu lieu. Un montage terminé et
 * jamais facturé n'apparaît donc dans aucun des deux. C'est précisément ce
 * que cette page va chercher.
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  const user = token ? await verifyToken(token) : null;
  if (!user || user.role !== "admin" || !(await peutVoirBexio(user))) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const forcer = request.nextUrl.searchParams.get("fresh") === "1";
  try {
    const [projets, copie] = await Promise.all([
      cachedOrFetch<Record<string, unknown>[]>(
        "projects-all-raw",
        getAllProjectsRaw as unknown as () => Promise<Record<string, unknown>[]>,
      ),
      lireCopieBexio(forcer),
    ]);
    const idx = indexerFacturation(copie.offres, copie.factures);

    const lignes = [];
    const compte: Record<EtatFacturation, number> = {
      facturee: 0, retrouvee: 0, probable: 0, mensuel: 0, sans: 0, inconnue: 0,
    };
    for (const p of projets as Array<Record<string, any>>) {
      if (String(p.etatCMD || "") !== "Terminé") continue;
      const r = rapprocher(p.ofrTM, idx);
      compte[r.etat] += 1;
      if (r.etat === "facturee" || r.etat === "inconnue") continue; // rien à surveiller
      lignes.push({
        id: p.id,
        ofrTM: p.ofrTM || "",
        projet: p.projet || "",
        nomChantier: p.nomChantier || "",
        adresseChantier: p.adresseChantier || "",
        nbCabines: p.nbCabines || 0,
        dateMontage: p.dateMontage || null,
        collaborateurs: p.collaborateurs || "",
        etatCMD: p.etatCMD || "",
        etat: r.etat,
        offre: r.offre ? { nr: r.offre.nr, total: r.offre.total, date: r.offre.date } : null,
        factures: r.factures.map((f) => ({ nr: f.nr, total: f.total, restant: f.restant, date: f.date })),
        facture: r.facture,
        restant: r.restant,
      });
    }
    // Les plus gros montants d'abord : c'est là qu'il faut regarder.
    lignes.sort((a, b) => (b.offre?.total || 0) - (a.offre?.total || 0));

    return NextResponse.json({
      le: copie.le,
      offres: copie.offres.length,
      facturesBexio: copie.factures.length,
      compte,
      aOublier: lignes.filter((l) => l.etat === "sans").reduce((s, l) => s + (l.offre?.total || 0), 0),
      lignes,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
