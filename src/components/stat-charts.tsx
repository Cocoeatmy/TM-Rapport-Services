"use client";

import React from "react";
import {
  BarChartHorizontal, BarChart2, LineChart as LineIcon, AreaChart as AreaIcon, PieChart,
  ChartPie, LayoutGrid, ChartBarStacked, Layers, Hexagon,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

export type ChartType =
  | "bar-h"       // barres horizontales
  | "bar-v"       // colonnes verticales (groupées)
  | "bar-stack"   // colonnes empilées
  | "line"        // ligne
  | "area"        // aire (non empilée)
  | "area-stack"  // aires empilées
  | "donut"       // donut (anneau)
  | "pie"         // camembert plein
  | "treemap"     // treemap proportionnel
  | "radar";      // radar / araignée

export interface ChartSeries {
  key: string;
  label: string;
  color: string; // hex ou hsl
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
  "bar-h":      { Icon: BarChartHorizontal, title: "Barres horizontales" },
  "bar-v":      { Icon: BarChart2,          title: "Colonnes groupées" },
  "bar-stack":  { Icon: ChartBarStacked,    title: "Colonnes empilées" },
  "line":       { Icon: LineIcon,           title: "Courbe" },
  "area":       { Icon: AreaIcon,           title: "Aire" },
  "area-stack": { Icon: Layers,             title: "Aires empilées" },
  "donut":      { Icon: PieChart,           title: "Donut" },
  "pie":        { Icon: ChartPie,           title: "Camembert" },
  "treemap":    { Icon: LayoutGrid,         title: "Treemap" },
  "radar":      { Icon: Hexagon,            title: "Radar" },
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

function svgColor(c: string): string {
  return c;
}

function polarToCart(cx: number, cy: number, r: number, angle: number) {
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

/** Courbe lissée (spline Catmull-Rom → Bézier) passant par tous les points. */
function smoothLine(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x},${pts[0].y}`;
  let d = `M ${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`;
  }
  return d;
}

/** Dernier index où la série a une valeur > 0 (pour stopper la courbe au lieu
 *  de plonger à 0 sur les mois futurs sans données). */
function lastDataIndex(data: ChartDataPoint[], key: string): number {
  for (let i = data.length - 1; i >= 0; i--) {
    if ((data[i].values[key] || 0) > 0) return i;
  }
  return -1;
}

// ── Line / Area Chart (non-empilé) ───────────────────────────────────────────

interface TimeChartProps {
  data: ChartDataPoint[];
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
  if (visibleSeries.length === 0 || data.length === 0)
    return <p className="text-xs text-gray-400 text-center py-4">Aucune donnée</p>;

  const maxVal = Math.max(
    ...visibleSeries.flatMap((s) => data.map((d) => d.values[s.key] || 0)),
    1,
  );

  const px = (i: number) => PAD.left + (data.length === 1 ? cW / 2 : (i / (data.length - 1)) * cW);
  const py = (v: number) => PAD.top + (1 - v / maxVal) * cH;
  const ticks = [0.5, 1].map((r) => Math.round(maxVal * r));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ display: "block" }}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.left} x2={W - PAD.right} y1={py(t)} y2={py(t)}
            stroke="#e5e7eb" strokeWidth="0.5" strokeDasharray="2 2" />
          <text x={PAD.left - 3} y={py(t) + 3} textAnchor="end" fontSize="6" fill="#9ca3af">{t}</text>
        </g>
      ))}
      <line x1={PAD.left} x2={W - PAD.right} y1={py(0)} y2={py(0)} stroke="#d1d5db" strokeWidth="0.8" />

      {chartType === "area" && (
        <defs>
          {visibleSeries.map((s) => (
            <linearGradient key={s.key} id={`tsc-grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0.02" />
            </linearGradient>
          ))}
        </defs>
      )}

      {visibleSeries.map((s) => {
        // Stoppe la courbe à la dernière donnée (pas de chute à 0 sur les mois futurs).
        const last = lastDataIndex(data, s.key);
        if (last < 0) return null;
        const pts = data.slice(0, last + 1).map((d, i) => ({ x: px(i), y: py(d.values[s.key] || 0) }));
        const color = svgColor(s.color);
        const line = smoothLine(pts);

        if (chartType === "area" && pts.length > 1) {
          const area = `${line} L ${pts[pts.length - 1].x.toFixed(2)},${py(0)} L ${pts[0].x.toFixed(2)},${py(0)} Z`;
          return (
            <g key={s.key}>
              <path d={area} fill={`url(#tsc-grad-${s.key})`} stroke="none" />
              <path d={line} fill="none" stroke={color} strokeWidth="1.1"
                strokeLinejoin="round" strokeLinecap="round" />
            </g>
          );
        }
        return (
          <path key={s.key} d={line} fill="none" stroke={color}
            strokeWidth="1.1" strokeLinejoin="round" strokeLinecap="round" />
        );
      })}

      {visibleSeries.map((s) =>
        data.map((d, i) => {
          const v = d.values[s.key] || 0;
          if (v === 0) return null;
          return (
            <circle key={`${s.key}-${i}`} cx={px(i)} cy={py(v)} r="1.5"
              fill={svgColor(s.color)} stroke="white" strokeWidth="0.6" />
          );
        }),
      )}

      {data.map((d, i) => (
        <text key={i} x={px(i)} y={H - 6} textAnchor="middle" fontSize="6" fill="#9ca3af">
          {d.label}
        </text>
      ))}
    </svg>
  );
}

// ── Stacked Area Chart ────────────────────────────────────────────────────────

interface StackedAreaProps {
  data: ChartDataPoint[];
  series: ChartSeries[];
  height?: number;
}

export function StackedAreaChart({ data, series, height = 150 }: StackedAreaProps) {
  const W = 320;
  const H = height;
  const PAD = { top: 12, right: 8, bottom: 28, left: 30 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;

  const visibleSeries = series.filter((s) => data.some((d) => (d.values[s.key] || 0) > 0));
  if (visibleSeries.length === 0 || data.length === 0)
    return <p className="text-xs text-gray-400 text-center py-4">Aucune donnée</p>;

  // Cumulative stacks per data point
  const stacked = data.map((d) => {
    let cum = 0;
    const layers: Record<string, { y0: number; y1: number }> = {};
    visibleSeries.forEach((s) => {
      const v = d.values[s.key] || 0;
      layers[s.key] = { y0: cum, y1: cum + v };
      cum += v;
    });
    return { ...d, layers, total: cum };
  });

  const maxVal = Math.max(...stacked.map((d) => d.total), 1);
  const px = (i: number) =>
    PAD.left + (data.length === 1 ? cW / 2 : (i / (data.length - 1)) * cW);
  const py = (v: number) => PAD.top + (1 - v / maxVal) * cH;
  const ticks = [0.5, 1].map((r) => Math.round(maxVal * r));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ display: "block" }}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.left} x2={W - PAD.right} y1={py(t)} y2={py(t)}
            stroke="#e5e7eb" strokeWidth="0.5" strokeDasharray="2 2" />
          <text x={PAD.left - 3} y={py(t) + 3} textAnchor="end" fontSize="6" fill="#9ca3af">{t}</text>
        </g>
      ))}
      <line x1={PAD.left} x2={W - PAD.right} y1={py(0)} y2={py(0)} stroke="#d1d5db" strokeWidth="0.8" />

      {/* Draw areas bottom-to-top (lowest series first so higher ones paint over) */}
      {[...visibleSeries].reverse().map((s) => {
        const color = svgColor(s.color);
        const pts1 = stacked.map((d, i) => ({ x: px(i), y: py(d.layers[s.key].y1) }));
        const pts0 = stacked.map((d, i) => ({ x: px(i), y: py(d.layers[s.key].y0) }));

        const path = [
          `M ${pts0[0].x.toFixed(1)},${pts0[0].y.toFixed(1)}`,
          ...pts1.map((p) => `L ${p.x.toFixed(1)},${p.y.toFixed(1)}`),
          `L ${pts0[pts0.length - 1].x.toFixed(1)},${pts0[pts0.length - 1].y.toFixed(1)}`,
          ...pts0.slice(0, -1).reverse().map((p) => `L ${p.x.toFixed(1)},${p.y.toFixed(1)}`),
          "Z",
        ].join(" ");

        return (
          <g key={s.key}>
            <path d={path} fill={color} fillOpacity="0.75" stroke="none" />
            <polyline
              points={pts1.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
              fill="none" stroke={color} strokeWidth="1" strokeLinejoin="round"
            />
          </g>
        );
      })}

      {/* Legend */}
      {visibleSeries.map((s, i) => (
        <g key={s.key} transform={`translate(${W - PAD.right - 58}, ${PAD.top + i * 10})`}>
          <rect x="0" y="0" width="6" height="6" fill={svgColor(s.color)} rx="1" />
          <text x="8" y="6" fontSize="5.5" fill="#6b7280">{s.label}</text>
        </g>
      ))}

      {data.map((d, i) => (
        <text key={i} x={px(i)} y={H - 6} textAnchor="middle" fontSize="6" fill="#9ca3af">
          {d.label}
        </text>
      ))}
    </svg>
  );
}

// ── Column Chart (barres verticales, série unique) ───────────────────────────

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

      {data.map((d, i) => {
        const barH = (d.value / max) * cH;
        const x = PAD.left + gap + i * (barW + gap);
        const y = PAD.top + cH - barH;
        const shortLabel = d.label.length > 7 ? d.label.slice(0, 6) + "…" : d.label;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={Math.max(barH, 1)} fill={svgColor(d.color)} rx="2" />
            {d.value > 0 && (
              <text x={x + barW / 2} y={y - 2} textAnchor="middle" fontSize="6" fontWeight="bold" fill="#374151">{d.value}</text>
            )}
            <text x={x + barW / 2} y={H - 10} textAnchor="middle" fontSize="6" fill="#9ca3af"
              transform={`rotate(-35, ${x + barW / 2}, ${H - 10})`}>{shortLabel}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Multi-series Column Chart (groupé) ───────────────────────────────────────

interface MultiColumnChartProps {
  data: ChartDataPoint[];
  series: ChartSeries[];
  height?: number;
}

export function MultiColumnChart({ data, series, height = 150 }: MultiColumnChartProps) {
  const visibleSeries = series.filter((s) => data.some((d) => (d.values[s.key] || 0) > 0));
  if (visibleSeries.length === 0 || data.length === 0)
    return <p className="text-xs text-gray-400 text-center py-4">Aucune donnée</p>;

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
      {[0.5, 1].map((r) => (
        <line key={r} x1={PAD.left} x2={W - PAD.right}
          y1={PAD.top + (1 - r) * cH} y2={PAD.top + (1 - r) * cH}
          stroke="#e5e7eb" strokeWidth="0.5" strokeDasharray="2 2" />
      ))}
      <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top + cH} y2={PAD.top + cH} stroke="#d1d5db" strokeWidth="0.8" />

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
            <text x={PAD.left + gi * groupW + groupW / 2} y={H - 6}
              textAnchor="middle" fontSize="5.5" fill="#9ca3af">{d.label}</text>
          </g>
        );
      })}

      {visibleSeries.map((s, i) => (
        <g key={s.key} transform={`translate(${W - PAD.right - 60}, ${PAD.top + i * 10})`}>
          <rect x="0" y="0" width="6" height="6" fill={svgColor(s.color)} rx="1" />
          <text x="8" y="6" fontSize="5.5" fill="#6b7280">{s.label}</text>
        </g>
      ))}
    </svg>
  );
}

// ── Stacked Bar Chart (multi-séries, empilé) ─────────────────────────────────

export function StackedBarChart({ data, series, height = 150 }: MultiColumnChartProps) {
  const visibleSeries = series.filter((s) => data.some((d) => (d.values[s.key] || 0) > 0));
  if (visibleSeries.length === 0 || data.length === 0)
    return <p className="text-xs text-gray-400 text-center py-4">Aucune donnée</p>;

  const W = 320;
  const H = height;
  const PAD = { top: 12, right: 8, bottom: 28, left: 26 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;

  const totals = data.map((d) => visibleSeries.reduce((s, ser) => s + (d.values[ser.key] || 0), 0));
  const max = Math.max(...totals, 1);
  const ticks = [0.5, 1].map((r) => Math.round(max * r));

  const groupW = cW / data.length;
  const barW = Math.max(5, Math.min(22, groupW - 5));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ display: "block" }}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top + (1 - t / max) * cH} y2={PAD.top + (1 - t / max) * cH}
            stroke="#e5e7eb" strokeWidth="0.5" strokeDasharray="2 2" />
          <text x={PAD.left - 3} y={PAD.top + (1 - t / max) * cH + 3} textAnchor="end" fontSize="6" fill="#9ca3af">{t}</text>
        </g>
      ))}
      <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top + cH} y2={PAD.top + cH} stroke="#d1d5db" strokeWidth="0.8" />

      {data.map((d, gi) => {
        const x = PAD.left + gi * groupW + (groupW - barW) / 2;
        let cumH = 0;
        const segments = visibleSeries
          .map((s) => {
            const v = d.values[s.key] || 0;
            const segH = (v / max) * cH;
            return { s, v, segH };
          })
          .filter((seg) => seg.v > 0);

        return (
          <g key={gi}>
            {segments.map(({ s, segH }) => {
              const y = PAD.top + cH - cumH - segH;
              cumH += segH;
              return (
                <rect key={s.key} x={x} y={y} width={barW} height={Math.max(segH, 1)}
                  fill={svgColor(s.color)} rx="1" opacity="0.88" />
              );
            })}
            {totals[gi] > 0 && (
              <text x={x + barW / 2} y={PAD.top + cH - cumH - 2}
                textAnchor="middle" fontSize="6" fontWeight="bold" fill="#374151">{totals[gi]}</text>
            )}
            <text x={PAD.left + gi * groupW + groupW / 2} y={H - 6}
              textAnchor="middle" fontSize="5.5" fill="#9ca3af">{d.label}</text>
          </g>
        );
      })}

      {/* Légende */}
      {visibleSeries.map((s, i) => (
        <g key={s.key} transform={`translate(${W - PAD.right - 58}, ${PAD.top + i * 10})`}>
          <rect x="0" y="0" width="6" height="6" fill={svgColor(s.color)} rx="1" />
          <text x="8" y="6" fontSize="5.5" fill="#6b7280">{s.label}</text>
        </g>
      ))}
    </svg>
  );
}

// ── Donut Chart ──────────────────────────────────────────────────────────────

interface DonutChartProps {
  data: DistributionItem[];
  showLegend?: boolean;
}

export function DonutChart({ data, showLegend = true }: DonutChartProps) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <p className="text-xs text-gray-400 text-center py-4">Aucune donnée</p>;

  const CX = 60, CY = 60, R = 52, r = 32;
  let angle = -Math.PI / 2;

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

// ── Pie Chart (camembert plein) ──────────────────────────────────────────────

export function PieChart2({ data, showLegend = true }: DonutChartProps) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <p className="text-xs text-gray-400 text-center py-4">Aucune donnée</p>;

  const CX = 60, CY = 60, R = 54;
  let angle = -Math.PI / 2;

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
          const d = [
            `M ${CX.toFixed(2)} ${CY.toFixed(2)}`,
            `L ${s.x.toFixed(2)} ${s.y.toFixed(2)}`,
            `A ${R} ${R} 0 ${largeArc} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`,
            "Z",
          ].join(" ");
          return <path key={i} d={d} fill={svgColor(seg.color)} stroke="white" strokeWidth="0.8" />;
        })}
        {/* Pourcentage du plus grand segment au centre */}
        {(() => {
          const biggest = [...segments].sort((a, b) => b.value - a.value)[0];
          const pct = Math.round((biggest.value / total) * 100);
          const mid = (biggest.start + biggest.end) / 2;
          const labelR = R * 0.6;
          const lp = polarToCart(CX, CY, labelR, mid);
          if (biggest.sweep < 0.4) return null;
          return (
            <text x={lp.x.toFixed(1)} y={lp.y.toFixed(1)} textAnchor="middle"
              fontSize="9" fontWeight="bold" fill="white" opacity="0.9">{pct}%</text>
          );
        })()}
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

// ── Treemap Chart ─────────────────────────────────────────────────────────────

interface TreemapCell {
  x: number; y: number; w: number; h: number;
  item: DistributionItem;
}

function binaryTreemap(
  items: DistributionItem[],
  x: number, y: number, w: number, h: number,
): TreemapCell[] {
  if (items.length === 0) return [];
  if (items.length === 1) return [{ x, y, w, h, item: items[0] }];

  const total = items.reduce((s, d) => s + d.value, 0);
  let cumSum = 0;
  let splitIdx = 1;
  const half = total / 2;
  for (let i = 0; i < items.length - 1; i++) {
    cumSum += items[i].value;
    splitIdx = i + 1;
    if (cumSum >= half) break;
  }

  const left = items.slice(0, splitIdx);
  const right = items.slice(splitIdx);
  const frac = left.reduce((s, d) => s + d.value, 0) / total;

  if (w >= h) {
    const w1 = w * frac;
    return [
      ...binaryTreemap(left, x, y, w1, h),
      ...binaryTreemap(right, x + w1, y, w - w1, h),
    ];
  } else {
    const h1 = h * frac;
    return [
      ...binaryTreemap(left, x, y, w, h1),
      ...binaryTreemap(right, x, y + h1, w, h - h1),
    ];
  }
}

export function TreemapChart({ data }: { data: DistributionItem[] }) {
  const sorted = [...data].sort((a, b) => b.value - a.value);
  const total = sorted.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <p className="text-xs text-gray-400 text-center py-4">Aucune donnée</p>;

  const W = 300, H = 150;
  const cells = binaryTreemap(sorted, 0, 0, W, H);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg overflow-hidden" style={{ display: "block" }}>
      {cells.map(({ x, y, w, h, item }) => {
        const pct = Math.round((item.value / total) * 100);
        const maxChars = Math.max(2, Math.floor(w / 5.5));
        const label = item.label.length > maxChars ? item.label.slice(0, maxChars - 1) + "…" : item.label;
        const showValue = w > 30 && h > 22;
        const showLabel = w > 18 && h > 14;
        const fs = Math.min(9, Math.max(5.5, w / 8, h / 5));

        return (
          <g key={item.label}>
            <rect
              x={x + 0.75} y={y + 0.75}
              width={Math.max(w - 1.5, 0.5)} height={Math.max(h - 1.5, 0.5)}
              fill={svgColor(item.color)} rx="2" opacity="0.88"
            />
            {showLabel && (
              <text x={(x + w / 2).toFixed(1)} y={(y + h / 2 + (showValue ? -4 : 2)).toFixed(1)}
                textAnchor="middle" fontSize={fs.toFixed(1)} fontWeight="600"
                fill="white" opacity="0.95" style={{ pointerEvents: "none" }}>
                {label}
              </text>
            )}
            {showValue && (
              <text x={(x + w / 2).toFixed(1)} y={(y + h / 2 + 6).toFixed(1)}
                textAnchor="middle" fontSize={Math.max(5, fs - 1.5).toFixed(1)}
                fill="white" opacity="0.75" style={{ pointerEvents: "none" }}>
                {item.value} · {pct}%
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ── Radar Chart ───────────────────────────────────────────────────────────────

interface RadarChartProps {
  data: DistributionItem[];
  color?: string;
}

export function RadarChart({ data, color = "#6366f1" }: RadarChartProps) {
  const items = data.slice(0, 10); // Max 10 axes
  const n = items.length;

  if (n < 3)
    return <p className="text-xs text-gray-400 text-center py-4">Radar nécessite ≥ 3 éléments</p>;

  const CX = 90, CY = 80, R = 58;
  const maxVal = Math.max(...items.map((d) => d.value), 1);
  const angle = (i: number) => -Math.PI / 2 + (i / n) * 2 * Math.PI;

  const axisPoint = (i: number, radius: number) => ({
    x: CX + radius * Math.cos(angle(i)),
    y: CY + radius * Math.sin(angle(i)),
  });

  const rings = [0.25, 0.5, 0.75, 1];

  const dataPts = items.map((d, i) => {
    const r = (d.value / maxVal) * R;
    return axisPoint(i, r);
  });

  return (
    <svg viewBox="0 0 180 160" className="w-full max-w-xs mx-auto" style={{ display: "block" }}>
      {/* Anneaux de grille */}
      {rings.map((rFrac) => {
        const pts = items.map((_, i) => axisPoint(i, R * rFrac));
        return (
          <polygon key={rFrac}
            points={pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
            fill="none" stroke="#e5e7eb" strokeWidth="0.6"
          />
        );
      })}

      {/* Valeur sur anneau max */}
      <text x={(CX - 3).toFixed(1)} y={(CY - R - 3).toFixed(1)}
        textAnchor="middle" fontSize="5" fill="#9ca3af">{maxVal}</text>
      <text x={(CX - 3).toFixed(1)} y={(CY - R * 0.5 - 1).toFixed(1)}
        textAnchor="middle" fontSize="5" fill="#cbd5e1">{Math.round(maxVal * 0.5)}</text>

      {/* Axes */}
      {items.map((_, i) => {
        const outer = axisPoint(i, R);
        return (
          <line key={i}
            x1={CX.toFixed(1)} y1={CY.toFixed(1)}
            x2={outer.x.toFixed(1)} y2={outer.y.toFixed(1)}
            stroke="#d1d5db" strokeWidth="0.5"
          />
        );
      })}

      {/* Polygone de données */}
      <polygon
        points={dataPts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
        fill={color} fillOpacity="0.22" stroke={color} strokeWidth="1.6"
      />

      {/* Points */}
      {dataPts.map((p, i) => (
        <circle key={i} cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r="2.5"
          fill={color} stroke="white" strokeWidth="0.8" />
      ))}

      {/* Labels */}
      {items.map((d, i) => {
        const labelR = R + 11;
        const p = axisPoint(i, labelR);
        const textAnchor = p.x < CX - 6 ? "end" : p.x > CX + 6 ? "start" : "middle";
        const maxC = 9;
        const label = d.label.length > maxC ? d.label.slice(0, maxC - 1) + "…" : d.label;
        return (
          <g key={i}>
            <text x={p.x.toFixed(1)} y={(p.y - 2).toFixed(1)} textAnchor={textAnchor}
              fontSize="6.5" fontWeight="600" fill="#374151" className="dark:fill-gray-200">
              {label}
            </text>
            <text x={p.x.toFixed(1)} y={(p.y + 6).toFixed(1)} textAnchor={textAnchor}
              fontSize="5.5" fill="#6b7280">
              {d.value}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
