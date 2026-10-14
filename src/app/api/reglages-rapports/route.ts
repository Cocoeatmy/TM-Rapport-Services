/**
 * L'interrupteur « contacts sur les rapports ».
 *
 * LECTURE pour tout compte connecté : les rapports s'en servent, et un
 * monteur qui génère une fiche doit obtenir le même résultat que
 * l'administrateur. ÉCRITURE réservée à l'administrateur : décider ce qui
 * sort de l'entreprise n'est pas un réglage d'affichage.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { lireReglagesRapports, ecrireReglagesRapports } from "@/lib/reglages-rapports";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  const user = token ? await verifyToken(token) : null;
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  return NextResponse.json(await lireReglagesRapports());
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  const user = token ? await verifyToken(token) : null;
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Réservé à l'administrateur" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  if (typeof body?.contacts !== "boolean") {
    return NextResponse.json({ error: "contacts (booléen) requis" }, { status: 400 });
  }
  await ecrireReglagesRapports({ contacts: body.contacts });
  return NextResponse.json({ ok: true, contacts: body.contacts });
}
