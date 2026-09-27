/**
 * /api/stats/analyses — transformation, route et coût du SAV.
 *
 * Ces trois analyses ont besoin de projets que la page Statistiques n'a pas en
 * main : les offres sans commande n'y figurent pas (elle ne garde que les
 * montages terminés), et le coût de trajet demande le cache de géocodage, qui
 * vit sur le serveur. Le calcul se fait donc ici, et ne renvoie que des lignes
 * agrégées — quelques dizaines, au lieu des 1350 fiches.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getAllProjectsRaw } from "@/lib/notion";
import { cachedOrFetch } from "@/lib/server-cache";
import { getData } from "@/lib/kv-store";
import {
  transformation, coutRoute, coutSav, rendement, clientsEnRecul,
  degatsLivraison, soloOuBinome,
} from "@/lib/analyses";
import type { Position } from "@/lib/tournee";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Entree = { adresse: string; lat: number | null; lng: number | null };

export async function GET(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  try { if (!(await verifyToken(token))) throw new Error(); }
  catch { return NextResponse.json({ error: "Non autorisé" }, { status: 401 }); }

  const de = req.nextUrl.searchParams.get("de") || undefined;
  const a = req.nextUrl.searchParams.get("a") || undefined;

  try {
    const projets = await cachedOrFetch("projects-all-raw", getAllProjectsRaw);

    /* Le géocodage sert au coût de trajet. S'il est vide, la fonction se
       rabat sur l'estimation par code postal : moins précise, jamais fausse
       au point d'inverser deux régions. */
    const positions: Record<string, Position | null> = {};
    try {
      (await getData<Entree>("geocode")).forEach((e) => {
        positions[e.adresse] = e.lat !== null && e.lng !== null ? { lat: e.lat, lng: e.lng } : null;
      });
    } catch { /* cache indisponible : estimation par NPA */ }

    return NextResponse.json({
      periode: { de: de || null, a: a || null },
      transformation: {
        sanitaire: transformation(projets, "sanitaire", de, a),
        grossiste: transformation(projets, "grossiste", de, a),
      },
      route: coutRoute(projets, positions, de, a),
      sav: {
        marque: coutSav(projets, "marque", de, a),
        serie: coutSav(projets, "serie", de, a),
      },
      rendement: {
        marque: rendement(projets, "marque", de, a),
        serie: rendement(projets, "serie", de, a),
      },
      /* Le recul se mesure sur douze mois glissants, indépendamment de la
         période affichée : comparer deux trimestres n'aurait aucun sens, la
         saisonnalité dominerait le signal. */
      recul: {
        sanitaire: clientsEnRecul(projets, "sanitaire"),
        grossiste: clientsEnRecul(projets, "grossiste"),
      },
      degats: {
        marque: degatsLivraison(projets, "marque", de, a),
        grossiste: degatsLivraison(projets, "grossiste", de, a),
      },
      equipage: soloOuBinome(projets, de, a),
    });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
  }
}
