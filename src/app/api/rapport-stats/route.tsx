/**
 * /api/rapport-stats  (POST) → PDF « Rapport statistique »
 *
 * Rapport d'activité de niveau direction : indicateurs clés, évolution
 * mensuelle, part de chaque activité, et comparaison entre les mois
 * sélectionnés à l'écran.
 *
 * Le client envoie les données DÉJÀ agrégées et filtrées (mêmes chiffres qu'à
 * l'écran) : on ne recalcule rien côté serveur. Accès réservé aux utilisateurs
 * authentifiés (cookie), aucun lien public.
 *
 * Charte identique aux autres rapports : logo, filet bleu #1e3a5f, en-têtes de
 * tableau bleus répétés, lignes zébrées, pied de page paginé.
 */
import { NextRequest, NextResponse } from "next/server";
import { LOGO_BASE64 } from "@/lib/logo";
import { verifyToken } from "@/lib/auth";
import ReactPDF, { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import React from "react";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const BRAND = "#1e3a5f";

function nfc(s: unknown) { return String(s ?? "").normalize("NFC"); }
function asciiFilename(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7E]/g, "").replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
}
function num(n: unknown): number { const v = Number(n); return Number.isFinite(v) ? v : 0; }
function fmt(n: number): string { return Math.round(n).toLocaleString("fr-CH").replace(/ | /g, "'"); }
function pct(a: number, b: number): string {
  if (a === 0) return b === 0 ? "0%" : "—";
  const p = ((b - a) / a) * 100;
  return `${p > 0 ? "+" : ""}${Math.round(p)}%`;
}
async function isAuthed(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get("auth-token")?.value;
  if (!token) return false;
  try { return !!(await verifyToken(token)); } catch { return false; }
}

type SerieId = "montages" | "cabines" | "mesures" | "services" | "sav" | "demontages" | "ofr" | "ca";
type MonthRow = { label: string } & Partial<Record<SerieId, number>>;
type Payload = {
  periodLabel?: string;
  months?: MonthRow[];          // dans l'ordre chronologique
  totals?: Partial<Record<SerieId, number>>;
  series?: SerieId[];           // séries visibles à l'écran
  comparedLabels?: string[];    // mois épinglés (comparaison)
  generatedBy?: string;
};

const LABELS: Record<SerieId, string> = {
  montages: "Montages", cabines: "Cabines mesurées", mesures: "Mesures",
  services: "Services", sav: "SAV", demontages: "Démontages",
  ofr: "Offres (OFR)", ca: "Chiffre d'affaires",
};
const ORDER: SerieId[] = ["montages", "cabines", "mesures", "services", "sav", "demontages", "ofr", "ca"];

const s = StyleSheet.create({
  page: { padding: 32, paddingBottom: 46, fontFamily: "Helvetica", fontSize: 9, color: "#1a1a1a" },
  header: { flexDirection: "column", marginBottom: 14, paddingBottom: 6, borderBottomWidth: 2, borderBottomColor: BRAND },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold", color: BRAND, marginTop: 8 },
  subtitle: { fontSize: 9, color: "#6b7280", marginTop: 3 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 7 },
  metaCell: { marginRight: 20, marginBottom: 2 },
  metaLabel: { fontSize: 7, color: "#888" },
  metaValue: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#1a1a1a" },

  sectionTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", color: BRAND, marginTop: 14, marginBottom: 7, paddingBottom: 3, borderBottomWidth: 0.7, borderBottomColor: "#dbe2ec" },

  kpiGrid: { flexDirection: "row", flexWrap: "wrap" },
  kpi: { width: "25%", paddingRight: 8, marginBottom: 9 },
  kpiBox: { borderWidth: 0.7, borderColor: "#dbe2ec", borderRadius: 4, paddingVertical: 7, paddingHorizontal: 9, backgroundColor: "#f8fafc" },
  kpiLabel: { fontSize: 7, color: "#6b7280" },
  kpiValue: { fontSize: 16, fontFamily: "Helvetica-Bold", color: BRAND, marginTop: 2 },

  thead: { flexDirection: "row", backgroundColor: BRAND, borderRadius: 3, paddingVertical: 4, paddingHorizontal: 4 },
  th: { color: "#fff", fontSize: 8, fontFamily: "Helvetica-Bold" },
  tr: { flexDirection: "row", paddingVertical: 4, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: "#e5e7eb" },
  td: { fontSize: 8.5, color: "#222" },
  cMonth: { width: 74 },
  cVal: { flex: 1, textAlign: "right", paddingLeft: 4 },
  totalRow: { flexDirection: "row", marginTop: 2, paddingVertical: 5, paddingHorizontal: 4, borderTopWidth: 1.5, borderTopColor: BRAND },
  totalTxt: { fontSize: 9, fontFamily: "Helvetica-Bold", color: BRAND },

  barRow: { flexDirection: "row", alignItems: "center", marginBottom: 5 },
  barLabel: { width: 96, fontSize: 8.5, color: "#222" },
  barTrack: { flex: 1, height: 9, backgroundColor: "#eef2f7", borderRadius: 2, marginRight: 6 },
  barFill: { height: 9, backgroundColor: BRAND, borderRadius: 2 },
  barValue: { width: 54, textAlign: "right", fontSize: 8.5, fontFamily: "Helvetica-Bold", color: "#222" },

  note: { fontSize: 7.5, color: "#8a94a3", marginTop: 10, lineHeight: 1.4 },
  footer: { position: "absolute", bottom: 22, left: 32, right: 32, textAlign: "center", fontSize: 7, color: "#999", borderTopWidth: 0.5, borderTopColor: "#ddd", paddingTop: 5 },
});

function RapportStatsPDF({ data }: { data: Payload }) {
  const months = (data.months || []).filter(Boolean);
  const series = (data.series && data.series.length ? data.series : ORDER).filter((k) => ORDER.includes(k));
  const totals = data.totals || {};
  const generatedAt = new Date().toLocaleDateString("fr-CH", { day: "2-digit", month: "long", year: "numeric" });

  // Colonnes du tableau mensuel : on borne à 6 séries pour rester lisible.
  const cols = series.filter((k) => k !== "ca").slice(0, 6);
  const maxTotal = Math.max(1, ...cols.map((k) => num(totals[k])));

  const first = months[0];
  const last = months[months.length - 1];
  const showCompare = months.length >= 2;

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.header} fixed>
          <Image src={LOGO_BASE64} style={{ width: 170, height: 26 }} />
          <Text style={s.title}>Rapport statistique</Text>
          <Text style={s.subtitle}>Analyse de l&apos;activité — montages, mesures, services et service après-vente</Text>
          <View style={s.metaRow}>
            <View style={s.metaCell}>
              <Text style={s.metaLabel}>Période</Text>
              <Text style={s.metaValue}>{nfc(data.periodLabel || "Tout")}</Text>
            </View>
            <View style={s.metaCell}>
              <Text style={s.metaLabel}>Mois couverts</Text>
              <Text style={s.metaValue}>{months.length || "—"}</Text>
            </View>
            {data.comparedLabels && data.comparedLabels.length > 0 ? (
              <View style={s.metaCell}>
                <Text style={s.metaLabel}>Mois comparés</Text>
                <Text style={s.metaValue}>{nfc(data.comparedLabels.join(" · "))}</Text>
              </View>
            ) : null}
            <View style={s.metaCell}>
              <Text style={s.metaLabel}>Établi le</Text>
              <Text style={s.metaValue}>{generatedAt}</Text>
            </View>
          </View>
        </View>

        {/* 1 — Indicateurs clés */}
        <Text style={s.sectionTitle}>1. Indicateurs clés de la période</Text>
        <View style={s.kpiGrid}>
          {ORDER.filter((k) => series.includes(k) || k === "ca").map((k) => (
            <View key={k} style={s.kpi}>
              <View style={s.kpiBox}>
                <Text style={s.kpiLabel}>{nfc(LABELS[k])}</Text>
                <Text style={s.kpiValue}>
                  {k === "ca" ? `${fmt(num(totals.ca))} CHF` : fmt(num(totals[k]))}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* 2 — Répartition */}
        <Text style={s.sectionTitle}>2. Répartition de l&apos;activité</Text>
        {cols.map((k) => {
          const v = num(totals[k]);
          return (
            <View key={k} style={s.barRow} wrap={false}>
              <Text style={s.barLabel}>{nfc(LABELS[k])}</Text>
              <View style={s.barTrack}>
                <View style={[s.barFill, { width: `${Math.round((v / maxTotal) * 100)}%` }]} />
              </View>
              <Text style={s.barValue}>{fmt(v)}</Text>
            </View>
          );
        })}

        {/* 3 — Évolution mensuelle */}
        <Text style={s.sectionTitle}>3. Évolution mensuelle</Text>
        <View style={s.thead} fixed>
          <Text style={[s.th, s.cMonth]}>Mois</Text>
          {cols.map((k) => (
            <Text key={k} style={[s.th, s.cVal]}>{nfc(LABELS[k])}</Text>
          ))}
        </View>
        {months.map((m, i) => (
          <View key={i} style={[s.tr, i % 2 ? { backgroundColor: "#f7f9fc" } : {}]} wrap={false}>
            <Text style={[s.td, s.cMonth]}>{nfc(m.label)}</Text>
            {cols.map((k) => (
              <Text key={k} style={[s.td, s.cVal]}>{fmt(num(m[k]))}</Text>
            ))}
          </View>
        ))}
        {months.length > 0 && (
          <View style={s.totalRow}>
            <Text style={[s.totalTxt, s.cMonth]}>Total</Text>
            {cols.map((k) => (
              <Text key={k} style={[s.totalTxt, s.cVal]}>{fmt(num(totals[k]))}</Text>
            ))}
          </View>
        )}
        {months.length === 0 && (
          <Text style={{ fontSize: 9, color: "#6b7280", marginTop: 6 }}>
            Aucune donnée sur la période sélectionnée.
          </Text>
        )}

        {/* 4 — Comparaison */}
        {showCompare && (
          <>
            <Text style={s.sectionTitle}>
              4. Comparaison {nfc(first.label)} → {nfc(last.label)}
            </Text>
            <View style={s.thead}>
              <Text style={[s.th, s.cMonth]}>Série</Text>
              <Text style={[s.th, s.cVal]}>{nfc(first.label)}</Text>
              <Text style={[s.th, s.cVal]}>{nfc(last.label)}</Text>
              <Text style={[s.th, s.cVal]}>Écart</Text>
              <Text style={[s.th, s.cVal]}>Évolution</Text>
            </View>
            {cols.map((k, i) => {
              const a = num(first[k]);
              const b = num(last[k]);
              return (
                <View key={k} style={[s.tr, i % 2 ? { backgroundColor: "#f7f9fc" } : {}]} wrap={false}>
                  <Text style={[s.td, s.cMonth]}>{nfc(LABELS[k])}</Text>
                  <Text style={[s.td, s.cVal]}>{fmt(a)}</Text>
                  <Text style={[s.td, s.cVal]}>{fmt(b)}</Text>
                  <Text style={[s.td, s.cVal]}>{b - a > 0 ? "+" : ""}{fmt(b - a)}</Text>
                  <Text style={[s.td, s.cVal, { fontFamily: "Helvetica-Bold" }]}>{pct(a, b)}</Text>
                </View>
              );
            })}
          </>
        )}

        <Text style={s.note}>
          Source : base de statistiques journalières Notion (saisie quotidienne). Les lignes « Objectif » sont
          exclues des chiffres réels. Les valeurs correspondent exactement à celles affichées à l&apos;écran au
          moment de l&apos;édition{data.generatedBy ? ` par ${nfc(data.generatedBy)}` : ""}.
        </Text>

        <Text style={s.footer} fixed
          render={({ pageNumber, totalPages }) => `TM Douche Montage · Rapport statistique · Généré le ${generatedAt} · Page ${pageNumber}/${totalPages}`} />
      </Page>
    </Document>
  );
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
