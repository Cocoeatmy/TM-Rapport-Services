/**
 * La trace des relances : la date dans Notion, le compte dans l'application.
 *
 * GET  → l'historique complet, par projet.
 * POST → inscrit une relance pour les projets donnés.
 *
 * Deux écritures pour une seule relance, et c'est voulu. La DATE va dans le
 * champ Notion « Relance dossier », parce que la formule « Etat de relance »
 * s'en sert et que l'utilisateur la lit directement dans Notion. Le COMPTE
 * reste côté application : Notion ne garde qu'une date, et « relancé trois
 * fois sans réponse » n'appelle pas le même geste qu'une première relance.
 *
 * En un seul appel pour tout un mois : vingt relances faisaient vingt
 * requêtes depuis le navigateur, chacune rouvrant la même page Notion.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { updateProject } from "@/lib/notion";
import { invalidateCache } from "@/lib/server-cache";
import { lireHistorique, noterRelances } from "@/lib/relances-historique";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  const user = token ? await verifyToken(token) : null;
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  return NextResponse.json({ historique: await lireHistorique() });
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  const user = token ? await verifyToken(token) : null;
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { ids, jour } = await request.json().catch(() => ({ ids: [] }));
  const liste: string[] = Array.isArray(ids)
    ? [...new Set(ids.filter((x) => typeof x === "string" && x))].slice(0, 60) : [];
  if (liste.length === 0) return NextResponse.json({ error: "Aucun projet" }, { status: 400 });

  const leJour = /^\d{4}-\d{2}-\d{2}$/.test(String(jour || ""))
    ? String(jour) : new Date().toISOString().slice(0, 10);

  /* L'historique d'abord : il est bon marché, et une écriture Notion qui
     échoue à mi-parcours ne doit pas faire perdre le compte. */
  const historique = await noterRelances(liste, user.name, leJour).catch(() => ({}));

  /* Les dates ensuite, une par une et sans s'arrêter au premier échec : un
     projet verrouillé dans Notion ne doit pas priver les dix-neuf autres de
     leur trace. Le navigateur apprend lesquels sont passés.

     Les clés « devis:TM-xxxx » n'ont pas de page Notion : un devis bexio
     n'est pas un dossier, et une offre sur trois n'en a aucun. Leur trace
     s'arrête à l'historique — qui vit lui aussi dans Notion, dans le magasin
     de l'application. */
  const ecrits: string[] = [];
  const echecs: string[] = [];
  for (const id of liste) {
    if (id.startsWith("devis:")) { ecrits.push(id); continue; }
    try {
      await updateProject(id, { relanceDossier: leJour });
      invalidateCache(`project-${id}`);
      ecrits.push(id);
    } catch {
      echecs.push(id);
    }
  }
  if (ecrits.some((id) => !id.startsWith("devis:"))) {
    invalidateCache("projects-mesures-sans-commande");
    invalidateCache("projects-mesures");
  }

  return NextResponse.json({ jour: leJour, ecrits, echecs, historique });
}
