/**
 * /api/stats/ca — le chiffre d'affaires réalisé.
 *
 * Réservée à une seule adresse, pas au rôle d'administrateur. La demande est
 * explicite : ces chiffres ne regardent que le patron. Un compte promu
 * administrateur plus tard — pour gérer les utilisateurs, par exemple — ne
 * doit pas hériter du chiffre d'affaires au passage.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getAllProjectsRaw } from "@/lib/notion";
import { cachedOrFetch } from "@/lib/server-cache";
import { chiffreAffaires, type FactureEmise } from "@/lib/ca";
import { getData } from "@/lib/kv-store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** La seule adresse admise. */
const PROPRIETAIRE = "ferreira.micael@gmail.com";

export async function GET(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  const user = token ? await verifyToken(token) : null;
  const email = String((user as { email?: string })?.email || "").toLowerCase();
  if (!user || email !== PROPRIETAIRE) {
    return NextResponse.json({ error: "Accès réservé" }, { status: 403 });
  }

  const de = req.nextUrl.searchParams.get("de") || undefined;
  const a = req.nextUrl.searchParams.get("a") || undefined;

  try {
    const projets = await cachedOrFetch("projects-all-raw", getAllProjectsRaw);
    /* Les factures viennent du Mac, pas de Notion. Leur absence n'est pas une
       erreur — l'agent n'a peut-être pas encore tourné : le chiffre d'affaires
       s'affiche alors sans la colonne facturée, plutôt que pas du tout. */
    let factures: FactureEmise[] = [];
    try { factures = await getData<FactureEmise>("factures-emises"); } catch { /* pas encore poussées */ }
    return NextResponse.json(chiffreAffaires(projets, de, a, factures));
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
  }
}
