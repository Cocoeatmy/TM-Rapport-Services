import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getData, setData } from "@/lib/kv-store";
import { notion } from "@/lib/notion";
import { invalidateCache } from "@/lib/server-cache";

interface PieceComment {
  user: string;
  message: string;
  timestamp: number;
}

interface PieceRequest {
  id: string;
  projectId: string;
  projectName: string;
  user: string;
  description: string;
  reference: string;
  photoUrl?: string;
  photoUrls?: string[];
  status: "demande" | "commande" | "recu";
  timestamp: number;
  comments: PieceComment[];
  cabineLabel?: string;
  /** Afficher cette pièce sur le rapport client (PDF). Absent/true = affichée. */
  displayInRapport?: boolean;
}

const KEY = "pieces";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const projectId = request.nextUrl.searchParams.get("projectId");
  const pieces = await getData<PieceRequest>(KEY);
  return NextResponse.json(projectId ? pieces.filter((p) => p.projectId === projectId) : pieces);
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const body = await request.json();
  const pieces = await getData<PieceRequest>(KEY);
  pieces.push({
    id: Math.random().toString(36).slice(2),
    ...body,
    user: user.name,
    status: "demande",
    timestamp: Date.now(),
    comments: [],
  });
  await setData(KEY, pieces);

  // Write to Notion project page (primary storage)
  if (body.projectId) {
    try {
      const now = new Date();
      const dateStr = `${String(now.getDate()).padStart(2, "0")}.${String(now.getMonth() + 1).padStart(2, "0")}.${now.getFullYear()}`;
      const summary = `Description: ${body.description || "-"} | Référence: ${body.reference || "-"} | Statut: demande | Par: ${user.name} | Date: ${dateStr}`;

      // Read existing text to append
      const page = await notion.pages.retrieve({ page_id: body.projectId });
      const existingText = (page as any).properties["Infos - Pièces manquantes"]?.rich_text?.map((t: any) => t.plain_text).join("") || "";
      const newText = existingText ? `${existingText}\n${summary}` : summary;

      const properties: any = {
        "Infos - Pièces manquantes": {
          rich_text: [{ text: { content: newText.slice(0, 2000) } }],
        },
      };

      // Add photos if present (support single photoUrl or array photoUrls)
      const newPhotoUrls: string[] = body.photoUrls?.length > 0
        ? body.photoUrls
        : body.photoUrl ? [body.photoUrl] : [];

      if (newPhotoUrls.length > 0) {
        // Colonne UNIFIÉE des photos de signalement (pièces + défauts).
        const existingFiles = (page as any).properties["Photos pour signalements"]?.files || [];
        const mappedExisting = existingFiles.map((f: any) => ({
          type: "external" as const,
          name: f.name || "photo.jpg",
          external: { url: f.type === "external" ? f.external?.url : f.file?.url || "" },
        })).filter((f: any) => f.external.url);

        properties["Photos pour signalements"] = {
          files: [
            ...mappedExisting,
            ...newPhotoUrls.map((url, i) => ({
              type: "external" as const,
              name: `piece-${dateStr}-${i + 1}.jpg`,
              external: { url },
            })),
          ],
        };
      }

      await notion.pages.update({ page_id: body.projectId, properties });
      invalidateCache(`project-${body.projectId}`);
    } catch (err) {
      console.error("Notion piece sync error:", err);
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

  const pieces = await getData<PieceRequest>(KEY);
  const piece = pieces.find((p) => p.id === id);
  const updated = pieces.filter((p) => p.id !== id);
  await setData(KEY, updated);

  // Rebuild Notion "Infos - Pièces manquantes" from remaining entries for this project
  if (piece?.projectId) {
    try {
      const remaining = updated.filter((p) => p.projectId === piece.projectId);
      const newText = remaining.map((p) => {
        const dateStr = p.timestamp
          ? new Date(p.timestamp).toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit", year: "numeric" })
          : "";
        return `Description: ${p.description || "-"} | Référence: ${p.reference || "-"} | Statut: ${p.status || "demande"} | Par: ${p.user} | Date: ${dateStr}`;
      }).join("\n");

      await notion.pages.update({
        page_id: piece.projectId,
        properties: {
          "Infos - Pièces manquantes": {
            rich_text: newText ? [{ text: { content: newText.slice(0, 2000) } }] : [],
          },
        },
      });
      invalidateCache(`project-${piece.projectId}`);
    } catch (err) {
      console.error("Notion piece delete sync error:", err);
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
  const { id, status, comment, description, reference, displayInRapport, cabineLabel } = body;
  const pieces = await getData<PieceRequest>(KEY);
  const idx = pieces.findIndex((p) => p.id === id);
  if (idx === -1) return NextResponse.json({ error: "Non trouvé" }, { status: 404 });

  if (comment) {
    if (!pieces[idx].comments) pieces[idx].comments = [];
    pieces[idx].comments.push({ user: user.name, message: comment, timestamp: Date.now() });
  }
  if (status) pieces[idx].status = status;
  if (typeof description === "string") pieces[idx].description = description;
  if (typeof reference === "string") pieces[idx].reference = reference;
  if (typeof displayInRapport === "boolean") pieces[idx].displayInRapport = displayInRapport;
  // Renommage d'une cabine : garde la pièce reliée au bon lot.
  if (typeof cabineLabel === "string" && cabineLabel.trim()) pieces[idx].cabineLabel = cabineLabel.trim();

  await setData(KEY, pieces);
  return NextResponse.json({ success: true });
}
