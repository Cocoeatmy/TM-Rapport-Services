import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { peutVoirBexio } from "@/lib/bexio";
import { lireCopieBexio } from "@/lib/bexio-donnees";
import { indexerFacturation, rapprocher } from "@/lib/bexio-rapprochement";
import { getAllProjectsRaw } from "@/lib/notion";
import { cachedOrFetch } from "@/lib/server-cache";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Chiffre d'affaires, lu dans bexio — et dans bexio seulement.
 *
 * La page « Stats » de l'app compte des cabines, des chantiers, des heures :
 * ce que Notion sait. Celle-ci compte des francs facturés, ce que seul bexio
 * sait. Les deux ne doivent pas être mélangées, d'où deux pages distinctes :
 * un chiffre d'affaires qui ne vient pas de la comptabilité n'est pas un
 * chiffre d'affaires.
 *
 * La répartition PAR FOURNISSEUR n'existe nulle part telle quelle : elle se
 * reconstitue en remontant de la facture à l'offre, de l'offre au chantier,
 * et du chantier à ses marques. Ce qui ne se rattache à aucun chantier est
 * compté à part plutôt que réparti au jugé.
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  const user = token ? await verifyToken(token) : null;
  if (!user || user.role !== "admin" || !(await peutVoirBexio(user))) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const annee = request.nextUrl.searchParams.get("annee") || String(new Date().getFullYear());
  const tout = annee === "tout";

  try {
    const [projets, copie] = await Promise.all([
      cachedOrFetch<Record<string, unknown>[]>(
        "projects-all-raw",
        getAllProjectsRaw as unknown as () => Promise<Record<string, unknown>[]>,
      ),
      lireCopieBexio(),
    ]);
    const idx = indexerFacturation(copie.offres, copie.factures);

    /* Facture → marques du chantier. Une facture ne peut être rattachée qu'à
       UN chantier : sans cette précaution, deux chantiers de même titre
       compteraient deux fois le même argent. */
    const marquesParFacture = new Map<number, string[]>();
    const pris = new Set<number>();
    for (const p of projets as Array<Record<string, any>>) {
      const r = rapprocher(p.ofrTM, idx);
      if (!r.factures.length) continue;
      const marques: string[] = Array.isArray(p.fournisseurs) ? p.fournisseurs.filter(Boolean) : [];
      for (const f of r.factures) {
        if (pris.has(f.id)) continue;
        pris.add(f.id);
        marquesParFacture.set(f.id, marques.length ? marques : ["Sans marque"]);
      }
    }

    const dansLaPeriode = (d: string) => tout || (d || "").slice(0, 4) === annee;
    const retenues = copie.factures.filter((f) => dansLaPeriode(f.date));

    const cumul = (cle: (f: typeof retenues[number]) => string[]) => {
      const m = new Map<string, { total: number; nb: number }>();
      for (const f of retenues) {
        for (const k of cle(f)) {
          const cur = m.get(k) || { total: 0, nb: 0 };
          /* Une facture qui porte plusieurs marques ne vaut pas plusieurs
             fois son montant : il est partagé entre elles. */
          cur.total += (f.total || 0) / Math.max(1, cle(f).length);
          cur.nb += 1;
          m.set(k, cur);
        }
      }
      return [...m.entries()]
        .map(([nom, v]) => ({ nom, total: Math.round(v.total * 100) / 100, nb: v.nb }))
        .sort((a, b) => b.total - a.total);
    };

    const parMois = (() => {
      const m = new Map<string, { total: number; nb: number }>();
      for (const f of retenues) {
        const k = (f.date || "").slice(0, 7);
        if (!k) continue;
        const cur = m.get(k) || { total: 0, nb: 0 };
        cur.total += f.total || 0; cur.nb += 1;
        m.set(k, cur);
      }
      return [...m.entries()]
        .map(([mois, v]) => ({ mois, total: Math.round(v.total * 100) / 100, nb: v.nb }))
        .sort((a, b) => a.mois.localeCompare(b.mois));
    })();

    const parAnnee = (() => {
      const m = new Map<string, { total: number; nb: number }>();
      for (const f of copie.factures) {
        const k = (f.date || "").slice(0, 4);
        if (!k) continue;
        const cur = m.get(k) || { total: 0, nb: 0 };
        cur.total += f.total || 0; cur.nb += 1;
        m.set(k, cur);
      }
      return [...m.entries()]
        .map(([an, v]) => ({ nom: an, total: Math.round(v.total * 100) / 100, nb: v.nb }))
        .sort((a, b) => b.nom.localeCompare(a.nom));
    })();

    const total = retenues.reduce((s, f) => s + (f.total || 0), 0);
    const restant = retenues.reduce((s, f) => s + (f.restant || 0), 0);
    const nonRattache = retenues.filter((f) => !marquesParFacture.has(f.id));

    return NextResponse.json({
      le: copie.le,
      annee,
      annees: parAnnee.map((a) => a.nom),
      total: Math.round(total * 100) / 100,
      restant: Math.round(restant * 100) / 100,
      encaisse: Math.round((total - restant) * 100) / 100,
      factures: retenues.length,
      parMois,
      parAnnee,
      parClient: cumul((f) => [f.client?.trim() || "Client inconnu"]).slice(0, 40),
      parFournisseur: cumul((f) => marquesParFacture.get(f.id) || ["Non rattaché"]),
      nonRattache: {
        nb: nonRattache.length,
        total: Math.round(nonRattache.reduce((s, f) => s + (f.total || 0), 0) * 100) / 100,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
