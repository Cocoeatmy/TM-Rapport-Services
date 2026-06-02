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
  Users as UsersIcon,
  FileDown,
  X,
  CheckSquare,
  Square,
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

/**
 * Extrait les entrées de temps d'un projet.
 *
 * Trois formats possibles dans heureArrivee / heureDepart :
 *
 * 1. Simple          "08:30"
 * 2. Multi-journée   "2026-04-07 Claudio 08:30 | 2026-04-08 Claudio 07:00"
 * 3. Multi-cabine    "Cab1:2026-05-07:08:30 | Cab2:2026-05-07:09:00 | …"
 *    → le collaborateur N'EST PAS dans la chaîne ; il est dans la KV store
 *      (cabine-attribution). On le reçoit via le paramètre `cabineAttribution`.
 */
function parseProjectHours(
  project: Project,
  cabineAttribution?: string[], // index 0 = Cab1, valeur = "Jacobo" ou "Jacobo & Claudio"
): TimeEntry[] {
  const entries: TimeEntry[] = [];
  const ha = project.heureArrivee || "";
  const hd = project.heureDepart || "";
  // Date effective : dateMontage en priorité, sinon dateMesures (projets services/mesures)
  const effectiveDate =
    project.dateMontage?.split("T")[0] ||
    project.dateMesures?.split("T")[0] ||
    "";

  // ── Format 3 : Multi-cabine "Cab1:date:HH:MM | Cab2:…" ──────────────────
  // Détecté par la présence de "CabN:" au début d'un segment.
  const isCabineFormat = /Cab\d+\s*:/.test(ha) || /Cab\d+\s*:/.test(hd);

  if (isCabineFormat) {
    // Regex : capture l'index de cabine, la date optionnelle, et l'heure
    const reTime = /Cab(\d+)\s*:(?:(\d{4}-\d{2}-\d{2}):)?(\d{1,2}:\d{2})/g;

    const arrTimes: Record<number, string> = {};
    const depTimes: Record<number, string> = {};
    const dates:    Record<number, string> = {};

    let m: RegExpExecArray | null;
    const haClean = ha; const hdClean = hd;

    const reA = new RegExp(reTime.source, "g");
    while ((m = reA.exec(haClean))) {
      const idx = parseInt(m[1], 10) - 1;
      arrTimes[idx] = m[3];
      if (m[2]) dates[idx] = m[2];
    }
    const reD = new RegExp(reTime.source, "g");
    while ((m = reD.exec(hdClean))) {
      const idx = parseInt(m[1], 10) - 1;
      depTimes[idx] = m[3];
      if (m[2] && !dates[idx]) dates[idx] = m[2];
    }

    const cabineIndices = new Set([
      ...Object.keys(arrTimes).map(Number),
      ...Object.keys(depTimes).map(Number),
    ]);

    // Si aucune heure extraite (format Cab sans temps valide), on crée
    // une entrée zéro-minute pour que le projet reste visible dans le mois.
    if (cabineIndices.size === 0 && effectiveDate) {
      entries.push({
        date: effectiveDate,
        collaborateur: project.collaborateurs || "",
        arrivee: "",
        depart: "",
        minutes: 0,
        projectName: project.projet,
        projectId:   project.id,
      });
      return entries;
    }

    for (const i of cabineIndices) {
      const arrTime = arrTimes[i] || "";
      const depTime = depTimes[i] || "";
      const date    = dates[i] || effectiveDate;
      // Priorité : attribution KV → champ collaborateurs du projet
      const collab  = cabineAttribution?.[i] || project.collaborateurs || "";

      const arrMin  = parseTimeString(arrTime);
      const depMin  = parseTimeString(depTime);
      const diff    = arrMin >= 0 && depMin >= 0 ? depMin - arrMin : 0;

      entries.push({
        date,
        collaborateur: collab,
        arrivee: arrTime,
        depart:  depTime,
        minutes: diff > 0 ? diff : 0,
        projectName: project.projet,
        projectId:   project.id,
      });
    }
    return entries;
  }

  // ── Format 2 : Multi-journée "date [collab] HH:MM | …" ──────────────────
  const isMultiArrival = ha.includes("|");
  const isMultiDepart  = hd.includes("|");

  if (isMultiArrival || isMultiDepart) {
    const arrParts = ha.split("|").map((s) => s.trim()).filter(Boolean);
    const depParts = hd.split("|").map((s) => s.trim()).filter(Boolean);

    const parseMulti = (parts: string[]) =>
      parts.map((part) => {
        const tokens = part.trim().split(/\s+/);
        if (tokens.length >= 3) {
          return { date: tokens[0], collaborateur: tokens.slice(1, -1).join(" "), time: tokens[tokens.length - 1] };
        }
        if (tokens.length === 2) {
          if (tokens[0].match(/^\d{4}-\d{2}-\d{2}$/)) {
            return { date: tokens[0], collaborateur: "", time: tokens[1] };
          }
          return { date: "", collaborateur: tokens[0], time: tokens[1] };
        }
        if (tokens.length === 1) return { date: "", collaborateur: "", time: tokens[0] };
        return { date: "", collaborateur: "", time: "" };
      });

    const arrivals   = parseMulti(arrParts);
    const departures = parseMulti(depParts);
    const maxLen     = Math.max(arrivals.length, departures.length);

    for (let i = 0; i < maxLen; i++) {
      const arr  = arrivals[i]   || { date: "", collaborateur: "", time: "" };
      const dep  = departures[i] || { date: "", collaborateur: "", time: "" };
      const date   = arr.date || dep.date || effectiveDate;
      const collab = arr.collaborateur || dep.collaborateur || project.collaborateurs || "";
      const arrMin = parseTimeString(arr.time);
      const depMin = parseTimeString(dep.time);
      const diff   = arrMin >= 0 && depMin >= 0 ? depMin - arrMin : 0;

      entries.push({
        date,
        collaborateur: collab,
        arrivee:  arr.time || "",
        depart:   dep.time || "",
        minutes:  diff > 0 ? diff : 0,
        projectName: project.projet,
        projectId:   project.id,
      });
    }
    return entries;
  }

  // ── Format 1 : Simple "HH:MM" — ou projet sans heures ──────────────────
  // On crée toujours une entrée si le projet a une date effective,
  // même si les heures sont vides (arrivee/depart = "" → minutes = 0).
  // Cela permet d'afficher les projets "sans heures renseignées" dans
  // la section Non assigné / À compléter plutôt que de les masquer.
  if (!ha && !hd && !effectiveDate) return entries;
  const arrMin = parseTimeString(ha);
  const depMin = parseTimeString(hd);
  const diff   = arrMin >= 0 && depMin >= 0 ? depMin - arrMin : 0;
  entries.push({
    date:          effectiveDate,
    collaborateur: project.collaborateurs || "",
    arrivee:       ha,
    depart:        hd,
    minutes:       diff > 0 ? diff : 0,
    projectName:   project.projet,
    projectId:     project.id,
  });

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
  // Map projectId → attribution[] (index = cabine - 1, valeur = monteur)
  const [attributionMap, setAttributionMap] = useState<Map<string, string[]>>(new Map());

  // ── PDF modal state ────────────────────────────────────────────────────────
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [pdfSelected, setPdfSelected] = useState<string[]>([]);  // labels sélectionnés
  const [pdfGenerating, setPdfGenerating] = useState(false);

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
      fetch("/api/cabine-attribution").then((r) => r.json()).catch(() => []),
    ]).then(([enCours, termines, attributions]) => {
      const all = [
        ...(Array.isArray(enCours) ? enCours : []),
        ...(Array.isArray(termines) ? termines : []),
      ];
      setProjects(all);
      // Construire la map projectId → attribution[]
      const map = new Map<string, string[]>();
      if (Array.isArray(attributions)) {
        for (const attr of attributions) {
          if (attr?.projectId && Array.isArray(attr.attribution)) {
            map.set(attr.projectId, attr.attribution);
          }
        }
      }
      setAttributionMap(map);
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
  // Chaque projet multi-cabine reçoit son attribution KV pour résoudre le collaborateur
  const allEntries = projects.flatMap((p) =>
    parseProjectHours(p, attributionMap.get(p.id))
  );

  // Filter entries for selected month
  const monthEntries = allEntries.filter((e) => e.date.startsWith(selectedMonth));

  // Group: solo → collabMap, binôme/team → teamMap
  const collabMap = new Map<string, TimeEntry[]>();
  const teamMap = new Map<string, TimeEntry[]>();
  // Track binôme minutes per collaborator (for display in parentheses)
  const collabTeamMinutes = new Map<string, number>();

  for (const entry of monthEntries) {
    const rawCollab = entry.collaborateur || "Non assigne";
    const names = rawCollab.split("&").map((n) => n.trim()).filter(Boolean);

    if (names.length > 1) {
      // Team/Binôme → only in teamMap
      const teamKey = names.sort().join(" & ");
      if (!teamMap.has(teamKey)) teamMap.set(teamKey, []);
      teamMap.get(teamKey)!.push(entry);

      // Track binôme minutes per individual
      for (const name of names) {
        const matched = COLLABORATEURS_LIST.find(
          (c) => name.toLowerCase().includes(c.toLowerCase()) || c.toLowerCase().includes(name.toLowerCase())
        ) || name;
        collabTeamMinutes.set(matched, (collabTeamMinutes.get(matched) || 0) + entry.minutes);
      }
    } else if (names.length === 1) {
      // Solo → collabMap
      const matched = COLLABORATEURS_LIST.find(
        (c) => names[0].toLowerCase().includes(c.toLowerCase()) || c.toLowerCase().includes(names[0].toLowerCase())
      ) || names[0];
      if (!collabMap.has(matched)) collabMap.set(matched, []);
      collabMap.get(matched)!.push(entry);
    } else {
      if (!collabMap.has("Non assigne")) collabMap.set("Non assigne", []);
      collabMap.get("Non assigne")!.push(entry);
    }
  }

  // Sort collaborators alphabetically
  const collabEntries = Array.from(collabMap.entries()).sort(([a], [b]) =>
    a.localeCompare(b)
  );

  // Sort teams
  const teamEntries = Array.from(teamMap.entries()).sort(([a], [b]) =>
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
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-600 shrink-0" />
            Heures de travail
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Suivi des heures par collaborateur
          </p>
        </div>
        <button
          onClick={() => { setPdfSelected([]); setShowPdfModal(true); }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#1e3a5f] hover:bg-[#163055] text-white text-sm font-medium transition-colors shrink-0 shadow-sm"
        >
          <FileDown className="w-4 h-4" />
          Rapport PDF
        </button>
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
        const teamMinutes = collabTeamMinutes.get(collab) || 0;

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
                  {teamMinutes > 0 && (
                    <span className="text-[10px] font-normal opacity-70 ml-1">(+{formatMinutes(teamMinutes)} en équipe)</span>
                  )}
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

      {/* Binômes / Teams */}
      {teamEntries.length > 0 && (
        <>
          <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mt-6 mb-3 flex items-center gap-2">
            <UsersIcon className="w-4 h-4" />
            Binômes & Teams
          </h2>
          {teamEntries.map(([team, entries]) => {
            const names = team.split(" & ");
            const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
            const teamTotal = entries.reduce((s, e) => s + e.minutes, 0);

            const weekMap = new Map<number, TimeEntry[]>();
            for (const e of sorted) {
              const wk = getWeekNumber(e.date);
              if (!weekMap.has(wk)) weekMap.set(wk, []);
              weekMap.get(wk)!.push(e);
            }
            const weeks = Array.from(weekMap.entries()).sort(([a], [b]) => a - b);

            return (
              <Card key={team} className="mb-4">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <div className="flex -space-x-2">
                      {names.map((n) => {
                        const c = getCollaboratorColor(n.trim());
                        return (
                          <div key={n} className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 border-white dark:border-gray-900"
                            style={{ backgroundColor: c.bg, color: c.text }}>
                            {n.trim()[0]}
                          </div>
                        );
                      })}
                    </div>
                    <span className="flex-1">{team}</span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                      {names.length === 2 ? "Binôme" : "Team"}
                    </span>
                    <span className="text-sm font-bold px-3 py-1 rounded-full bg-blue-50 text-blue-600">
                      {formatMinutes(teamTotal)}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                          <th className="text-left py-2 pr-2">Date</th>
                          <th className="text-left py-2 pr-2">Projet</th>
                          <th className="text-center py-2 px-2">Arrivee</th>
                          <th className="text-center py-2 px-2">Depart</th>
                          <th className="text-right py-2 pl-2">Heures</th>
                        </tr>
                      </thead>
                      <tbody>
                        {weeks.map(([weekNum, weekEntries]) => {
                          const weekTotal = weekEntries.reduce((s, e) => s + e.minutes, 0);
                          return (
                            <Fragment key={weekNum}>
                              {weekEntries.map((e, i) => {
                                const d = new Date(e.date);
                                const dayLabel = d.toLocaleDateString("fr-CH", { weekday: "short", day: "2-digit", month: "short" });
                                return (
                                  <tr key={`${e.date}-${e.projectId}-${i}`} className="border-b border-gray-50 dark:border-gray-800">
                                    <td className="py-1.5 pr-2 text-gray-700 dark:text-gray-300 whitespace-nowrap">{dayLabel}</td>
                                    <td className="py-1.5 pr-2 text-gray-900 dark:text-gray-100 truncate max-w-[150px]">{e.projectName}</td>
                                    <td className="py-1.5 px-2 text-center text-gray-600 font-mono">{e.arrivee || "-"}</td>
                                    <td className="py-1.5 px-2 text-center text-gray-600 font-mono">{e.depart || "-"}</td>
                                    <td className="py-1.5 pl-2 text-right font-medium">{e.minutes > 0 ? formatMinutes(e.minutes) : "-"}</td>
                                  </tr>
                                );
                              })}
                              <tr className="bg-gray-50 dark:bg-gray-800/30">
                                <td colSpan={4} className="py-1.5 pr-2 text-xs font-semibold text-gray-500 text-right">Semaine {weekNum}</td>
                                <td className="py-1.5 pl-2 text-right text-xs font-bold text-blue-600">{formatMinutes(weekTotal)}</td>
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
        </>
      )}

      {/* ── Modal Rapport PDF ──────────────────────────────────────────────── */}
      {showPdfModal && (() => {
        // Construire la liste des sujets disponibles (collabs solo + binômes/teams)
        const subjects: { label: string; type: "solo" | "team" }[] = [
          ...collabEntries.map(([label]) => ({ label, type: "solo" as const })),
          ...teamEntries.map(([label]) => ({ label, type: "team" as const })),
        ];

        const toggle = (label: string) =>
          setPdfSelected((prev) =>
            prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]
          );

        const handleGenerate = async () => {
          if (pdfSelected.length === 0) return;
          setPdfGenerating(true);
          try {
            const { generateRapportPDF } = await import("@/components/heures-rapport-pdf");

            for (const label of pdfSelected) {
              // Trouver les entrées correspondantes (solo ou team)
              let entries = collabMap.get(label) ?? teamMap.get(label) ?? [];

              // Pour solo, inclure aussi les entrées en binôme où ce collaborateur participe
              const isTeam = label.includes("&");
              if (!isTeam) {
                const teamEnts = Array.from(teamMap.values()).flat().filter((e) =>
                  e.collaborateur.toLowerCase().includes(label.toLowerCase())
                );
                entries = [...entries, ...teamEnts];
              }

              const blob = await generateRapportPDF({
                label,
                periode: monthLabel(selectedMonth),
                entries,
                projects,
              });

              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `rapport-heures_${label.replace(/\s+/g, "-")}_${selectedMonth}.pdf`;
              a.click();
              URL.revokeObjectURL(url);
            }
            setShowPdfModal(false);
          } catch (err) {
            console.error("PDF error:", err);
            alert("Erreur lors de la génération du PDF.");
          } finally {
            setPdfGenerating(false);
          }
        };

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowPdfModal(false)} />

            {/* Modal */}
            <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    <FileDown className="w-5 h-5 text-[#1e3a5f]" />
                    Générer un rapport PDF
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                    Période&nbsp;: <span className="font-medium text-gray-700 dark:text-gray-200">{monthLabel(selectedMonth)}</span>
                  </p>
                </div>
                <button onClick={() => setShowPdfModal(false)} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors">
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>

              {/* Sélection */}
              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                  Sélectionner le(s) collaborateur(s)
                </p>
                {subjects.length === 0 ? (
                  <p className="text-sm text-gray-400 py-4 text-center">Aucune entrée pour ce mois</p>
                ) : (
                  <div className="space-y-1 max-h-60 overflow-y-auto pr-1">
                    {subjects.map(({ label, type }) => {
                      const selected = pdfSelected.includes(label);
                      const colors = type === "solo" ? getCollaboratorColor(label) : { bg: "#1e3a5f", text: "#ffffff" };
                      const entries = collabMap.get(label) ?? teamMap.get(label) ?? [];
                      const total = entries.reduce((s, e) => s + e.minutes, 0);
                      return (
                        <button
                          key={label}
                          onClick={() => toggle(label)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 transition-all text-left ${
                            selected
                              ? "border-[#1e3a5f] bg-[#1e3a5f]/5 dark:bg-[#1e3a5f]/20"
                              : "border-gray-100 dark:border-slate-700 hover:border-gray-200 dark:hover:border-slate-600"
                          }`}
                        >
                          {selected
                            ? <CheckSquare className="w-4 h-4 text-[#1e3a5f] shrink-0" />
                            : <Square className="w-4 h-4 text-gray-300 shrink-0" />
                          }
                          <div
                            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                            style={{ backgroundColor: colors.bg, color: colors.text }}
                          >
                            {label.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium text-gray-800 dark:text-gray-100">{label}</span>
                            {type === "team" && (
                              <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 font-medium">Binôme</span>
                            )}
                          </div>
                          <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 shrink-0">
                            {formatMinutes(total)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Tout sélectionner */}
              {subjects.length > 1 && (
                <button
                  onClick={() => setPdfSelected(
                    pdfSelected.length === subjects.length ? [] : subjects.map((s) => s.label)
                  )}
                  className="text-xs text-[#1e3a5f] dark:text-blue-400 hover:underline"
                >
                  {pdfSelected.length === subjects.length ? "Tout désélectionner" : "Tout sélectionner"}
                </button>
              )}

              {/* Generate button */}
              <button
                onClick={handleGenerate}
                disabled={pdfSelected.length === 0 || pdfGenerating}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#1e3a5f] hover:bg-[#163055] disabled:opacity-50 text-white font-semibold text-sm transition-colors"
              >
                {pdfGenerating
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Génération en cours…</>
                  : <><FileDown className="w-4 h-4" /> Générer {pdfSelected.length > 1 ? `${pdfSelected.length} rapports` : "le rapport"}</>
                }
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

