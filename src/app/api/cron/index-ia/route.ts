/**
 * Tâche planifiée : relit les bases Notion de l'assistant IA, en entier, une
 * par une (hors base des projets). Les questions n'ont alors plus qu'à lire
 * l'index partagé et les pages modifiées depuis.
 *
 * LECTURE SEULE dans Notion. Une base qui échoue garde sa version précédente.
 */
import { NextRequest, NextResponse } from "next/server";
import { reconstruireTout } from "@/lib/recherche-ia/index-notion";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  const secret = new URL(request.url).searchParams.get("secret");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}` && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const t0 = Date.now();
  const bases = await reconstruireTout();
  return NextResponse.json({
    ms: Date.now() - t0,
    bases: bases.map((b) => ({ titre: b.titre, etat: b.etat, docs: b.docs, ...(b.erreur ? { erreur: b.erreur } : {}) })),
  });
}
