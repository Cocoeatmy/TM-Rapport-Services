/**
 * Les colonnes du Kanban, telles que Notion les déclare.
 *
 * Deux propriétés seulement — « État - Mesures » et « État - CMD » — avec
 * leurs options dans l'ordre de la base et leur couleur. Renommer une option
 * dans Notion la renomme ici ; en ajouter une fait apparaître une colonne.
 * Rien n'est écrit en dur, c'est tout l'intérêt.
 *
 * Pourquoi ne pas réutiliser `/api/notion/schema` : il rend les 142
 * propriétés, colonnes financières comprises, et il est réservé à
 * l'administration pour cette raison. Le Kanban n'a besoin que de deux listes
 * de mots, qu'un monteur peut voir — il les a déjà sous les yeux sur chaque
 * projet.
 */
import { NextRequest, NextResponse } from "next/server";
import { notion, databaseId } from "@/lib/notion";
import { exigerDroit } from "@/lib/droits-serveur";

export const dynamic = "force-dynamic";

const PROPRIETES = {
  mesures: "État - Mesures",
  cmd: "État - CMD",
} as const;

interface Option {
  nom: string;
  couleur?: string;
}
type Reponse = Record<keyof typeof PROPRIETES, Option[]>;

/* Un schéma ne bouge pas souvent, et chaque lecture est un aller-retour chez
   Notion dont le quota est compté. Un quart d'heure, comme pour le schéma
   complet ; `?frais=1` force la relecture après une modification dans Notion. */
let enCache: Reponse | null = null;
let expire = 0;
const DUREE_CACHE_MS = 15 * 60_000;

export async function GET(request: NextRequest) {
  const v = await exigerDroit("kanban.voir");
  if ("refus" in v) return v.refus;

  const frais = request.nextUrl.searchParams.get("frais") === "1";
  if (!frais && enCache && Date.now() < expire) {
    return NextResponse.json({ colonnes: enCache, cache: true });
  }

  try {
    const brut = (await notion.databases.retrieve({ database_id: databaseId })) as unknown as {
      properties: Record<string, { type?: string; status?: { options?: { name: string; color?: string }[] }; select?: { options?: { name: string; color?: string }[] } }>;
    };
    const colonnes = {} as Reponse;
    for (const [vue, nomPropriete] of Object.entries(PROPRIETES) as [keyof typeof PROPRIETES, string][]) {
      const p = brut.properties?.[nomPropriete];
      const options = p?.status?.options || p?.select?.options || [];
      colonnes[vue] = options.map((o) => ({ nom: o.name, couleur: o.color }));
    }
    enCache = colonnes;
    expire = Date.now() + DUREE_CACHE_MS;
    return NextResponse.json({ colonnes, cache: false });
  } catch (e) {
    /* Notion muet : plutôt que de rendre une page vide, on rend ce qu'on a.
       L'écran saura reconstruire les colonnes à partir des projets eux-mêmes
       — il y perdra l'ordre de la base et les couleurs, rien de plus. */
    if (enCache) return NextResponse.json({ colonnes: enCache, cache: true, perime: true });
    return NextResponse.json(
      { error: "Les colonnes n'ont pas pu être lues.", detail: e instanceof Error ? e.message : String(e) },
      { status: 503 },
    );
  }
}
