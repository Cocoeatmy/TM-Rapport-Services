import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { notion, notionWrite, databaseId } from "@/lib/notion";
import { invalidateCache } from "@/lib/server-cache";
import { normaliserSchema, champPar } from "@/lib/notion-schema";
import { ecrireValeur, TypeNonEcrivable, type ValeurChamp } from "@/lib/notion-valeurs";

/**
 * Créer un projet avec N'IMPORTE QUELLE propriété de la base.
 *
 * L'ancienne création n'en connaissait que dix-huit, écrites une à une
 * dans le code : pour tout le reste, il fallait ouvrir Notion. Celle-ci
 * ne connaît aucune propriété — elle lit le schéma et s'y conforme, comme
 * la route d'écriture.
 *
 * Elle est volontairement SÉPARÉE de l'ancienne, qui reste en place : rien
 * de ce qui marche aujourd'hui ne dépend de celle-ci.
 */

export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Admin requis" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const valeurs = body?.valeurs as Record<string, ValeurChamp> | undefined;
  if (!valeurs || typeof valeurs !== "object") {
    return NextResponse.json({ error: "Aucune valeur transmise" }, { status: 400 });
  }

  try {
    const brut = await notion.databases.retrieve({ database_id: databaseId });
    const schema = normaliserSchema(
      databaseId,
      (brut as unknown as { title?: unknown }).title,
      (brut as unknown as { properties: Record<string, never> }).properties,
    );

    const champTitre = schema.champs.find((c) => c.type === "title");
    const properties: Record<string, unknown> = {};
    const refuses: { nom: string; motif: string }[] = [];

    for (const [cid, valeur] of Object.entries(valeurs)) {
      const champ = champPar(schema, cid);
      if (!champ) { refuses.push({ nom: cid, motif: "Propriété inconnue" }); continue; }
      /* Une valeur vide à la création n'a rien à dire : on laisse la
         colonne telle que Notion la crée, plutôt que d'y écrire du vide. */
      const rienDit = valeur === null || valeur === undefined || valeur === ""
        || (Array.isArray(valeur) && valeur.length === 0);
      if (rienDit) continue;
      try {
        properties[champ.id] = ecrireValeur(champ.type, valeur);
      } catch (e) {
        refuses.push({ nom: champ.nom, motif: e instanceof TypeNonEcrivable ? e.message : "Valeur refusée" });
      }
    }

    /* Le nom du projet est la seule chose vraiment obligatoire : une fiche
       sans titre est introuvable, dans Notion comme dans l'application. */
    if (champTitre && !properties[champTitre.id]) {
      return NextResponse.json({ error: `« ${champTitre.nom} » est obligatoire` }, { status: 400 });
    }

    const page = await notionWrite.pages.create({
      parent: { database_id: databaseId },
      properties: properties as never,
    });

    invalidateCache("projects");
    invalidateCache("projects-mesures");
    invalidateCache("projects-services");
    invalidateCache("projects-sav");

    return NextResponse.json({ success: true, pageId: page.id, refuses }, { status: 201 });
  } catch (err) {
    console.error("[projects/creer]", err);
    const message = (err as { message?: string })?.message || "Création refusée par Notion";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
