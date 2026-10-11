/**
 * Les chantiers terminés que rien ne facture, prêts pour l'app Rappels.
 *
 * Même porte que les signalements : clé partagée `SHARE_LINK_KEY`, agent
 * macOS en face. Mais une règle de plus, et elle compte :
 *
 * CES DONNÉES VIENNENT DE BEXIO. Elles ne doivent être vues que par le
 * propriétaire des accès. L'app, elle, s'en charge par `peutVoirBexio` sur le
 * compte connecté ; ici il n'y a pas de compte, seulement une clé posée sur
 * SON Mac, qui écrit dans SON iCloud. La chaîne reste donc fermée de bout en
 * bout — aucun collaborateur n'a ni la clé, ni la liste.
 *
 * Le sens est unique, volontairement : la vérité est dans bexio. Facturer
 * là-bas fait cocher le rappel au passage suivant. Cocher le rappel sans
 * facturer ne change rien dans l'app — mais le rappel n'est pas ressuscité
 * non plus, parce que c'est un geste délibéré.
 */
import { NextRequest, NextResponse } from "next/server";
import { lireCopieBexio } from "@/lib/bexio-donnees";
import { indexerFacturation, rapprocher } from "@/lib/bexio-rapprochement";
import { lireReglages } from "@/lib/bexio-reglages";
import { getAllProjectsRaw } from "@/lib/notion";
import { cachedOrFetch } from "@/lib/server-cache";
import { listeDesFactures, type ChantierAFacturer } from "@/lib/rappels-facturation";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const cle = process.env.SHARE_LINK_KEY;
  if (!cle) {
    return NextResponse.json({ ok: false, error: "cle_absente" }, { status: 503 });
  }
  if (req.nextUrl.searchParams.get("key") !== cle) {
    return NextResponse.json({ ok: false, error: "non_autorise" }, { status: 401 });
  }

  try {
    const [projets, copie, reglages] = await Promise.all([
      cachedOrFetch<Record<string, unknown>[]>(
        "projects-all-raw",
        getAllProjectsRaw as unknown as () => Promise<Record<string, unknown>[]>,
      ),
      lireCopieBexio(),
      lireReglages(),
    ]);
    const idx = indexerFacturation(copie.offres, copie.factures);

    const chantiers: ChantierAFacturer[] = [];
    for (const p of projets as Array<Record<string, any>>) {
      if (String(p.etatCMD || "") !== "Terminé") continue;
      /* Une décision prise à la main l'emporte sur ce que bexio laisse voir. */
      if (reglages.has(String(p.id))) continue;
      const r = rapprocher(p.ofrTM, idx);
      if (r.etat !== "sans") continue;
      chantiers.push({
        id: String(p.id),
        ofrTM: p.ofrTM || "",
        projet: p.projet || "",
        nomChantier: p.nomChantier || "",
        adresseChantier: p.adresseChantier || "",
        nbCabines: p.nbCabines || 0,
        dateMontage: p.dateMontage || null,
        collaborateurs: p.collaborateurs || "",
        etat: r.etat,
        offre: r.offre ? { nr: r.offre.nr, total: r.offre.total, date: r.offre.date } : null,
      });
    }

    const liste = listeDesFactures(chantiers, { origine: req.nextUrl.origin });
    return NextResponse.json({
      ok: true,
      le: new Date().toISOString(),
      /* L'agent lit cette ligne pour savoir s'il doit remonter les cases
         cochées. Ici, non : bexio fait foi. */
      cloture: "un-sens",
      familles: ["facture"],
      liste,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: "server_error", message: String(err?.message || err) },
      { status: 500 },
    );
  }
}
