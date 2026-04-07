"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Calendar, MapPin, Clock, ChevronRight, ChevronDown, ChevronUp, Box, Truck, Users, BarChart3, Navigation, Route } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getCollaboratorColor } from "@/lib/collaborators";
import { COLLABORATEURS_LIST } from "@/lib/constants";
import type { Project } from "@/lib/notion";

interface MonteurDashboardProps {
  userName: string;
  projects: Project[];
  isAdmin?: boolean;
}

// --- Helper functions ---

function parseTimeToMinutes(raw: string): number {
  const match = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return -1;
  return parseInt(match[1]) * 60 + parseInt(match[2]);
}

function getWeeklyHoursForCollab(projects: Project[], collabName: string): number {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  const monStr = monday.toISOString().split("T")[0];
  const sunStr = sunday.toISOString().split("T")[0];

  let totalMinutes = 0;

  for (const p of projects) {
    const ha = p.heureArrivee || "";
    const hd = p.heureDepart || "";
    if (!ha && !hd) continue;

    if (ha.includes("|") || hd.includes("|")) {
      const arrParts = ha.split("|").map((s) => s.trim()).filter(Boolean);
      const depParts = hd.split("|").map((s) => s.trim()).filter(Boolean);
      const maxLen = Math.max(arrParts.length, depParts.length);
      for (let i = 0; i < maxLen; i++) {
        const aTokens = (arrParts[i] || "").split(/\s+/);
        const dTokens = (depParts[i] || "").split(/\s+/);
        const aDate = aTokens[0]?.match(/^\d{4}-\d{2}-\d{2}$/) ? aTokens[0] : "";
        const dDate = dTokens[0]?.match(/^\d{4}-\d{2}-\d{2}$/) ? dTokens[0] : "";
        const entryDate = aDate || dDate || p.dateMontage?.split("T")[0] || "";
        const entryCollab = aTokens.slice(1, -1).join(" ") || dTokens.slice(1, -1).join(" ") || "";
        if (!entryCollab.toLowerCase().includes(collabName.toLowerCase())) continue;
        if (entryDate < monStr || entryDate > sunStr) continue;
        const arrTime = aTokens[aTokens.length - 1] || "";
        const depTime = dTokens[dTokens.length - 1] || "";
        const arrMin = parseTimeToMinutes(arrTime);
        const depMin = parseTimeToMinutes(depTime);
        if (arrMin >= 0 && depMin >= 0 && depMin > arrMin) {
          totalMinutes += depMin - arrMin;
        }
      }
    } else {
      if (!p.collaborateurs?.toLowerCase().includes(collabName.toLowerCase())) continue;
      const dateStr = p.dateMontage?.split("T")[0] || "";
      if (dateStr < monStr || dateStr > sunStr) continue;
      const arrMin = parseTimeToMinutes(ha);
      const depMin = parseTimeToMinutes(hd);
      if (arrMin >= 0 && depMin >= 0 && depMin > arrMin) {
        totalMinutes += depMin - arrMin;
      }
    }
  }
  return totalMinutes;
}

function fmtMin(min: number): string {
  if (min <= 0) return "0h 00min";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m.toString().padStart(2, "0")}min`;
}

function getTodayStr() {
  return new Date().toISOString().split("T")[0];
}

function getWeekEndStr() {
  const today = new Date();
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);
  return weekEnd.toISOString().split("T")[0];
}

function formatDay(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("fr-CH", { weekday: "short", day: "2-digit", month: "short" });
}

function getProjectsForCollaborator(projects: Project[], name: string) {
  return projects.filter((p) =>
    p.collaborateurs?.toLowerCase().includes(name.toLowerCase())
  );
}

// --- Route planning button ---

function DailyRouteButton({ projects }: { projects: Project[] }) {
  const [showPicker, setShowPicker] = useState(false);

  const addresses = projects
    .map((p) => p.adresseChantier)
    .filter(Boolean);

  if (addresses.length === 0) return null;

  const buildGoogleMapsUrl = () => {
    // First address is destination, rest are waypoints
    const encoded = addresses.map((a) => encodeURIComponent(a));
    if (encoded.length === 1) {
      return `https://www.google.com/maps/dir/?api=1&destination=${encoded[0]}`;
    }
    const destination = encoded[encoded.length - 1];
    const waypoints = encoded.slice(0, -1).join("|");
    return `https://www.google.com/maps/dir/?api=1&destination=${destination}&waypoints=${waypoints}`;
  };

  const buildGoogleMapsDeepLink = () => {
    const encoded = addresses.map((a) => encodeURIComponent(a));
    if (encoded.length === 1) {
      return `comgooglemaps://?daddr=${encoded[0]}`;
    }
    // Google Maps app supports waypoints via the URL scheme
    return `comgooglemaps://?daddr=${encoded.join("+to:")}`;
  };

  const buildWazeUrl = () => {
    // Waze only supports single destination, use first address
    const addr = encodeURIComponent(addresses[0]);
    return `waze://?q=${addr}&navigate=yes`;
  };

  const buildWazeFallback = () => {
    const addr = encodeURIComponent(addresses[0]);
    return `https://waze.com/ul?q=${addr}&navigate=yes`;
  };

  const openApp = (app: "google" | "waze") => {
    setShowPicker(false);
    if (app === "google") {
      window.location.href = buildGoogleMapsDeepLink();
      setTimeout(() => {
        window.open(buildGoogleMapsUrl(), "_blank");
      }, 500);
    } else {
      window.location.href = buildWazeUrl();
      setTimeout(() => {
        window.open(buildWazeFallback(), "_blank");
      }, 500);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setShowPicker(!showPicker)}
        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 active:scale-[0.98] transition-all"
      >
        <Route className="w-4 h-4" />
        Itinéraire du jour ({addresses.length} arrêt{addresses.length > 1 ? "s" : ""})
      </button>
      {showPicker && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowPicker(false)} />
          <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 p-1">
            <button
              onClick={() => openApp("google")}
              className="w-full text-left text-sm px-3 py-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 text-gray-700 dark:text-gray-300"
            >
              <MapPin className="w-4 h-4 text-red-500" />
              Google Maps
            </button>
            <button
              onClick={() => openApp("waze")}
              className="w-full text-left text-sm px-3 py-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 text-gray-700 dark:text-gray-300"
            >
              <Navigation className="w-4 h-4 text-cyan-500" />
              Waze
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// --- Project card used in both views ---

function ProjectRow({ project, colors }: { project: Project; colors: { bg: string; text: string; dot: string } }) {
  return (
    <Link
      key={project.id}
      href={`/projet/${project.id}?mode=dashboard`}
      className="flex items-center gap-3 glass-card rounded-xl px-3 py-2 hover:bg-white/80 dark:hover:bg-white/10 transition-all"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate text-gray-900 dark:text-gray-100">{project.projet}</p>
        {project.adresseChantier && (
          <div className="flex items-center gap-1 mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            <MapPin className="w-3 h-3" />
            <span className="truncate">{project.adresseChantier}</span>
          </div>
        )}
      </div>
      <Badge variant="outline" className="text-[10px] shrink-0">{project.nbCabines || 0} cab.</Badge>
      <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 shrink-0" />
    </Link>
  );
}

// --- Admin view ---

function AdminDashboard({ projects }: { projects: Project[] }) {
  const [expandedCollabs, setExpandedCollabs] = useState<Record<string, boolean>>({});
  const toggleCollab = (name: string) => setExpandedCollabs((prev) => ({ ...prev, [name]: !prev[name] }));
  const todayStr = getTodayStr();
  const weekEndStr = getWeekEndStr();

  // Build per-collaborator data
  const collabData = COLLABORATEURS_LIST.map((name) => {
    const colors = getCollaboratorColor(name);
    const myProjects = getProjectsForCollaborator(projects, name);
    const todayProjects = myProjects.filter((p) => p.dateMontage === todayStr);
    const weekProjects = myProjects
      .filter((p) => p.dateMontage && p.dateMontage >= todayStr && p.dateMontage <= weekEndStr)
      .sort((a, b) => (a.dateMontage || "").localeCompare(b.dateMontage || ""));
    const totalCabines = myProjects.reduce((sum, p) => sum + (p.nbCabines || 0), 0);
    return { name, colors, myProjects, todayProjects, weekProjects, totalCabines };
  });

  // Summary stats
  const totalProjectsToday = new Set(
    collabData.flatMap((c) => c.todayProjects.map((p) => p.id))
  ).size;
  const totalCabinesWeek = collabData.reduce(
    (sum, c) => sum + c.weekProjects.reduce((s, p) => s + (p.nbCabines || 0), 0),
    0
  );
  const busyToday = collabData.filter((c) => c.todayProjects.length > 0).length;

  return (
    <div className="mb-6 space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="glass-card rounded-2xl p-4 text-center">
          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{totalProjectsToday}</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">Montages aujourd'hui</p>
        </div>
        <div className="glass-card rounded-2xl p-4 text-center">
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{totalCabinesWeek}</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">Cabines cette semaine</p>
        </div>
        <div className="glass-card rounded-2xl p-4 text-center">
          <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{busyToday}</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">Monteurs actifs</p>
        </div>
      </div>

      {/* Weekly hours summary */}
      {(() => {
        const weeklyData = COLLABORATEURS_LIST.map((name) => ({
          name,
          colors: getCollaboratorColor(name),
          minutes: getWeeklyHoursForCollab(projects, name),
        })).filter((c) => c.minutes > 0);
        if (weeklyData.length === 0) return null;
        const totalWeekMin = weeklyData.reduce((s, c) => s + c.minutes, 0);
        return (
          <div className="glass-card rounded-2xl p-4 space-y-2">
            <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Heures cette semaine
            </p>
            {weeklyData.map((c) => (
              <div key={c.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                    style={{ backgroundColor: c.colors.bg, color: c.colors.text }}
                  >
                    {c.name[0]}
                  </div>
                  <span className="text-sm text-gray-700 dark:text-gray-300">{c.name}</span>
                </div>
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{fmtMin(c.minutes)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between pt-1 border-t border-gray-200 dark:border-gray-700">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Total</span>
              <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{fmtMin(totalWeekMin)}</span>
            </div>
          </div>
        );
      })()}

      {/* Per-collaborator sections */}
      {collabData.map((collab) => {
        if (collab.myProjects.length === 0) return null;
        const isExpanded = expandedCollabs[collab.name] ?? false;
        return (
          <div key={collab.name} className="glass-card rounded-2xl overflow-hidden">
            {/* Collaborator header - clickable */}
            <button
              onClick={() => toggleCollab(collab.name)}
              className="w-full flex items-center gap-3 p-4 hover:bg-white/40 dark:hover:bg-white/5 transition-colors"
            >
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                style={{ backgroundColor: collab.colors.bg, color: collab.colors.text }}
              >
                {collab.name[0]}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="font-semibold text-gray-900 dark:text-gray-100">{collab.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {collab.todayProjects.length > 0
                    ? `${collab.todayProjects.length} montage${collab.todayProjects.length > 1 ? "s" : ""} aujourd'hui`
                    : "Aucun montage aujourd'hui"}
                  {" · "}{collab.totalCabines} cab.
                </p>
              </div>
              {collab.todayProjects.length > 0 && (
                <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse shrink-0" />
              )}
              {isExpanded ? (
                <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
              )}
            </button>

            {/* Collapsible content */}
            {isExpanded && (
              <div className="px-4 pb-4 space-y-3">
                {/* Today's projects */}
                {collab.todayProjects.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Aujourd'hui ({collab.todayProjects.length})
                    </p>
                    <div className="space-y-1.5">
                      {collab.todayProjects.map((p) => (
                        <ProjectRow key={p.id} project={p} colors={collab.colors} />
                      ))}
                    </div>
                    <div className="mt-2">
                      <DailyRouteButton projects={collab.todayProjects} />
                    </div>
                  </div>
                )}

                {/* Week's projects (excluding today) */}
                {collab.weekProjects.filter((p) => p.dateMontage !== todayStr).length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Cette semaine ({collab.weekProjects.filter((p) => p.dateMontage !== todayStr).length})
                    </p>
                    <div className="space-y-1.5">
                      {collab.weekProjects
                        .filter((p) => p.dateMontage !== todayStr)
                        .map((p) => (
                          <Link
                            key={p.id}
                            href={`/projet/${p.id}?mode=dashboard`}
                            className="flex items-center gap-3 glass-card rounded-xl px-3 py-2 hover:bg-white/80 dark:hover:bg-white/10 transition-all"
                          >
                            <span className="text-xs font-mono text-gray-500 dark:text-gray-400 w-16 shrink-0">
                              {formatDay(p.dateMontage!)}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm truncate text-gray-900 dark:text-gray-100">{p.projet}</p>
                            </div>
                            <Badge variant="outline" className="text-[10px] shrink-0">{p.nbCabines || 0} cab.</Badge>
                            <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 shrink-0" />
                          </Link>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// --- Main component ---

export function MonteurDashboard({ userName, projects, isAdmin }: MonteurDashboardProps) {
  // Admin view: show all collaborators
  if (isAdmin) {
    return <AdminDashboard projects={projects} />;
  }

  // Regular monteur view (unchanged logic)
  const firstName = userName.split(" ")[0];
  const colors = getCollaboratorColor(firstName);

  const todayStr = getTodayStr();
  const weekEndStr = getWeekEndStr();

  // Filtrer les projets du monteur
  const myProjects = projects.filter((p) =>
    p.collaborateurs?.toLowerCase().includes(firstName.toLowerCase())
  );

  // Projets du jour
  const todayProjects = myProjects.filter((p) => p.dateMontage === todayStr);

  // Projets de la semaine (7 prochains jours)
  const weekProjects = myProjects
    .filter((p) => p.dateMontage && p.dateMontage >= todayStr && p.dateMontage <= weekEndStr && p.dateMontage !== todayStr)
    .sort((a, b) => (a.dateMontage || "").localeCompare(b.dateMontage || ""));

  const totalCabines = myProjects.reduce((sum, p) => sum + (p.nbCabines || 0), 0);

  if (myProjects.length === 0) return null;

  return (
    <div className="mb-6 space-y-4">
      {/* En-tête personnalisé */}
      <div className="glass-card rounded-2xl p-4">
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold"
            style={{ backgroundColor: colors.bg, color: colors.text }}
          >
            {firstName[0]}
          </div>
          <div className="flex-1">
            <p className="font-semibold text-gray-900 dark:text-gray-100">Bonjour {firstName} 👋</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {todayProjects.length > 0
                ? `${todayProjects.length} montage${todayProjects.length > 1 ? "s" : ""} aujourd'hui`
                : "Aucun montage aujourd'hui"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold" style={{ color: colors.text }}>{totalCabines}</p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500">cabines en cours</p>
          </div>
        </div>
      </div>

      {/* Montages du jour */}
      {todayProjects.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" />
            Aujourd'hui
          </p>
          <div className="space-y-2">
            {todayProjects.map((p) => (
              <Link
                key={p.id}
                href={`/projet/${p.id}?mode=dashboard`}
                className="block glass-card rounded-xl p-3 border-l-4"
                style={{ borderLeftColor: colors.dot }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{p.projet}</p>
                    <div className="flex items-center gap-1.5 mt-1 text-xs text-gray-500 dark:text-gray-400">
                      <MapPin className="w-3 h-3" />
                      <span className="truncate">{p.adresseChantier || p.nomChantier || "---"}</span>
                    </div>
                    <div className="flex gap-1.5 mt-1.5">
                      {p.fournisseurs.slice(0, 1).map((f) => (
                        <Badge key={f} variant="secondary" className="text-[10px]">{f}</Badge>
                      ))}
                      <Badge variant="outline" className="text-[10px]">{p.nbCabines || 0} cab.</Badge>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-300 dark:text-gray-600 shrink-0" />
                </div>
              </Link>
            ))}
          </div>
          <div className="mt-3">
            <DailyRouteButton projects={todayProjects} />
          </div>
        </div>
      )}

      {/* Prochains RDV */}
      {weekProjects.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            Cette semaine
          </p>
          <div className="space-y-1.5">
            {weekProjects.map((p) => (
              <Link
                key={p.id}
                href={`/projet/${p.id}?mode=dashboard`}
                className="flex items-center gap-3 glass-card rounded-xl px-3 py-2"
              >
                <span className="text-xs font-mono text-gray-500 dark:text-gray-400 w-16 shrink-0">
                  {formatDay(p.dateMontage!)}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{p.projet}</p>
                </div>
                <Badge variant="outline" className="text-[10px] shrink-0">{p.nbCabines || 0} cab.</Badge>
                <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
