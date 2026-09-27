/**
 * /api/chantiers — les chantiers PPE, regroupés PAR LE SERVEUR.
 *
 * La page en construisait le regroupement dans le navigateur, ce qui
 * l'obligeait à télécharger les ~1350 fiches complètes — photos et documents
 * compris — pour n'en garder qu'une quarantaine de groupes. Acceptable sur un
 * Mac au bureau, lourd sur un téléphone en 4G.
 *
 * Le serveur a déjà les projets en cache : il rend ici les chantiers, avec des
 * offres réduites aux champs réellement affichés.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getAllProjectsRaw } from "@/lib/notion";
import { cachedOrFetch } from "@/lib/server-cache";
import { construireChantiers, alleger } from "@/lib/chantiers";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Plancher du calcul : la page filtre ensuite sur le seuil choisi (10 à 30). */
const SEUIL_MIN = 10;

export async function GET(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  try { if (!(await verifyToken(token))) throw new Error(); }
  catch { return NextResponse.json({ error: "Non autorisé" }, { status: 401 }); }

  try {
    const projets = await cachedOrFetch("projects-all-raw", getAllProjectsRaw);
    const chantiers = construireChantiers(projets, { seuilCabines: SEUIL_MIN });
    return NextResponse.json({
      seuilMin: SEUIL_MIN,
      chantiers: chantiers.map((c) => ({ ...c, offres: c.offres.map(alleger) })),
    });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
  }
}
