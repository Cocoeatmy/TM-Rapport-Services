import { NextResponse } from "next/server";
import { getProjectsSAV } from "@/lib/notion";
import { cachedOrFetch } from "@/lib/server-cache";

export const revalidate = 120;

export async function GET() {
  try {
    const projects = await cachedOrFetch("projects-sav", getProjectsSAV);
    return NextResponse.json(projects);
  } catch (error: any) {
    console.error("Error fetching SAV projects:", error);
    return NextResponse.json(
      { error: error.message || "Erreur" },
      { status: 500 }
    );
  }
}
