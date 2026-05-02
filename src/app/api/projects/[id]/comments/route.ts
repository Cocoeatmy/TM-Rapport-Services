import { NextRequest, NextResponse } from "next/server";
import { notion } from "@/lib/notion";
import { verifyToken } from "@/lib/auth";

// Note: notion est gardé pour le POST (création de commentaire)

export const dynamic = "force-dynamic";
export const maxDuration = 10;

export interface NotionComment {
  id: string;
  text: string;
  createdTime: string;
  discussionId: string;
  author?: string;
}

function toNotionComment(c: any): NotionComment {
  return {
    id: c.id,
    text: (c.rich_text as any[]).map((t: any) => t.plain_text || "").join(""),
    createdTime: c.created_time,
    discussionId: c.discussion_id,
    author: c.created_by?.name || c.created_by?.id || undefined,
  };
}

// Appel REST direct à l'API Notion (évite les quirks du SDK sur comments.list)
async function notionCommentsGet(queryParams: Record<string, string>): Promise<any> {
  const url = new URL("https://api.notion.com/v1/comments");
  for (const [k, v] of Object.entries(queryParams)) url.searchParams.set(k, v);
  const finalUrl = url.toString();
  console.log("[comments] GET", finalUrl);
  const res = await fetch(finalUrl, {
    headers: {
      Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
      "Notion-Version": "2022-06-28",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Notion ${res.status}: ${body}\n[URL appelée: ${finalUrl}]`);
  }
  return res.json();
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id || id === "undefined") {
      return NextResponse.json({ error: "ID de projet manquant" }, { status: 400 });
    }

    const seen = new Set<string>();
    const comments: NotionComment[] = [];
    const discussionIds = new Set<string>();

    // ── Étape 1 : commentaires racines de la page (paginés) ──────────────
    let cursor: string | undefined;
    do {
      const qp: Record<string, string> = { block_id: id, page_size: "100" };
      if (cursor) qp.start_cursor = cursor;
      const res = await notionCommentsGet(qp);

      for (const c of res.results ?? []) {
        if (!seen.has(c.id)) {
          seen.add(c.id);
          comments.push(toNotionComment(c));
        }
        if (c.discussion_id) discussionIds.add(c.discussion_id);
      }
      cursor = res.has_more ? res.next_cursor : undefined;
    } while (cursor);

    // ── Étape 2 : réponses dans chaque fil de discussion ─────────────────
    for (const discussionId of discussionIds) {
      let dCursor: string | undefined;
      do {
        const qp: Record<string, string> = { discussion_id: discussionId, page_size: "100" };
        if (dCursor) qp.start_cursor = dCursor;
        const dRes = await notionCommentsGet(qp);

        for (const c of dRes.results ?? []) {
          if (!seen.has(c.id)) {
            seen.add(c.id);
            comments.push(toNotionComment(c));
          }
        }
        dCursor = dRes.has_more ? dRes.next_cursor : undefined;
      } while (dCursor);
    }

    // Tri chronologique croissant
    comments.sort(
      (a, b) => new Date(a.createdTime).getTime() - new Date(b.createdTime).getTime()
    );

    return NextResponse.json(comments);
  } catch (error: any) {
    const msg = error?.message || String(error);
    console.error("[comments] Error fetching Notion comments:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
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
