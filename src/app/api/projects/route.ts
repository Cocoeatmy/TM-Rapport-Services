import { NextRequest, NextResponse } from "next/server";
import { getProjects, createProject, deleteProject } from "@/lib/notion";
import { getCached, setCache, invalidateCache } from "@/lib/server-cache";
import { verifyToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Cache serveur 60s
    const cached = getCached("projects");
    if (cached) {
      return NextResponse.json(cached);
    }

    const projects = await getProjects();
    setCache("projects", projects);
    return NextResponse.json(projects);
  } catch (error: any) {
    console.error("Error fetching projects:", error);
    return NextResponse.json(
      { error: error.message || "Erreur lors de la récupération des projets" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Admin requis" }, { status: 403 });

  try {
    const body = await request.json();
    if (!body.projet || typeof body.projet !== "string" || !body.projet.trim()) {
      return NextResponse.json({ error: "Le nom du projet est requis" }, { status: 400 });
    }

    const pageId = await createProject({
      projet: body.projet.trim(),
      ofrTM: body.ofrTM,
      nomChantier: body.nomChantier,
      adresseChantier: body.adresseChantier,
      nbCabines: body.nbCabines ? Number(body.nbCabines) : undefined,
      dateMontage: body.dateMontage,
      dateMesures: body.dateMesures,
      collaborateurs: body.collaborateurs,
      mesuresTraiteePar: body.mesuresTraiteePar,
      etatCMD: body.etatCMD,
      etatMesures: body.etatMesures,
      contacts: body.contacts,
    });

    // Invalider tous les caches projets
    invalidateCache("projects");
    invalidateCache("projects-mesures");
    invalidateCache("projects-services");
    invalidateCache("projects-sav");

    return NextResponse.json({ success: true, pageId }, { status: 201 });
  } catch (error: any) {
    console.error("Error creating project:", error);
    return NextResponse.json(
      { error: error.message || "Erreur lors de la création du projet" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Admin requis" }, { status: 403 });

  try {
    const body = await request.json();
    if (!body.pageId || typeof body.pageId !== "string") {
      return NextResponse.json({ error: "L'ID du projet est requis" }, { status: 400 });
    }

    await deleteProject(body.pageId);

    // Invalider tous les caches projets
    invalidateCache("projects");
    invalidateCache("projects-mesures");
    invalidateCache("projects-services");
    invalidateCache("projects-sav");
    invalidateCache(`project-${body.pageId}`);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting project:", error);
    return NextResponse.json(
      { error: error.message || "Erreur lors de la suppression du projet" },
      { status: 500 }
    );
  }
}
