/**
 * /api/carnet — le travail vendu et pas encore posé.
 *
 * Le calcul demande TOUS les projets : les terminés donnent le barème de durée
 * et le rythme des dernières semaines, les actifs donnent le carnet lui-même.
 * Il se fait donc ici, sur le cache serveur, plutôt que dans le navigateur.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getAllProjectsRaw } from "@/lib/notion";
import { cachedOrFetch } from "@/lib/server-cache";
import { construireCarnet } from "@/lib/carnet";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  try { if (!(await verifyToken(token))) throw new Error(); }
  catch { return NextResponse.json({ error: "Non autorisé" }, { status: 401 }); }

  try {
    const projets = await cachedOrFetch("projects-all-raw", getAllProjectsRaw);
    return NextResponse.json(construireCarnet(projets));
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
  }
}
