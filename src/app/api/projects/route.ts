import { NextResponse } from "next/server";
import { getProjects } from "@/lib/notion";
import { getCached, setCache } from "@/lib/server-cache";

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
