"use client";

/**
 * Page Statistiques du thème « Signal ».
 *
 * Rendue UNIQUEMENT quand data-ui="signal" : les autres thèmes conservent la
 * page statistiques historique, inchangée. Ce composant ne calcule aucune
 * donnée métier — il reçoit les agrégats déjà produits par la page et se
 * limite à la présentation.
 *
 * Graphiques : SVG maison (aucune dépendance ajoutée), avec courbes lissées,
 * dégradés, tracé animé, curseur de survol et infobulle. Chaque série est
 * activable / désactivable depuis la légende, et l'échelle se recalcule sur
 * les seules séries visibles.
 */

import { useMemo, useState } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

export type SignalStatsMonth = {
  mesures: number; cabines: number; montages: number; demontages: number;
  services: number; sav: number; ofr: number; ca: number;
};

type SerieId = keyof SignalStatsMonth;

const SERIES: { id: SerieId; label: string; color: string; unit?: string }[] = [
  { id: "montages",   label: "Montages",   color: "#3b82f6" },
  { id: "cabines",    label: "Cabines",    color: "#22c55e" },
  { id: "mesures",    label: "Mesures",    color: "#06b6d4" },
  { id: "services",   label: "Services",   color: "#a855f7" },
  { id: "sav",        label: "SAV",        color: "#f59e0b" },
  { id: "demontages", label: "Démontages", color: "#f43f5e" },
  { id: "ofr",        label: "OFR",        color: "#94a3b8" },
];

const KPIS: { id: SerieId; label: string; color: string; money?: boolean }[] = [
  { id: "montages", label: "Montages", color: "#3b82f6" },
  { id: "cabines",  label: "Cabines mesurées", color: "#22c55e" },
  { id: "mesures",  label: "Mesures", color: "#06b6d4" },
  { id: "ca",       label: "Chiffre d'affaires", color: "#0f766e", money: true },
  { id: "services", label: "Services", color: "#a855f7" },
  { id: "sav",      label: "SAV", color: "#f59e0b" },
  { id: "ofr",      label: "Offres", color: "#64748b" },
  { id: "demontages", label: "Démontages", color: "#f43f5e" },
];

const MONTH_ABBR = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];

function fmt(n: number, money?: boolean): string {
  if (money) {
    if (Math.abs(n) >= 1000) return `${Math.round(n / 1000).toLocaleString("fr-CH")}k`;
    return Math.round(n).toLocaleString("fr-CH");
  }
  return Math.round(n).toLocaleString("fr-CH");
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  const i = Number(m) - 1;
  return `${MONTH_ABBR[i] ?? m} ${(y || "").slice(2)}`;
}

/** Courbe lissée (Catmull-Rom converti en cubiques) — rendu moderne sans dépendance. */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

export function SignalStats({
  byMonth,
  monthKeys,
  rangeLabel,
  filter,
}: {
  byMonth: Record<string, SignalStatsMonth>;
  monthKeys: string[];
  rangeLabel?: string;
  filter?: React.ReactNode;
}) {
  const [hidden, setHidden] = useState<Set<SerieId>>(() => new Set<SerieId>(["ofr", "demontages"]));
  const [shape, setShape] = useState<"line" | "area" | "bar">("area");
  const [hover, setHover] = useState<number | null>(null);

  const keys = useMemo(() => monthKeys.slice(-14), [monthKeys]);
  const rows = useMemo(
    () => keys.map((k) => ({ key: k, label: monthLabel(k), v: byMonth[k] })).filter((r) => !!r.v),
    [keys, byMonth]
  );

  const totals = useMemo(() => {
    const t: Record<string, number> = {};
    (Object.keys(SERIES.reduce((a, s) => ({ ...a, [s.id]: 1 }), { ca: 1 } as Record<string, number>)) as string[])
      .forEach((id) => { t[id] = 0; });
    monthKeys.forEach((k) => {
      const v = byMonth[k];
      if (!v) return;
      (Object.keys(v) as SerieId[]).forEach((id) => { t[id] = (t[id] || 0) + (v[id] || 0); });
    });
    return t;
  }, [monthKeys, byMonth]);

  /** Variation du dernier mois complet par rapport au précédent. */
  const delta = (id: SerieId): number | null => {
    if (rows.length < 2) return null;
    const a = rows[rows.length - 2].v[id] || 0;
    const b = rows[rows.length - 1].v[id] || 0;
    if (a === 0) return b === 0 ? 0 : null;
    return ((b - a) / a) * 100;
  };

  const visible = SERIES.filter((s) => !hidden.has(s.id));
  const max = Math.max(1, ...rows.flatMap((r) => visible.map((s) => r.v[s.id] || 0)));

  // Géométrie du graphe
  const W = 1000, H = 340, PL = 44, PR = 16, PT = 18, PB = 34;
  const iw = W - PL - PR, ih = H - PT - PB;
  const x = (i: number) => (rows.length <= 1 ? PL + iw / 2 : PL + (i / (rows.length - 1)) * iw);
  const y = (v: number) => PT + ih - (v / max) * ih;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));

  const toggle = (id: SerieId) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (rows.length === 0) return;
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    const ratio = Math.max(0, Math.min(1, (px - PL) / iw));
    setHover(Math.round(ratio * (rows.length - 1)));
  };

  return (
    <div className="sgs">
      <div className="sgs-head">
        <div>
          <h1 className="sgs-h1">Statistiques</h1>
          {rangeLabel && <p className="sgs-sub">{rangeLabel}</p>}
        </div>
      </div>

      {filter && <div className="sgs-filter">{filter}</div>}

      {/* Indicateurs clés */}
      <div className="sgs-kpis">
        {KPIS.map((k, i) => {
          const d = delta(k.id);
          const spark = rows.map((r) => r.v[k.id] || 0);
          const sMax = Math.max(1, ...spark);
          const sPts = spark.map((v, idx) => ({
            x: spark.length <= 1 ? 50 : (idx / (spark.length - 1)) * 100,
            y: 26 - (v / sMax) * 22,
          }));
          return (
            <div key={k.id} className="sgs-kpi" style={{ animationDelay: `${i * 45}ms` }}>
              <div className="sgs-kpi-top">
                <span className="sgs-kpi-label">{k.label}</span>
                {d !== null && (
                  <span className={`sgs-delta ${d > 0.5 ? "up" : d < -0.5 ? "down" : "flat"}`}>
                    {d > 0.5 ? <TrendingUp className="w-3 h-3" /> : d < -0.5 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                    {Math.abs(Math.round(d))}%
                  </span>
                )}
              </div>
              <span className="sgs-kpi-value" style={{ color: k.color }}>{fmt(totals[k.id] || 0, k.money)}</span>
              <svg className="sgs-spark" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">
                <path d={smoothPath(sPts)} fill="none" stroke={k.color} strokeWidth="2" strokeLinecap="round" opacity="0.75" />
              </svg>
            </div>
          );
        })}
      </div>

      {/* Graphe principal */}
      <div className="sgs-card">
        <div className="sgs-card-head">
          <div>
            <h2 className="sgs-card-title">Tendance mensuelle</h2>
            <p className="sgs-card-meta">{rows.length} mois · cliquez une série pour l'afficher ou la masquer</p>
          </div>
          <div className="sgs-seg">
            {([["area", "Aires"], ["line", "Lignes"], ["bar", "Barres"]] as const).map(([v, lbl]) => (
              <button key={v} type="button" onClick={() => setShape(v)} className={shape === v ? "is-on" : ""}>{lbl}</button>
            ))}
          </div>
        </div>

        <div className="sgs-chart" onMouseLeave={() => setHover(null)}>
          <svg viewBox={`0 0 ${W} ${H}`} className="sgs-svg" onMouseMove={onMove} role="img" aria-label="Tendance mensuelle">
            <defs>
              {visible.map((s) => (
                <linearGradient key={s.id} id={`sgs-g-${s.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity="0.34" />
                  <stop offset="100%" stopColor={s.color} stopOpacity="0.02" />
                </linearGradient>
              ))}
            </defs>

            {ticks.map((t, i) => (
              <g key={i}>
                <line x1={PL} y1={y(t)} x2={W - PR} y2={y(t)} className="sgs-grid" />
                <text x={PL - 10} y={y(t) + 4} textAnchor="end" className="sgs-axis">{fmt(t)}</text>
              </g>
            ))}

            {shape === "bar" && rows.map((r, i) => {
              const bw = Math.max(2, (iw / Math.max(1, rows.length)) / Math.max(1, visible.length) - 2);
              return visible.map((s, si) => {
                const v = r.v[s.id] || 0;
                const bx = x(i) - (visible.length * (bw + 2)) / 2 + si * (bw + 2);
                const bh = Math.max(0, PT + ih - y(v));
                return (
                  <rect key={`${r.key}-${s.id}`} x={bx} y={y(v)} width={bw} height={bh} rx="2"
                    fill={s.color} className="sgs-bar" style={{ animationDelay: `${i * 22 + si * 8}ms` }} />
                );
              });
            })}

            {shape !== "bar" && visible.map((s, si) => {
              const pts = rows.map((r, i) => ({ x: x(i), y: y(r.v[s.id] || 0) }));
              const d = smoothPath(pts);
              return (
                <g key={s.id}>
                  {shape === "area" && pts.length > 1 && (
                    <path d={`${d} L ${pts[pts.length - 1].x} ${PT + ih} L ${pts[0].x} ${PT + ih} Z`}
                      fill={`url(#sgs-g-${s.id})`} className="sgs-area" style={{ animationDelay: `${si * 70}ms` }} />
                  )}
                  <path d={d} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    className="sgs-line" style={{ animationDelay: `${si * 70}ms` }} />
                  {pts.map((p, i) => (
                    <circle key={i} cx={p.x} cy={p.y} r={hover === i ? 5 : 3} fill="var(--sg-paper)" stroke={s.color} strokeWidth="2.5" className="sgs-dot" />
                  ))}
                </g>
              );
            })}

            {hover !== null && rows[hover] && (
              <line x1={x(hover)} y1={PT} x2={x(hover)} y2={PT + ih} className="sgs-cursor" />
            )}

            {rows.map((r, i) => (
              <text key={r.key} x={x(i)} y={H - 10} textAnchor="middle"
                className={`sgs-axis${hover === i ? " is-on" : ""}`}>{r.label}</text>
            ))}
          </svg>

          {hover !== null && rows[hover] && (
            <div className="sgs-tip" style={{ left: `${(x(hover) / W) * 100}%` }}>
              <span className="sgs-tip-title">{rows[hover].label}</span>
              {visible.map((s) => (
                <span key={s.id} className="sgs-tip-row">
                  <i style={{ background: s.color }} />
                  <span className="sgs-tip-k">{s.label}</span>
                  <span className="sgs-tip-v">{fmt(rows[hover].v[s.id] || 0)}</span>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Légende cliquable */}
        <div className="sgs-legend">
          {SERIES.map((s) => {
            const off = hidden.has(s.id);
            return (
              <button key={s.id} type="button" onClick={() => toggle(s.id)} aria-pressed={!off}
                className={`sgs-leg${off ? " is-off" : ""}`}>
                <i style={{ background: off ? "transparent" : s.color, borderColor: s.color }} />
                {s.label}
                <span className="sgs-leg-v">{fmt(totals[s.id] || 0)}</span>
              </button>
            );
          })}
          <button type="button" className="sgs-leg sgs-leg-all" onClick={() => setHidden(new Set())}>Tout afficher</button>
        </div>
      </div>

      {/* Détail mensuel */}
      <div className="sgs-card">
        <div className="sgs-card-head">
          <h2 className="sgs-card-title">Détail mensuel</h2>
          <span className="sgs-card-meta">séries visibles uniquement</span>
        </div>
        <div className="sgs-table" role="table">
          <div className="sgs-tr sgs-th" role="row">
            <span role="columnheader">Mois</span>
            {visible.map((s) => <span key={s.id} role="columnheader" className="sgs-right">{s.label}</span>)}
          </div>
          {[...rows].reverse().map((r) => (
            <div key={r.key} className="sgs-tr" role="row">
              <span role="cell" className="sgs-tr-m">{r.label}</span>
              {visible.map((s) => {
                const v = r.v[s.id] || 0;
                return (
                  <span key={s.id} role="cell" className="sgs-cell">
                    <i className="sgs-cell-bar" style={{ width: `${(v / max) * 100}%`, background: s.color }} />
                    <span className="sgs-cell-v">{fmt(v)}</span>
                  </span>
                );
              })}
            </div>
          ))}
          {rows.length === 0 && <p className="sgs-empty">Aucune donnée sur cette période.</p>}
        </div>
      </div>
    </div>
  );
}
