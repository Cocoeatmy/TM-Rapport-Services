import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { peutVoirBexio } from "@/lib/bexio";
import { synchroniserBexio, lireCopieBexio } from "@/lib/bexio-donnees";
import { getData, setData } from "@/lib/kv-store";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Relire bexio maintenant, sans attendre la copie de la nuit.
 *
 * Et répercuter ce qui en découle sur les « Indicateurs financiers » : les
 * créances, les dettes et le nombre de clients y étaient recopiés à la main,
 * donc faux dès le lendemain. Seuls ces champs-là sont réécrits — les
 * salaires et les charges portent une part saisie (masse salariale, frais
 * forfaitaires) qu'une synchronisation n'a pas à effacer.
 */
const r2 = (n: number) => Math.round((n || 0) * 100) / 100;

export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  const user = token ? await verifyToken(token) : null;
  if (!user || user.role !== "admin" || !(await peutVoirBexio(user))) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  try {
    const compte = await synchroniserBexio();
    const copie = await lireCopieBexio();

    /* Douze mois glissants : la fenêtre qui a du sens pour des créances et
       un nombre de clients, pas l'année civile tronquée au mois en cours. */
    const fin = new Date();
    const debut = new Date();
    debut.setMonth(debut.getMonth() - 11);
    debut.setDate(1);
    const de = debut.toISOString().slice(0, 10);
    const a = fin.toISOString().slice(0, 10);
    const dans = (d: string) => d >= de && d <= a;

    const creances = copie.factures.reduce((s, f) => s + (f.restant || 0), 0);
    const dettes = copie.achats.reduce((s, b) => s + (b.du || 0), 0);
    const retenues = copie.factures.filter((f) => dans(f.date));
    const nbClients = new Set(retenues.map((f) => f.contactId ?? -1)).size;
    const premiere = new Map<number, string>();
    for (const f of copie.factures) {
      const id = f.contactId ?? -1;
      const d = f.date || "9999";
      if (!premiere.has(id) || d < (premiere.get(id) as string)) premiere.set(id, d);
    }
    const nouveauxClients = [...premiere.values()].filter(dans).length;

    let indicateurs: Record<string, unknown> | null = null;
    try {
      const rows = await getData<Record<string, number | string | null>>("finances");
      const actuel = rows[0] || {};
      indicateurs = {
        creances: r2(creances),
        dettes: r2(dettes),
        nbClients,
        nouveauxClients,
      };
      await setData("finances", [{ ...actuel, ...indicateurs }]);
    } catch {
      indicateurs = null; // la synchro bexio reste valable même si l'écriture échoue
    }

    return NextResponse.json({ success: true, ...compte, le: new Date().toISOString(), indicateurs });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
