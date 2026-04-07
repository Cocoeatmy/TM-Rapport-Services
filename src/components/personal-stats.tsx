"use client";

import { useMemo } from "react";
import type { Project } from "@/lib/notion";
import { getCollaboratorColor } from "@/lib/collaborators";
import { parseTime, computeTimeDifference, formatMinutes } from "@/lib/time-utils";

interface PersonalStatsProps {
  userName: string;
  projects: Project[];
}

// --- Helpers ---

function getMonthRange(offset: number): { start: string; end: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + offset;
  const d = new Date(year, month, 1);
  const dEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return {
    start: d.toISOString().split("T")[0],
    end: dEnd.toISOString().split("T")[0],
  };
}

function isInMonth(dateStr: string | null, range: { start: string; end: string }): boolean {
  if (!dateStr) return false;
  const d = dateStr.split("T")[0];
  return d >= range.start && d <= range.end;
}

function userInProject(project: Project, userName: string): boolean {
  const collabs = (project.collaborateurs || "").split("&").map((s) => s.trim().toLowerCase());
  const n = userName.toLowerCase();
  return collabs.some((c) => c === n || c.split(/\s+/).some((w) => w === n));
}

function getCollabCount(project: Project): number {
  return (project.collaborateurs || "").split("&").map((s) => s.trim()).filter(Boolean).length || 1;
}

function getTeamLabel(project: Project): string {
  const count = getCollabCount(project);
  if (count === 1) return "solo";
  if (count === 2) return "binôme";
  if (count === 3) return "trio";
  if (count === 4) return "quatuor";
  return "team";
}

function getEffectiveCabines(project: Project): number {
  return Math.round((project.nbCabines || 0) / getCollabCount(project));
}

function getProjectMinutes(p: Project): number {
  return computeTimeDifference(p.heureArrivee || "", p.heureDepart || "");
}

function getDateStr(dateStr: string | null): string {
  if (!dateStr) return "";
  return dateStr.split("T")[0];
}

// --- Component ---

export function PersonalStats({ userName, projects }: PersonalStatsProps) {
  const color = getCollaboratorColor(userName);
  const thisMonth = getMonthRange(0);
  const lastMonth = getMonthRange(-1);

  const stats = useMemo(() => {
    const myProjects = projects.filter((p) => userInProject(p, userName));

    // --- This month ---
    const thisMonthProjects = myProjects.filter((p) => isInMonth(p.dateMontage, thisMonth));
    const cabinesThisMonth = thisMonthProjects.reduce((sum, p) => sum + getEffectiveCabines(p), 0);
    const projetsTermines = thisMonthProjects.filter(
      (p) => p.heureDepart && p.heureDepart.trim() !== ""
    ).length;

    // Solo vs team breakdown
    const soloProjects = thisMonthProjects.filter((p) => getCollabCount(p) === 1);
    const teamProjects = thisMonthProjects.filter((p) => getCollabCount(p) > 1);
    const cabinesSolo = soloProjects.reduce((sum, p) => sum + (p.nbCabines || 0), 0);
    const cabinesTeam = teamProjects.reduce((sum, p) => sum + getEffectiveCabines(p), 0);
    const cabinesTeamTotal = teamProjects.reduce((sum, p) => sum + (p.nbCabines || 0), 0);

    // Team composition breakdown
    const teamBreakdown: Record<string, { projects: number; cabines: number }> = {};
    teamProjects.forEach((p) => {
      const label = getTeamLabel(p);
      if (!teamBreakdown[label]) teamBreakdown[label] = { projects: 0, cabines: 0 };
      teamBreakdown[label].projects++;
      teamBreakdown[label].cabines += p.nbCabines || 0;
    });

    const timesThisMonth = thisMonthProjects
      .map((p) => {
        const mins = getProjectMinutes(p);
        const cab = p.nbCabines || 1;
        return mins > 0 ? mins / cab : 0;
      })
      .filter((t) => t > 0);
    const avgTimePerCabine =
      timesThisMonth.length > 0
        ? Math.round(timesThisMonth.reduce((a, b) => a + b, 0) / timesThisMonth.length)
        : 0;

    const totalMinutesThisMonth = thisMonthProjects.reduce(
      (sum, p) => sum + getProjectMinutes(p),
      0
    );

    // --- Streak ---
    const today = new Date();
    let streak = 0;
    const projectsByDate = new Map<string, Project[]>();
    for (const p of myProjects) {
      const ds = getDateStr(p.dateMontage);
      if (!ds) continue;
      if (!projectsByDate.has(ds)) projectsByDate.set(ds, []);
      projectsByDate.get(ds)!.push(p);
    }

    const checkDate = new Date(today);
    for (let i = 0; i < 365; i++) {
      const ds = checkDate.toISOString().split("T")[0];
      const dayProjects = projectsByDate.get(ds);
      if (!dayProjects || dayProjects.length === 0) {
        // No projects this day - skip (weekends, off days)
        // But only skip if there were no projects; break if there were projects with soucis
        checkDate.setDate(checkDate.getDate() - 1);
        continue;
      }
      const hasSoucis = dayProjects.some((p) => p.soucisMontage);
      if (hasSoucis) break;
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    }

    // --- Last month comparison ---
    const lastMonthProjects = myProjects.filter((p) => isInMonth(p.dateMontage, lastMonth));
    const cabinesLastMonth = lastMonthProjects.reduce((sum, p) => sum + getEffectiveCabines(p), 0);
    const totalMinutesLastMonth = lastMonthProjects.reduce(
      (sum, p) => sum + getProjectMinutes(p),
      0
    );
    const soucisThisMonth = thisMonthProjects.filter((p) => p.soucisMontage).length;
    const soucisLastMonth = lastMonthProjects.filter((p) => p.soucisMontage).length;

    const soucisRateThis =
      thisMonthProjects.length > 0 ? soucisThisMonth / thisMonthProjects.length : 0;
    const soucisRateLast =
      lastMonthProjects.length > 0 ? soucisLastMonth / lastMonthProjects.length : 0;

    // --- Top stats ---
    const projectsWithTimePerCab = myProjects
      .filter((p) => getProjectMinutes(p) > 0 && (p.nbCabines || 0) > 0)
      .map((p) => ({
        project: p,
        timePerCab: getProjectMinutes(p) / (p.nbCabines || 1),
      }));
    const fastest = projectsWithTimePerCab.length > 0
      ? projectsWithTimePerCab.reduce((min, c) => (c.timePerCab < min.timePerCab ? c : min))
      : null;

    // Most cabines in one day
    const cabinesByDay = new Map<string, number>();
    for (const p of myProjects) {
      const ds = getDateStr(p.dateMontage);
      if (!ds) continue;
      cabinesByDay.set(ds, (cabinesByDay.get(ds) || 0) + (p.nbCabines || 0));
    }
    let mostCabinesDay = { date: "", count: 0 };
    cabinesByDay.forEach((count, date) => {
      if (count > mostCabinesDay.count) mostCabinesDay = { date, count };
    });

    const careerTotal = myProjects.reduce((sum, p) => sum + getEffectiveCabines(p), 0);

    return {
      cabinesThisMonth,
      cabinesSolo,
      cabinesTeam,
      cabinesTeamTotal,
      teamBreakdown,
      soloCount: soloProjects.length,
      teamCount: teamProjects.length,
      projetsTermines,
      avgTimePerCabine,
      totalMinutesThisMonth,
      streak,
      cabinesLastMonth,
      totalMinutesLastMonth,
      soucisRateThis,
      soucisRateLast,
      fastest,
      mostCabinesDay,
      careerTotal,
    };
  }, [projects, userName, thisMonth.start, thisMonth.end, lastMonth.start, lastMonth.end]);

  function pctChange(current: number, previous: number): { pct: number; up: boolean } {
    if (previous === 0) return { pct: current > 0 ? 100 : 0, up: current > 0 };
    const pct = Math.round(((current - previous) / previous) * 100);
    return { pct: Math.abs(pct), up: pct >= 0 };
  }

  const cabTrend = pctChange(stats.cabinesThisMonth, stats.cabinesLastMonth);
  const hoursTrend = pctChange(stats.totalMinutesThisMonth, stats.totalMinutesLastMonth);
  // For soucis rate, DOWN is good (improvement)
  const soucisImproved = stats.soucisRateThis <= stats.soucisRateLast;
  const soucisChange = pctChange(stats.soucisRateThis * 100, stats.soucisRateLast * 100);

  return (
    <div className="mt-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <span
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: color.dot }}
        />
        <h2
          className="text-lg font-bold"
          style={{ color: color.text }}
        >
          Statistiques de {userName}
        </h2>
      </div>

      {/* Section 1: Ce mois */}
      <div className="glass-card rounded-2xl p-4">
        <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3">
          Ce mois
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            label="Cabines (part effective)"
            value={stats.cabinesThisMonth}
            color={color.dot}
          />
          <StatCard
            label="Projets terminés"
            value={stats.projetsTermines}
            color={color.dot}
          />
          <StatCard
            label="Temps moy/cabine"
            value={stats.avgTimePerCabine > 0 ? formatMinutes(stats.avgTimePerCabine) : "--"}
            color={color.dot}
          />
          <StatCard
            label="Heures totales"
            value={formatMinutes(stats.totalMinutesThisMonth)}
            color={color.dot}
          />
        </div>

        {/* Ventilation solo / équipe */}
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500 dark:text-gray-400">Solo ({stats.soloCount} projet{stats.soloCount > 1 ? "s" : ""})</span>
            <span className="font-semibold text-gray-900 dark:text-gray-100">{stats.cabinesSolo} cab.</span>
          </div>
          {Object.entries(stats.teamBreakdown).map(([label, data]) => (
            <div key={label} className="flex items-center justify-between text-xs">
              <span className="text-gray-500 dark:text-gray-400">
                <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full mr-1 ${label === "team" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>{label}</span>
                ({data.projects} projet{data.projects > 1 ? "s" : ""})
              </span>
              <span className="font-semibold text-gray-900 dark:text-gray-100">
                {data.cabines} cab. total · ~{Math.round(data.cabines / (label === "binôme" ? 2 : label === "trio" ? 3 : label === "quatuor" ? 4 : 5))}/pers.
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Section 2: Streak */}
      <div className="glass-card rounded-2xl p-4">
        <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3">
          Streak
        </h3>
        <div className="flex items-center gap-3">
          <span className="text-3xl">🔥</span>
          <div className="flex-1">
            <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
              {stats.streak} jour{stats.streak !== 1 ? "s" : ""} sans soucis
            </p>
            {/* Progress bar */}
            <div className="mt-2 h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min((stats.streak / 15) * 100, 100)}%`,
                  backgroundColor: stats.streak > 10 ? "#eab308" : stats.streak > 5 ? "#22c55e" : color.dot,
                }}
              />
            </div>
          </div>
          {stats.streak > 10 && (
            <span className="text-xs font-bold px-2 py-1 rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
              Imbattable!
            </span>
          )}
          {stats.streak > 5 && stats.streak <= 10 && (
            <span className="text-xs font-bold px-2 py-1 rounded-full bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
              Excellent!
            </span>
          )}
        </div>
      </div>

      {/* Section 3: Evolution */}
      <div className="glass-card rounded-2xl p-4">
        <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3">
          {"\u00C9"}volution (vs mois dernier)
        </h3>
        <div className="grid grid-cols-3 gap-3">
          <TrendItem
            label="Cabines"
            up={cabTrend.up}
            pct={cabTrend.pct}
            good={cabTrend.up}
          />
          <TrendItem
            label="Heures"
            up={hoursTrend.up}
            pct={hoursTrend.pct}
            good={hoursTrend.up}
          />
          <TrendItem
            label="Soucis"
            up={!soucisImproved}
            pct={soucisChange.pct}
            good={soucisImproved}
          />
        </div>
      </div>

      {/* Section 4: Top stats */}
      <div className="glass-card rounded-2xl p-4">
        <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3">
          Top stats
        </h3>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-400">Installation la plus rapide</span>
            <span className="font-semibold text-gray-900 dark:text-gray-100">
              {stats.fastest
                ? `${formatMinutes(Math.round(stats.fastest.timePerCab))}/cab`
                : "--"}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-400">Max cabines en 1 jour</span>
            <span className="font-semibold text-gray-900 dark:text-gray-100">
              {stats.mostCabinesDay.count > 0 ? stats.mostCabinesDay.count : "--"}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-400">Total cabines (carri{"\u00E8"}re)</span>
            <span className="font-bold text-lg" style={{ color: color.dot }}>
              {stats.careerTotal}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Sub-components ---

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="rounded-xl bg-white/60 dark:bg-white/5 border border-gray-100 dark:border-gray-800 p-3 text-center">
      <p
        className="text-2xl font-bold"
        style={{ color }}
      >
        {value}
      </p>
      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">{label}</p>
    </div>
  );
}

function TrendItem({
  label,
  up,
  pct,
  good,
}: {
  label: string;
  up: boolean;
  pct: number;
  good: boolean;
}) {
  return (
    <div className="text-center">
      <div className="flex items-center justify-center gap-1">
        <span
          className={`text-lg font-bold ${good ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}
        >
          {up ? "\u2191" : "\u2193"}
        </span>
        <span
          className={`text-sm font-semibold ${good ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}
        >
          {pct}%
        </span>
      </div>
      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{label}</p>
    </div>
  );
}
