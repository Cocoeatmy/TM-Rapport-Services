import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { notion, databaseId } from "@/lib/notion";
import { normaliserSchema, type SchemaNotion } from "@/lib/notion-schema";
import { placerChamp, poidsChamp, SECTIONS } from "@/lib/champs-sections";

/**
 * Le schéma de la base, tel que l'application doit l'afficher.
 *
 * Notion dit quelles propriétés existent et comment elles fonctionnent ;
 * TM Rapport dit où elles vont et ce qu'on a le droit d'y toucher. Les
 * deux réponses arrivent ensemble pour que l'écran n'ait rien à deviner.
 *
 * Relu au plus une fois par quart d'heure : un schéma ne bouge pas souvent,
 * et chaque lecture est un aller-retour chez Notion. `?frais=1` force la
 * relecture, pour voir tout de suite une colonne qu'on vient d'ajouter.
 */

let enCache: (SchemaNotion & { sections: typeof SECTIONS }) | null = null;
let expire = 0;
const DUREE_CACHE_MS = 15 * 60_000;

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const user = await verifyToken(token);
  /* Le schéma complet expose des colonnes financières (montants, coûts) :
     il reste réservé à l'administration, comme les écrans qui s'en
     servent. */
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Admin requis" }, { status: 403 });

  const frais = request.nextUrl.searchParams.get("frais") === "1";
  if (!frais && enCache && Date.now() < expire) return NextResponse.json(enCache);

  try {
    const brut = await notion.databases.retrieve({ database_id: databaseId });
    const schema = normaliserSchema(
      databaseId,
      (brut as unknown as { title?: unknown }).title,
      (brut as unknown as { properties: Record<string, never> }).properties,
    );
    /* On attache la mise en page ici plutôt qu'à l'écran : la règle de
       classement est testée, et deux écrans différents ne peuvent pas en
       donner deux lectures. */
    const champs = schema.champs
      .map((c) => {
        const place = placerChamp(c.nom, c.type, c.modifiable);
        return {
          ...c,
          section: place.section,
          masque: place.masque,
          /* Lecture seule si l'API refuse d'écrire, OU si la colonne
             appartient au système de rapports. */
          lectureSeule: !c.modifiable || place.lectureSeule,
          motif: place.motif || c.raison,
          poids: poidsChamp(c.nom, c.type, !c.modifiable || place.lectureSeule),
        };
      })
      .sort((a, b) => a.poids - b.poids || a.nom.localeCompare(b.nom, "fr"));

    enCache = { ...schema, champs: champs as never, sections: SECTIONS };
    expire = Date.now() + DUREE_CACHE_MS;
    return NextResponse.json(enCache);
  } catch (err) {
    console.error("[notion/schema]", err);
    /* Un schéma périmé vaut mieux que pas de formulaire du tout. */
    if (enCache) return NextResponse.json({ ...enCache, perime: true });
    return NextResponse.json({ error: "Schéma Notion indisponible" }, { status: 503 });
  }
}
