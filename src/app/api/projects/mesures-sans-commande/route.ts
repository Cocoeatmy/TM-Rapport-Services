import { NextResponse } from "next/server";
import { getProjectsMesuresSansCommande } from "@/lib/notion";
import { cachedOrFetch } from "@/lib/server-cache";
import { cachedJson } from "@/lib/edge-cache";

export const revalidate = 120;

export async function GET() {
  try {
    const projects = await cachedOrFetch(
      "projects-mesures-sans-commande",
      getProjectsMesuresSansCommande
    );
    return cachedJson(projects, { sMaxAge: 60, swr: 300 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Erreur" },
      { status: 500 }
    );
  }
}
