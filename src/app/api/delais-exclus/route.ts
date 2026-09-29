/**
 * /api/delais-exclus — les chantiers écartés des statistiques de délai.
 *
 * Certaines attentes ne nous sont pas imputables : les cabines sont arrivées,
 * mais le chantier n'était pas prêt, le client a reporté, l'accès était
 * impossible. Rien dans Notion ne distingue ces cas d'un simple retard de
 * notre part — et aucun calcul ne le devinera, puisque la cause est extérieure
 * aux données.
 *
 * C'est donc une décision humaine, et elle se consigne : chaque exclusion
 * garde le motif, la date et l'auteur. Un chiffre corrigé sans trace serait
 * invérifiable, et la correction finirait par ressembler à un arrangement.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getData, setData } from "@/lib/kv-store";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CLE = "delais-exclus";

export interface Exclusion {
  projectId: string;
  ofrTM: string;
  motif: string;
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
    return NextResponse.json(await getData<Exclusion>(CLE));
  } catch {
    /* Stockage indisponible : aucune exclusion vaut mieux qu'une erreur — la
       statistique s'affiche, simplement sans les corrections. */
    return NextResponse.json([]);
  }
}

export async function POST(req: NextRequest) {
  const user = await utilisateur(req);
  if (!user || (user as { role?: string }).role !== "admin") {
    return NextResponse.json({ error: "Admin requis" }, { status: 403 });
  }
  try {
    const { projectId, ofrTM, motif } = await req.json();
    if (!projectId) return NextResponse.json({ error: "projectId requis" }, { status: 400 });

    const liste = await getData<Exclusion>(CLE);
    const sans = liste.filter((x) => x.projectId !== projectId);
    /* Sans motif, on RETIRE l'exclusion : le même geste sert dans les deux
       sens, et l'on ne peut pas exclure un chantier sans dire pourquoi. */
    const motifPropre = String(motif || "").trim();
    if (!motifPropre) {
      await setData(CLE, sans);
      return NextResponse.json({ ok: true, exclu: false });
    }
    sans.push({
      projectId: String(projectId),
      ofrTM: String(ofrTM || ""),
      motif: motifPropre.slice(0, 200),
      par: String((user as { name?: string }).name || ""),
      quand: Date.now(),
    });
    await setData(CLE, sans);
    return NextResponse.json({ ok: true, exclu: true });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
  }
}
