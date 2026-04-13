import { NextRequest, NextResponse } from "next/server";
import { notion } from "@/lib/notion";

export const dynamic = "force-dynamic";

// Proxy to get fresh Notion file URLs (they expire after ~1h)
export async function GET(request: NextRequest) {
  try {
    const projectId = request.nextUrl.searchParams.get("projectId");
    const field = request.nextUrl.searchParams.get("field");
    const index = parseInt(request.nextUrl.searchParams.get("index") || "0", 10);

    if (!projectId || !field) {
      return NextResponse.json({ error: "Missing projectId or field" }, { status: 400 });
    }

    // Fetch fresh page data from Notion
    const page = await notion.pages.retrieve({ page_id: projectId }) as any;
    const prop = page.properties[field];

    if (!prop || prop.type !== "files" || !prop.files?.length) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const file = prop.files[index];
    if (!file) {
      return NextResponse.json({ error: "File index out of range" }, { status: 404 });
    }

    const url = file.type === "external" ? file.external?.url : file.file?.url;
    if (!url) {
      return NextResponse.json({ error: "No URL found" }, { status: 404 });
    }

    // Redirect to the fresh URL
    return NextResponse.redirect(url);
  } catch (error: any) {
    console.error("File proxy error:", error);
    return NextResponse.json({ error: error.message || "Error" }, { status: 500 });
  }
}
