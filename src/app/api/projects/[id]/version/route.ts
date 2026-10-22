import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { derniereEcriture } from "@/lib/server-cache";

export const dynamic = "force-dynamic";

/**
 * L'heure de la dernière modification connue d'une fiche (22.10.2026).
 *
 * La fiche ouverte la demande toutes les 3 s : c'est une lecture Redis de
 * quelques octets, AUCUNE requête Notion. Elle change quand l'app enregistre
 * la fiche (updateProject) ou quand Notion signale une modification faite
 * chez lui (webhook) ; la fiche ne se relit en entier qu'à ce moment-là.
 */

/* Plusieurs écrans sur la même fiche : une lecture Redis par seconde suffit. */
const memo = new Map<string, { v: number; t: number }>();

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token || !(await verifyToken(token))) {
    return NextResponse.json({ error: "Connexion requise" }, { status: 401 });
  }
  const { id } = await params;
  const cle = `project-${id}`;
  const m = memo.get(cle);
  let v: number;
  if (m && Date.now() - m.t < 1_000) v = m.v;
  else {
    v = await derniereEcriture(cle);
    memo.set(cle, { v, t: Date.now() });
    if (memo.size > 500) memo.clear();
  }
  return NextResponse.json({ v }, { headers: { "Cache-Control": "private, no-store" } });
}
