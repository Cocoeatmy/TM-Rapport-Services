import { NextResponse } from "next/server";
import { getAllActiveProjects } from "@/lib/notion";
import { cachedOrFetch } from "@/lib/server-cache";

export const revalidate = 120;

export async function GET() {
  try {
    const projects = await cachedOrFetch("projects-all-active", getAllActiveProjects);
    return NextResponse.json(projects, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
