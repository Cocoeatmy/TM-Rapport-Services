"use client";

import type { Dispatch, SetStateAction } from "react";

export type StatsDateMode = "all" | "rolling12" | "range" | "month" | "year";

export interface StatsDateState {
  mode: StatsDateMode;
  from: string;
  to: string;
  month: string;
  year: string;
}

/** Retourne la plage [from, to] pour le mode rolling12 (12 derniers mois glissants). */
export function getRolling12Range(): { from: string; to: string } {
  const today = new Date();
  const to = today.toISOString().split("T")[0];
  const from = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate() + 1)
    .toISOString().split("T")[0];
  return { from, to };
}

export const DEFAULT_STATS_DATE_STATE: StatsDateState = {
  mode: "all",
  from: "",
  to: "",
  month: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`,
  year: String(new Date().getFullYear()),
};

interface StatsDateFilterProps {
  mode: StatsDateMode;
  from: string;
  to: string;
  month: string;
  year: string;
  onModeChange: Dispatch<SetStateAction<StatsDateMode>> | ((m: StatsDateMode) => void);
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  onMonthChange: (v: string) => void;
  onYearChange: (v: string) => void;
  className?: string;
}

const MOIS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

export function StatsDateFilter({
  mode,
  from,
  to,
  month,
  year,
  onModeChange,
  onFromChange,
  onToChange,
  onMonthChange,
  onYearChange,
  className,
}: StatsDateFilterProps) {
  const modes: { key: StatsDateMode; label: string }[] = [
    { key: "all", label: "Tout" },
    { key: "month", label: "Mois" },
    { key: "year", label: "Année" },
    { key: "rolling12", label: "12 mois" },
    { key: "range", label: "Période" },
  ];
  return (
    <div className={`bg-white dark:bg-slate-800 rounded-xl p-3 border border-gray-100 dark:border-gray-700 mb-4 ${className || ""}`}>
      <div className="flex gap-1.5 mb-2 flex-wrap">
        {modes.map((m) => (
          <button
            key={m.key}
            onClick={() => onModeChange(m.key)}
            className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
              mode === m.key
                ? "bg-[#1e3a5f] text-white"
                : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
      {mode === "range" && (
        <div className="flex gap-2 items-center">
          <input
            type="date"
            value={from}
            onChange={(e) => onFromChange(e.target.value)}
            className="text-xs border rounded-lg px-2 py-1.5 dark:bg-slate-700 dark:border-gray-600 dark:text-gray-200"
          />
          <span className="text-xs text-gray-400">→</span>
          <input
            type="date"
            value={to}
            onChange={(e) => onToChange(e.target.value)}
            className="text-xs border rounded-lg px-2 py-1.5 dark:bg-slate-700 dark:border-gray-600 dark:text-gray-200"
          />
        </div>
      )}
      {mode === "month" && (() => {
        const selectedYear = month ? month.split("-")[0] : String(new Date().getFullYear());
        const selectedMonth = month ? Number(month.split("-")[1]) : null;
        return (
          <div className="flex flex-wrap gap-1.5">
            {MOIS.map((m, i) => {
              const val = `${selectedYear}-${String(i + 1).padStart(2, "0")}`;
              const isActive = selectedMonth === i + 1;
              return (
                <button
                  key={m}
                  onClick={() => onMonthChange(val)}
                  className={`text-[11px] font-medium px-2.5 py-1.5 rounded-lg transition-colors ${
                    isActive
                      ? "bg-[#1e3a5f] text-white"
                      : "bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600"
                  }`}
                >
                  {m}
                </button>
              );
            })}
          </div>
        );
      })()}
      {mode === "year" && (() => {
        const currentYear = new Date().getFullYear();
        const startYear = 2024;
        const years: number[] = [];
        for (let y = startYear; y <= currentYear; y++) years.push(y);
        return (
          <div className="flex flex-wrap gap-1.5">
            {years.map((y) => (
              <button
                key={y}
                onClick={() => onYearChange(String(y))}
                className={`text-[11px] font-medium px-3 py-1.5 rounded-lg transition-colors ${
                  String(y) === year
                    ? "bg-[#1e3a5f] text-white"
                    : "bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600"
                }`}
              >
                {y}
              </button>
            ))}
          </div>
        );
      })()}
    </div>
  );
}

/** Filtre une liste de projets par leur dateMontage selon l'état de
 *  StatsDateFilter. Renvoie tout pour "all". */
export function filterByStatsDate<T extends { dateMontage?: string | null }>(
  projects: T[],
  dateMode: StatsDateMode,
  from: string,
  to: string,
  month: string,
  year: string,
): T[] {
  if (dateMode === "all") return projects;
  // Pour rolling12, calculer la plage dynamiquement
  const r12 = dateMode === "rolling12" ? getRolling12Range() : null;
  const effectiveFrom = r12 ? r12.from : from;
  const effectiveTo   = r12 ? r12.to   : to;
  return projects.filter((p) => {
    const d = (p.dateMontage || "").split("T")[0];
    if (!d) return false;
    if (dateMode === "range" || dateMode === "rolling12") {
      if (effectiveFrom && d < effectiveFrom) return false;
      if (effectiveTo   && d > effectiveTo)   return false;
      return true;
    }
    if (dateMode === "month") return d.startsWith(month);
    if (dateMode === "year") return d.startsWith(year);
    return true;
  });
}

/** Plage [start,end] (inclus) qui correspond à l'état du filtre.
 *  Sert à calculer une "période précédente" pour les comparaisons. */
export function getDateRangeFromState(state: StatsDateState): { start: string; end: string } | null {
  if (state.mode === "all") return null;
  if (state.mode === "range") {
    if (!state.from || !state.to) return null;
    return { start: state.from, end: state.to };
  }
  if (state.mode === "month" && state.month) {
    const [y, m] = state.month.split("-").map(Number);
    if (!y || !m) return null;
    const start = `${y}-${String(m).padStart(2, "0")}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const end = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    return { start, end };
  }
  if (state.mode === "year" && state.year) {
    return { start: `${state.year}-01-01`, end: `${state.year}-12-31` };
  }
  return null;
}

/** Calcule la période juste avant la période courante, de durée
 *  équivalente. Utilisé pour les comparaisons "vs période précédente". */
export function getPreviousRange(state: StatsDateState): { start: string; end: string } | null {
  const cur = getDateRangeFromState(state);
  if (!cur) return null;
  if (state.mode === "year") {
    const y = Number(state.year);
    return { start: `${y - 1}-01-01`, end: `${y - 1}-12-31` };
  }
  if (state.mode === "month") {
    const [y, m] = state.month.split("-").map(Number);
    const prevDate = new Date(y, m - 2, 1);
    const py = prevDate.getFullYear();
    const pm = prevDate.getMonth() + 1;
    const start = `${py}-${String(pm).padStart(2, "0")}-01`;
    const lastDay = new Date(py, pm, 0).getDate();
    const end = `${py}-${String(pm).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    return { start, end };
  }
  // range : même durée immédiatement avant
  const startMs = new Date(cur.start).getTime();
  const endMs = new Date(cur.end).getTime();
  const days = Math.round((endMs - startMs) / 86400000) + 1;
  const prevEnd = new Date(startMs - 86400000);
  const prevStart = new Date(prevEnd.getTime() - (days - 1) * 86400000);
  return {
    start: prevStart.toISOString().split("T")[0],
    end: prevEnd.toISOString().split("T")[0],
  };
}

/** Libellé humain pour la période active (pour titres de section). */
export function describeStatsRange(state: StatsDateState): string {
  if (state.mode === "all") return "Tout";
  if (state.mode === "year") return state.year;
  if (state.mode === "month" && state.month) {
    const [y, m] = state.month.split("-").map(Number);
    return `${MOIS[m - 1]} ${y}`;
  }
  if (state.mode === "range") {
    const fmt = (s: string) =>
      s ? new Date(s).toLocaleDateString("fr-CH", { day: "2-digit", month: "short", year: "2-digit" }) : "—";
    return `${fmt(state.from)} → ${fmt(state.to)}`;
  }
  return "";
}
