import { NextResponse } from "next/server";

export const revalidate = 30;

export async function GET() {
  try {
    // TODO: connecter aux filtres Notion
    return NextResponse.json([]);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Erreur" },
      { status: 500 }
    );
  }
}
