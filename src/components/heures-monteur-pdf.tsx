"use client";

/**
 * PDF — Rapport d'heures détaillé d'un monteur (page /admin/heures/[monteur]).
 *
 * Layout : 1ʳᵉ page = RÉCAP (totaux + tableau par mois, tient sur une page),
 * puis le DÉTAIL par mois → jour → cabine. Paysage A4 pour loger toutes les
 * colonnes. Respecte le filtre actif (les entrées reçues sont déjà filtrées).
 *
 *   const blob = await generateMonteurHeuresPdf(data);
 */

import { Document, Page, Text, View, StyleSheet, pdf } from "@react-pdf/renderer";

export interface MonteurPdfEntry {
  date: string; // YYYY-MM-DD
  projectName: string;
  cabineLabel: string;
  marque: string;
  serie: string;
  typeService: string;
  arrivee: string;
  depart: string;
  minutes: number;
  binome: boolean;
  partner: string;
}

export interface MonteurPdfData {
  monteur: string;
  periodLabel: string; // "Toutes années", "Mai 2026"…
  filterLabel: string; // résumé des filtres actifs ("" si aucun)
  entries: MonteurPdfEntry[];
}

function fmtMin(m: number): string {
  if (m <= 0) return "—";
  return `${Math.floor(m / 60)}h${(m % 60).toString().padStart(2, "0")}`;
}

const MONTHS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
function monthLabel(ym: string): string {
  if (!ym) return "Date inconnue";
  const [y, mo] = ym.split("-");
  return `${MONTHS[parseInt(mo, 10) - 1]} ${y}`;
}
function dayLabel(d: string): string {
  if (!d) return "Date inconnue";
  const dt = new Date(d + "T12:00:00");
  return dt.toLocaleDateString("fr-CH", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}
function genDate(): string {
  return new Date().toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const NAVY = "#1e3a5f";
const TEAL = "#0d9488";

const s = StyleSheet.create({
  page: { padding: 28, fontSize: 9, color: "#1a1a1a", fontFamily: "Helvetica" },
  headerBand: { backgroundColor: NAVY, borderRadius: 6, padding: 12, marginBottom: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { color: "#fff", fontSize: 16, fontFamily: "Helvetica-Bold" },
  subtitle: { color: "#cbd5e1", fontSize: 9, marginTop: 2 },
  genInfo: { color: "#cbd5e1", fontSize: 8, textAlign: "right" },
  statsRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  statBox: { flex: 1, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 5, padding: 8, alignItems: "center" },
  statVal: { fontSize: 14, fontFamily: "Helvetica-Bold", color: NAVY },
  statValTeal: { fontSize: 14, fontFamily: "Helvetica-Bold", color: TEAL },
  statValPurple: { fontSize: 14, fontFamily: "Helvetica-Bold", color: "#7c3aed" },
  statLabel: { fontSize: 7, color: "#64748b", marginTop: 2 },
  sectionTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", color: NAVY, marginBottom: 6, marginTop: 6 },
  // tableau
  tHead: { flexDirection: "row", backgroundColor: NAVY, borderRadius: 2, paddingVertical: 4, paddingHorizontal: 4 },
  th: { color: "#fff", fontSize: 7.5, fontFamily: "Helvetica-Bold" },
  tRow: { flexDirection: "row", paddingVertical: 3.5, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: "#e2e8f0" },
  tRowAlt: { flexDirection: "row", paddingVertical: 3.5, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: "#e2e8f0", backgroundColor: "#f8fafc" },
  td: { fontSize: 8, color: "#334155" },
  monthHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#eef2ff", borderRadius: 4, paddingVertical: 5, paddingHorizontal: 8, marginTop: 10, marginBottom: 4 },
  monthName: { fontSize: 11, fontFamily: "Helvetica-Bold", color: NAVY },
  monthTotal: { fontSize: 10, fontFamily: "Helvetica-Bold", color: TEAL },
  dayName: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: NAVY, marginTop: 6, marginBottom: 2 },
  binomeTag: { fontSize: 6.5, color: "#7c3aed" },
  footer: { position: "absolute", bottom: 14, left: 28, right: 28, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: "#94a3b8", borderTopWidth: 0.5, borderTopColor: "#e2e8f0", paddingTop: 4 },
});

// Largeurs de colonnes (paysage A4 ≈ 785pt utile)
const COL = { date: 88, projet: 175, cabine: 95, marque: 75, serie: 80, service: 90, arr: 42, dep: 42, h: 48 };

function group<T>(arr: T[], key: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of arr) { const k = key(x); if (!m.has(k)) m.set(k, []); m.get(k)!.push(x); }
  return m;
}

function MonteurDoc({ data }: { data: MonteurPdfData }) {
  const entries = [...data.entries].sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));
  const totalMin = entries.reduce((s2, e) => s2 + e.minutes, 0);
  const soloMin = entries.filter((e) => !e.binome).reduce((s2, e) => s2 + e.minutes, 0);
  const binomeMin = entries.filter((e) => e.binome).reduce((s2, e) => s2 + e.minutes, 0);
  const totalCab = entries.length;
  const cabAvecH = entries.filter((e) => e.minutes > 0).length;

  const byMonth = group(entries, (e) => (e.date || "").slice(0, 7));
  const months = Array.from(byMonth.entries()).sort(([a], [b]) => (a || "9999").localeCompare(b || "9999"));

  // Lignes de récap par mois
  const recap = months.map(([ym, list]) => ({
    ym,
    cab: list.length,
    solo: list.filter((e) => !e.binome).reduce((s2, e) => s2 + e.minutes, 0),
    binome: list.filter((e) => e.binome).reduce((s2, e) => s2 + e.minutes, 0),
    total: list.reduce((s2, e) => s2 + e.minutes, 0),
  }));

  const Footer = () => (
    <View style={s.footer} fixed>
      <Text>TM Douche Montage — Rapport d'heures · {data.monteur}</Text>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );

  const Header = ({ sub }: { sub: string }) => (
    <View style={s.headerBand}>
      <View>
        <Text style={s.title}>Rapport d'heures — {data.monteur}</Text>
        <Text style={s.subtitle}>{sub}</Text>
      </View>
      <Text style={s.genInfo}>Généré le {genDate()}</Text>
    </View>
  );

  return (
    <Document title={`Rapport heures — ${data.monteur}`} author="TM Rapport Services">
      {/* ── Page RÉCAP ── */}
      <Page size="A4" orientation="landscape" style={s.page}>
        <Header sub={`Récapitulatif · ${data.periodLabel}${data.filterLabel ? ` · ${data.filterLabel}` : ""}`} />

        <View style={s.statsRow}>
          <View style={s.statBox}><Text style={s.statValTeal}>{fmtMin(totalMin)}</Text><Text style={s.statLabel}>TOTAL HEURES</Text></View>
          <View style={s.statBox}><Text style={s.statVal}>{fmtMin(soloMin)}</Text><Text style={s.statLabel}>SOLO</Text></View>
          <View style={s.statBox}><Text style={s.statValPurple}>{fmtMin(binomeMin)}</Text><Text style={s.statLabel}>BINÔME</Text></View>
          <View style={s.statBox}><Text style={s.statVal}>{totalCab}</Text><Text style={s.statLabel}>CABINES</Text></View>
          <View style={s.statBox}><Text style={s.statVal}>{cabAvecH > 0 ? fmtMin(Math.round(totalMin / cabAvecH)) : "—"}</Text><Text style={s.statLabel}>MOY. / CABINE</Text></View>
        </View>

        <Text style={s.sectionTitle}>Récapitulatif par mois</Text>
        <View style={s.tHead}>
          <Text style={[s.th, { width: 180 }]}>MOIS</Text>
          <Text style={[s.th, { width: 80, textAlign: "right" }]}>CABINES</Text>
          <Text style={[s.th, { width: 110, textAlign: "right" }]}>SOLO</Text>
          <Text style={[s.th, { width: 110, textAlign: "right" }]}>BINÔME</Text>
          <Text style={[s.th, { width: 110, textAlign: "right" }]}>TOTAL</Text>
        </View>
        {recap.map((r, i) => (
          <View key={r.ym} style={i % 2 ? s.tRowAlt : s.tRow}>
            <Text style={[s.td, { width: 180, fontFamily: "Helvetica-Bold", color: NAVY }]}>{monthLabel(r.ym)}</Text>
            <Text style={[s.td, { width: 80, textAlign: "right" }]}>{r.cab}</Text>
            <Text style={[s.td, { width: 110, textAlign: "right" }]}>{fmtMin(r.solo)}</Text>
            <Text style={[s.td, { width: 110, textAlign: "right", color: "#7c3aed" }]}>{fmtMin(r.binome)}</Text>
            <Text style={[s.td, { width: 110, textAlign: "right", fontFamily: "Helvetica-Bold", color: TEAL }]}>{fmtMin(r.total)}</Text>
          </View>
        ))}
        {/* Total général */}
        <View style={[s.tRow, { borderTopWidth: 1, borderTopColor: NAVY, borderBottomWidth: 0 }]}>
          <Text style={[s.td, { width: 180, fontFamily: "Helvetica-Bold" }]}>TOTAL</Text>
          <Text style={[s.td, { width: 80, textAlign: "right", fontFamily: "Helvetica-Bold" }]}>{totalCab}</Text>
          <Text style={[s.td, { width: 110, textAlign: "right", fontFamily: "Helvetica-Bold" }]}>{fmtMin(soloMin)}</Text>
          <Text style={[s.td, { width: 110, textAlign: "right", fontFamily: "Helvetica-Bold", color: "#7c3aed" }]}>{fmtMin(binomeMin)}</Text>
          <Text style={[s.td, { width: 110, textAlign: "right", fontFamily: "Helvetica-Bold", color: TEAL }]}>{fmtMin(totalMin)}</Text>
        </View>
        <Footer />
      </Page>

      {/* ── DÉTAIL : une PAGE A4 par mois (chaque mois démarre en haut) ── */}
      {months.map(([ym, mList]) => {
        const mTotal = mList.reduce((s2, e) => s2 + e.minutes, 0);
        const byDay = group(mList, (e) => e.date || "");
        const days = Array.from(byDay.entries()).sort(([a], [b]) => (a || "9999").localeCompare(b || "9999"));
        return (
          <Page key={ym} size="A4" orientation="landscape" style={s.page}>
            <Header sub={`Détail — ${monthLabel(ym)}`} />
            <View style={s.monthHeader} wrap={false}>
              <Text style={s.monthName}>{monthLabel(ym)}</Text>
              <Text style={s.monthTotal}>{mList.length} cab. · {fmtMin(mTotal)}</Text>
            </View>
            {days.map(([d, dList]) => {
                const sorted = [...dList].sort((a, b) => (a.arrivee || "99:99").localeCompare(b.arrivee || "99:99"));
                const dTotal = dList.reduce((s2, e) => s2 + e.minutes, 0);
                return (
                  <View key={d} wrap={false}>
                    <Text style={s.dayName}>{dayLabel(d)} — {fmtMin(dTotal)}</Text>
                    <View style={s.tHead}>
                      <Text style={[s.th, { width: COL.projet }]}>PROJET</Text>
                      <Text style={[s.th, { width: COL.cabine }]}>CABINE</Text>
                      <Text style={[s.th, { width: COL.marque }]}>MARQUE</Text>
                      <Text style={[s.th, { width: COL.serie }]}>SÉRIE</Text>
                      <Text style={[s.th, { width: COL.service }]}>SERVICE</Text>
                      <Text style={[s.th, { width: COL.arr, textAlign: "center" }]}>ARR.</Text>
                      <Text style={[s.th, { width: COL.dep, textAlign: "center" }]}>DÉP.</Text>
                      <Text style={[s.th, { width: COL.h, textAlign: "right" }]}>HEURES</Text>
                    </View>
                    {sorted.map((e, i) => (
                      <View key={i} style={i % 2 ? s.tRowAlt : s.tRow}>
                        <Text style={[s.td, { width: COL.projet }]}>{e.projectName}</Text>
                        <Text style={[s.td, { width: COL.cabine }]}>
                          {e.cabineLabel}{e.binome ? <Text style={s.binomeTag}>  - Binôme{e.partner ? ` (${e.partner})` : ""}</Text> : ""}
                        </Text>
                        <Text style={[s.td, { width: COL.marque }]}>{e.marque || "—"}</Text>
                        <Text style={[s.td, { width: COL.serie }]}>{e.serie || "—"}</Text>
                        <Text style={[s.td, { width: COL.service }]}>{e.typeService || "—"}</Text>
                        <Text style={[s.td, { width: COL.arr, textAlign: "center" }]}>{e.arrivee || "-"}</Text>
                        <Text style={[s.td, { width: COL.dep, textAlign: "center" }]}>{e.depart || "-"}</Text>
                        <Text style={[s.td, { width: COL.h, textAlign: "right", fontFamily: "Helvetica-Bold" }]}>{e.minutes > 0 ? fmtMin(e.minutes) : "-"}</Text>
                      </View>
                    ))}
                  </View>
                );
              })}
            <Footer />
          </Page>
          );
        })}
    </Document>
  );
}

export async function generateMonteurHeuresPdf(data: MonteurPdfData): Promise<Blob> {
  return pdf(<MonteurDoc data={data} />).toBlob();
}
