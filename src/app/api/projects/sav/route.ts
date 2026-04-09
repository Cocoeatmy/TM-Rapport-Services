import { NextResponse } from "next/server";
import { getProjectsSAV } from "@/lib/notion";
import { getCached, setCache } from "@/lib/server-cache";

export const revalidate = 120;

export async function GET() {
  try {
    const cached = getCached("projects-sav");
    if (cached) {
      return NextResponse.json(cached);
    }

    const projects = await getProjectsSAV();
    setCache("projects-sav", projects);
    return NextResponse.json(projects);
  } catch (error: any) {
    console.error("Error fetching SAV projects:", error);
    return NextResponse.json(
      { error: error.message || "Erreur" },
      { status: 500 }
    );
  }
}
