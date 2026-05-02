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
  // Indique si le défaut doit apparaître dans le rapport PDF envoyé
  // au client. Par défaut true (rétro-compat : les anciens défauts
  // sans ce champ sont traités comme "à afficher").
  displayInRapport?: boolean;
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
    // Si le client n'a pas envoyé le flag, on considère que oui (par défaut
    // on affiche dans le rapport, c'est le comportement attendu).
    displayInRapport: body.displayInRapport !== false,
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

export async function DELETE(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });

  const defauts = await getData<DefautRequest>(KEY);
  const defaut = defauts.find((d) => d.id === id);
  const updated = defauts.filter((d) => d.id !== id);
  await setData(KEY, updated);

  // Rebuild the Notion "Infos - Défauts signalé" field from remaining KV entries for this project
  if (defaut?.projectId) {
    try {
      const remaining = updated.filter((d) => d.projectId === defaut.projectId);
      const newText = remaining.map((d) => {
        const typesStr = d.types?.join(", ") || d.typesLabel || "-";
        return `Types: ${typesStr} | Description: ${d.description || "-"} | Par: ${d.user} | Date: ${d.timestamp ? new Date(d.timestamp).toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit", year: "numeric" }) : ""}`;
      }).join("\n");

      await notion.pages.update({
        page_id: defaut.projectId,
        properties: {
          "Infos - Défauts signalé": {
            rich_text: newText ? [{ text: { content: newText.slice(0, 2000) } }] : [],
          },
        },
      });
      invalidateCache(`project-${defaut.projectId}`);
    } catch (err) {
      console.error("Notion defaut delete sync error:", err);
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
  const { id, status, comment, displayInRapport, description } = body;
  const defauts = await getData<DefautRequest>(KEY);
  const idx = defauts.findIndex((d) => d.id === id);
  if (idx === -1) return NextResponse.json({ error: "Non trouvé" }, { status: 404 });

  if (comment) {
    if (!defauts[idx].comments) defauts[idx].comments = [];
    defauts[idx].comments.push({ user: user.name, message: comment, timestamp: Date.now() });
  }
  if (status) defauts[idx].status = status;
  if (typeof displayInRapport === "boolean") defauts[idx].displayInRapport = displayInRapport;
  if (typeof description === "string") defauts[idx].description = description;

  await setData(KEY, defauts);
  return NextResponse.json({ success: true });
}
