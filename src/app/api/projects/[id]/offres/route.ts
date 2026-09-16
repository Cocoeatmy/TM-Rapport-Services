// GET /api/projects/[id]/offres → fichiers de la colonne Notion « Offre TM »
// du projet (offres, commandes, factures, commande usine…). Admin uniquement.
// Récupération FRAÎCHE depuis Notion : les URL signées des fichiers uploadés
// dans Notion expirent (~1 h), on ne les met donc jamais en cache.
import { NextRequest, NextResponse } from "next/server";
import { getProject } from "@/lib/notion";
import { verifyToken } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = req.cookies.get("auth-token")?.value;
  const user = token ? await verifyToken(token).catch(() => null) : null;
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    const { id } = await params;
    const project = await getProject(id);
    return NextResponse.json(
      { files: project.offresTM || [] },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e: any) {
    return NextResponse.json({ error: "server_error", message: String(e?.message || e) }, { status: 500 });
  }
}
