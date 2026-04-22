import { NextResponse } from "next/server";
import { getProjectsServices } from "@/lib/notion";
import { cachedOrFetch } from "@/lib/server-cache";

export const revalidate = 120;

export async function GET() {
  try {
    const projects = await cachedOrFetch("projects-services", getProjectsServices);
    return NextResponse.json(projects);
  } catch (error: any) {
    console.error("Error fetching services projects:", error);
    return NextResponse.json(
      { error: error.message || "Erreur" },
      { status: 500 }
    );
  }
}
