/**
 * Ordre d'AFFICHAGE des lots (par projet).
 *
 * GET  /api/projects/[id]/cabine-order   → { order: number[] }  (positions CabN)
 * POST /api/projects/[id]/cabine-order   → { order: number[] }  (admin)
 *
 * IMPORTANT : ceci ne stocke QU'UN ORDRE D'AFFICHAGE (une liste de numéros de
 * cabine CabN). AUCUNE donnée de lot (nom, photos, heures, SAV…) n'est déplacée
 * ni modifiée — le contenu reste soudé à son CabN. Réorganiser = changer l'ordre
 * dans lequel les lots sont affichés, jamais leur contenu. Si l'ordre est faux,
 * on le remet sans le moindre risque pour les données.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getData, setData } from "@/lib/kv-store";

export const dynamic = "force-dynamic";

interface OrderRecord {
  id: string;        // = projectId (clé)
  projectId: string;
  order: number[];   // CabN dans l'ordre d'affichage
}
const KEY = "cabine-order";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = req.cookies.get("auth-token")?.value;
  if (!token || !(await verifyToken(token))) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const all = await getData<OrderRecord>(KEY);
  const rec = all.find((r) => r.projectId === id);
  return NextResponse.json({ order: Array.isArray(rec?.order) ? rec!.order : [] });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = req.cookies.get("auth-token")?.value;
  const user = token ? await verifyToken(token) : null;
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Réservé à l'admin" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const order = Array.isArray(body?.order) ? body.order.map((n: any) => parseInt(n, 10)).filter((n: number) => Number.isInteger(n) && n >= 1) : null;
  if (!order) return NextResponse.json({ error: "order invalide" }, { status: 400 });

  const all = await getData<OrderRecord>(KEY);
  const others = all.filter((r) => r.projectId !== id);
  // order vide = retour à l'ordre par défaut (on supprime l'enregistrement).
  if (order.length > 0) others.push({ id, projectId: id, order });
  await setData(KEY, others);
  return NextResponse.json({ ok: true });
}
