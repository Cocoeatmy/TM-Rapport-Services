import { NextResponse } from "next/server";
import { getAllActiveProjects } from "@/lib/notion";

export const revalidate = 120; // ISR: re-validate toutes les 2 minutes

export async function GET() {
  try {
    const projects = await getAllActiveProjects();
    return NextResponse.json(projects, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
