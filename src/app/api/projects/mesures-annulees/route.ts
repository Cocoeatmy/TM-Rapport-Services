import { NextResponse } from "next/server";
import { getProjectsMesuresAnnulees } from "@/lib/notion";
import { cachedOrFetch } from "@/lib/server-cache";
import { cachedJson } from "@/lib/edge-cache";

export const revalidate = 120;

export async function GET() {
  try {
    const projects = await cachedOrFetch(
      "projects-mesures-annulees",
      getProjectsMesuresAnnulees
    );
    return cachedJson(projects, { sMaxAge: 60, swr: 300 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Erreur" },
      { status: 500 }
    );
  }
}
