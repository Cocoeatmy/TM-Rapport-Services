/**
 * Les absences notées à la main sur le tableau de disponibilité.
 *
 * LECTURE pour tout compte connecté : savoir qui est là concerne toute
 * l'équipe. ÉCRITURE réservée à l'administrateur : une absence est une
 * décision de planning, et un monteur ne doit pas pouvoir noircir la case
 * d'un collègue.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { lireAbsences, basculerAbsence } from "@/lib/absences";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  const user = token ? await verifyToken(token) : null;
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const absences = await lireAbsences();
  const du = request.nextUrl.searchParams.get("du") || "";
  const au = request.nextUrl.searchParams.get("au") || "";
  const liste = [...absences.values()]
    .filter((a) => (!du || a.jour >= du) && (!au || a.jour <= au))
    .sort((a, b) => a.jour.localeCompare(b.jour));
  return NextResponse.json(liste);
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  const user = token ? await verifyToken(token) : null;
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Réservé à l'administrateur" }, { status: 403 });
  }

  const { collaborateur, jour } = await request.json().catch(() => ({ collaborateur: "", jour: "" }));
  if (!collaborateur || !/^\d{4}-\d{2}-\d{2}$/.test(String(jour || ""))) {
    return NextResponse.json({ error: "collaborateur et jour (AAAA-MM-JJ) requis" }, { status: 400 });
  }

  const { absent } = await basculerAbsence(String(collaborateur), String(jour), user.name);
  return NextResponse.json({ ok: true, absent });
}
