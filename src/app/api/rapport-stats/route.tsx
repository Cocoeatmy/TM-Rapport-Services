/**
 * /api/rapport-stats  (POST) → PDF « Rapport statistique »
 *
 * Rapport d'activité de niveau direction : indicateurs clés, répartition,
 * évolution mensuelle avec graphiques, chiffre d'affaires et comparaison entre
 * les mois sélectionnés à l'écran.
 *
 * Le client envoie les données mensuelles DÉJÀ agrégées et filtrées (mêmes
 * chiffres qu'à l'écran) ; le document recalcule ses totaux à partir de ces
 * mois, de sorte qu'un indicateur ne puisse jamais contredire son tableau.
 * Accès réservé aux utilisateurs authentifiés (cookie), aucun lien public.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import ReactPDF from "@react-pdf/renderer";
import React from "react";
import { RapportStatsPDF, type Payload } from "@/lib/pdf/rapport-stats-doc";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function asciiFilename(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7E]/g, "").replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
}

async function isAuthed(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get("auth-token")?.value;
  if (!token) return false;
  try { return !!(await verifyToken(token)); } catch { return false; }
}

export async function POST(req: NextRequest) {
  if (!(await isAuthed(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const data: Payload = await req.json();
    const pdfStream = await ReactPDF.renderToStream(<RapportStatsPDF data={data} />);
    const chunks: Buffer[] = [];
    // @ts-ignore - ReadableStream from react-pdf
    for await (const chunk of pdfStream) chunks.push(Buffer.from(chunk));
    const buffer = Buffer.concat(chunks);
    const filename = asciiFilename(`Rapport statistique - ${data.periodLabel || "Tout"}`) + ".pdf";
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: "server_error", message: String(err?.message || err) }, { status: 500 });
  }
}
