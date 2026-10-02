/**
 * /api/paiements-fournisseurs — les lignes pointées comme payées.
 *
 * Pointer une facture fournisseur, c'est cocher ligne à ligne ce qui a été
 * réglé. Rien dans Notion ne le dit : le paiement est un fait comptable, pas
 * un état du chantier, et l'y inscrire mélangerait deux choses qui n'ont pas
 * le même cycle de vie.
 *
 * La coche porte sur un COUPLE projet + prestation : un même chantier donne
 * une ligne de mesures et une ligne de montage, facturées séparément et
 * souvent à des mois d'écart. Une coche par projet aurait fait passer les
 * deux pour réglées d'un seul geste.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getData, setData } from "@/lib/kv-store";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CLE = "paiements-fournisseurs";

export interface LignePayee {
  /** « <id projet>:<prestation> » — mesures, montage, services, sav, soucis. */
  cle: string;
  par: string;
  quand: number;
}

async function utilisateur(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  return token ? await verifyToken(token) : null;
}

export async function GET(req: NextRequest) {
  if (!(await utilisateur(req))) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  try {
    return NextResponse.json(await getData<LignePayee>(CLE));
  } catch {
    /* Stockage indisponible : la liste s'affiche sans les coches plutôt que
       de ne pas s'afficher du tout. */
    return NextResponse.json([]);
  }
}

export async function POST(req: NextRequest) {
  const user = await utilisateur(req);
  if (!user || (user as { role?: string }).role !== "admin") {
    return NextResponse.json({ error: "Admin requis" }, { status: 403 });
  }
  try {
    const { cle, paye } = await req.json();
    const id = String(cle || "").trim();
    if (!id) return NextResponse.json({ error: "cle requise" }, { status: 400 });

    const liste = await getData<LignePayee>(CLE);
    const sans = liste.filter((x) => x.cle !== id);
    if (paye) {
      sans.push({ cle: id, par: String((user as { name?: string }).name || ""), quand: Date.now() });
    }
    await setData(CLE, sans);
    return NextResponse.json({ ok: true, paye: !!paye });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
  }
}
