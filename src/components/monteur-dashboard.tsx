"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Calendar, MapPin, Clock, ChevronRight, ChevronDown, ChevronUp, Box, Truck, Users, BarChart3, Navigation, Route } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getCollaboratorColor, getCollaboratorInitials } from "@/lib/collaborators";
import { COLLABORATEURS_LIST } from "@/lib/constants";
import type { Project } from "@/lib/notion";

const CLIENT_LOGOS: { prefix: string; logo: string }[] = [
  { prefix: "getaz", logo: "/logos/fournisseurs/BMS-Logo.png" },
  { prefix: "gétaz", logo: "/logos/fournisseurs/BMS-Logo.png" },
  { prefix: "duka", logo: "/logos/fournisseurs/duka.ch-logo.png" },
  { prefix: "duscholux", logo: "/logos/fournisseurs/Duscholux-logo.png" },
  { prefix: "ronal", logo: "/logos/fournisseurs/ronal-logo.png" },
  { prefix: "nelo", logo: "/logos/fournisseurs/Nelo-logo.jpg" },
  { prefix: "novellini", logo: "/logos/fournisseurs/Novellini-logo.png" },
  { prefix: "samo", logo: "/logos/fournisseurs/Samo-logo.jpg" },
  { prefix: "dubat", logo: "/logos/fournisseurs/Dubat-Logo.png" },
  { prefix: "tema", logo: "/logos/fournisseurs/Tema-Logo.png" },
  { prefix: "matway", logo: "/logos/fournisseurs/Matway-Logo.png" },
  { prefix: "bringhen", logo: "/logos/fournisseurs/Bringhen-logo.jpg" },
];

function getClientLogo(projectName: string): string | null {
  const lower = projectName.toLowerCase();
  const match = CLIENT_LOGOS.find((c) => lower.startsWith(c.prefix));
  return match ? match.logo : null;
}

// Get all working days (Mon-Fri) between start and end dates
function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getWorkingDays(startStr: string, endStr: string): string[] {
  const days: string[] = [];
  const start = new Date(startStr.split("T")[0] + "T12:00:00");
  const end = new Date(endStr.split("T")[0] + "T12:00:00");
  const current = new Date(start);
  while (current <= end) {
    const dow = current.getDay();
    if (dow !== 0 && dow !== 6) {
      days.push(formatLocalDate(current));
    }
    current.setDate(current.getDate() + 1);
  }
  return days;
}

// Get the effective date for a project (montage or mesures)
function getEffectiveDate(p: Project): string {
  return (p.dateMontage || p.dateMesures || "").split("T")[0];
}

// Check if a project spans a given date (considering multi-day projects, excluding weekends)
function projectSpansDate(p: Project, dateStr: string): boolean {
  const startRaw = getEffectiveDate(p);
  const endRaw = (p.dateMontageEnd || "").split("T")[0];
  if (!startRaw) return false;
  if (!endRaw) return startRaw === dateStr;
  return getWorkingDays(startRaw, endRaw).includes(dateStr);
}

// Check if a project is active during a date range (for week views)
function projectActiveDuringRange(p: Project, rangeStart: string, rangeEnd: string): boolean {
  const startRaw = getEffectiveDate(p);
  const endRaw = (p.dateMontageEnd || startRaw).split("T")[0];
  if (!startRaw) return false;
  return startRaw <= rangeEnd && endRaw >= rangeStart;
}

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
  weekEnd.setDate(weekEnd.getDate() + 14);
  return weekEnd.toISOString().split("T")[0];
}

function getThisWeekEndStr() {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
  const sunday = new Date(today);
  sunday.setDate(today.getDate() + daysUntilSunday);
  return sunday.toISOString().split("T")[0];
}

function formatDay(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("fr-CH", { weekday: "short", day: "2-digit", month: "short" });
}

function matchesCollaborator(fieldValue: string, name: string): boolean {
  if (!fieldValue) return false;
  const n = name.toLowerCase();
  return fieldValue.split("&").some((part) => {
    const trimmed = part.trim().toLowerCase();
    // Exact match on the part or the part contains the name as a distinct word
    return trimmed === n || trimmed.split(/\s+/).some((word) => word === n);
  });
}

function getProjectsForCollaborator(projects: Project[], name: string) {
  return projects.filter((p) => {
    const source = getProjectSource(p);
    // For mesures projects, only match mesuresTraiteePar
    if (source === "mesures") {
      return matchesCollaborator(p.mesuresTraiteePar || "", name);
    }
    // For montage/services/sav, only match collaborateurs
    return matchesCollaborator(p.collaborateurs || "", name);
  });
}

function getProjectSource(p: any): string {
  return (p as any)._source || "montage";
}

function countCabinesBySource(projects: Project[], collabName?: string) {
  const counts: Record<string, number> = {};
  for (const p of projects) {
    const source = getProjectSource(p);
    const cab = p.nbCabines || 0;
    // If in binôme/team, divide cabines by number of collaborateurs
    const collabNames = (p.collaborateurs || "").split(" & ").map((n) => n.trim()).filter(Boolean);
    const divisor = (collabName && source === "montage" && collabNames.length > 1) ? collabNames.length : 1;
    counts[source] = (counts[source] || 0) + Math.round(cab / divisor);
  }
  return counts;
}

function formatCabinesSummary(counts: Record<string, number>): string {
  const labels: Record<string, string> = { montage: "montage", mesures: "mesures", services: "services", sav: "SAV" };
  return Object.entries(counts)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${v} ${labels[k] || k}`)
    .join(" · ");
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
  const source = getProjectSource(project);
  const isMesure = source === "mesures";
  const collabField = isMesure ? (project.mesuresTraiteePar || "") : (project.collaborateurs || "");
  const collabNames = collabField.split(" & ").map((n) => n.trim()).filter(Boolean);
  const isTeam = collabNames.length >= 5 || collabField.toLowerCase().includes("team");
  const teamLabel = isTeam ? "Team" : collabNames.length === 2 ? "Binôme" : collabNames.length === 3 ? "Trio" : collabNames.length === 4 ? "Quatuor" : "";
  const logo = getClientLogo(project.projet);

  return (
    <Link
      key={project.id}
      href={`/projet/${project.id}?mode=dashboard`}
      className="flex items-center gap-2 glass-card rounded-xl px-3 py-2 hover:bg-white/80 dark:hover:bg-white/10 transition-all"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          {project.ofrTM && (
            <span className="text-[10px] font-mono text-gray-400 dark:text-gray-500">{project.ofrTM}</span>
          )}
          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${isMesure ? "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300" : "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300"}`}>
            {isMesure ? "Mesures" : "Montages"}
          </span>
          {teamLabel && (
            <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${isTeam ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
              {teamLabel}
            </span>
          )}
        </div>
        <p className="text-xs font-medium text-gray-900 dark:text-gray-100 line-clamp-2 mt-0.5">{project.projet}</p>
        {project.adresseChantier && (
          <div className="flex items-center gap-1 mt-0.5 text-[10px] text-gray-500 dark:text-gray-400">
            <MapPin className="w-3 h-3 shrink-0" />
            <span className="line-clamp-1">{project.adresseChantier}</span>
          </div>
        )}
        <div className="flex items-center gap-1 mt-1">
          {collabNames.length >= 1 && (
            <div className="flex -space-x-1">
              {collabNames.map((n) => (
                <span key={n} className="w-5 h-5 rounded-full text-[7px] font-bold flex items-center justify-center border border-white dark:border-gray-800"
                  style={{ backgroundColor: getCollaboratorColor(n).bg, color: getCollaboratorColor(n).text }}>
                  {getCollaboratorInitials(n)}
                </span>
              ))}
            </div>
          )}
          {logo && <img src={logo} alt="" className="h-4 w-auto object-contain shrink-0 rounded" />}
        </div>
      </div>
      <Badge variant="outline" className="text-[10px] shrink-0">{project.nbCabines || 0} cab.</Badge>
      <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 shrink-0" />
    </Link>
  );
}

function WeekProjectRow({ project }: { project: Project }) {
  const date = project.dateMontage || project.dateMesures || "";
  const source = getProjectSource(project);
  const isMesure = source === "mesures";
  const collabField = isMesure ? (project.mesuresTraiteePar || "") : (project.collaborateurs || "");
  const collabNames = collabField.split(" & ").map((n) => n.trim()).filter(Boolean);
  const isTeam = collabNames.length >= 5 || collabField.toLowerCase().includes("team");
  const teamLabel = isTeam ? "Team" : collabNames.length === 2 ? "Binôme" : collabNames.length === 3 ? "Trio" : collabNames.length === 4 ? "Quatuor" : "";
  const logo = getClientLogo(project.projet);

  return (
    <Link
      href={`/projet/${project.id}?mode=dashboard`}
      className="flex items-center gap-2 glass-card rounded-xl px-3 py-2 hover:bg-white/80 dark:hover:bg-white/10 transition-all"
    >
      <div className="text-[10px] font-mono text-gray-500 dark:text-gray-400 w-16 shrink-0">
        <div>{formatDay(date)}</div>
        {date.includes("T") && (
          <div className="text-[9px] text-blue-500 font-semibold">
            {new Date(date).toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" })}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          {project.ofrTM && (
            <span className="text-[10px] font-mono text-gray-400 dark:text-gray-500">{project.ofrTM}</span>
          )}
          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${isMesure ? "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300" : "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300"}`}>
            {isMesure ? "Mesures" : "Montages"}
          </span>
          {teamLabel && (
            <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${isTeam ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
              {teamLabel}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-900 dark:text-gray-100 line-clamp-2 mt-0.5">{project.projet}</p>
        <div className="flex items-center gap-1 mt-0.5">
          {collabNames.length >= 1 && (
            <div className="flex -space-x-1">
              {collabNames.map((n) => (
                <span key={n} className="w-5 h-5 rounded-full text-[7px] font-bold flex items-center justify-center border border-white dark:border-gray-800"
                  style={{ backgroundColor: getCollaboratorColor(n).bg, color: getCollaboratorColor(n).text }}>
                  {getCollaboratorInitials(n)}
                </span>
              ))}
            </div>
          )}
          {logo && <img src={logo} alt="" className="h-4 w-auto object-contain shrink-0 rounded" />}
        </div>
      </div>
      <Badge variant="outline" className="text-[10px] shrink-0">{project.nbCabines || 0} cab.</Badge>
      <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 shrink-0" />
    </Link>
  );
}

// --- Admin view ---

function AdminDashboard({ projects, userName }: { projects: Project[]; userName: string }) {
  const firstName = userName.split(" ")[0];
  const [expandedCollabs, setExpandedCollabs] = useState<Record<string, boolean>>({});
  const toggleCollab = (name: string) => setExpandedCollabs((prev) => ({ ...prev, [name]: !prev[name] }));
  const [showWeekProjects, setShowWeekProjects] = useState(false);
  const [showSummaryPanel, setShowSummaryPanel] = useState<"today" | "week" | "active" | "rdv-a-fixer" | "rdv-fixe" | null>(null);
  const [userActivities, setUserActivities] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/user-activity")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          const map: Record<string, string> = {};
          data.forEach((a: any) => { map[a.name] = a.lastSeen; });
          setUserActivities(map);
        }
      })
      .catch(() => {});
  }, []);
  const todayStr = getTodayStr();
  const weekEndStr = getWeekEndStr();
  const thisWeekEndStr = getThisWeekEndStr();

  // Build per-collaborator data
  const collabData = COLLABORATEURS_LIST.map((name) => {
    const colors = getCollaboratorColor(name);
    const myProjects = getProjectsForCollaborator(projects, name);
    const getD = (p: Project) => p.dateMontage || p.dateMesures || "";
    const todayProjects = myProjects.filter((p) => projectSpansDate(p, todayStr));
    const thisWeekProjects = myProjects
      .filter((p) => {
        if (todayProjects.includes(p)) return false;
        return projectActiveDuringRange(p, todayStr, thisWeekEndStr);
      })
      .sort((a, b) => getD(a).localeCompare(getD(b)));
    const nextWeekProjects = myProjects
      .filter((p) => {
        if (todayProjects.includes(p) || thisWeekProjects.includes(p)) return false;
        return projectActiveDuringRange(p, thisWeekEndStr, weekEndStr);
      })
      .sort((a, b) => getD(a).localeCompare(getD(b)));
    const allUpcoming = [...todayProjects, ...thisWeekProjects, ...nextWeekProjects];
    const cabinesBySource = countCabinesBySource(allUpcoming, name);
    const totalCabines = Object.values(cabinesBySource).reduce((s, v) => s + v, 0);
    const cabinesSummary = formatCabinesSummary(cabinesBySource);
    return { name, colors, myProjects, todayProjects, thisWeekProjects, nextWeekProjects, totalCabines, cabinesSummary };
  });

  // Build per-binôme/team data (projects with 2+ collaborateurs)
  const binomeMap: Record<string, Project[]> = {};
  projects.forEach((p) => {
    const collab = p.collaborateurs || "";
    if (!collab.includes("&")) return;
    // Check if project is active within next 2 weeks
    if (!projectActiveDuringRange(p, todayStr, weekEndStr)) return;
    if (!binomeMap[collab]) binomeMap[collab] = [];
    binomeMap[collab].push(p);
  });
  const binomeData = Object.entries(binomeMap)
    .map(([teamName, teamProjects]) => {
      const names = teamName.split(" & ").map((n) => n.trim());
      const isBinome = names.length === 2;
      const isTeam = names.length >= 5 || teamName.toLowerCase().includes("team");
      const getD = (p: Project) => p.dateMontage || p.dateMesures || "";
      const todayP = teamProjects.filter((p) => projectSpansDate(p, todayStr));
      const thisWeekP = teamProjects.filter((p) => { if (todayP.includes(p)) return false; return projectActiveDuringRange(p, todayStr, thisWeekEndStr); })
        .sort((a, b) => getD(a).localeCompare(getD(b)));
      const nextWeekP = teamProjects.filter((p) => { if (todayP.includes(p) || thisWeekP.includes(p)) return false; return projectActiveDuringRange(p, thisWeekEndStr, weekEndStr); })
        .sort((a, b) => getD(a).localeCompare(getD(b)));
      const totalCabines = teamProjects.reduce((sum, p) => sum + (p.nbCabines || 0), 0);
      return { teamName, names, isBinome, isTeam, todayProjects: todayP, thisWeekProjects: thisWeekP, nextWeekProjects: nextWeekP, totalCabines };
    })
    .filter((b) => b.todayProjects.length > 0 || b.thisWeekProjects.length > 0 || b.nextWeekProjects.length > 0);

  // Summary stats
  const totalProjectsToday = new Set(
    collabData.flatMap((c) => c.todayProjects.map((p) => p.id))
  ).size;
  const totalCabinesWeek = collabData.reduce((sum, c) => sum + c.totalCabines, 0);
  const allWeekCabinesBySource: Record<string, number> = {};
  collabData.forEach((c) => {
    const counts = countCabinesBySource([...c.todayProjects, ...c.thisWeekProjects, ...c.nextWeekProjects], c.name);
    Object.entries(counts).forEach(([k, v]) => { allWeekCabinesBySource[k] = (allWeekCabinesBySource[k] || 0) + v; });
  });
  const weekSummary = formatCabinesSummary(allWeekCabinesBySource);
  const busyToday = collabData.filter((c) => c.todayProjects.length > 0).length;

  // Mesures aujourd'hui
  const mesuresTodayProjects = projects.filter((p) => (p as any)._source === "mesures" && (p.dateMesures || "").split("T")[0] === todayStr);
  const mesuresTodayCount = mesuresTodayProjects.length;
  const mesuresTodayCabines = mesuresTodayProjects.reduce((s, p) => s + (p.nbCabines || 0), 0);

  // Services du jour
  const servicesTodayProjects = projects.filter((p) => ((p as any)._source === "services" || (p as any)._source === "sav") && (p.dateMontage || "").split("T")[0] === todayStr);
  const servicesTodayCount = servicesTodayProjects.length;
  const servicesTodayCabines = servicesTodayProjects.reduce((s, p) => s + (p.nbCabines || 0), 0);

  return (
    <div className="mb-6 space-y-4">
      {/* En-tête de bienvenue */}
      <div className="glass-card rounded-2xl p-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-lg font-bold text-blue-600 dark:text-blue-400">
            {getCollaboratorInitials(firstName)}
          </div>
          <div className="flex-1">
            <p className="font-semibold text-gray-900 dark:text-gray-100">Bonjour {firstName} 👋</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {totalProjectsToday > 0
                ? `${totalProjectsToday} montage${totalProjectsToday > 1 ? "s" : ""} prévu${totalProjectsToday > 1 ? "s" : ""} aujourd'hui · ${busyToday} monteur${busyToday > 1 ? "s" : ""} actif${busyToday > 1 ? "s" : ""}`
                : "Aucun montage prévu aujourd'hui"}
            </p>
          </div>
          <button onClick={() => setShowWeekProjects(!showWeekProjects)} className="text-right hover:opacity-70 transition-opacity">
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{totalCabinesWeek}</p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500">cab. cette sem. ▾</p>
            {weekSummary && <p className="text-[9px] text-gray-400 mt-0.5">{weekSummary}</p>}
          </button>
        </div>
        {showWeekProjects && (() => {
          const allWeekProjects = collabData
            .flatMap((c) => [...c.todayProjects, ...c.thisWeekProjects, ...c.nextWeekProjects])
            .filter((p, i, arr) => arr.findIndex((x) => x.id === p.id) === i)
            .sort((a, b) => (a.dateMontage || "").localeCompare(b.dateMontage || ""));
          return (
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 space-y-1.5">
              {allWeekProjects.map((p) => {
                const source = getProjectSource(p);
                const isMesure = source === "mesures";
                const collabField = isMesure ? (p.mesuresTraiteePar || p.collaborateurs || "") : (p.collaborateurs || "");
                const names = collabField.split(" & ").map((n) => n.trim()).filter(Boolean);
                const logo = getClientLogo(p.projet);
                return (
                  <Link key={p.id} href={`/projet/${p.id}?mode=dashboard`}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/60 dark:hover:bg-white/5 transition-colors text-xs">
                    <span className="text-gray-400 font-mono w-16 shrink-0">
                      {(p.dateMontage || p.dateMesures) ? new Date((p.dateMontage || p.dateMesures || "") + (p.dateMontage?.includes("T") ? "" : "T12:00:00")).toLocaleDateString("fr-CH", { day: "2-digit", month: "short" }) : "---"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 flex-wrap">
                        {p.ofrTM && <span className="text-[9px] font-mono text-gray-400">{p.ofrTM}</span>}
                        <span className={`text-[8px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${isMesure ? "bg-cyan-100 text-cyan-700" : "bg-orange-100 text-orange-700"}`}>{isMesure ? "Mesures" : "Montages"}</span>
                      </div>
                      <p className="text-xs text-gray-900 dark:text-gray-100 line-clamp-2">{p.projet}</p>
                    </div>
                    {logo && <img src={logo} alt="" className="h-4 w-auto object-contain shrink-0 rounded" />}
                    <div className="flex -space-x-1 shrink-0">
                      {names.slice(0, 3).map((n) => (
                        <span key={n} className="w-5 h-5 rounded-full text-[7px] font-bold flex items-center justify-center border border-white dark:border-gray-800"
                          style={{ backgroundColor: getCollaboratorColor(n).bg, color: getCollaboratorColor(n).text }}>
                          {getCollaboratorInitials(n)}
                        </span>
                      ))}
                    </div>
                    <Badge variant="outline" className="text-[10px] shrink-0">{p.nbCabines || 0} cab.</Badge>
                  </Link>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* Summary cards — hauteur uniformisée via un placeholder invisible
          pour les cartes sans sous-texte "X cab." */}
      <div className="grid grid-cols-5 gap-1.5 sm:gap-3">
        <div className="glass-card rounded-2xl p-2 sm:p-4 flex flex-col items-center">
          <p className="text-lg sm:text-2xl font-bold text-cyan-600 dark:text-cyan-400">{mesuresTodayCount}</p>
          <p className="text-[8px] sm:text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 leading-tight text-center">Mesures aujourd'hui</p>
          <p className="text-[7px] sm:text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{mesuresTodayCabines} cab.</p>
        </div>
        <button onClick={() => setShowSummaryPanel(showSummaryPanel === "today" ? null : "today")} className="glass-card rounded-2xl p-2 sm:p-4 flex flex-col items-center hover:shadow-lg active:scale-95 transition-all">
          <p className="text-lg sm:text-2xl font-bold text-blue-600 dark:text-blue-400">{totalProjectsToday}</p>
          <p className="text-[8px] sm:text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 leading-tight text-center">Montages aujourd'hui</p>
          <p className="text-[7px] sm:text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 invisible" aria-hidden="true">0 cab.</p>
        </button>
        <div className="glass-card rounded-2xl p-2 sm:p-4 flex flex-col items-center">
          <p className="text-lg sm:text-2xl font-bold text-violet-600 dark:text-violet-400">{servicesTodayCount}</p>
          <p className="text-[8px] sm:text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 leading-tight text-center">Services aujourd'hui</p>
          <p className="text-[7px] sm:text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{servicesTodayCabines} cab.</p>
        </div>
        <button onClick={() => setShowSummaryPanel(showSummaryPanel === "week" ? null : "week")} className="glass-card rounded-2xl p-2 sm:p-4 flex flex-col items-center hover:shadow-lg active:scale-95 transition-all">
          <p className="text-lg sm:text-2xl font-bold text-emerald-600 dark:text-emerald-400">{totalCabinesWeek}</p>
          <p className="text-[8px] sm:text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 leading-tight text-center">Cabines cette semaine</p>
          <p className="text-[7px] sm:text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 invisible" aria-hidden="true">0 cab.</p>
        </button>
        <button onClick={() => setShowSummaryPanel(showSummaryPanel === "active" ? null : "active")} className="glass-card rounded-2xl p-2 sm:p-4 flex flex-col items-center hover:shadow-lg active:scale-95 transition-all">
          <p className="text-lg sm:text-2xl font-bold text-amber-600 dark:text-amber-400">{busyToday}</p>
          <p className="text-[8px] sm:text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 leading-tight text-center">Monteurs actifs</p>
          <p className="text-[7px] sm:text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 invisible" aria-hidden="true">0 cab.</p>
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {(() => {
          const rdvAFixerStatuses = ["Livraison partielle", "Cabine à aller chercher", "Récéptionné - RDV à fixer", "Montage partiel"];
          const mesuresAFixerStatuses = ["Pas contacté", "Contact sans réponse"];
          const rdvAFixerProjects = projects.filter((p) =>
            rdvAFixerStatuses.includes(p.etatCMD) ||
            (p.etatCMD === "En attente de mesures" && mesuresAFixerStatuses.includes(p.etatMesures))
          );
          const montagesRdvCab = rdvAFixerProjects.filter((p) => { const src = (p as any)._source; return src === "cmd" || src === "montage" || !src; }).reduce((s, p) => s + (p.nbCabines || 0), 0);
          const mesuresRdvCab = rdvAFixerProjects.filter((p) => (p as any)._source === "mesures").reduce((s, p) => s + (p.nbCabines || 0), 0);
          const servicesRdvCab = rdvAFixerProjects.filter((p) => (p as any)._source === "services" || (p as any)._source === "sav").reduce((s, p) => s + (p.nbCabines || 0), 0);
          return (
            <button onClick={() => setShowSummaryPanel(showSummaryPanel === "rdv-a-fixer" ? null : "rdv-a-fixer")} className="glass-card rounded-2xl p-4 text-center hover:shadow-lg active:scale-95 transition-all">
              <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{rdvAFixerProjects.length}</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">RDV à fixer</p>
              <div className="text-center mt-1.5 space-y-0.5">
                {montagesRdvCab > 0 && <p className="text-[9px] text-gray-400 dark:text-gray-500">Montages: {montagesRdvCab} cab.</p>}
                {mesuresRdvCab > 0 && <p className="text-[9px] text-gray-400 dark:text-gray-500">Mesures: {mesuresRdvCab} cab.</p>}
                {servicesRdvCab > 0 && <p className="text-[9px] text-gray-400 dark:text-gray-500">Services: {servicesRdvCab} cab.</p>}
              </div>
            </button>
          );
        })()}
        {(() => {
          const rdvFixeProjects = projects.filter((p) => p.etatCMD === "RDV - fixé" || p.etatMesures === "RDV - Fixé");
          const montagesFixeCab = rdvFixeProjects.filter((p) => { const src = (p as any)._source; return src === "cmd" || src === "montage" || !src; }).reduce((s, p) => s + (p.nbCabines || 0), 0);
          const mesuresFixeCab = rdvFixeProjects.filter((p) => (p as any)._source === "mesures").reduce((s, p) => s + (p.nbCabines || 0), 0);
          const servicesFixeCab = rdvFixeProjects.filter((p) => (p as any)._source === "services" || (p as any)._source === "sav").reduce((s, p) => s + (p.nbCabines || 0), 0);
          return (
            <button onClick={() => setShowSummaryPanel(showSummaryPanel === "rdv-fixe" ? null : "rdv-fixe")} className="glass-card rounded-2xl p-4 text-center hover:shadow-lg active:scale-95 transition-all">
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">{rdvFixeProjects.length}</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">RDV fixé</p>
              <div className="text-center mt-1.5 space-y-0.5">
                {montagesFixeCab > 0 && <p className="text-[9px] text-gray-400 dark:text-gray-500">Montages: {montagesFixeCab} cab.</p>}
                {mesuresFixeCab > 0 && <p className="text-[9px] text-gray-400 dark:text-gray-500">Mesures: {mesuresFixeCab} cab.</p>}
                {servicesFixeCab > 0 && <p className="text-[9px] text-gray-400 dark:text-gray-500">Services: {servicesFixeCab} cab.</p>}
              </div>
            </button>
          );
        })()}
      </div>

      {/* Summary panel */}
      {showSummaryPanel && (() => {
        let panelProjects: Project[] = [];
        let panelTitle = "";

        if (showSummaryPanel === "today") {
          panelTitle = "Montages aujourd'hui";
          panelProjects = collabData
            .flatMap((c) => c.todayProjects)
            .filter((p, i, arr) => arr.findIndex((x) => x.id === p.id) === i);
        } else if (showSummaryPanel === "week") {
          panelTitle = "Cabines cette semaine";
          panelProjects = collabData
            .flatMap((c) => [...c.todayProjects, ...c.thisWeekProjects, ...c.nextWeekProjects])
            .filter((p, i, arr) => arr.findIndex((x) => x.id === p.id) === i)
            .sort((a, b) => ((a.dateMontage || a.dateMesures || "").split("T")[0]).localeCompare((b.dateMontage || b.dateMesures || "").split("T")[0]));
        } else if (showSummaryPanel === "active") {
          panelTitle = "Monteurs actifs aujourd'hui";
          const activeCollabs = collabData.filter((c) => c.todayProjects.length > 0);
          return (
            <div className="glass-card rounded-2xl p-4 space-y-2">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{panelTitle}</p>
              {activeCollabs.length === 0 && <p className="text-sm text-gray-400 py-2">Aucun monteur actif</p>}
              {activeCollabs.map((c) => (
                <div key={c.name} className="flex items-center gap-3 py-1.5">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                    style={{ backgroundColor: c.colors.bg, color: c.colors.text }}>{getCollaboratorInitials(c.name)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{c.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{c.todayProjects.length} montage{c.todayProjects.length > 1 ? "s" : ""}</p>
                  </div>
                  <div className="text-right text-xs text-gray-500">
                    {c.todayProjects.reduce((s, p) => s + (p.nbCabines || 0), 0)} cab.
                  </div>
                </div>
              ))}
            </div>
          );
        } else if (showSummaryPanel === "rdv-a-fixer") {
          // Split into 3 categories
          const montageStatuses = ["Livraison partielle", "Cabine à aller chercher", "Récéptionné - RDV à fixer", "Montage partiel"];
          const mesuresStatuses = ["Pas contacté", "Contact sans réponse"];

          const montageProjects = projects.filter((p) => montageStatuses.includes(p.etatCMD))
            .sort((a, b) => ((a.dateMesures || a.dateMontage || "z").split("T")[0]).localeCompare((b.dateMesures || b.dateMontage || "z").split("T")[0]));

          const mesuresProjects = projects.filter((p) => p.etatCMD === "En attente de mesures" && mesuresStatuses.includes(p.etatMesures))
            .sort((a, b) => ((a.dateMesuresRecue || a.dateMesures || "z").split("T")[0]).localeCompare((b.dateMesuresRecue || b.dateMesures || "z").split("T")[0]));

          const servicesProjects = projects.filter((p) =>
            montageStatuses.includes(p.etatCMD) && p.typeServices && p.typeServices.some((t) => t !== "Montages" && t !== "Montage")
          ).sort((a, b) => ((a.dateDemandeProjet || a.dateMontage || "z").split("T")[0]).localeCompare((b.dateDemandeProjet || b.dateMontage || "z").split("T")[0]));

          // Remove services from montage list to avoid duplicates
          const pureMontageProjets = montageProjects.filter((p) => !servicesProjects.some((s) => s.id === p.id));

          const totalCount = pureMontageProjets.length + mesuresProjects.length + servicesProjects.length;

          const renderCategory = (title: string, color: string, bgColor: string, categoryProjects: Project[], dateLabel?: string, useDateField?: "dateMesuresRecue" | "dateDemandeProjet") => {
            if (categoryProjects.length === 0) return null;
            return (
              <div key={title} className="mb-4">
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg mb-1.5 ${bgColor}`}>
                  <span className={`text-[12px] font-bold ${color}`}>{title}</span>
                  <span className="ml-auto text-[10px] font-semibold bg-white/60 dark:bg-white/10 px-2 py-0.5 rounded-full">
                    {categoryProjects.length} projet{categoryProjects.length > 1 ? "s" : ""}
                  </span>
                </div>
                {dateLabel && (
                  <div className="flex items-center gap-2 px-2 py-0.5 mb-1 text-[9px] font-semibold text-gray-400 uppercase tracking-wider">
                    <span className="w-16 shrink-0">{dateLabel}</span>
                  </div>
                )}
                {categoryProjects.map((p, idx) => {
                  const isMesure = p.etatMesures && mesuresStatuses.includes(p.etatMesures);
                  const collabField = isMesure ? (p.mesuresTraiteePar || p.collaborateurs || "") : (p.collaborateurs || "");
                  const names = collabField.split(" & ").map((n) => n.trim()).filter(Boolean);
                  const date = useDateField === "dateMesuresRecue"
                    ? (p.dateMesuresRecue || p.dateMesures || "").split("T")[0]
                    : useDateField === "dateDemandeProjet"
                    ? (p.dateDemandeProjet || p.dateMontage || "").split("T")[0]
                    : (p.dateMesures || p.dateMontage || "").split("T")[0];
                  const rowBg = idx % 2 === 0 ? "bg-blue-50/60 dark:bg-blue-950/20" : "bg-blue-100/60 dark:bg-blue-900/20";
                  return (
                    <Link key={p.id} href={`/projet/${p.id}?mode=dashboard`}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-blue-200/60 dark:hover:bg-blue-800/30 transition-colors text-xs ${rowBg}`}>
                      <span className="text-gray-400 font-mono w-16 shrink-0">
                        {date ? new Date(date + "T12:00:00").toLocaleDateString("fr-CH", { day: "2-digit", month: "short" }) : "---"}
                      </span>
                      <span className="w-20 shrink-0 font-mono text-gray-600 dark:text-gray-300 truncate">{p.ofrTM || "---"}</span>
                      <span className="w-20 shrink-0 font-mono text-gray-500 dark:text-gray-400 truncate hidden sm:block">{p.servMesuresFournisseurs || "---"}</span>
                      <span className="w-20 shrink-0 font-mono text-gray-500 dark:text-gray-400 truncate hidden sm:block">{p.servCmdFournisseurs || "---"}</span>
                      <span className="flex-1 min-w-0 text-xs text-gray-900 dark:text-gray-100 line-clamp-2">{p.projet}</span>
                      {p.typeServices && p.typeServices.length > 0 && p.typeServices.flatMap((ts) => {
                        const parts = ts.includes("+") ? ts.split("+").map((s) => s.trim()) : [ts];
                        return parts.map((part) => {
                          const tsColors: Record<string, string> = {
                            "Montages": "bg-orange-100 text-orange-700", "Montage": "bg-orange-100 text-orange-700",
                            "Mesures": "bg-cyan-100 text-cyan-700", "Services": "bg-emerald-100 text-emerald-700",
                            "SAV": "bg-red-100 text-red-700", "Livraison": "bg-amber-100 text-amber-700",
                            "Dépannage": "bg-pink-100 text-pink-700", "Démontage": "bg-rose-100 text-rose-700",
                            "Remplacement": "bg-indigo-100 text-indigo-700",
                          };
                          return <span key={part} className={`shrink-0 text-[8px] font-semibold px-1.5 py-0.5 rounded-full ${tsColors[part] || "bg-gray-100 text-gray-600"}`}>{part}</span>;
                        });
                      })}
                      {(() => { const logo = getClientLogo(p.projet); return logo ? (
                        <img src={logo} alt="" className="w-7 h-5 object-contain shrink-0 rounded" />
                      ) : null; })()}
                      <div className="flex -space-x-1 shrink-0">
                        {names.slice(0, 3).map((n) => (
                          <span key={n} className="w-6 h-6 rounded-full text-[7px] font-bold flex items-center justify-center border border-white dark:border-gray-800"
                            style={{ backgroundColor: getCollaboratorColor(n).bg, color: getCollaboratorColor(n).text }}>{getCollaboratorInitials(n)}</span>
                        ))}
                      </div>
                      <Badge variant="outline" className="text-[10px] shrink-0">{p.nbCabines || 0} cab.</Badge>
                    </Link>
                  );
                })}
              </div>
            );
          };

          return (
            <div className="glass-card rounded-2xl p-4">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">RDV à fixer ({totalCount})</p>
              {renderCategory("Mesures à relever", "text-cyan-700 dark:text-cyan-300", "bg-cyan-50 dark:bg-cyan-900/20", mesuresProjects, "Reçue le", "dateMesuresRecue")}
              {renderCategory("Montages à planifier", "text-orange-700 dark:text-orange-300", "bg-orange-50 dark:bg-orange-900/20", pureMontageProjets)}
              {renderCategory("Services à planifier", "text-emerald-700 dark:text-emerald-300", "bg-emerald-50 dark:bg-emerald-900/20", servicesProjects, "Reçue le", "dateDemandeProjet")}
              {totalCount === 0 && <p className="text-sm text-gray-400 py-2">Aucun projet</p>}
            </div>
          );
        } else if (showSummaryPanel === "rdv-fixe") {
          panelTitle = "RDV fixé";
          panelProjects = projects
            .filter((p) => p.etatCMD === "RDV - fixé" || p.etatMesures === "RDV - Fixé")
            .sort((a, b) => ((a.dateMontage || a.dateMesures || "z").split("T")[0]).localeCompare((b.dateMontage || b.dateMesures || "z").split("T")[0]));
        }

        const isRdvAFixer = false; // rdv-a-fixer has its own return above
        const dateLabel = "Date";

        return (
          <div className="glass-card rounded-2xl p-4 space-y-1.5">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{panelTitle} ({panelProjects.length})</p>
            {panelProjects.length > 0 && (
              <div className="flex items-center gap-2 px-2 py-1 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700 mb-1">
                {isRdvAFixer && <span className="w-16 shrink-0">{dateLabel}</span>}
                <span className="w-20 shrink-0">N° OFR TM</span>
                <span className="w-20 shrink-0 hidden sm:block">N° Mes. Fourn.</span>
                <span className="w-20 shrink-0 hidden sm:block">N° CMD Fourn.</span>
                <span className="flex-1">Projet</span>
                <span className="w-14 text-right">Cabines</span>
              </div>
            )}
            {panelProjects.length === 0 && <p className="text-sm text-gray-400 py-2">Aucun projet</p>}

            {/* RDV à fixer : liste simple avec colonne date */}
            {isRdvAFixer && panelProjects.map((p, idx) => {
              const isMesure = p.etatMesures === "RDV - Fixé";
              const collabField = isMesure ? (p.mesuresTraiteePar || p.collaborateurs || "") : (p.collaborateurs || "");
              const names = collabField.split(" & ").map((n) => n.trim()).filter(Boolean);
              const date = (p.dateMesures || "").split("T")[0];
              const rowBg = idx % 2 === 0
                ? "bg-blue-50/60 dark:bg-blue-950/20"
                : "bg-blue-100/60 dark:bg-blue-900/20";
              return (
                <Link key={p.id} href={`/projet/${p.id}?mode=dashboard`}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-blue-200/60 dark:hover:bg-blue-800/30 transition-colors text-xs ${rowBg}`}>
                  <span className="text-gray-400 font-mono w-16 shrink-0">
                    {date ? new Date(date + "T12:00:00").toLocaleDateString("fr-CH", { day: "2-digit", month: "short" }) : "---"}
                  </span>
                  <span className="w-20 shrink-0 font-mono text-gray-600 dark:text-gray-300 truncate">{p.ofrTM || "---"}</span>
                  <span className="w-20 shrink-0 font-mono text-gray-500 dark:text-gray-400 truncate hidden sm:block">{p.servMesuresFournisseurs || "---"}</span>
                  <span className="w-20 shrink-0 font-mono text-gray-500 dark:text-gray-400 truncate hidden sm:block">{p.servCmdFournisseurs || "---"}</span>
                  <span className="flex-1 min-w-0 text-xs text-gray-900 dark:text-gray-100 line-clamp-2">{p.projet}</span>
                  {p.typeServices && p.typeServices.length > 0 && p.typeServices.flatMap((ts) => {
                    // Split "Démontage + Montage" into separate badges
                    const parts = ts.includes("+") ? ts.split("+").map((s) => s.trim()) : [ts];
                    return parts.map((part) => {
                      const tsColors: Record<string, string> = {
                        "Montages": "bg-orange-100 text-orange-700",
                        "Montage": "bg-orange-100 text-orange-700",
                        "Mesures": "bg-cyan-100 text-cyan-700",
                        "Services": "bg-emerald-100 text-emerald-700",
                        "SAV": "bg-red-100 text-red-700",
                        "Livraison": "bg-amber-100 text-amber-700",
                        "Dépannage": "bg-pink-100 text-pink-700",
                        "Démontage": "bg-rose-100 text-rose-700",
                        "Remplacement": "bg-indigo-100 text-indigo-700",
                      };
                      return <span key={part} className={`shrink-0 text-[8px] font-semibold px-1.5 py-0.5 rounded-full ${tsColors[part] || "bg-gray-100 text-gray-600"}`}>{part}</span>;
                    });
                  })}
                  {(() => { const logo = getClientLogo(p.projet); return logo ? (
                    <img src={logo} alt="" className="w-7 h-5 object-contain shrink-0 rounded" />
                  ) : null; })()}
                  <div className="flex -space-x-1 shrink-0">
                    {names.slice(0, 3).map((n) => (
                      <span key={n} className="w-6 h-6 rounded-full text-[7px] font-bold flex items-center justify-center border border-white dark:border-gray-800"
                        style={{ backgroundColor: getCollaboratorColor(n).bg, color: getCollaboratorColor(n).text }}>{getCollaboratorInitials(n)}</span>
                    ))}
                  </div>
                  {p.dateMontageEnd && (() => { const days = getWorkingDays(p.dateMontage || "", p.dateMontageEnd); return days.length > 1 ? (
                    <span className="shrink-0 text-[8px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">{days.length}j</span>
                  ) : null; })()}
                  <Badge variant="outline" className="text-[10px] shrink-0">{p.nbCabines || 0} cab.</Badge>
                </Link>
              );
            })}

            {/* Autres panels : groupé par jour avec séparateurs */}
            {!isRdvAFixer && (() => {
              const todayStr = new Date().toISOString().split("T")[0];
              const now = new Date();
              const weekEnd = new Date(now);
              weekEnd.setDate(weekEnd.getDate() + (7 - weekEnd.getDay()));
              const weekEndStr = weekEnd.toISOString().split("T")[0];

              // Build a map of dateKey → projects, expanding multi-day projects
              const dayMap: Record<string, Project[]> = {};
              panelProjects.forEach((p) => {
                const startDate = (p.dateMontage || p.dateMesures || "").split("T")[0];
                if (!startDate) {
                  if (!dayMap["no-date"]) dayMap["no-date"] = [];
                  dayMap["no-date"].push(p);
                  return;
                }
                const endDate = (p.dateMontageEnd || "").split("T")[0];
                if (endDate && endDate > startDate) {
                  // Multi-day: add to each working day
                  const days = getWorkingDays(startDate, endDate);
                  days.forEach((d) => {
                    if (!dayMap[d]) dayMap[d] = [];
                    dayMap[d].push(p);
                  });
                } else {
                  // Single day
                  if (!dayMap[startDate]) dayMap[startDate] = [];
                  dayMap[startDate].push(p);
                }
              });

              // Sort days and build grouped array
              const sortedDays = Object.keys(dayMap).sort((a, b) => a === "no-date" ? 1 : b === "no-date" ? -1 : a.localeCompare(b));
              const grouped = sortedDays.map((dateKey) => {
                const d = dateKey !== "no-date" ? new Date(dateKey + "T12:00:00") : null;
                const label = d ? d.toLocaleDateString("fr-CH", { weekday: "long", day: "numeric", month: "long" }) : "Date non définie";
                return {
                  dateKey,
                  dateLabel: label.charAt(0).toUpperCase() + label.slice(1),
                  isToday: dateKey === todayStr,
                  isThisWeek: dateKey >= todayStr && dateKey <= weekEndStr,
                  projects: dayMap[dateKey],
                };
              });

              return grouped.map((group) => (
                <div key={group.dateKey} className="mb-1">
                  <div className={`flex items-center gap-2 px-3 py-2 mt-3 mb-1 rounded-lg shadow-sm ${
                    group.isToday
                      ? "bg-green-600 dark:bg-green-700"
                      : group.isThisWeek
                        ? "bg-[#1e3a5f] dark:bg-[#1e3a5f]"
                        : "bg-slate-500 dark:bg-slate-600"
                  }`}>
                    <span className="text-[12px] font-bold text-white">
                      {group.isToday ? "📍 Aujourd'hui" : group.dateLabel}
                    </span>
                    <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full font-semibold bg-white/20 text-white">
                      {group.projects.length} projet{group.projects.length > 1 ? "s" : ""} · {group.projects.reduce((s, p) => s + (p.nbCabines || 0), 0)} cab.
                    </span>
                  </div>
                  {group.projects.map((p, idx) => {
                    const isMesure = p.etatMesures === "RDV - Fixé";
                    const collabField = isMesure ? (p.mesuresTraiteePar || p.collaborateurs || "") : (p.collaborateurs || "");
                    const names = collabField.split(" & ").map((n) => n.trim()).filter(Boolean);
                    const rowBg = idx % 2 === 0
                      ? "bg-white/60 dark:bg-slate-800/40"
                      : "bg-blue-50/40 dark:bg-blue-950/15";
                    return (
                      <Link key={p.id} href={`/projet/${p.id}?mode=dashboard`}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-blue-200/60 dark:hover:bg-blue-800/30 transition-colors text-xs ${rowBg}`}>
                        <span className="w-20 shrink-0 font-mono text-gray-600 dark:text-gray-300 truncate">{p.ofrTM || "---"}</span>
                        <span className="w-20 shrink-0 font-mono text-gray-500 dark:text-gray-400 truncate hidden sm:block">{p.servMesuresFournisseurs || "---"}</span>
                        <span className="w-20 shrink-0 font-mono text-gray-500 dark:text-gray-400 truncate hidden sm:block">{p.servCmdFournisseurs || "---"}</span>
                        <span className="flex-1 min-w-0 text-xs text-gray-900 dark:text-gray-100 line-clamp-2">{p.projet}</span>
                        {(showSummaryPanel === "rdv-fixe") && (
                          isMesure ? (
                            <span className="shrink-0 text-[8px] font-semibold px-1.5 py-0.5 rounded-full bg-cyan-100 text-cyan-700">Mesures</span>
                          ) : (
                            (p.typeServices && p.typeServices.length > 0) ? p.typeServices.flatMap((ts) => {
                              const parts = ts.includes("+") ? ts.split("+").map((s) => s.trim()) : [ts];
                              return parts.map((part) => {
                                const tsColors: Record<string, string> = {
                                  "Montages": "bg-orange-100 text-orange-700",
                                  "Montage": "bg-orange-100 text-orange-700",
                                  "Services": "bg-emerald-100 text-emerald-700",
                                  "SAV": "bg-red-100 text-red-700",
                                  "Livraison": "bg-amber-100 text-amber-700",
                                  "Dépannage": "bg-pink-100 text-pink-700",
                                  "Démontage": "bg-rose-100 text-rose-700",
                                  "Remplacement": "bg-indigo-100 text-indigo-700",
                                };
                                return <span key={part} className={`shrink-0 text-[8px] font-semibold px-1.5 py-0.5 rounded-full ${tsColors[part] || "bg-gray-100 text-gray-600"}`}>{part}</span>;
                              });
                            }) : (
                              <span className="shrink-0 text-[8px] font-semibold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700">Montages</span>
                            )
                          )
                        )}
                        {(() => { const logo = getClientLogo(p.projet); return logo ? (
                          <img src={logo} alt="" className="w-7 h-5 object-contain shrink-0 rounded" />
                        ) : null; })()}
                        <div className="flex -space-x-1 shrink-0">
                          {names.slice(0, 3).map((n) => (
                            <span key={n} className="w-6 h-6 rounded-full text-[7px] font-bold flex items-center justify-center border border-white dark:border-gray-800"
                              style={{ backgroundColor: getCollaboratorColor(n).bg, color: getCollaboratorColor(n).text }}>{getCollaboratorInitials(n)}</span>
                          ))}
                        </div>
                        {p.dateMontageEnd && (() => { const days = getWorkingDays(p.dateMontage || "", p.dateMontageEnd); return days.length > 1 ? (
                          <span className="shrink-0 text-[8px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">{days.length}j</span>
                        ) : null; })()}
                        <Badge variant="outline" className="text-[10px] shrink-0">{p.nbCabines || 0} cab.</Badge>
                      </Link>
                    );
                  })}
                </div>
              ));
            })()}
          </div>
        );
      })()}

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
                    {getCollaboratorInitials(c.name)}
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
                {getCollaboratorInitials(collab.name)}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="font-semibold text-gray-900 dark:text-gray-100">{collab.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {collab.todayProjects.length > 0
                    ? `${collab.todayProjects.length} montage${collab.todayProjects.length > 1 ? "s" : ""} aujourd'hui`
                    : "Aucun montage aujourd'hui"}
                  {collab.cabinesSummary ? ` · ${collab.cabinesSummary}` : ""}
                </p>
              </div>
              {/* Dernière connexion */}
              {(() => {
                const collabLower = collab.name.toLowerCase();
                const lastSeen = Object.entries(userActivities).find(([name]) => {
                  const nameLower = name.toLowerCase();
                  const nameFirst = nameLower.split(" ")[0];
                  // Match: "Claudio Zanutto" contains "Claudio", or "Claudio" contains "Claudio"
                  return nameLower.includes(collabLower) || collabLower.includes(nameFirst) || nameFirst === collabLower;
                })?.[1];
                if (!lastSeen) return (
                  <span className="text-[9px] text-gray-300 dark:text-gray-600 shrink-0 text-right">Jamais<br/>connecté</span>
                );
                const d = new Date(lastSeen);
                const now = Date.now();
                const diff = now - d.getTime();
                const isRecent = diff < 3600000; // < 1h
                const isToday = d.toDateString() === new Date().toDateString();
                return (
                  <div className={`text-[9px] shrink-0 text-right px-1.5 py-1 rounded-lg mr-2 ${isRecent ? "bg-green-50 text-green-600" : isToday ? "bg-blue-50 text-blue-600" : "bg-gray-50 text-gray-400"}`}>
                    <p className="font-medium">{d.toLocaleDateString("fr-CH", { day: "2-digit", month: "short" })}</p>
                    <p>{d.toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" })}</p>
                  </div>
                );
              })()}
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

                {/* This week's projects (excluding today) */}
                {collab.thisWeekProjects.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Cette semaine ({collab.thisWeekProjects.length})
                    </p>
                    <div className="space-y-1.5">
                      {collab.thisWeekProjects.map((p) => (
                        <WeekProjectRow key={p.id} project={p} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Next week's projects */}
                {collab.nextWeekProjects.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Semaine prochaine ({collab.nextWeekProjects.length})
                    </p>
                    <div className="space-y-1.5">
                      {collab.nextWeekProjects.map((p) => (
                        <WeekProjectRow key={p.id} project={p} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Binômes & Teams */}
      {binomeData.length > 0 && (
        <>
          <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mt-2">
            <Users className="w-3.5 h-3.5" />
            Binômes & Teams
          </p>
          {binomeData.map((team) => {
            const isExpanded = expandedCollabs[`team-${team.teamName}`] ?? false;
            return (
              <div key={team.teamName} className="glass-card rounded-2xl overflow-hidden">
                <button
                  onClick={() => toggleCollab(`team-${team.teamName}`)}
                  className="w-full flex items-center gap-3 p-4 hover:bg-white/40 dark:hover:bg-white/5 transition-colors"
                >
                  <div className="flex -space-x-2 shrink-0">
                    {team.names.map((n) => (
                      <div key={n} className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold border-2 border-white dark:border-gray-800"
                        style={{ backgroundColor: getCollaboratorColor(n).bg, color: getCollaboratorColor(n).text }}>
                        {getCollaboratorInitials(n)}
                      </div>
                    ))}
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{team.names.join(" & ")}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {team.todayProjects.length > 0
                        ? `${team.todayProjects.length} montage${team.todayProjects.length > 1 ? "s" : ""} aujourd'hui`
                        : "Pas de montage aujourd'hui"}
                      {" · "}{team.totalCabines} cab.
                    </p>
                  </div>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${team.isTeam ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                    {team.isTeam ? "Team" : team.names.length === 2 ? "Binôme" : team.names.length === 3 ? "Trio" : team.names.length === 4 ? "Quatuor" : "Équipe"}
                  </span>
                  {team.todayProjects.length > 0 && <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse shrink-0" />}
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
                </button>
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-3">
                    {team.todayProjects.length > 0 && (
                      <div>
                        <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> Aujourd'hui ({team.todayProjects.length})
                        </p>
                        <div className="space-y-1.5">
                          {team.todayProjects.map((p) => <ProjectRow key={p.id} project={p} colors={getCollaboratorColor(team.names[0])} />)}
                        </div>
                      </div>
                    )}
                    {team.thisWeekProjects.length > 0 && (
                      <div>
                        <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> Cette semaine ({team.thisWeekProjects.length})
                        </p>
                        <div className="space-y-1.5">{team.thisWeekProjects.map((p) => <WeekProjectRow key={p.id} project={p} />)}</div>
                      </div>
                    )}
                    {team.nextWeekProjects.length > 0 && (
                      <div>
                        <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> Semaine prochaine ({team.nextWeekProjects.length})
                        </p>
                        <div className="space-y-1.5">{team.nextWeekProjects.map((p) => <WeekProjectRow key={p.id} project={p} />)}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

// --- Main component ---

export function MonteurDashboard({ userName, projects, isAdmin }: MonteurDashboardProps) {
  // Admin view: show all collaborators
  if (isAdmin) {
    return <AdminDashboard projects={projects} userName={userName} />;
  }

  // Regular monteur view (unchanged logic)
  const firstName = userName.split(" ")[0];
  const colors = getCollaboratorColor(firstName);

  const todayStr = getTodayStr();
  const weekEndStr = getWeekEndStr();
  const thisWeekEndStr = getThisWeekEndStr();

  // Filtrer les projets du monteur par rôle correct selon la source
  const myProjects = projects.filter((p) => {
    const source = getProjectSource(p);
    if (source === "mesures") {
      return matchesCollaborator(p.mesuresTraiteePar || "", firstName);
    }
    return matchesCollaborator(p.collaborateurs || "", firstName);
  });

  // Date effective d'un projet (mesures ou montage)
  const getDate = (p: Project) => p.dateMontage || p.dateMesures || "";

  // Projets du jour (inclut les projets multi-jours qui couvrent aujourd'hui)
  const todayProjects = myProjects.filter((p) => projectSpansDate(p, todayStr));

  // Projets cette semaine (excl. aujourd'hui)
  const thisWeekProjects = myProjects
    .filter((p) => {
      if (todayProjects.includes(p)) return false; // déjà dans "aujourd'hui"
      return projectActiveDuringRange(p, todayStr, thisWeekEndStr);
    })
    .sort((a, b) => getDate(a).localeCompare(getDate(b)));

  // Projets semaine prochaine
  const nextWeekProjects = myProjects
    .filter((p) => {
      if (todayProjects.includes(p) || thisWeekProjects.includes(p)) return false;
      return projectActiveDuringRange(p, thisWeekEndStr, weekEndStr);
    })
    .sort((a, b) => getDate(a).localeCompare(getDate(b)));

  const allUpcoming = [...todayProjects, ...thisWeekProjects, ...nextWeekProjects];
  const myCabinesBySource = countCabinesBySource(allUpcoming, firstName);
  const totalCabines = Object.values(myCabinesBySource).reduce((s, v) => s + v, 0);
  const mySummary = formatCabinesSummary(myCabinesBySource);

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
            {getCollaboratorInitials(firstName)}
          </div>
          <div className="flex-1">
            <p className="font-semibold text-gray-900 dark:text-gray-100">Bonjour {firstName} 👋</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {todayProjects.length > 0
                ? `${todayProjects.length} intervention${todayProjects.length > 1 ? "s" : ""} aujourd'hui`
                : "Aucune intervention aujourd'hui"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold" style={{ color: colors.text }}>{totalCabines}</p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500">cab. à venir</p>
            {mySummary && <p className="text-[9px] text-gray-400 mt-0.5">{mySummary}</p>}
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
              <ProjectRow key={p.id} project={p} colors={colors} />
            ))}
          </div>
          <div className="mt-3">
            <DailyRouteButton projects={todayProjects} />
          </div>
        </div>
      )}

      {/* Cette semaine */}
      {thisWeekProjects.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            Cette semaine
          </p>
          <div className="space-y-1.5">
            {thisWeekProjects.map((p) => (
              <WeekProjectRow key={p.id} project={p} />
            ))}
          </div>
        </div>
      )}

      {/* Semaine prochaine */}
      {nextWeekProjects.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" />
            Semaine prochaine
          </p>
          <div className="space-y-1.5">
            {nextWeekProjects.map((p) => (
              <WeekProjectRow key={p.id} project={p} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
