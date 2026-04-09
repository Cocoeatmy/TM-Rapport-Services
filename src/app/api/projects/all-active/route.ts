import { NextResponse } from "next/server";
import { getAllActiveProjects } from "@/lib/notion";

export const dynamic = "force-dynamic";
export const revalidate = 300;

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
