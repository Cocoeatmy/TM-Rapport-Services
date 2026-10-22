import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { notion, notionWrite, databaseId } from "@/lib/notion";
import { invalidateCache } from "@/lib/server-cache";
import { normaliserSchema, champPar } from "@/lib/notion-schema";
import { ecrireValeur, lireValeur, TypeNonEcrivable, type ValeurChamp } from "@/lib/notion-valeurs";

/**
 * Lire et écrire N'IMPORTE QUELLE propriété d'un projet, par son
 * identifiant Notion.
 *
 * Jusqu'ici chaque colonne devait être écrite à la main dans le code :
 * dix-huit sur cent quarante-deux étaient accessibles, et tout le reste
 * obligeait à rouvrir Notion. Cette route n'en connaît aucune — elle lit
 * le schéma et s'y conforme.
 *
 * TROIS GARANTIES, et elles comptent plus que la souplesse.
 *
 * ON DÉSIGNE PAR IDENTIFIANT. Renommer une colonne dans Notion ne casse
 * rien, ne crée pas de doublon, ne fait disparaître aucune information.
 *
 * ON N'ÉCRIT QUE CE QU'ON ENVOIE. Les propriétés absentes de la requête ne
 * sont pas touchées : une modification faite ailleurs entre-temps n'est
 * jamais écrasée au passage.
 *
 * ON REFUSE BRUYAMMENT. Une propriété calculée, un bouton, un type que
 * l'API ne sait pas écrire : la réponse le dit, champ par champ, au lieu
 * de laisser croire à un enregistrement qui n'a pas eu lieu.
 */

async function schemaCourant() {
  const brut = await notion.databases.retrieve({ database_id: databaseId });
  return normaliserSchema(
    databaseId,
    (brut as unknown as { title?: unknown }).title,
    (brut as unknown as { properties: Record<string, never> }).properties,
  );
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Admin requis" }, { status: 403 });

  const { id } = await ctx.params;
  try {
    const [page, schema] = await Promise.all([
      notion.pages.retrieve({ page_id: id }),
      schemaCourant(),
    ]);
    const props = (page as unknown as { properties: Record<string, Record<string, unknown>> }).properties || {};
    /* On renvoie les valeurs rangées PAR IDENTIFIANT : l'écran ne
       manipule jamais les noms, et un renommage ne le concerne pas. */
    const valeurs: Record<string, ValeurChamp> = {};
    for (const p of Object.values(props)) {
      const pid = String(p.id);
      valeurs[pid] = lireValeur(p);
    }
    return NextResponse.json({
      id,
      valeurs,
      /* La dernière modification connue : l'écran s'en sert pour repérer
         qu'on a travaillé sur une version dépassée. */
      modifieLe: (page as unknown as { last_edited_time?: string }).last_edited_time || null,
      champs: schema.champs.map((c) => ({ id: c.id, nom: c.nom, type: c.type })),
    });
  } catch (err) {
    console.error("[projects/champs GET]", err);
    return NextResponse.json({ error: "Projet introuvable ou Notion indisponible" }, { status: 503 });
  }
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Admin requis" }, { status: 403 });

  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const modifs = body?.valeurs as Record<string, ValeurChamp> | undefined;
  if (!modifs || typeof modifs !== "object" || Object.keys(modifs).length === 0) {
    return NextResponse.json({ error: "Aucune modification transmise" }, { status: 400 });
  }

  try {
    const schema = await schemaCourant();
    const properties: Record<string, unknown> = {};
    const refuses: { id: string; nom: string; motif: string }[] = [];

    for (const [cid, valeur] of Object.entries(modifs)) {
      const champ = champPar(schema, cid);
      if (!champ) {
        refuses.push({ id: cid, nom: cid, motif: "Propriété inconnue dans la base Notion" });
        continue;
      }
      try {
        /* Notion accepte l'identifiant comme clé, au même titre que le nom.
           C'est ce qui rend l'écriture insensible aux renommages. */
        properties[champ.id] = ecrireValeur(champ.type, valeur);
      } catch (e) {
        refuses.push({
          id: champ.id,
          nom: champ.nom,
          motif: e instanceof TypeNonEcrivable ? e.message : "Valeur refusée",
        });
      }
    }

    if (Object.keys(properties).length === 0) {
      return NextResponse.json({ error: "Rien à enregistrer", refuses }, { status: 400 });
    }

    /* `notionWrite` a son propre débit, séparé des lectures : une
       synchronisation en cours ne doit pas affamer une saisie. */
    await notionWrite.pages.update({ page_id: id, properties: properties as never });
    await invalidateCache(`project-${id}`);
    invalidateCache("projects");

    return NextResponse.json({
      success: true,
      enregistres: Object.keys(properties).length,
      refuses,
    });
  } catch (err) {
    console.error("[projects/champs PATCH]", err);
    const message = (err as { body?: string; message?: string })?.message || "Enregistrement refusé par Notion";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
