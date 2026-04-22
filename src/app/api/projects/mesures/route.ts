import { NextResponse } from "next/server";
import { getProjectsMesures } from "@/lib/notion";
import { cachedOrFetch } from "@/lib/server-cache";

export const revalidate = 120;

export async function GET() {
  try {
    const projects = await cachedOrFetch("projects-mesures", getProjectsMesures);
    return NextResponse.json(projects);
  } catch (error: any) {
    console.error("Error fetching mesures projects:", error);
    return NextResponse.json(
      { error: error.message || "Erreur lors de la récupération des projets mesures" },
      { status: 500 }
    );
  }
}
