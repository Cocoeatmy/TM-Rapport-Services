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
  transformation, coutRoute, coutSav, rendement, clientsEnRecul, clientFacture,
  degatsLivraison, soloOuBinome, devenirMesures,
} from "@/lib/analyses";
import { journeeType } from "@/lib/journee";
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
  /* Une carte qui porte sa propre période redemande cette route à chaque
     changement. `only` lui évite de faire recalculer — et retransmettre — les
     huit autres analyses dont elle n'a que faire. */
  const only = req.nextUrl.searchParams.get("only") || "";

  try {
    const projets = await cachedOrFetch("projects-all-raw", getAllProjectsRaw);

    /* Familles de clients réellement présentes, pour que l'écran propose des
       filtres qui donnent des résultats — une liste écrite en dur vieillirait
       à la première valeur ajoutée dans Notion. */
    const familles = [...new Set(projets.map((p) => clientFacture(p).type))]
      .filter((t) => t && t !== "Non renseigné")
      .sort((x, y) => x.localeCompare(y, "fr"));

    if (only === "transformation") {
      const type = req.nextUrl.searchParams.get("type") || "tous";
      return NextResponse.json({
        periode: { de: de || null, a: a || null },
        familles,
        transformation: transformation(projets, type, de, a),
      });
    }

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
      /* `transformation` n'est plus ici : sa carte porte sa propre période et
         la demande à part (`only=transformation`). L'inclure d'office aurait
         transmis pour rien les projets de chaque mesure, qu'elle seule ouvre. */
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
      familles,
      recul: clientsEnRecul(projets, "tous"),
      degats: {
        marque: degatsLivraison(projets, "marque", de, a),
        grossiste: degatsLivraison(projets, "grossiste", de, a),
      },
      equipage: soloOuBinome(projets, de, a),
      journee: journeeType(projets, positions, de, a),
      mesures: devenirMesures(projets, de, a),
    });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
  }
}
