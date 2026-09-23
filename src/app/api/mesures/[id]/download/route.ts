/**
 * GET /api/mesures/[id]/download?cab=N[&s=<sig>]
 * Renvoie la mesure d'UNE cabine :
 *  - Duka : extrait à la volée les pages du lot depuis le PDF source (1 fichier).
 *  - Autres : renvoie le fichier entier rattaché à la cabine.
 * Accès : cookie d'auth (app) OU signature HMAC (lien public, ex. fiche).
 */
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { PDFDocument } from "pdf-lib";
import { getProject } from "@/lib/notion";
import { getDataFresh, getData } from "@/lib/kv-store";
import { verifyToken } from "@/lib/auth";
import { signMesure } from "@/lib/doc-link";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface MesureLot {
  projectId: string; cab: number; ref?: string; serie?: string;
  fileName: string; pageStart: number | null; pageEnd: number | null;
}

function asciiFilename(s: string): string {
  return (s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7E]/g, "").replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
}
async function isAuthed(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get("auth-token")?.value;
  if (!token) return false;
  try { return !!(await verifyToken(token)); } catch { return false; }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cab = parseInt(req.nextUrl.searchParams.get("cab") || "0", 10) || 0;
  const s = req.nextUrl.searchParams.get("s") || "";

  const secret = process.env.SHARE_LINK_KEY || "";
  const sigValid = (() => {
    if (!secret || !s || !cab) return false;
    const a = Buffer.from(s); const b = Buffer.from(signMesure(id, cab));
    return a.length === b.length && timingSafeEqual(a, b);
  })();
  if (!sigValid && !(await isAuthed(req))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!cab) return NextResponse.json({ error: "missing_cab" }, { status: 400 });

  try {
    const map = (await getDataFresh<MesureLot>("mesures-map").catch(() => getData<MesureLot>("mesures-map").catch(() => [] as MesureLot[])));
    const entry = map.find((e) => e.projectId === id && e.cab === cab);
    if (!entry) return NextResponse.json({ error: "not_found" }, { status: 404 });

    // URL fraîche du fichier source (les URLs Notion expirent → getProject refait la requête).
    const project = await getProject(id);
    const file = (project.documentsMontagee || []).find((f) => f.name === entry.fileName);
    if (!file) return NextResponse.json({ error: "file_missing" }, { status: 404 });

    const res = await fetch(file.url);
    if (!res.ok) return NextResponse.json({ error: "fetch_failed", status: res.status }, { status: 502 });
    const srcBuf = Buffer.from(await res.arrayBuffer());

    const cabName = (() => {
      const re = new RegExp(`Cab${cab}\\s*:\\s*([^|]*)`);
      const m = (project.nomsCabines || "").match(re);
      return (m && m[1].trim()) || entry.ref || `Cabine ${cab}`;
    })();
    const outName = asciiFilename(`Mesure - ${cabName}`) + ".pdf";

    // Fichier entier (cas « 1 mesure / lot »).
    if (entry.pageStart == null || entry.pageEnd == null) {
      return new NextResponse(srcBuf, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${outName}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    // Extraction des pages du lot (Duka).
    const src = await PDFDocument.load(srcBuf, { ignoreEncryption: true });
    const out = await PDFDocument.create();
    const last = src.getPageCount();
    const from = Math.max(1, entry.pageStart);
    const to = Math.min(last, entry.pageEnd);
    const indices: number[] = [];
    for (let p = from; p <= to; p++) indices.push(p - 1);
    const copied = await out.copyPages(src, indices);
    copied.forEach((pg) => out.addPage(pg));
    const bytes = await out.save();

    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${outName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: "server_error", message: String(err?.message || err) }, { status: 500 });
  }
}
