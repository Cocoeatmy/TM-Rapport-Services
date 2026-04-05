"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Search, MapPin, Calendar, ChevronRight, AlertCircle, X, FileText, CalendarDays, Users as UsersIcon, ArrowLeft, ChevronLeft, ChevronRight as ChevronRightIcon, Star } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { Project } from "@/lib/notion";
import { getCollaboratorColor } from "@/lib/collaborators";
import { formatDateFR, STATUS_CMD_COLORS, STATUS_MESURES_COLORS, STATUS_SORT_ORDER, COLLABORATEURS_LIST } from "@/lib/constants";
import { MonteurDashboard } from "@/components/monteur-dashboard";
import { WeekPlanning } from "@/components/week-planning";
import { getFavorites } from "@/lib/favorites";

function ProjectCard({ project, mode }: { project: Project; mode: string }) {
  const statusColors = mode.startsWith("mesures") ? STATUS_MESURES_COLORS : STATUS_CMD_COLORS;
  const statusValue = mode.startsWith("mesures") ? project.etatMesures : project.etatCMD;
  const statusColor = statusColors[statusValue] || "bg-gray-100 text-gray-700";

  return (
    <Link
      href={`/projet/${project.id}?mode=${mode}`}
      prefetch={true}
      className="block glass-card rounded-2xl p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 truncate text-base">
            {project.projet || "Sans nom"}
          </h3>
          {project.ofrTM && (
            <p className="text-xs text-gray-500 mt-0.5">OFR {project.ofrTM}</p>
          )}
          {project.nomChantier && (
            <div className="flex items-center gap-1.5 mt-2 text-sm text-gray-600">
              <FileText className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{project.nomChantier}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 mt-1 text-sm text-gray-600">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">
              {project.adresseChantier || "---"}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-1 text-sm text-gray-600">
            <Calendar className="w-3.5 h-3.5 shrink-0" />
            <span>{formatDateFR(project.dateMontage)}</span>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {project.fournisseurs.slice(0, 2).map((f) => (
              <Badge key={f} variant="secondary" className="text-xs">
                {f}
              </Badge>
            ))}
            {project.nbCabines && (
              <Badge variant="outline" className="text-xs">
                {project.nbCabines} cabine{project.nbCabines > 1 ? "s" : ""}
              </Badge>
            )}
            {project.emplacementCabine && (
              <Badge variant="outline" className="text-xs">
                {project.emplacementCabine}
              </Badge>
            )}
            {((mode === "mesures" ? project.mesuresTraiteePar : project.collaborateurs) || "").split(" & ").filter(Boolean).map((name) => (
              <span
                key={name}
                className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full"
                style={{
                  backgroundColor: getCollaboratorColor(name.trim()).bg,
                  color: getCollaboratorColor(name.trim()).text,
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: getCollaboratorColor(name.trim()).dot }}
                />
                {name.trim()}
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span
            className={`text-[11px] font-medium px-2.5 py-1 rounded-full whitespace-nowrap glass-status ${statusColor}`}
          >
            {statusValue || "---"}
          </span>
          <ChevronRight className="w-5 h-5 text-gray-300" />
        </div>
      </div>
    </Link>
  );
}

function SkeletonCard() {
  return (
    <div className="glass-card rounded-2xl p-4 animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-3/4 mb-3" />
      <div className="h-3 bg-gray-100 rounded w-1/2 mb-2" />
      <div className="h-3 bg-gray-100 rounded w-2/3 mb-2" />
      <div className="flex gap-2 mt-3">
        <div className="h-5 bg-gray-100 rounded-full w-16" />
        <div className="h-5 bg-gray-100 rounded-full w-20" />
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="px-4 py-8 text-center text-gray-400">Chargement...</div>}>
      <HomePage />
    </Suspense>
  );
}

function HomePage() {
  const searchParams = useSearchParams();
  const collaborateurParam = searchParams.get("collaborateur");
  type Mode = "mesures" | "mesures-termine" | "cmd" | "cmd-termine" | "services" | "services-termine" | "sav" | "sav-termine";
  const [mode, setMode] = useState<Mode>("cmd");
  const [projectsData, setProjectsData] = useState<Record<string, Project[]>>({});
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [collabFilter, setCollabFilter] = useState<string | null>(collaborateurParam);
  const [quickFilter, setQuickFilter] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<{ name: string; role: string } | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "calendar" | "collab" | "week">("list");
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const MODE_API: Record<Mode, string> = {
    mesures: "/api/projects/mesures",
    "mesures-termine": "/api/projects/mesures-termine",
    cmd: "/api/projects",
    "cmd-termine": "/api/projects/cmd-termine",
    services: "/api/projects/services",
    "services-termine": "/api/projects/services-termine",
    sav: "/api/projects/sav",
    "sav-termine": "/api/projects/sav-termine",
  };

  // Cache-first: charger depuis localStorage instantanément, puis API en arrière-plan
  useEffect(() => {
    // 1. Charger le cache local immédiatement
    try {
      const cached = localStorage.getItem("tm-projects-cache");
      if (cached) {
        const parsed = JSON.parse(cached);
        setProjectsData(parsed);
        setLoading(false);
      }
    } catch {}

    // Charger l'utilisateur connecté
    fetch("/api/auth").then((r) => r.json()).then((d) => {
      if (d.user) setCurrentUser(d.user);
    }).catch(() => {});

    // 2. Fetch API en arrière-plan
    Promise.all([
      fetch("/api/projects").then((r) => r.json()),
      fetch("/api/projects/mesures").then((r) => r.json()),
    ]).then(([cmd, mesures]) => {
      const newData: Record<string, any> = {};
      if (Array.isArray(cmd)) newData.cmd = cmd;
      if (Array.isArray(mesures)) newData.mesures = mesures;
      setProjectsData((prev) => {
        const merged = { ...prev, ...newData };
        // Sauvegarder en cache pour le prochain chargement
        try { localStorage.setItem("tm-projects-cache", JSON.stringify(merged)); } catch {}
        return merged;
      });
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  // Charger les données d'un mode non-caché quand on switch
  useEffect(() => {
    if (projectsData[mode]) return;
    setLoading(true);
    fetch(MODE_API[mode])
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setProjectsData((prev) => {
            const merged = { ...prev, [mode]: data };
            try { localStorage.setItem("tm-projects-cache", JSON.stringify(merged)); } catch {}
            return merged;
          });
        } else {
          setError(data.error || "Erreur inconnue");
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [mode]);

  const projects = projectsData[mode] || [];
  const isTermineMode = mode.endsWith("-termine");
  const STATUS_COLORS = mode.startsWith("mesures") ? STATUS_MESURES_COLORS : STATUS_CMD_COLORS;

  const getStatusVal = (p: Project) => mode.startsWith("mesures") ? p.etatMesures : p.etatCMD;

  const statusCountsRaw = projects.reduce<Record<string, number>>((acc, p) => {
    const val = getStatusVal(p);
    if (val) acc[val] = (acc[val] || 0) + 1;
    return acc;
  }, {});

  // Ordonner les statuts selon l'ordre défini dans STATUS_COLORS
  const orderedStatuses = Object.keys(STATUS_COLORS).filter((s) => statusCountsRaw[s]);
  // Ajouter les statuts non prévus à la fin
  Object.keys(statusCountsRaw).forEach((s) => {
    if (!orderedStatuses.includes(s)) orderedStatuses.push(s);
  });
  const statusCounts = Object.fromEntries(orderedStatuses.map((s) => [s, statusCountsRaw[s]]));

  const COLLABORATEURS = [...COLLABORATEURS_LIST];

  const collabCounts = COLLABORATEURS.reduce<Record<string, number>>((acc, name) => {
    acc[name] = projects.filter((p) => p.collaborateurs.toLowerCase().includes(name.toLowerCase())).length;
    return acc;
  }, {});

  const rdvFixeCount = mode === "cmd" ? projects.filter((p) => p.etatCMD === "RDV - fixé").length : 0;
  const rdvAFixerCount = mode === "cmd" ? projects.filter((p) => p.etatCMD === "Cabine à aller chercher" || p.etatCMD === "Récéptionné - RDV à fixer").length : 0;

  const filtered = projects.filter((p) => {
    if (collabFilter && !p.collaborateurs.toLowerCase().includes(collabFilter.toLowerCase())) {
      return false;
    }
    const statusVal = getStatusVal(p);
    if (statusFilter && statusVal !== statusFilter) {
      return false;
    }
    if (quickFilter === "rdv-fixe" && p.etatCMD !== "RDV - fixé") {
      return false;
    }
    if (quickFilter === "rdv-a-fixer" && p.etatCMD !== "Cabine à aller chercher" && p.etatCMD !== "Récéptionné - RDV à fixer") {
      return false;
    }
    const q = search.toLowerCase();
    return (
      p.projet.toLowerCase().includes(q) ||
      p.ofrTM.toLowerCase().includes(q) ||
      p.nomChantier.toLowerCase().includes(q) ||
      p.fournisseurs.some((f) => f.toLowerCase().includes(q))
    );
  }).sort((a, b) => {
    const dateA = mode.startsWith("mesures") ? a.dateMesures : a.dateMontage;
    const dateB = mode.startsWith("mesures") ? b.dateMesures : b.dateMontage;
    if (dateA && dateB) return dateA.localeCompare(dateB);
    if (dateA && !dateB) return -1;
    if (!dateA && dateB) return 1;
    // Les deux sans date : trier par priorité de statut
    const orderA = STATUS_SORT_ORDER[a.etatCMD] ?? 5;
    const orderB = STATUS_SORT_ORDER[b.etatCMD] ?? 5;
    return orderA - orderB;
  });

  return (
    <div className="px-4 py-4 max-w-5xl mx-auto w-full">
      {/* Onglets navigation */}
      {(() => {
        const switchMode = (m: Mode) => { setMode(m); setStatusFilter(null); setQuickFilter(null); };
        const tabClass = (m: Mode) =>
          `flex-1 text-xs font-medium py-2 rounded-lg transition-all duration-200 ${
            mode === m
              ? "glass-tab-active text-[#1e3a5f]"
              : "text-gray-500 hover:text-gray-700 hover:bg-white/30"
          }`;
        const count = (m: string) => (projectsData[m]?.length ?? "…");
        return (
          <div className="mb-4 glass-tabs p-1.5 rounded-2xl max-w-md mx-auto sm:mx-0">
            <div className="flex gap-1">
              <button onClick={() => switchMode("mesures")} className={tabClass("mesures")}>
                Mesures ({count("mesures")})
              </button>
              <button onClick={() => switchMode("cmd")} className={tabClass("cmd")}>
                Montages ({count("cmd")})
              </button>
              <button onClick={() => switchMode("services")} className={tabClass("services")}>
                Services ({count("services")})
              </button>
              <button onClick={() => switchMode("sav")} className={tabClass("sav")}>
                SAV ({count("sav")})
              </button>
            </div>
          </div>
        );
      })()}

      {/* Boutons Calendrier / Collaborateurs */}
      {!loading && (mode === "cmd" || mode === "mesures") && viewMode === "list" && (
        <div className="flex gap-3 mb-4">
          <button
            onClick={() => setViewMode("calendar")}
            className="glass-card flex items-center gap-2 px-4 py-3 rounded-xl hover:bg-white/80 transition-all active:scale-95"
          >
            <span className="text-2xl font-bold text-[#1e3a5f]">{rdvFixeCount}</span>
            <CalendarDays className="w-5 h-5 text-blue-500" />
          </button>
          <button
            onClick={() => setViewMode("collab")}
            className="glass-card flex items-center gap-2 px-4 py-3 rounded-xl hover:bg-white/80 transition-all active:scale-95"
          >
            <span className="text-2xl font-bold text-[#1e3a5f]">{rdvFixeCount}</span>
            <UsersIcon className="w-5 h-5 text-purple-500" />
          </button>
          <button
            onClick={() => setViewMode("week")}
            className="glass-card flex items-center gap-2 px-4 py-3 rounded-xl hover:bg-white/80 transition-all active:scale-95"
          >
            <span className="text-xs font-semibold text-[#1e3a5f]">Semaine</span>
            <Calendar className="w-5 h-5 text-green-500" />
          </button>
        </div>
      )}

      {/* VUE SEMAINE */}
      {viewMode === "week" && (
        <div className="mb-4">
          <div className="flex items-center gap-3 mb-4">
            <button onClick={() => setViewMode("list")} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-semibold flex-1">Planning semaine</h2>
          </div>
          <WeekPlanning projects={projects} mode={mode} />
        </div>
      )}

      {/* VUE CALENDRIER */}
      {viewMode === "calendar" && (() => {
        const rdvProjects = projects.filter((p) => {
          const date = mode.startsWith("mesures") ? p.dateMesures : p.dateMontage;
          return date && (
            mode === "cmd" ? p.etatCMD === "RDV - fixé" : true
          );
        });
        const { year, month } = calendarMonth;
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const startDow = (firstDay.getDay() + 6) % 7; // Lundi = 0
        const daysInMonth = lastDay.getDate();
        const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

        const projectsByDay: Record<number, Project[]> = {};
        rdvProjects.forEach((p) => {
          const date = mode.startsWith("mesures") ? p.dateMesures : p.dateMontage;
          if (!date) return;
          const d = new Date(date);
          if (d.getFullYear() === year && d.getMonth() === month) {
            const day = d.getDate();
            if (!projectsByDay[day]) projectsByDay[day] = [];
            projectsByDay[day].push(p);
          }
        });

        const today = new Date();
        const isToday = (d: number) => today.getFullYear() === year && today.getMonth() === month && today.getDate() === d;

        return (
          <div className="mb-4">
            <div className="flex items-center gap-3 mb-4">
              <button onClick={() => setViewMode("list")} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h2 className="text-lg font-semibold flex-1">Calendrier RDV</h2>
            </div>
            <div className="glass-card rounded-2xl p-4">
              <div className="flex items-center justify-between mb-4">
                <button onClick={() => { setSelectedDay(null); setCalendarMonth((prev) => {
                  const m = prev.month - 1;
                  return m < 0 ? { year: prev.year - 1, month: 11 } : { ...prev, month: m };
                }); }} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="font-semibold">{monthNames[month]} {year}</span>
                <button onClick={() => { setSelectedDay(null); setCalendarMonth((prev) => {
                  const m = prev.month + 1;
                  return m > 11 ? { year: prev.year + 1, month: 0 } : { ...prev, month: m };
                }); }} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
                  <ChevronRightIcon className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-400 mb-1">
                {["Lu", "Ma", "Me", "Je", "Ve", "Sa", "Di"].map((d) => <div key={d}>{d}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: startDow }).map((_, i) => <div key={`e-${i}`} />)}
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                  const dayProjects = projectsByDay[day] || [];
                  const hasRdv = dayProjects.length > 0;
                  return (
                    <div
                      key={day}
                      onClick={() => hasRdv ? setSelectedDay(selectedDay === day ? null : day) : setSelectedDay(null)}
                      className={`relative aspect-square flex flex-col items-center justify-center rounded-lg text-sm transition-colors ${
                        selectedDay === day ? "ring-2 ring-[#1e3a5f] bg-blue-50 text-[#1e3a5f] font-bold" :
                        isToday(day) ? "bg-[#1e3a5f] text-white font-bold" :
                        hasRdv ? "bg-green-100 text-green-800 font-medium cursor-pointer hover:bg-green-200" :
                        "text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {day}
                      {hasRdv && (
                        <span className={`text-[9px] font-bold ${isToday(day) ? "text-white/80" : "text-green-600"}`}>
                          {dayProjects.length}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            {/* Liste des RDV */}
            <div className="mt-4 space-y-2">
              {(selectedDay ? [[String(selectedDay), projectsByDay[selectedDay] || []]] : Object.entries(projectsByDay).sort(([a], [b]) => +a - +b))
                .filter(([, projs]) => (projs as Project[]).length > 0)
                .map(([day, projs]) => (
                <div key={String(day)}>
                  <p className="text-xs font-semibold text-gray-500 mb-1.5 flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5" />
                    {parseInt(day as string)} {monthNames[month]} {year}
                    {selectedDay && (
                      <button onClick={() => setSelectedDay(null)} className="text-blue-500 hover:text-blue-700 ml-auto text-[10px]">
                        Voir tout le mois
                      </button>
                    )}
                  </p>
                  {(projs as Project[]).map((p) => (
                    <a key={p.id} href={`/projet/${p.id}?mode=${mode}`}
                      className="block glass-card rounded-xl p-3 mb-1.5">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{p.projet}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <p className="text-xs text-gray-500 truncate">{p.nomChantier}</p>
                            {p.collaborateurs && p.collaborateurs.split(" & ").map((n) => (
                              <span key={n} className="inline-flex items-center gap-1 text-[10px]" style={{ color: getCollaboratorColor(n.trim()).text }}>
                                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: getCollaboratorColor(n.trim()).dot }} />
                                {n.trim()}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          <Badge variant="outline" className="text-[10px]">{p.nbCabines || 0} cab.</Badge>
                          <ChevronRight className="w-4 h-4 text-gray-300" />
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* VUE COLLABORATEURS */}
      {viewMode === "collab" && (() => {
        const rdvProjects = projects.filter((p) => {
          const date = mode.startsWith("mesures") ? p.dateMesures : p.dateMontage;
          return date && (mode === "cmd" ? p.etatCMD === "RDV - fixé" : true);
        }).sort((a, b) => {
          const dA = mode.startsWith("mesures") ? a.dateMesures : a.dateMontage;
          const dB = mode.startsWith("mesures") ? b.dateMesures : b.dateMontage;
          return (dA || "").localeCompare(dB || "");
        });

        const collabMap: Record<string, Project[]> = {};
        rdvProjects.forEach((p) => {
          const collab = p.collaborateurs || "Non assigné";
          if (!collabMap[collab]) collabMap[collab] = [];
          collabMap[collab].push(p);
        });

        return (
          <div className="mb-4">
            <div className="flex items-center gap-3 mb-4">
              <button onClick={() => setViewMode("list")} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h2 className="text-lg font-semibold flex-1">RDV par collaborateur</h2>
            </div>
            <div className="space-y-4">
              {Object.entries(collabMap).sort(([, a], [, b]) => b.length - a.length).map(([collab, projs]) => {
                const names = collab.split(" & ");
                return (
                  <div key={collab} className="glass-card rounded-2xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      {names.map((n, i) => {
                        const c = getCollaboratorColor(n.trim());
                        return (
                          <span key={n} className="inline-flex items-center gap-1">
                            {i > 0 && <span className="text-gray-300 text-xs">&</span>}
                            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: c.dot }} />
                            <span className="text-sm font-semibold">{n.trim()}</span>
                          </span>
                        );
                      })}
                      <span className="ml-auto text-xs font-medium bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{projs.length} RDV</span>
                    </div>
                    <div className="space-y-1.5">
                      {projs.map((p) => {
                        const date = mode.startsWith("mesures") ? p.dateMesures : p.dateMontage;
                        return (
                          <a key={p.id} href={`/projet/${p.id}?mode=${mode}`}
                            className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-white/60 transition-colors">
                            <span className="text-xs font-mono text-gray-500 w-20 shrink-0">
                              {date ? new Date(date).toLocaleDateString("fr-CH", { day: "2-digit", month: "short" }) : "---"}
                            </span>
                            <span className="text-sm flex-1 truncate">{p.projet}</span>
                            <Badge variant="outline" className="text-[10px] shrink-0">{p.nbCabines || 0} cab.</Badge>
                          </a>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Dashboard monteur personnalisé */}
      {viewMode === "list" && currentUser && mode === "cmd" && projects.length > 0 && (
        <MonteurDashboard userName={currentUser.name} projects={projects} />
      )}

      {/* Favoris */}
      {viewMode === "list" && (() => {
        const favIds = typeof window !== "undefined" ? getFavorites() : [];
        const favProjects = projects.filter((p) => favIds.includes(p.id));
        if (favProjects.length === 0) return null;
        return (
          <div className="mb-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
              Favoris
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {favProjects.map((p) => (
                <Link
                  key={p.id}
                  href={`/projet/${p.id}?mode=${mode}`}
                  className="shrink-0 glass-card rounded-xl px-3 py-2 w-48"
                >
                  <p className="text-sm font-medium truncate">{p.projet}</p>
                  <p className="text-[10px] text-gray-500 truncate">{p.nomChantier}</p>
                </Link>
              ))}
            </div>
          </div>
        );
      })()}

      {/* VUE LISTE (standard) */}
      {viewMode === "list" && (
      <div className="relative mb-4 max-w-lg">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          placeholder="Rechercher un projet, OFR, chantier..."
          className="pl-9 h-11 rounded-xl glass-input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      )}

      {viewMode === "list" && error && (
        <div className="flex items-center gap-2 bg-red-50 text-red-700 px-4 py-3 rounded-xl mb-4">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {viewMode === "list" && loading ? (
        <div className="max-w-lg space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : viewMode === "list" ? (
        <div className="sm:flex sm:gap-6">
          {/* Filtres à gauche - desktop uniquement */}
          <div className="w-52 shrink-0 hidden sm:block">
            <div className="sticky top-[68px] space-y-4 glass-panel rounded-2xl p-3">
              {/* Statuts */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  {mode === "cmd" ? "Statut Montages" : "Statut Mesures"}
                </p>
                <div className="space-y-1">
                  <button
                    onClick={() => setStatusFilter(null)}
                    className={`w-full text-left text-xs font-medium px-3 py-2 rounded-lg transition-colors ${
                      !statusFilter
                        ? "bg-[#1e3a5f] text-white"
                        : "text-gray-600 hover:bg-gray-100 active:bg-gray-200"
                    }`}
                  >
                    Tous les statuts ({projects.length})
                  </button>
                  {Object.entries(statusCounts).map(([status, count]) => (
                    <button
                      key={status}
                      onClick={() => setStatusFilter(statusFilter === status ? null : status)}
                      className={`w-full text-left text-xs font-medium px-3 py-2 rounded-lg transition-colors ${
                        statusFilter === status
                          ? "bg-[#1e3a5f] text-white"
                          : `${STATUS_COLORS[status] || "bg-gray-100 text-gray-700"} hover:opacity-80`
                      }`}
                    >
                      {status} ({count})
                    </button>
                  ))}
                </div>
              </div>

              {/* Collaborateurs */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Collaborateurs</p>
                <div className="space-y-1">
                  <button
                    onClick={() => setCollabFilter(null)}
                    className={`w-full text-left text-xs font-medium px-3 py-2 rounded-lg transition-colors ${
                      !collabFilter
                        ? "bg-[#1e3a5f] text-white"
                        : "text-gray-600 hover:bg-gray-100 active:bg-gray-200"
                    }`}
                  >
                    Tous
                  </button>
                  {COLLABORATEURS.map((name) => {
                    const colors = getCollaboratorColor(name);
                    return (
                      <button
                        key={name}
                        onClick={() => setCollabFilter(collabFilter === name ? null : name)}
                        className="w-full text-left text-xs font-medium px-3 py-2 rounded-lg transition-colors flex items-center gap-2"
                        style={
                          collabFilter === name
                            ? { backgroundColor: "#1e3a5f", color: "white" }
                            : { backgroundColor: colors.bg, color: colors.text }
                        }
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: collabFilter === name ? "white" : colors.dot }}
                        />
                        {name} ({collabCounts[name] || 0})
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Filtres mobile (visible uniquement sur petit écran) */}
          <div className="sm:hidden w-full space-y-2 mb-3">
            {/* Statuts - scroll horizontal */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-4 px-4" style={{ WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
              <button
                onClick={() => setStatusFilter(null)}
                className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                  !statusFilter
                    ? "bg-[#1e3a5f] text-white border-[#1e3a5f]"
                    : "bg-white text-gray-600 border-gray-200"
                }`}
              >
                Tous ({projects.length})
              </button>
              {Object.entries(statusCounts).map(([status, count]) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(statusFilter === status ? null : status)}
                  className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors whitespace-nowrap ${
                    statusFilter === status
                      ? "bg-[#1e3a5f] text-white border-[#1e3a5f]"
                      : `${STATUS_COLORS[status] || "bg-gray-100 text-gray-700"} border-transparent`
                  }`}
                >
                  {status} ({count})
                </button>
              ))}
            </div>
            {/* Collaborateurs - scroll horizontal */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-4 px-4" style={{ WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
              <button
                onClick={() => setCollabFilter(null)}
                className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                  !collabFilter
                    ? "bg-[#1e3a5f] text-white border-[#1e3a5f]"
                    : "bg-white text-gray-600 border-gray-200"
                }`}
              >
                Tous
              </button>
              {COLLABORATEURS.map((name) => {
                const colors = getCollaboratorColor(name);
                return (
                  <button
                    key={name}
                    onClick={() => setCollabFilter(collabFilter === name ? null : name)}
                    className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-full transition-colors inline-flex items-center gap-1 whitespace-nowrap"
                    style={
                      collabFilter === name
                        ? { backgroundColor: "#1e3a5f", color: "white" }
                        : { backgroundColor: colors.bg, color: colors.text }
                    }
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: collabFilter === name ? "white" : colors.dot }}
                    />
                    {name} ({collabCounts[name] || 0})
                  </button>
                );
              })}
            </div>
          </div>

          {/* Liste des projets */}
          <div className="flex-1 min-w-0 w-full">
            <p className="text-sm text-gray-500 mb-3">
              {filtered.length} projet{filtered.length !== 1 ? "s" : ""}
              {" · "}
              {filtered.reduce((sum, p) => sum + (p.nbCabines || 0), 0)} cabine{filtered.reduce((sum, p) => sum + (p.nbCabines || 0), 0) !== 1 ? "s" : ""}
            </p>
            {mode === "cmd" && (
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => { setQuickFilter(quickFilter === "rdv-fixe" ? null : "rdv-fixe"); setStatusFilter(null); }}
                  className={`flex-1 text-sm font-medium py-2.5 rounded-xl border-2 transition-colors ${
                    quickFilter === "rdv-fixe"
                      ? "bg-green-600 text-white border-green-600"
                      : "bg-green-50 text-green-800 border-green-200 active:bg-green-100"
                  }`}
                >
                  RDV fixé ({rdvFixeCount})
                </button>
                <button
                  onClick={() => { setQuickFilter(quickFilter === "rdv-a-fixer" ? null : "rdv-a-fixer"); setStatusFilter(null); }}
                  className={`flex-1 text-sm font-medium py-2.5 rounded-xl border-2 transition-colors ${
                    quickFilter === "rdv-a-fixer"
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-blue-50 text-blue-800 border-blue-200 active:bg-blue-100"
                  }`}
                >
                  RDV à fixer ({rdvAFixerCount})
                </button>
              </div>
            )}
            <div className="space-y-3">
              {filtered.map((project) => (
                <ProjectCard key={project.id} project={project} mode={mode} />
              ))}
              {filtered.length === 0 && !error && (
                <div className="text-center py-12 text-gray-400">
                  <p className="text-lg">Aucun projet trouvé</p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
