"use client";

import React from "react";
import { BarChartHorizontal, BarChart2, LineChart as LineIcon, AreaChart as AreaIcon, PieChart } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

export type ChartType = "bar-h" | "bar-v" | "line" | "area" | "donut";

export interface ChartSeries {
  key: string;
  label: string;
  color: string; // hex or tailwind hex
}

export interface ChartDataPoint {
  label: string;
  values: Record<string, number>;
}

export interface DistributionItem {
  label: string;
  value: number;
  color: string; // hex
}

// ── ChartTypeSelector ────────────────────────────────────────────────────────

const CHART_META: Record<ChartType, { Icon: React.ElementType; title: string }> = {
  "bar-h": { Icon: BarChartHorizontal, title: "Barres horizontales" },
  "bar-v": { Icon: BarChart2,          title: "Colonnes" },
  "line":  { Icon: LineIcon,           title: "Ligne" },
  "area":  { Icon: AreaIcon,           title: "Aire" },
  "donut": { Icon: PieChart,           title: "Donut" },
};

interface ChartTypeSelectorProps {
  value: ChartType;
  onChange: (t: ChartType) => void;
  types: ChartType[];
}

export function ChartTypeSelector({ value, onChange, types }: ChartTypeSelectorProps) {
  return (
    <div className="flex gap-0.5 ml-auto shrink-0" onClick={(e) => e.stopPropagation()}>
      {types.map((t) => {
        const { Icon, title } = CHART_META[t];
        const active = value === t;
        return (
          <button
            key={t}
            title={title}
            onClick={() => onChange(t)}
            className={`p-1 rounded-md transition-colors ${
              active
                ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400"
                : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
          </button>
        );
      })}
    </div>
  );
}

// ── Helpers SVG ──────────────────────────────────────────────────────────────

/** Transforme "hsl(220 70% 50%)" ou "#3b82f6" en valeur utilisable dans SVG. */
function svgColor(c: string): string {
  return c; // les deux formats sont valides dans SVG
}

// ── Line / Area Chart ────────────────────────────────────────────────────────

interface TimeChartProps {
  data: ChartDataPoint[];       // un point = un mois
  series: ChartSeries[];
  chartType: "line" | "area";
  height?: number;
}

export function TimeSeriesChart({ data, series, chartType, height = 140 }: TimeChartProps) {
  const W = 320;
  const H = height;
  const PAD = { top: 12, right: 8, bottom: 28, left: 28 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;

  const visibleSeries = series.filter((s) => data.some((d) => (d.values[s.key] || 0) > 0));
  if (visibleSeries.length === 0 || data.length === 0) {
    return <p className="text-xs text-gray-400 text-center py-4">Aucune donnée</p>;
  }

  const maxVal = Math.max(
    ...visibleSeries.flatMap((s) => data.map((d) => d.values[s.key] || 0)),
    1,
  );

  const px = (i: number) => PAD.left + (data.length === 1 ? cW / 2 : (i / (data.length - 1)) * cW);
  const py = (v: number) => PAD.top + (1 - v / maxVal) * cH;

  // Y-axis ticks (3)
  const ticks = [0.5, 1].map((r) => Math.round(maxVal * r));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ display: "block" }}>
      {/* Grid */}
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.left} x2={W - PAD.right} y1={py(t)} y2={py(t)}
            stroke="#e5e7eb" strokeWidth="0.5" strokeDasharray="2 2" />
          <text x={PAD.left - 3} y={py(t) + 3} textAnchor="end" fontSize="6" fill="#9ca3af">{t}</text>
        </g>
      ))}
      {/* Baseline */}
      <line x1={PAD.left} x2={W - PAD.right} y1={py(0)} y2={py(0)} stroke="#d1d5db" strokeWidth="0.8" />

      {/* Series */}
      {visibleSeries.map((s) => {
        const pts = data.map((d, i) => ({ x: px(i), y: py(d.values[s.key] || 0) }));
        const polyline = pts.map((p) => `${p.x},${p.y}`).join(" ");
        const color = svgColor(s.color);

        if (chartType === "area") {
          const area = [
            `M ${pts[0].x},${py(0)}`,
            ...pts.map((p) => `L ${p.x},${p.y}`),
            `L ${pts[pts.length - 1].x},${py(0)}`,
            "Z",
          ].join(" ");
          return (
            <g key={s.key}>
              <path d={area} fill={color} fillOpacity="0.15" stroke="none" />
              <polyline points={polyline} fill="none" stroke={color} strokeWidth="1.8"
                strokeLinejoin="round" strokeLinecap="round" />
            </g>
          );
        }
        return (
          <polyline key={s.key} points={polyline} fill="none" stroke={color}
            strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
        );
      })}

      {/* Dots on data points */}
      {visibleSeries.map((s) =>
        data.map((d, i) => {
          const v = d.values[s.key] || 0;
          if (v === 0) return null;
          return (
            <circle key={`${s.key}-${i}`} cx={px(i)} cy={py(v)} r="2"
              fill={svgColor(s.color)} stroke="white" strokeWidth="0.8" />
          );
        }),
      )}

      {/* X labels */}
      {data.map((d, i) => (
        <text key={i} x={px(i)} y={H - 6} textAnchor="middle" fontSize="6" fill="#9ca3af">
          {d.label}
        </text>
      ))}
    </svg>
  );
}

// ── Column Chart (vertical bars) ─────────────────────────────────────────────

interface ColumnChartProps {
  data: DistributionItem[];
  height?: number;
}

export function ColumnChart({ data, height = 130 }: ColumnChartProps) {
  if (data.length === 0) return <p className="text-xs text-gray-400 text-center py-4">Aucune donnée</p>;

  const W = 320;
  const H = height;
  const PAD = { top: 16, right: 8, bottom: 32, left: 24 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;

  const max = Math.max(...data.map((d) => d.value), 1);
  const barW = Math.max(6, Math.min(28, cW / data.length - 4));
  const gap = (cW - barW * data.length) / (data.length + 1);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ display: "block" }}>
      {/* Grid */}
      {[0.5, 1].map((r) => {
        const v = Math.round(max * r);
        return (
          <g key={r}>
            <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top + (1 - r) * cH} y2={PAD.top + (1 - r) * cH}
              stroke="#e5e7eb" strokeWidth="0.5" strokeDasharray="2 2" />
            <text x={PAD.left - 3} y={PAD.top + (1 - r) * cH + 3} textAnchor="end" fontSize="6" fill="#9ca3af">{v}</text>
          </g>
        );
      })}
      <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top + cH} y2={PAD.top + cH} stroke="#d1d5db" strokeWidth="0.8" />

      {/* Bars */}
      {data.map((d, i) => {
        const barH = (d.value / max) * cH;
        const x = PAD.left + gap + i * (barW + gap);
        const y = PAD.top + cH - barH;
        // Shorten label: first word or first 6 chars
        const shortLabel = d.label.length > 7 ? d.label.slice(0, 6) + "…" : d.label;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={Math.max(barH, 1)} fill={svgColor(d.color)} rx="2" />
            {/* Value above bar */}
            {d.value > 0 && (
              <text x={x + barW / 2} y={y - 2} textAnchor="middle" fontSize="6" fontWeight="bold" fill="#374151"
                className="dark:fill-gray-200">{d.value}</text>
            )}
            {/* Label below */}
            <text x={x + barW / 2} y={H - 10} textAnchor="middle" fontSize="6" fill="#9ca3af"
              transform={`rotate(-35, ${x + barW / 2}, ${H - 10})`}>{shortLabel}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Donut Chart ──────────────────────────────────────────────────────────────

interface DonutChartProps {
  data: DistributionItem[];
  showLegend?: boolean;
}

function polarToCart(cx: number, cy: number, r: number, angle: number) {
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

export function DonutChart({ data, showLegend = true }: DonutChartProps) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <p className="text-xs text-gray-400 text-center py-4">Aucune donnée</p>;

  const CX = 60, CY = 60, R = 52, r = 32;
  let angle = -Math.PI / 2; // start at top

  const segments = data.map((d) => {
    const sweep = (d.value / total) * 2 * Math.PI;
    const start = angle;
    const end = angle + sweep;
    angle = end;
    return { ...d, start, end, sweep };
  });

  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 120 120" className="w-28 h-28 shrink-0" style={{ display: "block" }}>
        {segments.map((seg, i) => {
          if (seg.sweep < 0.005) return null;
          const largeArc = seg.sweep > Math.PI ? 1 : 0;
          const s = polarToCart(CX, CY, R, seg.start);
          const e = polarToCart(CX, CY, R, seg.end);
          const is = polarToCart(CX, CY, r, seg.end);
          const ie = polarToCart(CX, CY, r, seg.start);
          const d = [
            `M ${s.x.toFixed(2)} ${s.y.toFixed(2)}`,
            `A ${R} ${R} 0 ${largeArc} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`,
            `L ${is.x.toFixed(2)} ${is.y.toFixed(2)}`,
            `A ${r} ${r} 0 ${largeArc} 0 ${ie.x.toFixed(2)} ${ie.y.toFixed(2)}`,
            "Z",
          ].join(" ");
          return <path key={i} d={d} fill={svgColor(seg.color)} stroke="white" strokeWidth="0.5" />;
        })}
        {/* Center label */}
        <text x={CX} y={CY - 4} textAnchor="middle" fontSize="11" fontWeight="bold" fill="#1e3a5f">{total}</text>
        <text x={CX} y={CY + 8} textAnchor="middle" fontSize="7" fill="#9ca3af">total</text>
      </svg>

      {showLegend && (
        <div className="flex-1 min-w-0 space-y-1.5">
          {data.map((d) => {
            const pct = Math.round((d.value / total) * 100);
            return (
              <div key={d.label} className="flex items-center gap-1.5 text-[10px]">
                <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: svgColor(d.color) }} />
                <span className="truncate text-gray-700 dark:text-gray-300 flex-1">{d.label}</span>
                <span className="font-bold tabular-nums text-gray-800 dark:text-gray-200 shrink-0">{d.value}</span>
                <span className="text-gray-400 shrink-0 w-7 text-right">{pct}%</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Multi-series Column Chart (monthly) ──────────────────────────────────────

interface MultiColumnChartProps {
  data: ChartDataPoint[];
  series: ChartSeries[];
  height?: number;
}

export function MultiColumnChart({ data, series, height = 150 }: MultiColumnChartProps) {
  const visibleSeries = series.filter((s) => data.some((d) => (d.values[s.key] || 0) > 0));
  if (visibleSeries.length === 0 || data.length === 0) {
    return <p className="text-xs text-gray-400 text-center py-4">Aucune donnée</p>;
  }

  const W = 320;
  const H = height;
  const PAD = { top: 12, right: 8, bottom: 28, left: 24 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;

  const max = Math.max(
    ...visibleSeries.flatMap((s) => data.map((d) => d.values[s.key] || 0)),
    1,
  );

  const groupW = cW / data.length;
  const barW = Math.max(2, Math.min(10, (groupW - 4) / visibleSeries.length));
  const groupPad = (groupW - barW * visibleSeries.length) / 2;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ display: "block" }}>
      {/* Grid */}
      {[0.5, 1].map((r) => (
        <line key={r} x1={PAD.left} x2={W - PAD.right}
          y1={PAD.top + (1 - r) * cH} y2={PAD.top + (1 - r) * cH}
          stroke="#e5e7eb" strokeWidth="0.5" strokeDasharray="2 2" />
      ))}
      <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top + cH} y2={PAD.top + cH} stroke="#d1d5db" strokeWidth="0.8" />

      {/* Bars */}
      {data.map((d, gi) => {
        const gx = PAD.left + gi * groupW + groupPad;
        return (
          <g key={gi}>
            {visibleSeries.map((s, si) => {
              const v = d.values[s.key] || 0;
              const barH = (v / max) * cH;
              const x = gx + si * barW;
              const y = PAD.top + cH - barH;
              return (
                <rect key={si} x={x} y={y} width={Math.max(barW - 0.5, 1)} height={Math.max(barH, 1)}
                  fill={svgColor(s.color)} rx="1" opacity="0.85" />
              );
            })}
            {/* Month label */}
            <text x={PAD.left + gi * groupW + groupW / 2} y={H - 6}
              textAnchor="middle" fontSize="5.5" fill="#9ca3af">{d.label}</text>
          </g>
        );
      })}

      {/* Legend (bottom right of chart) */}
      {visibleSeries.map((s, i) => (
        <g key={s.key} transform={`translate(${W - PAD.right - 60}, ${PAD.top + i * 10})`}>
          <rect x="0" y="0" width="6" height="6" fill={svgColor(s.color)} rx="1" />
          <text x="8" y="6" fontSize="5.5" fill="#6b7280">{s.label}</text>
        </g>
      ))}
    </svg>
  );
}
