import { NextRequest, NextResponse } from "next/server";
import { notion } from "@/lib/notion";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

export interface NotionComment {
  id: string;
  text: string;
  createdTime: string;
  discussionId: string;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const response = await notion.comments.list({ block_id: id });

    const comments: NotionComment[] = (response.results as any[]).map((c) => ({
      id: c.id,
      text: (c.rich_text as any[])
        .map((t: any) => t.plain_text || "")
        .join(""),
      createdTime: c.created_time,
      discussionId: c.discussion_id,
    }));

    return NextResponse.json(comments);
  } catch (error: any) {
    // Si les commentaires ne sont pas accessibles (permissions), on retourne
    // un tableau vide plutôt qu'une erreur pour ne pas bloquer le rendu.
    console.error("[comments] Error fetching Notion comments:", error?.message);
    return NextResponse.json([]);
  }
}
