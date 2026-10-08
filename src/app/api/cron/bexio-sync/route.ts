import { NextRequest, NextResponse } from "next/server";
import { synchroniserBexio } from "@/lib/bexio-donnees";
import { lireJeton } from "@/lib/bexio";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Copie nocturne des offres et factures bexio. */
export async function GET(request: NextRequest) {
  const attendu = process.env.CRON_SECRET;
  const fourni = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
    || request.nextUrl.searchParams.get("secret");
  if (!attendu || fourni !== attendu) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  // Pas de connexion bexio : rien à faire, et surtout pas une erreur nocturne.
  if (!(await lireJeton())?.refresh) {
    return NextResponse.json({ ignore: "bexio n'est pas connecté" });
  }
  try {
    const r = await synchroniserBexio();
    return NextResponse.json({ success: true, ...r });
  } catch (e) {
    console.error("[cron bexio-sync]", (e as Error).message);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
