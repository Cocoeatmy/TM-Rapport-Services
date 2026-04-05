import { NextResponse } from "next/server";
import { getProjectsServices } from "@/lib/notion";
import { getCached, setCache } from "@/lib/server-cache";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const cached = getCached("projects-services");
    if (cached) {
      return NextResponse.json(cached);
    }

    const projects = await getProjectsServices();
    setCache("projects-services", projects);
    return NextResponse.json(projects);
  } catch (error: any) {
    console.error("Error fetching services projects:", error);
    return NextResponse.json(
      { error: error.message || "Erreur" },
      { status: 500 }
    );
  }
}
