/**
 * POST /api/projects/[id]/restore-order   (ADMIN)
 *
 * Réécrit DIRECTEMENT (remplacement complet, sans merge) l'ordre des lots :
 *   - "Lot (nom de cabine)"  ← body.nomsCabines
 *   - "Monteur responsable"  ← body.attributionCabines
 *
 * Outil de RÉPARATION ponctuel : après une réorganisation qui avait
 * désynchronisé les noms de la position des données. Les champs positionnels
 * (photos .CabN., heures, sous-traitance, état, SAV) ne sont PAS touchés — ils
 * étaient restés à leur position d'origine ; remettre les noms dans le bon
 * ordre les réaligne.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { notion } from "@/lib/notion";
import { invalidateCache } from "@/lib/server-cache";

export const dynamic = "force-dynamic";

function toRich(s: string) {
  return s ? [{ text: { content: s.slice(0, 1990) } }] : [];
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = req.cookies.get("auth-token")?.value;
  const user = token ? await verifyToken(token) : null;
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Réservé à l'admin" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const properties: Record<string, unknown> = {};
  if (typeof body.nomsCabines === "string") properties["Lot (nom de cabine)"] = { rich_text: toRich(body.nomsCabines) };
  if (typeof body.attributionCabines === "string") properties["Monteur responsable"] = { rich_text: toRich(body.attributionCabines) };
  if (typeof body.heureArrivee === "string") properties["Heure arrivée"] = { rich_text: toRich(body.heureArrivee) };
  if (typeof body.heureDepart === "string") properties["Heure départ"] = { rich_text: toRich(body.heureDepart) };
  if (Object.keys(properties).length === 0) return NextResponse.json({ error: "rien à écrire" }, { status: 400 });

  try {
    await notion.pages.update({ page_id: id, properties: properties as any });
    invalidateCache(`project-${id}`);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
