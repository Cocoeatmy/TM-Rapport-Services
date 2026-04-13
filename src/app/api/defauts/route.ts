import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getData, setData } from "@/lib/kv-store";
import { notion } from "@/lib/notion";
import { invalidateCache } from "@/lib/server-cache";

interface DefautComment {
  user: string;
  message: string;
  timestamp: number;
}

interface DefautRequest {
  id: string;
  projectId: string;
  projectName: string;
  user: string;
  types: string[];
  typesLabel: string;
  description: string;
  photoUrls: string[];
  status: "signale" | "en-cours" | "resolu";
  timestamp: number;
  comments: DefautComment[];
}

const KEY = "defauts";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const projectId = request.nextUrl.searchParams.get("projectId");
  const defauts = await getData<DefautRequest>(KEY);
  return NextResponse.json(projectId ? defauts.filter((d) => d.projectId === projectId) : defauts);
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const body = await request.json();
  const defauts = await getData<DefautRequest>(KEY);
  defauts.push({
    id: Math.random().toString(36).slice(2),
    ...body,
    user: user.name,
    status: "signale",
    timestamp: Date.now(),
    comments: [],
  });
  await setData(KEY, defauts);

  // Write to Notion project page (primary storage)
  if (body.projectId) {
    try {
      const now = new Date();
      const dateStr = `${String(now.getDate()).padStart(2, "0")}.${String(now.getMonth() + 1).padStart(2, "0")}.${now.getFullYear()}`;
      const typesStr = Array.isArray(body.types) ? body.types.join(", ") : (body.typesLabel || "-");
      const summary = `Types: ${typesStr} | Description: ${body.description || "-"} | Par: ${user.name} | Date: ${dateStr}`;

      // Read existing text to append
      const page = await notion.pages.retrieve({ page_id: body.projectId });
      const existingText = (page as any).properties["Infos - Défauts signalé"]?.rich_text?.map((t: any) => t.plain_text).join("") || "";
      const newText = existingText ? `${existingText}\n${summary}` : summary;

      const properties: any = {
        "Infos - Défauts signalé": {
          rich_text: [{ text: { content: newText.slice(0, 2000) } }],
        },
      };

      // Add photos if present
      if (body.photoUrls?.length > 0) {
        const existingFiles = (page as any).properties["Photos - Défauts signalé"]?.files || [];
        const mappedExisting = existingFiles.map((f: any) => ({
          type: "external" as const,
          name: f.name || "photo.jpg",
          external: { url: f.type === "external" ? f.external?.url : f.file?.url || "" },
        })).filter((f: any) => f.external.url);

        const newFiles = body.photoUrls.map((url: string, i: number) => ({
          type: "external" as const,
          name: `defaut-${dateStr}-${i + 1}.jpg`,
          external: { url },
        }));

        properties["Photos - Défauts signalé"] = {
          files: [...mappedExisting, ...newFiles],
        };
      }

      await notion.pages.update({ page_id: body.projectId, properties });
      invalidateCache(`project-${body.projectId}`);
    } catch (err) {
      console.error("Notion defaut sync error:", err);
      // kv-store already saved as backup, continue
    }
  }

  return NextResponse.json({ success: true });
}

export async function PATCH(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const body = await request.json();
  const { id, status, comment } = body;
  const defauts = await getData<DefautRequest>(KEY);
  const idx = defauts.findIndex((d) => d.id === id);
  if (idx === -1) return NextResponse.json({ error: "Non trouvé" }, { status: 404 });

  if (comment) {
    if (!defauts[idx].comments) defauts[idx].comments = [];
    defauts[idx].comments.push({
      user: user.name,
      message: comment,
      timestamp: Date.now(),
    });
  }

  if (status) {
    defauts[idx].status = status;
  }

  await setData(KEY, defauts);
  return NextResponse.json({ success: true });
}
