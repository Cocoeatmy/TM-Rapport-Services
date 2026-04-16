import { NextResponse } from "next/server";
import { getProjects, getAllActiveProjects } from "@/lib/notion";

export const revalidate = 120;

interface PieceItem {
  id: string;
  projectId: string;
  projectName: string;
  user: string;
  description: string;
  reference: string;
  photoUrl: string;
  status: string;
  timestamp: number;
}

interface DefautItem {
  id: string;
  projectId: string;
  projectName: string;
  user: string;
  types: string[];
  typesLabel: string;
  description: string;
  photoUrls: string[];
  status: string;
  timestamp: number;
}

function parsePiecesFromText(text: string, projectId: string, projectName: string, photos: { name: string; url: string }[]): PieceItem[] {
  if (!text) return [];
  return text.split("\n").filter(Boolean).map((line, i) => {
    // Parse: "Description: X | Référence: Y | Statut: demande | Par: User | Date: DD.MM.YYYY"
    const parts: Record<string, string> = {};
    line.split("|").forEach((p) => {
      const [key, ...val] = p.split(":");
      if (key && val.length) parts[key.trim()] = val.join(":").trim();
    });
    return {
      id: `${projectId}-piece-${i}`,
      projectId,
      projectName,
      user: parts["Par"] || "",
      description: parts["Description"] || line,
      reference: parts["Référence"] || parts["Reference"] || "",
      photoUrl: photos[i]?.url || "",
      status: (parts["Statut"] || "demande").toLowerCase(),
      timestamp: parts["Date"] ? new Date(parts["Date"].split(".").reverse().join("-")).getTime() : Date.now(),
    };
  });
}

function parseDefautsFromText(text: string, projectId: string, projectName: string, photos: { name: string; url: string }[]): DefautItem[] {
  if (!text) return [];
  return text.split("\n").filter(Boolean).map((line, i) => {
    const parts: Record<string, string> = {};
    line.split("|").forEach((p) => {
      const [key, ...val] = p.split(":");
      if (key && val.length) parts[key.trim()] = val.join(":").trim();
    });
    const types = (parts["Types"] || "").split(",").map((t) => t.trim()).filter(Boolean);
    return {
      id: `${projectId}-defaut-${i}`,
      projectId,
      projectName,
      user: parts["Par"] || "",
      types,
      typesLabel: types.join(", "),
      description: parts["Description"] || line,
      photoUrls: photos.map((p) => p.url),
      status: (parts["Statut"] || "signale").toLowerCase(),
      timestamp: parts["Date"] ? new Date(parts["Date"].split(".").reverse().join("-")).getTime() : Date.now(),
    };
  });
}

export async function GET() {
  try {
    // Get all active projects
    const projects = await getAllActiveProjects();

    const allPieces: PieceItem[] = [];
    const allDefauts: DefautItem[] = [];

    for (const p of projects) {
      if (p.infoPiecesManquantes) {
        allPieces.push(...parsePiecesFromText(
          p.infoPiecesManquantes, p.id, p.projet, p.photosPiecesManquantes || []
        ));
      }
      if (p.infoDefautsSignale) {
        allDefauts.push(...parseDefautsFromText(
          p.infoDefautsSignale, p.id, p.projet, p.photosDefautsSignale || []
        ));
      }
    }

    // Sort by most recent first
    allPieces.sort((a, b) => b.timestamp - a.timestamp);
    allDefauts.sort((a, b) => b.timestamp - a.timestamp);

    return NextResponse.json({ pieces: allPieces, defauts: allDefauts });
  } catch (error: any) {
    console.error("Signalements error:", error);
    return NextResponse.json({ pieces: [], defauts: [] });
  }
}
