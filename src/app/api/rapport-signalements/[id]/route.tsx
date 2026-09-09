/**
 * /api/rapport-signalements/[id]         → PDF « Rapport des signalements »
 * /api/rapport-signalements/[id]?s=<sig> → PDF public (signé, signSignalements)
 * /api/rapport-signalements/[id]?link=1  → JSON { url } (cookie admin requis)
 * /api/rapport-signalements/[id]?all=1   → inclut TOUS les signalements (même « Ne pas afficher »)
 *
 * Regroupe pièces manquantes + défauts + constats avant intervention par lot,
 * coloriés par type (pièce orange, défaut rouge, constat indigo, réglé vert),
 * avec photos. Par défaut on n'inclut que les signalements « Sur rapport »
 * (displayInRapport !== false) — la case « Ne pas afficher » sert de sélection.
 */
import { NextRequest, NextResponse } from "next/server";
import { getProject } from "@/lib/notion";
import { getDataFresh, getData } from "@/lib/kv-store";
import { LOGO_BASE64 } from "@/lib/logo";
import { verifyToken } from "@/lib/auth";
import { signSignalements } from "@/lib/doc-link";
import { formatSwissDate } from "@/lib/time-utils";
import { timingSafeEqual } from "crypto";
import ReactPDF, {
  Document, Page, Text, View, Image, Link, StyleSheet,
} from "@react-pdf/renderer";
import React from "react";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Piece = { id: string; projectId: string; description?: string; reference?: string; status?: string; cabineLabel?: string; displayInRapport?: boolean; photoUrls?: string[]; photoUrl?: string; user?: string; timestamp?: number };
type Defaut = { id: string; projectId: string; typesLabel?: string; types?: string[]; description?: string; cabineLabel?: string; resolved?: boolean; phase?: string; displayInRapport?: boolean; photoUrls?: string[]; user?: string; timestamp?: number };

function nfc(s: string) { return (s || "").normalize("NFC"); }
function fmtDate(ts?: number) { try { return ts ? formatSwissDate(new Date(ts).toISOString()) : ""; } catch { return ""; } }
function previewUrl(u: string) {
  if (u && u.includes("res.cloudinary.com") && u.includes("/upload/")) return u.replace("/upload/", "/upload/w_600,q_60,f_jpg/");
  return u;
}
const PIECE_STATUS: Record<string, string> = { demande: "à commander", commande: "commandée", recu: "reçue" };

const C = {
  piece: "#ea580c", defaut: "#dc2626", avant: "#4f46e5", done: "#15803d", navy: "#1e3a5f",
};

const styles = StyleSheet.create({
  page: { padding: 36, paddingBottom: 50, fontFamily: "Helvetica", fontSize: 10, color: "#1a1a1a" },
  header: { flexDirection: "column", marginBottom: 12, paddingBottom: 6, borderBottomWidth: 2, borderBottomColor: "#1e3a5f" },
  title: { fontSize: 19, fontFamily: "Helvetica-Bold", color: "#1e3a5f", marginTop: 8 },
  tm: { fontSize: 14, fontFamily: "Helvetica-Bold", color: "#1e3a5f", marginTop: 5 },
  subtitle: { fontSize: 10, color: "#666", marginTop: 2 },
  lot: { fontSize: 12, fontFamily: "Helvetica-Bold", color: "#1e3a5f", marginTop: 10, marginBottom: 4, paddingBottom: 3, borderBottomWidth: 1, borderBottomColor: "#e0e0e0" },
  card: { borderWidth: 1, borderRadius: 5, padding: 8, marginBottom: 8 },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 3 },
  cardTitle: { fontSize: 10.5, fontFamily: "Helvetica-Bold" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginBottom: 3 },
  chip: { fontSize: 7.5, paddingVertical: 1.5, paddingHorizontal: 4, borderRadius: 3 },
  desc: { fontSize: 9, color: "#333", marginBottom: 3, lineHeight: 1.35 },
  meta: { fontSize: 7.5, color: "#999", marginBottom: 3 },
  photoRow: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  photo: { width: 120, height: 90, borderRadius: 4, objectFit: "cover" },
  footer: { position: "absolute", bottom: 24, left: 36, right: 36, textAlign: "center", fontSize: 7, color: "#999", borderTopWidth: 0.5, borderTopColor: "#ddd", paddingTop: 6 },
});

type Item = {
  kind: "piece" | "defaut" | "avant";
  title: string; color: string; bg: string; chips: string[]; chipColor: string;
  desc: string; reference?: string; status?: string; resolved?: boolean;
  cabineLabel: string; user: string; date: string; photos: string[];
};

function SignalementsPDF({ project, items }: { project: any; items: Item[] }) {
  // Regroupement par lot.
  const groups = new Map<string, Item[]>();
  for (const it of items) {
    const lot = it.cabineLabel || "Général";
    if (!groups.has(lot)) groups.set(lot, []);
    groups.get(lot)!.push(it);
  }
  const lots = [...groups.keys()].sort((a, b) => a.localeCompare(b, "fr", { numeric: true, sensitivity: "base" }));

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Image src={LOGO_BASE64} style={{ width: 180, height: 27 }} />
          <Text style={styles.title}>Rapport des signalements</Text>
          <Text style={styles.tm}>{project.ofrTM || "TM-—"}</Text>
          {project.projet ? <Text style={styles.subtitle}>{nfc(project.projet)}</Text> : null}
          <Text style={styles.subtitle}>{items.length} signalement{items.length > 1 ? "s" : ""}</Text>
        </View>

        {items.length === 0 ? (
          <Text style={{ fontSize: 11, color: "#888" }}>Aucun signalement à afficher.</Text>
        ) : lots.map((lot) => (
          <View key={lot}>
            <Text style={styles.lot}>{nfc(lot)}</Text>
            {groups.get(lot)!.map((it, i) => (
              <View key={i} style={{ ...styles.card, borderColor: it.color, backgroundColor: it.bg }} wrap={false}>
                <View style={styles.cardHead}>
                  <Text style={{ ...styles.cardTitle, color: it.color }}>{it.title}</Text>
                  {it.status ? <Text style={{ fontSize: 8, color: it.color }}>{it.status}</Text> : null}
                  {it.resolved ? <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: C.done }}>Réglé ✓</Text> : null}
                </View>
                {it.chips.length > 0 ? (
                  <View style={styles.chipRow}>
                    {it.chips.map((c, j) => (
                      <Text key={j} style={{ ...styles.chip, backgroundColor: "#ffffff", color: it.chipColor, borderWidth: 0.5, borderColor: it.chipColor }}>{nfc(c)}</Text>
                    ))}
                  </View>
                ) : null}
                {it.reference ? <Text style={{ ...styles.desc, color: "#555" }}>Réf. : {nfc(it.reference)}</Text> : null}
                {it.desc ? <Text style={styles.desc}>{nfc(it.desc)}</Text> : null}
                <Text style={styles.meta}>{[it.user, it.date].filter(Boolean).join(" · ")}</Text>
                {it.photos.length > 0 ? (
                  <View style={styles.photoRow}>
                    {it.photos.map((url, j) => (
                      <Link key={j} src={url}><Image src={previewUrl(url)} style={styles.photo} /></Link>
                    ))}
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        ))}

        <Text style={styles.footer} fixed>
          TM Douche Montage | Champs-Lovat 13 Box n°16, 1400 Yverdon | Tél : +41 79 555 24 74 | www.douche-montage.ch
        </Text>
      </Page>
    </Document>
  );
}

function asciiFilename(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7E]/g, "").replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
}

async function isAuthed(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get("auth-token")?.value;
  if (!token) return false;
  try { return !!(await verifyToken(token)); } catch { return false; }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sp = req.nextUrl.searchParams;
  const s = sp.get("s") || "";
  const wantLink = sp.get("link") === "1";
  const includeAll = sp.get("all") === "1";
  const secret = process.env.SHARE_LINK_KEY || "";

  const sigValid = (() => {
    if (!secret || !s) return false;
    const a = Buffer.from(s); const b = Buffer.from(signSignalements(id));
    return a.length === b.length && timingSafeEqual(a, b);
  })();
  const authed = await isAuthed(req);

  if (wantLink) {
    if (!authed) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (!secret) return NextResponse.json({ error: "SHARE_LINK_KEY non configuré" }, { status: 503 });
    const q = includeAll ? `?s=${signSignalements(id)}&all=1` : `?s=${signSignalements(id)}`;
    return NextResponse.json({ url: `${req.nextUrl.origin}/api/rapport-signalements/${encodeURIComponent(id)}${q}` });
  }
  if (!sigValid && !authed) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    const project = await getProject(id);
    const [allPieces, allDefauts] = await Promise.all([
      getDataFresh<Piece>("pieces").catch(() => getData<Piece>("pieces").catch(() => [] as Piece[])),
      getDataFresh<Defaut>("defauts").catch(() => getData<Defaut>("defauts").catch(() => [] as Defaut[])),
    ]);
    const keep = (x: { displayInRapport?: boolean }) => includeAll || x.displayInRapport !== false;
    const pieces = allPieces.filter((p) => p.projectId === id && keep(p));
    const defauts = allDefauts.filter((d) => d.projectId === id && keep(d));

    const items: Item[] = [];
    for (const p of pieces) {
      const photos = (p.photoUrls && p.photoUrls.length > 0) ? p.photoUrls : (p.photoUrl ? [p.photoUrl] : []);
      items.push({
        kind: "piece", title: "Pièce manquante", color: C.piece, bg: "#fff7ed",
        chips: [], chipColor: C.piece,
        desc: p.description || "", reference: p.reference || "",
        status: PIECE_STATUS[p.status || ""] || "",
        cabineLabel: p.cabineLabel || "", user: p.user || "", date: fmtDate(p.timestamp), photos,
      });
    }
    for (const d of defauts) {
      const avant = d.phase === "avant-intervention";
      const color = d.resolved ? C.done : (avant ? C.avant : C.defaut);
      const chips = (d.types && d.types.length > 0) ? d.types : (d.typesLabel || "").split(",").map((x) => x.trim()).filter(Boolean);
      items.push({
        kind: avant ? "avant" : "defaut",
        title: avant ? "Constat avant intervention" : "Défaut",
        color, bg: d.resolved ? "#f0fdf4" : (avant ? "#eef2ff" : "#fef2f2"),
        chips, chipColor: color,
        desc: d.description || "", resolved: !!d.resolved,
        cabineLabel: d.cabineLabel || "", user: d.user || "", date: fmtDate(d.timestamp), photos: d.photoUrls || [],
      });
    }

    const pdfStream = await ReactPDF.renderToStream(<SignalementsPDF project={project} items={items} />);
    const chunks: Buffer[] = [];
    // @ts-ignore - ReadableStream from react-pdf
    for await (const chunk of pdfStream) chunks.push(Buffer.from(chunk));
    const buffer = Buffer.concat(chunks);

    const ofr = asciiFilename((project.ofrTM || "").replace(/-/g, " "));
    const filename = asciiFilename(`Rapport signalements - ${ofr} - ${project.projet || ""}`) + ".pdf";
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
