"use client";

import { Fragment, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Clock,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Shield,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCollaboratorColor } from "@/lib/collaborators";
import { COLLABORATEURS_LIST } from "@/lib/constants";
import type { Project } from "@/lib/notion";

// --- Utility functions ---

function parseTimeString(raw: string): number {
  // Parse "HH:MM" to minutes since midnight
  const match = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return -1;
  return parseInt(match[1]) * 60 + parseInt(match[2]);
}

interface TimeEntry {
  date: string;
  collaborateur: string;
  arrivee: string;
  depart: string;
  minutes: number;
  projectName: string;
  projectId: string;
}

function parseProjectHours(project: Project): TimeEntry[] {
  const entries: TimeEntry[] = [];
  const ha = project.heureArrivee || "";
  const hd = project.heureDepart || "";

  // Check for multi-day format: "2026-04-07 Claudio 08:30 | 2026-04-08 Claudio 07:00"
  const isMultiArrival = ha.includes("|");
  const isMultiDepart = hd.includes("|");

  if (isMultiArrival || isMultiDepart) {
    const arrParts = ha.split("|").map((s) => s.trim()).filter(Boolean);
    const depParts = hd.split("|").map((s) => s.trim()).filter(Boolean);

    // Parse multi entries: "2026-04-07 Claudio 08:30"
    const parseMulti = (parts: string[]) =>
      parts.map((part) => {
        const tokens = part.trim().split(/\s+/);
        // format: date [collaborateur] time
        if (tokens.length >= 3) {
          return { date: tokens[0], collaborateur: tokens.slice(1, -1).join(" "), time: tokens[tokens.length - 1] };
        }
        if (tokens.length === 2) {
          // could be "date time" or "collaborateur time"
          if (tokens[0].match(/^\d{4}-\d{2}-\d{2}$/)) {
            return { date: tokens[0], collaborateur: "", time: tokens[1] };
          }
          return { date: "", collaborateur: tokens[0], time: tokens[1] };
        }
        if (tokens.length === 1) {
          return { date: "", collaborateur: "", time: tokens[0] };
        }
        return { date: "", collaborateur: "", time: "" };
      });

    const arrivals = parseMulti(arrParts);
    const departures = parseMulti(depParts);

    const maxLen = Math.max(arrivals.length, departures.length);
    for (let i = 0; i < maxLen; i++) {
      const arr = arrivals[i] || { date: "", collaborateur: "", time: "" };
      const dep = departures[i] || { date: "", collaborateur: "", time: "" };
      const date = arr.date || dep.date || project.dateMontage?.split("T")[0] || "";
      const collab = arr.collaborateur || dep.collaborateur || "";
      const arrMin = parseTimeString(arr.time);
      const depMin = parseTimeString(dep.time);
      const diff = arrMin >= 0 && depMin >= 0 ? depMin - arrMin : 0;

      entries.push({
        date,
        collaborateur: collab,
        arrivee: arr.time || "",
        depart: dep.time || "",
        minutes: diff > 0 ? diff : 0,
        projectName: project.projet,
        projectId: project.id,
      });
    }
  } else {
    // Simple format: just "HH:MM"
    if (!ha && !hd) return entries;
    const arrMin = parseTimeString(ha);
    const depMin = parseTimeString(hd);
    const diff = arrMin >= 0 && depMin >= 0 ? depMin - arrMin : 0;
    entries.push({
      date: project.dateMontage?.split("T")[0] || "",
      collaborateur: project.collaborateurs || "",
      arrivee: ha,
      depart: hd,
      minutes: diff > 0 ? diff : 0,
      projectName: project.projet,
      projectId: project.id,
    });
  }

  return entries;
}

function formatMinutes(min: number): string {
  if (min <= 0) return "0h 00min";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m.toString().padStart(2, "0")}min`;
}

function getWeekNumber(dateStr: string): number {
  const d = new Date(dateStr);
  const dayOfYear = Math.floor(
    (d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / 86400000
  );
  return Math.ceil((dayOfYear + new Date(d.getFullYear(), 0, 1).getDay() + 1) / 7);
}

function getMonthStr(offset: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}`;
}

function monthLabel(m: string): string {
  const [y, mo] = m.split("-");
  const months = [
    "Janvier", "Fevrier", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Aout", "Septembre", "Octobre", "Novembre", "Decembre",
  ];
  return `${months[parseInt(mo) - 1]} ${y}`;
}

export default function HeuresPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [monthOffset, setMonthOffset] = useState(0);

  const selectedMonth = getMonthStr(monthOffset);

  useEffect(() => {
    fetch("/api/auth")
      .then((r) => r.json())
      .then((data) => {
        if (data.user?.role !== "admin") {
          router.push("/");
          return;
        }
        setIsAdmin(true);
      });

    Promise.all([
      fetch("/api/projects").then((r) => r.json()),
      fetch("/api/projects/cmd-termine").then((r) => r.json()),
    ]).then(([enCours, termines]) => {
      const all = [
        ...(Array.isArray(enCours) ? enCours : []),
        ...(Array.isArray(termines) ? termines : []),
      ];
      setProjects(all);
    }).finally(() => setLoading(false));
  }, [router]);

  if (!isAdmin || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  // Parse all time entries from projects
  const allEntries = projects.flatMap(parseProjectHours);

  // Filter entries for selected month
  const monthEntries = allEntries.filter((e) => e.date.startsWith(selectedMonth));

  // Group by collaborator
  const collabMap = new Map<string, TimeEntry[]>();
  for (const entry of monthEntries) {
    // Try to match collaborator to known list
    const matchedCollab = COLLABORATEURS_LIST.find(
      (c) => entry.collaborateur.toLowerCase().includes(c.toLowerCase())
    ) || entry.collaborateur || "Non assigne";

    if (!collabMap.has(matchedCollab)) collabMap.set(matchedCollab, []);
    collabMap.get(matchedCollab)!.push(entry);
  }

  // Sort collaborators alphabetically
  const collabEntries = Array.from(collabMap.entries()).sort(([a], [b]) =>
    a.localeCompare(b)
  );

  // Grand total
  const grandTotal = monthEntries.reduce((s, e) => s + e.minutes, 0);

  return (
    <div className="max-w-4xl mx-auto w-full px-4 py-4 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <button
          onClick={() => router.push("/admin")}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 active:bg-gray-200 shrink-0"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-600 shrink-0" />
            Heures de travail
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Suivi des heures par collaborateur
          </p>
        </div>
      </div>

      {/* Month selector */}
      <div className="flex items-center justify-center gap-4 mb-6">
        <button
          onClick={() => setMonthOffset((o) => o - 1)}
          className="w-9 h-9 flex items-center justify-center rounded-full glass-card hover:bg-white/80 dark:hover:bg-white/10 transition-all"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="text-lg font-semibold text-gray-900 dark:text-gray-100 min-w-[180px] text-center">
          {monthLabel(selectedMonth)}
        </span>
        <button
          onClick={() => setMonthOffset((o) => o + 1)}
          className="w-9 h-9 flex items-center justify-center rounded-full glass-card hover:bg-white/80 dark:hover:bg-white/10 transition-all"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Grand total card */}
      <div className="glass-card rounded-2xl p-4 text-center mb-6">
        <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">
          {formatMinutes(grandTotal)}
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Total heures - {monthLabel(selectedMonth)}
        </p>
      </div>

      {collabEntries.length === 0 && (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500">
          <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Aucune heure enregistree pour ce mois</p>
        </div>
      )}

      {/* Per-collaborator tables */}
      {collabEntries.map(([collab, entries]) => {
        const colors = getCollaboratorColor(collab);
        const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
        const collabTotal = entries.reduce((s, e) => s + e.minutes, 0);

        // Group by week for subtotals
        const weekMap = new Map<number, TimeEntry[]>();
        for (const e of sorted) {
          const wk = getWeekNumber(e.date);
          if (!weekMap.has(wk)) weekMap.set(wk, []);
          weekMap.get(wk)!.push(e);
        }
        const weeks = Array.from(weekMap.entries()).sort(([a], [b]) => a - b);

        return (
          <Card key={collab} className="mb-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                  style={{ backgroundColor: colors.bg, color: colors.text }}
                >
                  {collab[0]}
                </div>
                <span className="flex-1">{collab}</span>
                <span
                  className="text-sm font-bold px-3 py-1 rounded-full"
                  style={{ backgroundColor: colors.bg, color: colors.text }}
                >
                  {formatMinutes(collabTotal)}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                      <th className="text-left py-2 pr-2">Date</th>
                      <th className="text-left py-2 pr-2">Projet</th>
                      <th className="text-center py-2 px-2">Arrivee</th>
                      <th className="text-center py-2 px-2">Depart</th>
                      <th className="text-right py-2 pl-2">Heures</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weeks.map(([weekNum, weekEntries]) => {
                      const weekTotal = weekEntries.reduce(
                        (s, e) => s + e.minutes,
                        0
                      );
                      return (
                        <Fragment key={weekNum}>
                          {weekEntries.map((e, i) => {
                            const d = new Date(e.date);
                            const dayLabel = d.toLocaleDateString("fr-CH", {
                              weekday: "short",
                              day: "2-digit",
                              month: "short",
                            });
                            return (
                              <tr
                                key={`${e.date}-${e.projectId}-${i}`}
                                className="border-b border-gray-50 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                              >
                                <td className="py-1.5 pr-2 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                                  {dayLabel}
                                </td>
                                <td className="py-1.5 pr-2 text-gray-900 dark:text-gray-100 truncate max-w-[150px]">
                                  {e.projectName}
                                </td>
                                <td className="py-1.5 px-2 text-center text-gray-600 dark:text-gray-400 font-mono">
                                  {e.arrivee || "-"}
                                </td>
                                <td className="py-1.5 px-2 text-center text-gray-600 dark:text-gray-400 font-mono">
                                  {e.depart || "-"}
                                </td>
                                <td className="py-1.5 pl-2 text-right font-medium text-gray-900 dark:text-gray-100">
                                  {e.minutes > 0
                                    ? formatMinutes(e.minutes)
                                    : "-"}
                                </td>
                              </tr>
                            );
                          })}
                          {/* Weekly subtotal */}
                          <tr className="bg-gray-50 dark:bg-gray-800/30">
                            <td
                              colSpan={4}
                              className="py-1.5 pr-2 text-xs font-semibold text-gray-500 dark:text-gray-400 text-right"
                            >
                              Semaine {weekNum}
                            </td>
                            <td className="py-1.5 pl-2 text-right text-xs font-bold text-blue-600 dark:text-blue-400">
                              {formatMinutes(weekTotal)}
                            </td>
                          </tr>
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

