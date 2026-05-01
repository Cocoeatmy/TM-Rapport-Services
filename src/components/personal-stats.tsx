"use client";

import { useMemo, useState } from "react";
import type { Project } from "@/lib/notion";
import { getCollaboratorColor } from "@/lib/collaborators";
import { computeTimeDifference, formatMinutes } from "@/lib/time-utils";
import {
  StatsDateFilter,
  type StatsDateMode,
  type StatsDateState,
  filterByStatsDate,
  getDateRangeFromState,
  getPreviousRange,
  describeStatsRange,
} from "@/components/stats-date-filter";

interface PersonalStatsProps {
  userName: string;
  projects: Project[];
}

// --- Helpers ---

function isInRange(dateStr: string | null, range: { start: string; end: string } | null): boolean {
  if (!dateStr || !range) return false;
  const d = dateStr.split("T")[0];
  return d >= range.start && d <= range.end;
}

/** Supprime les diacritiques : "Loïc" → "loic", insensible à la casse. */
function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function userInProject(project: Project, userName: string): boolean {
  const collabs = (project.collaborateurs || "").split("&").map((s) => norm(s.trim()));
  const n = norm(userName);
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

  // Filtre par période — par défaut "Mois courant" pour préserver
  // l'expérience initiale ; l'utilisateur peut basculer sur Année,
  // une plage personnalisée, ou Tout.
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [dateMode, setDateMode] = useState<StatsDateMode>("month");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [dateMonth, setDateMonth] = useState(currentMonth);
  const [dateYear, setDateYear] = useState(String(now.getFullYear()));

  const filterState: StatsDateState = { mode: dateMode, from: dateFrom, to: dateTo, month: dateMonth, year: dateYear };
  const periodLabel = describeStatsRange(filterState);

  const stats = useMemo(() => {
    const myProjects = projects.filter((p) => userInProject(p, userName));

    // --- Période active (selon filtre) ---
    const periodProjects = filterByStatsDate(myProjects, dateMode, dateFrom, dateTo, dateMonth, dateYear);
    const cabinesPeriod = periodProjects.reduce((sum, p) => sum + getEffectiveCabines(p), 0);
    const projetsTermines = periodProjects.filter(
      (p) => p.heureDepart && p.heureDepart.trim() !== ""
    ).length;

    // Solo vs team breakdown
    const soloProjects = periodProjects.filter((p) => getCollabCount(p) === 1);
    const teamProjects = periodProjects.filter((p) => getCollabCount(p) > 1);
    const cabinesSolo = soloProjects.reduce((sum, p) => sum + (p.nbCabines || 0), 0);

    // Ventilation détaillée par configuration d'équipe : pour chaque
    // taille d'équipe (solo, binôme, trio, …) on calcule
    // projets / cabines totales / part personnelle / heures /
    // soucis. L'idée : voir si un monteur est plus productif seul
    // ou en équipe, et comparer la qualité de son travail (taux de
    // soucis) selon la configuration.
    interface TeamConfigStat {
      key: string;
      label: string;
      teamSize: number;
      projects: number;
      cabinesTotal: number;
      cabinesEffective: number;
      minutes: number;
      soucis: number;
    }
    const teamConfigsMap = new Map<string, TeamConfigStat>();
    periodProjects.forEach((p) => {
      const teamSize = getCollabCount(p);
      const label = getTeamLabel(p);
      const existing = teamConfigsMap.get(label) || {
        key: label,
        label,
        teamSize,
        projects: 0,
        cabinesTotal: 0,
        cabinesEffective: 0,
        minutes: 0,
        soucis: 0,
      };
      existing.projects++;
      existing.cabinesTotal += p.nbCabines || 0;
      existing.cabinesEffective += getEffectiveCabines(p);
      existing.minutes += getProjectMinutes(p);
      if (p.soucisMontage) existing.soucis++;
      teamConfigsMap.set(label, existing);
    });
    const teamConfigOrder = ["solo", "binôme", "trio", "quatuor", "team"];
    const teamConfigs: TeamConfigStat[] = teamConfigOrder
      .map((k) => teamConfigsMap.get(k))
      .filter((x): x is TeamConfigStat => x !== undefined);

    // Team composition breakdown (legacy — gardé pour la ligne de
    // synthèse sous la 1re carte, à voir si on la supprime).
    const teamBreakdown: Record<string, { projects: number; cabines: number }> = {};
    teamProjects.forEach((p) => {
      const label = getTeamLabel(p);
      if (!teamBreakdown[label]) teamBreakdown[label] = { projects: 0, cabines: 0 };
      teamBreakdown[label].projects++;
      teamBreakdown[label].cabines += p.nbCabines || 0;
    });

    const timesPeriod = periodProjects
      .map((p) => {
        const mins = getProjectMinutes(p);
        const cab = p.nbCabines || 1;
        return mins > 0 ? mins / cab : 0;
      })
      .filter((t) => t > 0);
    const avgTimePerCabine =
      timesPeriod.length > 0
        ? Math.round(timesPeriod.reduce((a, b) => a + b, 0) / timesPeriod.length)
        : 0;

    const totalMinutesPeriod = periodProjects.reduce((sum, p) => sum + getProjectMinutes(p), 0);

    // --- Streak (toujours depuis aujourd'hui, indépendant du filtre) ---
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
        checkDate.setDate(checkDate.getDate() - 1);
        continue;
      }
      const hasSoucis = dayProjects.some((p) => p.soucisMontage);
      if (hasSoucis) break;
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    }

    // --- Comparaison vs période précédente (ex. mois -1, année -1,
    //     plage de même durée juste avant). ---
    const prevRange = getPreviousRange(filterState);
    const prevProjects = prevRange
      ? myProjects.filter((p) => isInRange(p.dateMontage, prevRange))
      : [];
    const cabinesPrev = prevProjects.reduce((sum, p) => sum + getEffectiveCabines(p), 0);
    const totalMinutesPrev = prevProjects.reduce((sum, p) => sum + getProjectMinutes(p), 0);
    const soucisPeriod = periodProjects.filter((p) => p.soucisMontage).length;
    const soucisPrev = prevProjects.filter((p) => p.soucisMontage).length;
    const soucisRateThis = periodProjects.length > 0 ? soucisPeriod / periodProjects.length : 0;
    const soucisRateLast = prevProjects.length > 0 ? soucisPrev / prevProjects.length : 0;

    // --- Top stats (toute la carrière, pas filtré) ---
    const projectsWithTimePerCab = myProjects
      .filter((p) => getProjectMinutes(p) > 0 && (p.nbCabines || 0) > 0)
      .map((p) => ({
        project: p,
        timePerCab: getProjectMinutes(p) / (p.nbCabines || 1),
      }));
    const fastest = projectsWithTimePerCab.length > 0
      ? projectsWithTimePerCab.reduce((min, c) => (c.timePerCab < min.timePerCab ? c : min))
      : null;

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
      cabinesPeriod,
      cabinesSolo,
      teamBreakdown,
      teamConfigs,
      soloCount: soloProjects.length,
      teamCount: teamProjects.length,
      projetsTermines,
      avgTimePerCabine,
      totalMinutesPeriod,
      streak,
      cabinesPrev,
      totalMinutesPrev,
      soucisRateThis,
      soucisRateLast,
      hasPrev: prevRange !== null,
      fastest,
      mostCabinesDay,
      careerTotal,
    };
  }, [projects, userName, dateMode, dateFrom, dateTo, dateMonth, dateYear, filterState]);

  function pctChange(current: number, previous: number): { pct: number; up: boolean } {
    if (previous === 0) return { pct: current > 0 ? 100 : 0, up: current > 0 };
    const pct = Math.round(((current - previous) / previous) * 100);
    return { pct: Math.abs(pct), up: pct >= 0 };
  }

  const cabTrend = pctChange(stats.cabinesPeriod, stats.cabinesPrev);
  const hoursTrend = pctChange(stats.totalMinutesPeriod, stats.totalMinutesPrev);
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

      {/* Filtre période */}
      <StatsDateFilter
        mode={dateMode}
        from={dateFrom}
        to={dateTo}
        month={dateMonth}
        year={dateYear}
        onModeChange={setDateMode}
        onFromChange={setDateFrom}
        onToChange={setDateTo}
        onMonthChange={setDateMonth}
        onYearChange={setDateYear}
      />

      {/* Section 1: Période active */}
      <div className="glass-card rounded-2xl p-4">
        <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3">
          {periodLabel || "Période"}
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            label="Cabines (part effective)"
            value={stats.cabinesPeriod}
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
            value={formatMinutes(stats.totalMinutesPeriod)}
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

      {/* Section : ventilation par configuration d'équipe.
          Pour chaque taille (solo, binôme, trio…), on montre projets,
          cabines totales (équipe complète) ET part personnelle, heures
          travaillées, et taux de soucis. Permet de voir d'un coup
          d'œil si le monteur est plus productif seul ou en équipe. */}
      {stats.teamConfigs.length > 0 && (
        <div className="glass-card rounded-2xl p-4">
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3">
            Par configuration d&apos;équipe
          </h3>
          <div className="space-y-3">
            {stats.teamConfigs.map((cfg) => {
              const soucisRate = cfg.projects > 0 ? Math.round((cfg.soucis / cfg.projects) * 100) : 0;
              const avgPerCab =
                cfg.cabinesTotal > 0 ? Math.round(cfg.minutes / cfg.cabinesTotal) : 0;
              const isSolo = cfg.key === "solo";
              return (
                <div
                  key={cfg.key}
                  className="rounded-xl border border-gray-100 dark:border-gray-800 bg-white/60 dark:bg-white/5 p-3"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                        isSolo
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                          : cfg.key === "binôme"
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                            : cfg.key === "team"
                              ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                              : "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300"
                      }`}
                    >
                      {cfg.label}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {cfg.projects} projet{cfg.projects > 1 ? "s" : ""}
                      {!isSolo && ` · équipe de ${cfg.teamSize}`}
                    </span>
                    {cfg.projects > 0 && (
                      <span
                        className={`ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                          soucisRate > 20
                            ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                            : soucisRate > 10
                              ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300"
                              : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                        }`}
                      >
                        {soucisRate}% soucis
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div>
                      <p className="text-base font-bold text-gray-900 dark:text-gray-100">{cfg.cabinesTotal}</p>
                      <p className="text-[9px] text-gray-500 dark:text-gray-400 leading-tight">Cabines totales</p>
                    </div>
                    <div>
                      <p className="text-base font-bold text-gray-900 dark:text-gray-100">{cfg.cabinesEffective}</p>
                      <p className="text-[9px] text-gray-500 dark:text-gray-400 leading-tight">{isSolo ? "Cabines" : "Ta part"}</p>
                    </div>
                    <div>
                      <p className="text-base font-bold text-gray-900 dark:text-gray-100">
                        {cfg.minutes > 0 ? formatMinutes(cfg.minutes) : "--"}
                      </p>
                      <p className="text-[9px] text-gray-500 dark:text-gray-400 leading-tight">Heures équipe</p>
                    </div>
                    <div>
                      <p className="text-base font-bold text-gray-900 dark:text-gray-100">
                        {avgPerCab > 0 ? formatMinutes(avgPerCab) : "--"}
                      </p>
                      <p className="text-[9px] text-gray-500 dark:text-gray-400 leading-tight">Temps/cabine</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-gray-400 mt-2">
            « Cabines totales » = équipe complète. « Ta part » = cabines totales ÷ taille de l&apos;équipe.
          </p>
        </div>
      )}

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

      {/* Section 3: Évolution vs période précédente — masquée si le filtre
          est "Tout", car on n'a pas de période antérieure naturelle. */}
      {stats.hasPrev && (
        <div className="glass-card rounded-2xl p-4">
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3">
            {"É"}volution (vs p{"é"}riode pr{"é"}c{"é"}dente)
          </h3>
          <div className="grid grid-cols-3 gap-3">
            <TrendItem label="Cabines" up={cabTrend.up} pct={cabTrend.pct} good={cabTrend.up} />
            <TrendItem label="Heures" up={hoursTrend.up} pct={hoursTrend.pct} good={hoursTrend.up} />
            <TrendItem label="Soucis" up={!soucisImproved} pct={soucisChange.pct} good={soucisImproved} />
          </div>
        </div>
      )}

      {/* Section 4: Top stats */}
      <div className="glass-card rounded-2xl p-4">
        <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3">
          Top stats <span className="text-[10px] font-normal text-gray-400">· toute la carri{"è"}re</span>
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
            <span className="text-gray-600 dark:text-gray-400">Total cabines (carri{"è"}re)</span>
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
          {up ? "↑" : "↓"}
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
