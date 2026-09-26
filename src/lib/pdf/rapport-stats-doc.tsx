/**
 * Document PDF « Rapport statistique ».
 *
 * Extrait de la route /api/rapport-stats pour pouvoir être rendu hors requête
 * (tests, vérification visuelle) : la route se contente de l'authentification
 * et du streaming.
 *
 * Charte identique aux autres rapports : logo, filet bleu #1e3a5f, en-têtes de
 * tableau bleus répétés, lignes zébrées, pied de page paginé. Les graphiques
 * sont dessinés en SVG natif @react-pdf — aucune dépendance ajoutée.
 */
import { LOGO_BASE64 } from "@/lib/logo";
import { Document, Page, Text, View, Image, StyleSheet, Svg, G, Rect, Line, Path, Polyline, Circle, Text as SvgText } from "@react-pdf/renderer";
import React from "react";

/** Helvetica (police standard PDF) ne connaît ni les tirets longs ni les
 *  flèches : ils ressortaient en apostrophes (« 01 août 26 '26 sept. 26 »).
 *  On les remplace par leurs équivalents ASCII avant impression. */
export function nfc(s: unknown) {
  return String(s ?? "")
    .normalize("NFC")
    .replace(/[‒–—―]/g, "-")
    .replace(/[→➡➔]/g, "->")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...");
}
export function num(n: unknown): number { const v = Number(n); return Number.isFinite(v) ? v : 0; }
/** Séparateur de milliers suisse, sans dépendre de la locale de Node : les
 *  espaces fines renvoyées par toLocaleString variaient d'un environnement à
 *  l'autre et laissaient passer des nombres collés (« 1462800 CHF »). */
export function fmt(n: number): string {
  const v = Math.round(n);
  const sign = v < 0 ? "-" : "";
  return sign + String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, "'");
}
function pct(a: number, b: number): string {
  if (a === 0) return b === 0 ? "0%" : "\u2014";
  const p = ((b - a) / a) * 100;
  return `${p > 0 ? "+" : ""}${Math.round(p)}%`;
}

const BRAND = "#1e3a5f";

type SerieId = "montages" | "cabines" | "mesures" | "services" | "sav" | "demontages" | "ofr" | "ca";
type MonthRow = { label: string } & Partial<Record<SerieId, number>>;
export type Payload = {
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
  barLabel: { width: 88, fontSize: 8.5, color: "#222" },
  barTrack: { flex: 1, height: 9, backgroundColor: "#eef2f7", borderRadius: 2, marginRight: 6 },
  barFill: { height: 9, backgroundColor: BRAND, borderRadius: 2 },
  barValue: { width: 48, textAlign: "right", fontSize: 8.5, fontFamily: "Helvetica-Bold", color: "#222" },
  barShare: { width: 32, textAlign: "right", fontSize: 8, color: "#6b7280" },

  legendDot: { width: 7, height: 7, borderRadius: 3.5, marginRight: 5 },
  chartLegend: { flexDirection: "row", flexWrap: "wrap", marginTop: 4, marginBottom: 6 },
  chartLegendItem: { flexDirection: "row", alignItems: "center", marginRight: 14 },
  chartLegendTxt: { fontSize: 7.5, color: "#4a5568" },
  chartCaption: { fontSize: 7.5, color: "#6b7280", marginTop: 3 },

  note: { fontSize: 7.5, color: "#8a94a3", marginTop: 10, lineHeight: 1.4 },
  footer: { position: "absolute", bottom: 22, left: 32, right: 32, textAlign: "center", fontSize: 7, color: "#999", borderTopWidth: 0.5, borderTopColor: "#ddd", paddingTop: 5 },
});

/* ── Graphiques ───────────────────────────────────────────────────────────
   Dessinés en SVG natif @react-pdf : aucune dépendance ajoutée, et le rendu
   reste vectoriel (net à l'impression comme au zoom). */

/** Palette du rapport, une teinte par série. */
const SERIE_COLORS: Record<SerieId, string> = {
  montages: "#1e3a5f", cabines: "#2f6fb0", mesures: "#4f9dd9",
  services: "#f0a13c", sav: "#d9534f", demontages: "#7e8ea3",
  ofr: "#5b8c5a", ca: "#8e6fb0",
};

/** Histogramme groupé : une grappe de barres par mois. */
function MonthlyChart({ months, cols }: { months: MonthRow[]; cols: SerieId[] }) {
  const W = 531, H = 168, PL = 34, PR = 8, PT = 10, PB = 26;
  const iw = W - PL - PR, ih = H - PT - PB;
  const max = Math.max(1, ...months.flatMap((m) => cols.map((k) => num(m[k]))));
  // Graduations « rondes » : 4 paliers au-dessus du maximum réel.
  const step = Math.pow(10, Math.floor(Math.log10(max || 1)));
  const top = Math.ceil(max / step) * step || 1;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(top * f));
  const slot = iw / Math.max(1, months.length);
  const barW = Math.min(16, (slot * 0.74) / Math.max(1, cols.length));
  const groupW = barW * cols.length;

  return (
    <Svg width={W} height={H}>
      {ticks.map((t, i) => {
        const y = PT + ih - (t / top) * ih;
        return (
          <G key={i}>
            <Line x1={PL} y1={y} x2={W - PR} y2={y} strokeWidth={0.5} stroke={i === 0 ? "#b9c4d4" : "#e8edf4"} />
            <SvgText x={PL - 5} y={y + 3} textAnchor="end" style={{ fontSize: 6.5, fill: "#8a94a3" }}>{fmt(t)}</SvgText>
          </G>
        );
      })}
      {months.map((m, mi) => {
        const cx = PL + slot * mi + slot / 2;
        return (
          <G key={mi}>
            {cols.map((k, ci) => {
              const v = num(m[k]);
              const h = Math.max(v > 0 ? 1 : 0, (v / top) * ih);
              return (
                <Rect key={k} x={cx - groupW / 2 + ci * barW} y={PT + ih - h}
                  width={Math.max(1, barW - 1.5)} height={h} fill={SERIE_COLORS[k]} />
              );
            })}
            <SvgText x={cx} y={H - 9} textAnchor="middle" style={{ fontSize: 7, fill: "#4a5568" }}>{nfc(m.label)}</SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

/** Courbe d'évolution du chiffre d'affaires. */
function CaChart({ months }: { months: MonthRow[] }) {
  // PR large : le libellé du DERNIER mois est centré sous son point et serait
  // rogné par le bord droit de la page s'il n'avait pas sa marge.
  const W = 531, H = 130, PL = 46, PR = 30, PT = 12, PB = 24;
  const iw = W - PL - PR, ih = H - PT - PB;
  const vals = months.map((m) => num(m.ca));
  const max = Math.max(1, ...vals);
  const step = Math.pow(10, Math.floor(Math.log10(max || 1)));
  const top = Math.ceil(max / step) * step || 1;
  const x = (i: number) => PL + (months.length <= 1 ? iw / 2 : (iw * i) / (months.length - 1));
  const y = (v: number) => PT + ih - (v / top) * ih;
  const pts = vals.map((v, i) => `${x(i)},${y(v)}`).join(" ");

  return (
    <Svg width={W} height={H}>
      {[0, 0.5, 1].map((f, i) => {
        const gy = PT + ih - f * ih;
        return (
          <G key={i}>
            <Line x1={PL} y1={gy} x2={W - PR} y2={gy} strokeWidth={0.5} stroke={f === 0 ? "#b9c4d4" : "#e8edf4"} />
            <SvgText x={PL - 5} y={gy + 3} textAnchor="end" style={{ fontSize: 6.5, fill: "#8a94a3" }}>{fmt(top * f)}</SvgText>
          </G>
        );
      })}
      {months.length > 1 && <Polyline points={pts} fill="none" stroke={SERIE_COLORS.ca} strokeWidth={1.6} />}
      {vals.map((v, i) => (
        <G key={i}>
          <Circle cx={x(i)} cy={y(v)} r={2.4} fill={SERIE_COLORS.ca} />
          <SvgText x={x(i)} y={H - 8} textAnchor="middle" style={{ fontSize: 7, fill: "#4a5568" }}>{nfc(months[i].label)}</SvgText>
        </G>
      ))}
    </Svg>
  );
}

/** Anneau de répartition : part de chaque activité sur la période. */
function DonutChart({ parts }: { parts: { k: SerieId; v: number }[] }) {
  const size = 132, r = 52, ri = 31, cx = size / 2, cy = size / 2;
  const total = parts.reduce((s2, p) => s2 + p.v, 0);
  if (total <= 0) return null;
  let a0 = -Math.PI / 2;
  const arc = (v: number) => {
    const a1 = a0 + (v / total) * Math.PI * 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = [
      `M ${cx + r * Math.cos(a0)} ${cy + r * Math.sin(a0)}`,
      `A ${r} ${r} 0 ${large} 1 ${cx + r * Math.cos(a1)} ${cy + r * Math.sin(a1)}`,
      `L ${cx + ri * Math.cos(a1)} ${cy + ri * Math.sin(a1)}`,
      `A ${ri} ${ri} 0 ${large} 0 ${cx + ri * Math.cos(a0)} ${cy + ri * Math.sin(a0)}`,
      "Z",
    ].join(" ");
    a0 = a1;
    return p;
  };
  return (
    <Svg width={size} height={size}>
      {parts.map((p) => <Path key={p.k} d={arc(p.v)} fill={SERIE_COLORS[p.k]} />)}
    </Svg>
  );
}

export function RapportStatsPDF({ data }: { data: Payload }) {
  const months = (data.months || []).filter(Boolean);
  const series = (data.series && data.series.length ? data.series : ORDER).filter((k) => ORDER.includes(k));
  const generatedAt = new Date().toLocaleDateString("fr-CH", { day: "2-digit", month: "long", year: "numeric" });

  /* Totaux RECALCULÉS à partir des mois imprimés, jamais repris tels quels.
     Un rapport ne peut ainsi pas s'auto-contredire : l'indicateur en haut de
     page est toujours, par construction, la somme de la colonne du tableau. */
  const totals: Partial<Record<SerieId, number>> = {};
  ORDER.forEach((k) => { totals[k] = months.reduce((acc, m) => acc + num(m[k]), 0); });

  // Colonnes du tableau mensuel : on borne à 6 séries pour rester lisible.
  const cols = series.filter((k) => k !== "ca").slice(0, 6);
  const maxTotal = Math.max(1, ...cols.map((k) => num(totals[k])));
  const donutParts = cols.map((k) => ({ k, v: num(totals[k]) })).filter((p) => p.v > 0);
  const donutTotal = donutParts.reduce((acc, p) => acc + p.v, 0);
  const hasCa = num(totals.ca) > 0;

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
            // Le chiffre d'affaires est le plus long : demi-largeur, sinon il
            // passait à la ligne entre le montant et « CHF ».
            <View key={k} style={[s.kpi, k === "ca" ? { width: "50%" } : {}]}>
              <View style={s.kpiBox}>
                <Text style={s.kpiLabel}>{nfc(LABELS[k])}</Text>
                <Text style={s.kpiValue}>
                  {k === "ca" ? `${fmt(num(totals.ca))} CHF` : fmt(num(totals[k]))}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* 2 — Répartition : anneau + barres, pour lire la part ET la valeur */}
        <Text style={s.sectionTitle}>2. Répartition de l&apos;activité</Text>
        <View style={{ flexDirection: "row", alignItems: "center" }} wrap={false}>
          {donutParts.length > 0 && (
            <View style={{ width: 140 }}>
              <DonutChart parts={donutParts} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            {cols.map((k) => {
              const v = num(totals[k]);
              const share = donutTotal > 0 ? Math.round((v / donutTotal) * 100) : 0;
              return (
                <View key={k} style={s.barRow} wrap={false}>
                  <View style={[s.legendDot, { backgroundColor: SERIE_COLORS[k] }]} />
                  <Text style={s.barLabel}>{nfc(LABELS[k])}</Text>
                  <View style={s.barTrack}>
                    <View style={[s.barFill, { width: `${Math.round((v / maxTotal) * 100)}%`, backgroundColor: SERIE_COLORS[k] }]} />
                  </View>
                  <Text style={s.barValue}>{fmt(v)}</Text>
                  <Text style={s.barShare}>{share}%</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* 3 — Évolution mensuelle : le graphique d'abord, le détail ensuite */}
        <Text style={s.sectionTitle}>3. Évolution mensuelle</Text>
        {months.length > 0 && (
          <View wrap={false}>
            <MonthlyChart months={months} cols={cols} />
            <View style={s.chartLegend}>
              {cols.map((k) => (
                <View key={k} style={s.chartLegendItem}>
                  <View style={[s.legendDot, { backgroundColor: SERIE_COLORS[k] }]} />
                  <Text style={s.chartLegendTxt}>{nfc(LABELS[k])}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
        {/* Le tableau reste d'un seul tenant tant qu'il tient sur une page :
            `fixed` sur l'en-tête, combiné à une coupure, réimprimait la
            dernière ligne sur la page suivante (mois compté deux fois). */}
        <View wrap={months.length > 16}>
        <View style={s.thead}>
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
        </View>
        {months.length === 0 && (
          <Text style={{ fontSize: 9, color: "#6b7280", marginTop: 6 }}>
            Aucune donnée sur la période sélectionnée.
          </Text>
        )}

        {/* 4 — Chiffre d'affaires */}
        {hasCa && months.length > 0 && (
          <View wrap={false}>
            <Text style={s.sectionTitle}>4. Chiffre d&apos;affaires par mois</Text>
            <CaChart months={months} />
            <Text style={s.chartCaption}>
              Total de la période : {fmt(num(totals.ca))} CHF
              {months.length > 0 ? ` · moyenne mensuelle ${fmt(num(totals.ca) / months.length)} CHF` : ""}
            </Text>
          </View>
        )}

        {/* 5 — Comparaison */}
        {showCompare && (
          <>
            <Text style={s.sectionTitle}>
              {hasCa ? "5" : "4"}. Comparaison {nfc(first.label)} vers {nfc(last.label)}
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
          Source : base de statistiques journalières Notion (saisie quotidienne). Les lignes « Objectif » et
          les lignes non rattachées à un mois (cumuls, récapitulatifs) sont exclues des chiffres réels.
          Chaque indicateur clé est, par construction, la somme de la colonne correspondante du tableau
          d&apos;évolution mensuelle ci-dessus — les deux ne peuvent pas diverger. Valeurs arrêtées au moment
          de l&apos;édition{data.generatedBy ? ` par ${nfc(data.generatedBy)}` : ""}.
        </Text>

        <Text style={s.footer} fixed
          render={({ pageNumber, totalPages }) => `TM Douche Montage · Rapport statistique · Généré le ${generatedAt} · Page ${pageNumber}/${totalPages}`} />
      </Page>
    </Document>
  );
}

