import { NextResponse } from "next/server";
import { getProjectsMesures } from "@/lib/notion";
import { getCached, setCache } from "@/lib/server-cache";

export const revalidate = 120;

export async function GET() {
  try {
    const cached = getCached("projects-mesures");
    if (cached) {
      return NextResponse.json(cached);
    }

    const projects = await getProjectsMesures();
    setCache("projects-mesures", projects);
    return NextResponse.json(projects);
  } catch (error: any) {
    console.error("Error fetching mesures projects:", error);
    return NextResponse.json(
      { error: error.message || "Erreur lors de la récupération des projets mesures" },
      { status: 500 }
    );
  }
}
