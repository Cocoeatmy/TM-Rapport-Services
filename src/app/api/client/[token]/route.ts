import { NextRequest, NextResponse } from "next/server";
import { getProject } from "@/lib/notion";
import { STATUS_CMD_COLORS } from "@/lib/constants";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const ip = _request.headers.get("x-forwarded-for") || _request.headers.get("x-real-ip") || "unknown";
    const { allowed, remaining } = checkRateLimit(`client:${ip}`, 10, 60000);
    if (!allowed) {
      return NextResponse.json(
        { error: "Trop de requêtes. Veuillez réessayer dans une minute." },
        { status: 429, headers: { "Retry-After": "60", "X-RateLimit-Remaining": "0" } }
      );
    }

    const { token } = await params;

    // Decode the base64 token to get the project ID
    let projectId: string;
    try {
      projectId = Buffer.from(token, "base64url").toString("utf-8");
    } catch {
      return NextResponse.json(
        { error: "Lien invalide" },
        { status: 400 }
      );
    }

    if (!projectId || projectId.length < 10) {
      return NextResponse.json(
        { error: "Lien invalide" },
        { status: 400 }
      );
    }

    const project = await getProject(projectId);

    // Return only public-safe data (no hours, comments, prices)
    const publicData = {
      projet: project.projet,
      nomChantier: project.nomChantier,
      adresseChantier: project.adresseChantier,
      dateMontage: project.dateMontage,
      collaborateurs: project.collaborateurs,
      etatCMD: project.etatCMD,
      fournisseurs: project.fournisseurs,
      seriesCabines: project.seriesCabines,
      nbCabines: project.nbCabines,
      photosAvant: project.photosAvant,
      photosMontage: project.photosMontage,
    };

    return NextResponse.json(publicData);
  } catch (error: any) {
    console.error("Client portal error:", error);
    return NextResponse.json(
      { error: "Projet introuvable" },
      { status: 404 }
    );
  }
}
