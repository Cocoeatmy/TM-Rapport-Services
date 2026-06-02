"use client";

/**
 * Rapport PDF — Heures de travail
 * Généré côté client via @react-pdf/renderer.
 *
 * Usage :
 *   const blob = await generateRapportPDF(data);
 *   const url = URL.createObjectURL(blob);
 *   window.open(url);
 */

import { Document, Page, Text, View, StyleSheet, pdf } from "@react-pdf/renderer";
import type { Project } from "@/lib/notion";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RapportEntry {
  date: string;          // ISO "2026-06-02"
  collaborateur: string;
  arrivee: string;
  depart: string;
  minutes: number;
  projectName: string;
  projectId: string;
}

export interface RapportData {
  /** Libellé affiché : "Claudio", "Claudio & Jacobo", etc. */
  label: string;
  /** Période lisible : "Juin 2026" ou "01.05 – 30.06.2026" */
  periode: string;
  entries: RapportEntry[];
  projects: Project[];   // Pour retrouver fournisseurs, séries, nbCabines
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(min: number): string {
  if (min <= 0) return "0h 00min";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m.toString().padStart(2, "0")}min`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("fr-CH", {
    weekday: "short", day: "2-digit", month: "short", year: "numeric",
  });
}

function today(): string {
  return new Date().toLocaleDateString("fr-CH", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

interface StatRow { label: string; cabines: number; minutes: number }

function computeStats(entries: RapportEntry[], projects: Project[], field: "fournisseurs" | "seriesCabines"): StatRow[] {
  const map = new Map<string, { cabines: number; minutes: number }>();
  for (const e of entries) {
    if (e.minutes <= 0) continue;
    const proj = projects.find((p) => p.id === e.projectId);
    if (!proj) continue;
    const keys: string[] = proj[field] ?? [];
    const cabines = proj.nbCabines ?? 1;
    if (keys.length === 0) {
      const s = map.get("—") ?? { cabines: 0, minutes: 0 };
      s.minutes += e.minutes; s.cabines += cabines;
      map.set("—", s);
    } else {
      for (const k of keys) {
        const s = map.get(k) ?? { cabines: 0, minutes: 0 };
        s.minutes += e.minutes; s.cabines += cabines;
        map.set(k, s);
      }
    }
  }
  return Array.from(map.entries())
    .map(([label, v]) => ({ label, ...v }))
    .sort((a, b) => b.minutes - a.minutes);
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const C = {
  navy:   "#1e3a5f",
  blue:   "#2563eb",
  sky:    "#0ea5e9",
  slate:  "#64748b",
  light:  "#f1f5f9",
  border: "#e2e8f0",
  white:  "#ffffff",
  black:  "#0f172a",
  green:  "#16a34a",
  muted:  "#94a3b8",
};

const s = StyleSheet.create({
  page:       { padding: 44, fontFamily: "Helvetica", fontSize: 9, color: C.black, backgroundColor: C.white },

  // Header
  header:     { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 },
  logoBox:    { flexDirection: "column", gap: 2 },
  logoTitle:  { fontSize: 16, fontFamily: "Helvetica-Bold", color: C.navy, letterSpacing: 0.5 },
  logoSub:    { fontSize: 8, color: C.slate },
  headerRight:{ flexDirection: "column", alignItems: "flex-end", gap: 2 },
  headerLabel:{ fontSize: 8, color: C.muted },
  headerVal:  { fontSize: 9, fontFamily: "Helvetica-Bold", color: C.slate },

  // Title band
  titleBand:  { backgroundColor: C.navy, borderRadius: 6, paddingHorizontal: 14, paddingVertical: 8, marginBottom: 18, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  titleText:  { fontSize: 14, fontFamily: "Helvetica-Bold", color: C.white, letterSpacing: 0.3 },
  titleSub:   { fontSize: 9, color: "#93c5fd" },

  // KPI cards
  kpiRow:     { flexDirection: "row", gap: 8, marginBottom: 20 },
  kpi:        { flex: 1, borderRadius: 6, borderWidth: 1, borderColor: C.border, paddingHorizontal: 10, paddingVertical: 8, alignItems: "center" },
  kpiVal:     { fontSize: 16, fontFamily: "Helvetica-Bold", color: C.blue, marginBottom: 2 },
  kpiLabel:   { fontSize: 7.5, color: C.slate, textAlign: "center" },
  kpiHighlight:{ backgroundColor: C.navy, borderColor: C.navy },
  kpiValH:    { color: C.white },
  kpiLabelH:  { color: "#93c5fd" },

  // Section
  sectionTitle:{ fontSize: 10, fontFamily: "Helvetica-Bold", color: C.navy, marginBottom: 6, marginTop: 16, textTransform: "uppercase", letterSpacing: 0.8 },
  divider:    { borderBottomWidth: 1.5, borderBottomColor: C.navy, marginBottom: 8 },

  // Stats table
  table:      { borderWidth: 1, borderColor: C.border, borderRadius: 4, marginBottom: 8, overflow: "hidden" },
  thead:      { flexDirection: "row", backgroundColor: C.light, paddingVertical: 5, paddingHorizontal: 8 },
  theadCell:  { fontFamily: "Helvetica-Bold", fontSize: 8, color: C.slate },
  trow:       { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 8, borderTopWidth: 1, borderTopColor: C.border },
  trowAlt:    { backgroundColor: "#f8fafc" },
  td:         { fontSize: 8.5, color: C.black },
  tdMuted:    { color: C.slate },
  tdBold:     { fontFamily: "Helvetica-Bold" },
  tdGreen:    { color: C.green, fontFamily: "Helvetica-Bold" },

  // Columns widths (stats table)
  colLabel:   { flex: 3 },
  colNum:     { flex: 1, textAlign: "right" },
  colHours:   { flex: 1.5, textAlign: "right" },
  colAvg:     { flex: 1.5, textAlign: "right" },

  // Detail table
  detailTable:{ borderWidth: 1, borderColor: C.border, borderRadius: 4, overflow: "hidden", marginBottom: 4 },
  dhead:      { flexDirection: "row", backgroundColor: C.navy, paddingVertical: 5, paddingHorizontal: 8 },
  dtheadCell: { fontFamily: "Helvetica-Bold", fontSize: 7.5, color: C.white },
  drow:       { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 8, borderTopWidth: 1, borderTopColor: C.border },
  drowAlt:    { backgroundColor: "#f8fafc" },

  // Detail columns
  dcDate:     { flex: 2 },
  dcProject:  { flex: 5 },
  dcSeries:   { flex: 2 },
  dcArrivee:  { flex: 1.2, textAlign: "center" },
  dcDepart:   { flex: 1.2, textAlign: "center" },
  dcHeures:   { flex: 1.5, textAlign: "right" },

  // Footer
  footer:     { position: "absolute", bottom: 24, left: 44, right: 44, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: 1, borderTopColor: C.border, paddingTop: 6 },
  footerText: { fontSize: 7, color: C.muted },
  pageNum:    { fontSize: 7, color: C.muted },
});

// ─── PDF Document ─────────────────────────────────────────────────────────────

function StatsTable({ title, rows }: { title: string; rows: StatRow[] }) {
  if (rows.length === 0) return null;
  const total = rows.reduce((s, r) => s + r.minutes, 0);
  const totalCab = rows.reduce((s, r) => s + r.cabines, 0);

  return (
    <View>
      <Text style={s.sectionTitle}>{title}</Text>
      <View style={s.divider} />
      <View style={s.table}>
        <View style={s.thead}>
          <Text style={[s.theadCell, s.colLabel]}>{title.includes("Marque") ? "Marque / Fournisseur" : "Série"}</Text>
          <Text style={[s.theadCell, s.colNum]}>Cabines</Text>
          <Text style={[s.theadCell, s.colHours]}>Heures</Text>
          <Text style={[s.theadCell, s.colAvg]}>Moy. / cabine</Text>
        </View>
        {rows.map((r, i) => {
          const avg = r.cabines > 0 ? Math.round(r.minutes / r.cabines) : 0;
          return (
            <View key={r.label} style={[s.trow, i % 2 === 1 ? s.trowAlt : {}]}>
              <Text style={[s.td, s.tdBold, s.colLabel]}>{r.label}</Text>
              <Text style={[s.td, s.colNum]}>{r.cabines}</Text>
              <Text style={[s.td, s.tdGreen, s.colHours]}>{fmt(r.minutes)}</Text>
              <Text style={[s.td, s.tdMuted, s.colAvg]}>{fmt(avg)}</Text>
            </View>
          );
        })}
        {/* Totals row */}
        <View style={[s.trow, { backgroundColor: C.light }]}>
          <Text style={[s.td, s.tdBold, s.colLabel]}>TOTAL</Text>
          <Text style={[s.td, s.tdBold, s.colNum]}>{totalCab}</Text>
          <Text style={[s.td, s.tdBold, { color: C.navy }, s.colHours]}>{fmt(total)}</Text>
          <Text style={[s.td, s.tdMuted, s.colAvg]}>
            {totalCab > 0 ? fmt(Math.round(total / totalCab)) : "—"}
          </Text>
        </View>
      </View>
    </View>
  );
}

function DetailSection({ entries, projects }: { entries: RapportEntry[]; projects: Project[] }) {
  const sorted = [...entries].filter((e) => e.minutes > 0).sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length === 0) return null;

  return (
    <View break>
      <Text style={s.sectionTitle}>Détail des interventions</Text>
      <View style={s.divider} />
      <View style={s.detailTable}>
        <View style={s.dhead}>
          <Text style={[s.dtheadCell, s.dcDate]}>Date</Text>
          <Text style={[s.dtheadCell, s.dcProject]}>Projet</Text>
          <Text style={[s.dtheadCell, s.dcSeries]}>Série</Text>
          <Text style={[s.dtheadCell, s.dcArrivee]}>Arrivée</Text>
          <Text style={[s.dtheadCell, s.dcDepart]}>Départ</Text>
          <Text style={[s.dtheadCell, s.dcHeures]}>Heures</Text>
        </View>
        {sorted.map((e, i) => {
          const proj = projects.find((p) => p.id === e.projectId);
          const series = proj?.seriesCabines?.join(", ") || "—";
          return (
            <View key={`${e.projectId}-${e.date}-${i}`} style={[s.drow, i % 2 === 1 ? s.drowAlt : {}]}>
              <Text style={[s.td, s.tdMuted, s.dcDate]}>{fmtDate(e.date)}</Text>
              <Text style={[s.td, s.dcProject]}>{e.projectName}</Text>
              <Text style={[s.td, s.tdMuted, s.dcSeries]}>{series}</Text>
              <Text style={[s.td, { textAlign: "center" }, s.dcArrivee]}>{e.arrivee || "—"}</Text>
              <Text style={[s.td, { textAlign: "center" }, s.dcDepart]}>{e.depart || "—"}</Text>
              <Text style={[s.td, s.tdGreen, s.dcHeures]}>{fmt(e.minutes)}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function RapportDocument({ data }: { data: RapportData }) {
  const totalMin  = data.entries.reduce((s, e) => s + e.minutes, 0);
  const nbProjects= new Set(data.entries.filter((e) => e.minutes > 0).map((e) => e.projectId)).size;
  const nbCabines = data.entries.filter((e) => e.minutes > 0).reduce((s, e) => {
    const p = data.projects.find((pr) => pr.id === e.projectId);
    return s + (p?.nbCabines ?? 1);
  }, 0);

  const brandStats  = computeStats(data.entries, data.projects, "fournisseurs");
  const seriesStats = computeStats(data.entries, data.projects, "seriesCabines");

  return (
    <Document title={`Rapport heures — ${data.label} — ${data.periode}`} author="TM Rapport Services">
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <View style={s.logoBox}>
            <Text style={s.logoTitle}>TM Douche Montage Sàrl</Text>
            <Text style={s.logoSub}>Champs-Lovat 13 Box n°16, 1400 Yverdon</Text>
            <Text style={s.logoSub}>+41 79 555 24 74 · info@douche-montage.ch</Text>
          </View>
          <View style={s.headerRight}>
            <Text style={s.headerLabel}>Généré le</Text>
            <Text style={s.headerVal}>{today()}</Text>
          </View>
        </View>

        {/* Title band */}
        <View style={s.titleBand}>
          <View>
            <Text style={s.titleText}>Rapport de travail</Text>
            <Text style={s.titleSub}>{data.label}</Text>
          </View>
          <Text style={s.titleSub}>{data.periode}</Text>
        </View>

        {/* KPI cards */}
        <View style={s.kpiRow}>
          <View style={[s.kpi, s.kpiHighlight]}>
            <Text style={[s.kpiVal, s.kpiValH]}>{fmt(totalMin)}</Text>
            <Text style={[s.kpiLabel, s.kpiLabelH]}>Total heures</Text>
          </View>
          <View style={s.kpi}>
            <Text style={s.kpiVal}>{nbProjects}</Text>
            <Text style={s.kpiLabel}>Projet{nbProjects !== 1 ? "s" : ""}</Text>
          </View>
          <View style={s.kpi}>
            <Text style={s.kpiVal}>{nbCabines}</Text>
            <Text style={s.kpiLabel}>Cabine{nbCabines !== 1 ? "s" : ""} installée{nbCabines !== 1 ? "s" : ""}</Text>
          </View>
          <View style={s.kpi}>
            <Text style={s.kpiVal}>{nbCabines > 0 ? fmt(Math.round(totalMin / nbCabines)) : "—"}</Text>
            <Text style={s.kpiLabel}>Moyenne / cabine</Text>
          </View>
        </View>

        {/* Stats by brand */}
        <StatsTable title="Statistiques par Marque" rows={brandStats} />

        {/* Stats by series */}
        <StatsTable title="Statistiques par Série" rows={seriesStats} />

        {/* Detail */}
        <DetailSection entries={data.entries} projects={data.projects} />

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>TM Douche Montage Sàrl · Rapport confidentiel</Text>
          <Text style={s.pageNum} render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

// ─── Export function ──────────────────────────────────────────────────────────

export async function generateRapportPDF(data: RapportData): Promise<Blob> {
  const doc = <RapportDocument data={data} />;
  return await pdf(doc).toBlob();
}
