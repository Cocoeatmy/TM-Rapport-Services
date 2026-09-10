/**
 * /api/rapport-fournisseurs  (POST) → PDF « Rapport fournisseur »
 *
 * Génère un tableau des projets ACTUELLEMENT FILTRÉS dans la vue Fournisseurs
 * (fournisseur + type d'activité + période + statut). Sert au pointage des
 * factures (ex. tous les montages Duka de juillet).
 *
 * Le client envoie la liste déjà filtrée (rows) + les métadonnées d'en-tête :
 * on ne recalcule RIEN côté serveur, le PDF colle donc exactement à l'écran.
 * Accès réservé aux utilisateurs authentifiés (cookie), aucun lien public.
 */
import { NextRequest, NextResponse } from "next/server";
import { LOGO_BASE64 } from "@/lib/logo";
import { verifyToken } from "@/lib/auth";
import ReactPDF, {
  Document, Page, Text, View, Image, StyleSheet,
} from "@react-pdf/renderer";
import React from "react";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function nfc(s: unknown) { return String(s ?? "").normalize("NFC"); }
function asciiFilename(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7E]/g, "").replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
}
async function isAuthed(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get("auth-token")?.value;
  if (!token) return false;
  try { return !!(await verifyToken(token)); } catch { return false; }
}

type Row = {
  projet?: string;
  ofrTM?: string;
  cmd?: string;        // N° CMD Fournisseurs
  mesures?: string;    // N° CMD Mesures Fournisseurs
  services?: string;   // N° CMD Services Fournisseurs
  date?: string;       // déjà formatée (JJ.MM.AAAA) ou ""
  nbCabines?: number;
  etat?: string;
  collaborateurs?: string;
};
type Payload = {
  title?: string;         // Titre du rapport (défaut "Rapport fournisseur")
  familleLabel?: string;  // Libellé de l'en-tête famille (défaut "Fournisseur")
  fournisseur?: string;   // "Duka.ch" | "Tous" | ...
  typeLabel?: string;     // "Montage" | "Mesures" | "Services" | "SAV" | "Tous"
  periodLabel?: string;   // "Août 2026" | "Tout" | ...
  statusLabel?: string;   // filtre de statut éventuel
  rows?: Row[];
};

const styles = StyleSheet.create({
  page: { padding: 32, paddingBottom: 46, fontFamily: "Helvetica", fontSize: 9, color: "#1a1a1a" },
  header: { flexDirection: "column", marginBottom: 12, paddingBottom: 6, borderBottomWidth: 2, borderBottomColor: "#1e3a5f" },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold", color: "#1e3a5f", marginTop: 8 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 6 },
  metaCell: { marginRight: 18, marginBottom: 2 },
  metaLabel: { fontSize: 7, color: "#888" },
  metaValue: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#1a1a1a" },
  thead: { flexDirection: "row", backgroundColor: "#1e3a5f", borderRadius: 3, paddingVertical: 4, paddingHorizontal: 4, marginTop: 4 },
  th: { color: "#fff", fontSize: 8, fontFamily: "Helvetica-Bold" },
  tr: { flexDirection: "row", paddingVertical: 4, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: "#e5e7eb", alignItems: "flex-start" },
  td: { fontSize: 8.5, color: "#222" },
  cNum: { width: 20 },
  cProjet: { flex: 1, paddingRight: 6 },
  cOfr: { width: 78, paddingRight: 4 },
  cRef: { width: 104, paddingRight: 4 },
  cDate: { width: 52, paddingRight: 4 },
  cCab: { width: 24, textAlign: "right", paddingRight: 4 },
  cEtat: { width: 84 },
  refLine: { fontSize: 8, color: "#222" },
  refPrefix: { color: "#8a94a3", fontFamily: "Helvetica-Bold" },
  chip: { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#1e3a5f", backgroundColor: "#eef2f7", borderRadius: 3, paddingVertical: 1.5, paddingHorizontal: 4, alignSelf: "flex-start" },
  totalRow: { flexDirection: "row", marginTop: 8, paddingTop: 6, borderTopWidth: 1.5, borderTopColor: "#1e3a5f" },
  totalTxt: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#1e3a5f" },
  footer: { position: "absolute", bottom: 22, left: 32, right: 32, textAlign: "center", fontSize: 7, color: "#999", borderTopWidth: 0.5, borderTopColor: "#ddd", paddingTop: 5 },
});

function RapportFournisseursPDF({ data }: { data: Payload }) {
  const rows = data.rows || [];
  const totalCab = rows.reduce((s, r) => s + (Number(r.nbCabines) || 0), 0);
  const generatedAt = new Date().toLocaleDateString("fr-CH", { day: "2-digit", month: "long", year: "numeric" });
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header} fixed>
          <Image src={LOGO_BASE64} style={{ width: 170, height: 26 }} />
          <Text style={styles.title}>{nfc(data.title || "Rapport fournisseur")}</Text>
          <View style={styles.metaRow}>
            <View style={styles.metaCell}>
              <Text style={styles.metaLabel}>{nfc(data.familleLabel || "Fournisseur")}</Text>
              <Text style={styles.metaValue}>{nfc(data.fournisseur || "Tous")}</Text>
            </View>
            <View style={styles.metaCell}>
              <Text style={styles.metaLabel}>Type</Text>
              <Text style={styles.metaValue}>{nfc(data.typeLabel || "Tous")}</Text>
            </View>
            <View style={styles.metaCell}>
              <Text style={styles.metaLabel}>Période</Text>
              <Text style={styles.metaValue}>{nfc(data.periodLabel || "Tout")}</Text>
            </View>
            {data.statusLabel ? (
              <View style={styles.metaCell}>
                <Text style={styles.metaLabel}>Statut</Text>
                <Text style={styles.metaValue}>{nfc(data.statusLabel)}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* En-tête de tableau (répété à chaque page) */}
        <View style={styles.thead} fixed>
          <Text style={[styles.th, styles.cNum]}>#</Text>
          <Text style={[styles.th, styles.cProjet]}>Projet</Text>
          <Text style={[styles.th, styles.cOfr]}>OFR</Text>
          <Text style={[styles.th, styles.cRef]}>N° Fournisseurs</Text>
          <Text style={[styles.th, styles.cDate]}>Date</Text>
          <Text style={[styles.th, styles.cCab]}>Cab.</Text>
          <Text style={[styles.th, styles.cEtat]}>État</Text>
        </View>

        {rows.map((r, i) => (
          <View key={i} style={[styles.tr, i % 2 ? { backgroundColor: "#f7f9fc" } : {}]} wrap={false}>
            <Text style={[styles.td, styles.cNum]}>{i + 1}</Text>
            <Text style={[styles.td, styles.cProjet]}>{nfc(r.projet || "—")}</Text>
            <Text style={[styles.td, styles.cOfr]}>{nfc(r.ofrTM || "")}</Text>
            <View style={styles.cRef}>
              {r.cmd ? <Text style={styles.refLine}><Text style={styles.refPrefix}>CMD </Text>{nfc(r.cmd)}</Text> : null}
              {r.mesures ? <Text style={styles.refLine}><Text style={styles.refPrefix}>Mes. </Text>{nfc(r.mesures)}</Text> : null}
              {r.services ? <Text style={styles.refLine}><Text style={styles.refPrefix}>Serv. </Text>{nfc(r.services)}</Text> : null}
            </View>
            <Text style={[styles.td, styles.cDate]}>{nfc(r.date || "—")}</Text>
            <Text style={[styles.td, styles.cCab]}>{r.nbCabines ? String(r.nbCabines) : ""}</Text>
            <View style={styles.cEtat}>{r.etat ? <Text style={styles.chip}>{nfc(r.etat)}</Text> : null}</View>
          </View>
        ))}

        {rows.length === 0 ? (
          <Text style={{ fontSize: 10, color: "#888", marginTop: 16, textAlign: "center" }}>Aucun projet pour ce filtre.</Text>
        ) : (
          <View style={styles.totalRow}>
            <Text style={[styles.totalTxt, styles.cNum]}> </Text>
            <Text style={[styles.totalTxt, styles.cProjet]}>Total : {rows.length} projet{rows.length !== 1 ? "s" : ""}</Text>
            <Text style={[styles.totalTxt, styles.cOfr]}> </Text>
            <Text style={[styles.totalTxt, styles.cRef]}> </Text>
            <Text style={[styles.totalTxt, styles.cDate]}> </Text>
            <Text style={[styles.totalTxt, styles.cCab]}>{totalCab || ""}</Text>
            <Text style={[styles.totalTxt, styles.cEtat]}> cab.</Text>
          </View>
        )}

        <Text style={styles.footer} fixed
          render={({ pageNumber, totalPages }) => `TM Rapport · Généré le ${generatedAt} · Page ${pageNumber}/${totalPages}`} />
      </Page>
    </Document>
  );
}

export async function POST(req: NextRequest) {
  if (!(await isAuthed(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const data: Payload = await req.json();
    const pdfStream = await ReactPDF.renderToStream(<RapportFournisseursPDF data={data} />);
    const chunks: Buffer[] = [];
    // @ts-ignore - ReadableStream from react-pdf
    for await (const chunk of pdfStream) chunks.push(Buffer.from(chunk));
    const buffer = Buffer.concat(chunks);

    const parts = [data.fournisseur, data.typeLabel, data.periodLabel].filter(Boolean).join(" - ");
    const filename = asciiFilename(`${data.title || "Rapport fournisseur"} - ${parts}`) + ".pdf";
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
