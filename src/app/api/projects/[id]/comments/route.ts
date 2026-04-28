import { NextRequest, NextResponse } from "next/server";
import { notion } from "@/lib/notion";
import { verifyToken } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

export interface NotionComment {
  id: string;
  text: string;
  createdTime: string;
  discussionId: string;
}

function toNotionComment(c: any): NotionComment {
  return {
    id: c.id,
    text: (c.rich_text as any[]).map((t: any) => t.plain_text || "").join(""),
    createdTime: c.created_time,
    discussionId: c.discussion_id,
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const seen = new Set<string>();
    const comments: NotionComment[] = [];
    const discussionIds = new Set<string>();

    // ── Étape 1 : commentaires racines de la page (paginés) ──────────────
    let cursor: string | undefined;
    do {
      const res = await notion.comments.list({
        block_id: id,
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      } as any);

      for (const c of res.results as any[]) {
        if (!seen.has(c.id)) {
          seen.add(c.id);
          comments.push(toNotionComment(c));
        }
        if (c.discussion_id) discussionIds.add(c.discussion_id);
      }
      cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
    } while (cursor);

    // ── Étape 2 : réponses dans chaque fil de discussion (paginées) ───────
    for (const discussionId of discussionIds) {
      let dCursor: string | undefined;
      do {
        const dRes = await notion.comments.list({
          discussion_id: discussionId,
          page_size: 100,
          ...(dCursor ? { start_cursor: dCursor } : {}),
        } as any);

        for (const c of dRes.results as any[]) {
          if (!seen.has(c.id)) {
            seen.add(c.id);
            comments.push(toNotionComment(c));
          }
        }
        dCursor = dRes.has_more ? (dRes.next_cursor ?? undefined) : undefined;
      } while (dCursor);
    }

    // Tri chronologique croissant
    comments.sort(
      (a, b) => new Date(a.createdTime).getTime() - new Date(b.createdTime).getTime()
    );

    return NextResponse.json(comments);
  } catch (error: any) {
    // Si les commentaires ne sont pas accessibles (permissions), on retourne
    // un tableau vide plutôt qu'une erreur pour ne pas bloquer le rendu.
    console.error("[comments] Error fetching Notion comments:", error?.message);
    return NextResponse.json([]);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Auth : seuls les utilisateurs connectés peuvent commenter
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  try {
    const { id } = await params;
    const body = await request.json();
    const text: string = (body.text ?? "").trim();

    if (!text) {
      return NextResponse.json({ error: "Le commentaire ne peut pas être vide" }, { status: 400 });
    }

    const comment = await notion.comments.create({
      parent: { page_id: id },
      rich_text: [{ type: "text", text: { content: text } }],
    });

    const result: NotionComment = {
      id: (comment as any).id,
      text: ((comment as any).rich_text as any[])
        .map((t: any) => t.plain_text || "")
        .join(""),
      createdTime: (comment as any).created_time,
      discussionId: (comment as any).discussion_id,
    };

    return NextResponse.json(result, { status: 201 });
  } catch (error: any) {
    console.error("[comments] Error creating Notion comment:", error?.message);
    return NextResponse.json(
      { error: error.message || "Erreur lors de la création du commentaire" },
      { status: 500 }
    );
  }
}
