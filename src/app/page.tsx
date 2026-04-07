"use client";

import { Suspense, useCallback, useEffect, useState, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Onboarding } from "@/components/onboarding";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Search, MapPin, Calendar, ChevronRight, AlertCircle, X, FileText, CalendarDays, Users as UsersIcon, ArrowLeft, ChevronLeft, ChevronRight as ChevronRightIcon, Star, Loader2, Building, Printer, ChevronDown, ChevronUp, LayoutGrid } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { Project } from "@/lib/notion";
import { getCollaboratorColor } from "@/lib/collaborators";
import { formatDateFR, formatDateLong, STATUS_CMD_COLORS, STATUS_MESURES_COLORS, STATUS_SORT_ORDER, STATUS_MESURES_SORT_ORDER, COLLABORATEURS_LIST } from "@/lib/constants";
import { getFavorites } from "@/lib/favorites";
import { fetchWithRetry } from "@/lib/api-helpers";
import { showRetryToast } from "@/components/error-toast";

const MonteurDashboard = dynamic(() => import("@/components/monteur-dashboard").then(m => ({ default: m.MonteurDashboard })), {
  ssr: false,
  loading: () => <div className="animate-pulse bg-gray-200 rounded-xl h-32" />,
});

const WeekPlanning = dynamic(() => import("@/components/week-planning").then(m => ({ default: m.WeekPlanning })), {
  ssr: false,
  loading: () => <div className="animate-pulse bg-gray-200 rounded-xl h-32" />,
});

const PersonalStats = dynamic(() => import("@/components/personal-stats").then(m => ({ default: m.PersonalStats })), {
  ssr: false,
  loading: () => <div className="animate-pulse bg-gray-200 rounded-xl h-32" />,
});

const KanbanBoard = dynamic(() => import("@/components/kanban-board").then(m => ({ default: m.KanbanBoard })), {
  ssr: false,
  loading: () => <div className="animate-pulse bg-gray-200 rounded-xl h-32" />,
});

const CRMClients = dynamic(() => import("@/components/crm-clients").then(m => ({ default: m.CRMClients })), {
  ssr: false,
  loading: () => <div className="animate-pulse bg-gray-200 rounded-xl h-32" />,
});

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
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate text-base">
            {project.projet || "Sans nom"}
          </h3>
          {project.ofrTM && (
            <p className="text-xs text-gray-500 mt-0.5">OFR {project.ofrTM}</p>
          )}
          {project.nomChantier && (
            <div className="flex items-center gap-1.5 mt-2 text-sm text-gray-600 dark:text-gray-400">
              <FileText className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{project.nomChantier}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 mt-1 text-sm text-gray-600 dark:text-gray-400">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">
              {project.adresseChantier || "---"}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-1 text-sm text-gray-600 dark:text-gray-400">
            <Calendar className="w-3.5 h-3.5 shrink-0" />
            <span>{formatDateFR(mode.startsWith("mesures") ? project.dateMesures : project.dateMontage)}</span>
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

function NavBar({ mode, projectsData, onSwitchMode }: { mode: string; projectsData: Record<string, any[]>; onSwitchMode: (m: any) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const count = (m: string) => (projectsData[m]?.length ?? "...");

  const servicesModes = ["mesures", "cmd", "services", "sav"];
  const servicesLabels: Record<string, string> = { mesures: "Mesures", cmd: "Montages", services: "Services", sav: "SAV" };
  const isServicesActive = servicesModes.includes(mode) || mode.endsWith("-termine");
  const servicesActiveLabel = servicesLabels[mode] || servicesLabels[mode.replace("-termine", "")] || "";

  const clientsModes = ["clients-contacts", "clients-entreprises", "clients-fournisseurs", "clients-grossistes"];
  const clientsLabels: Record<string, string> = { "clients-contacts": "Contacts", "clients-entreprises": "Entreprises", "clients-fournisseurs": "Fournisseurs", "clients-grossistes": "Grossistes" };
  const isClientsActive = clientsModes.includes(mode);
  const clientsActiveLabel = clientsLabels[mode] || "";

  const tabCls = (active: boolean) =>
    `shrink-0 text-xs font-medium py-2 px-3 rounded-lg transition-all duration-200 inline-flex items-center gap-1 ${
      active ? "glass-tab-active text-[#1e3a5f] dark:text-white" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-white/30"
    }`;

  const handleSelect = (m: string) => {
    setOpen(null);
    onSwitchMode(m);
  };

  return (
    <div className="mb-4 space-y-1.5">
      {/* Ligne principale */}
      <div className="glass-tabs p-1.5 rounded-2xl max-w-full sm:max-w-lg">
        <div className="flex gap-1">
          <button onClick={() => { handleSelect("dashboard"); setOpen(null); }} className={tabCls(mode === "dashboard")}>
            Dashboard
          </button>
          <button onClick={() => setOpen(open === "services" ? null : "services")} className={tabCls(isServicesActive || open === "services")}>
            Services
            <ChevronDown className={`w-3 h-3 transition-transform ${open === "services" ? "rotate-180" : ""}`} />
          </button>
          <button onClick={() => setOpen(open === "clients" ? null : "clients")} className={tabCls(isClientsActive || open === "clients")}>
            Clients
            <ChevronDown className={`w-3 h-3 transition-transform ${open === "clients" ? "rotate-180" : ""}`} />
          </button>
          <button onClick={() => { handleSelect("rapport"); setOpen(null); }} className={`shrink-0 text-xs font-medium py-2 px-3 rounded-lg transition-all duration-200 inline-flex items-center gap-1 ${
            mode === "rapport" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-white/30"
          }`}>
            Rapport
          </button>
        </div>
      </div>

      {/* Sous-menu Services - deuxième ligne */}
      {open === "services" && (
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide px-1">
          {servicesModes.map((m) => (
            <button key={m} onClick={() => handleSelect(m)}
              className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                mode === m || mode === `${m}-termine`
                  ? "bg-[#1e3a5f] text-white"
                  : "bg-white dark:bg-slate-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700"
              }`}>
              {servicesLabels[m]} ({count(m)})
            </button>
          ))}
        </div>
      )}

      {/* Sous-menu Clients - deuxième ligne */}
      {open === "clients" && (
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide px-1">
          {clientsModes.map((m) => (
            <button key={m} onClick={() => handleSelect(m)}
              className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                mode === m
                  ? "bg-[#1e3a5f] text-white"
                  : "bg-white dark:bg-slate-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700"
              }`}>
              {clientsLabels[m]}
            </button>
          ))}
        </div>
      )}
    </div>
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
  const router = useRouter();
  const collaborateurParam = searchParams.get("collaborateur");
  const modeParam = searchParams.get("mode");
  const statusParam = searchParams.get("status");
  const collabParam = searchParams.get("collab");
  const quickParam = searchParams.get("quick");
  const qParam = searchParams.get("q");
  type Mode = "dashboard" | "mesures" | "mesures-termine" | "cmd" | "cmd-termine" | "services" | "services-termine" | "sav" | "sav-termine" | "rapport" | "clients-contacts" | "clients-entreprises" | "clients-fournisseurs" | "clients-grossistes";
  const validModes: Mode[] = ["dashboard", "mesures", "mesures-termine", "cmd", "cmd-termine", "services", "services-termine", "sav", "sav-termine", "rapport", "clients-contacts", "clients-entreprises", "clients-fournisseurs", "clients-grossistes"];
  const initialMode: Mode = validModes.includes(modeParam as Mode) ? (modeParam as Mode) : "dashboard";
  const [mode, setMode] = useState<Mode>(initialMode);
  const [projectsData, setProjectsData] = useState<Record<string, Project[]>>({});
  const [search, setSearch] = useState(qParam || "");
  const [statusFilter, setStatusFilter] = useState<string | null>(statusParam);
  const [collabFilter, setCollabFilter] = useState<string | null>(collabParam || collaborateurParam);
  const [quickFilter, setQuickFilter] = useState<string | null>(quickParam);
  const isInitialMount = useRef(true);

  // Sync filters to URL search params
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    const params = new URLSearchParams();
    if (mode && mode !== "dashboard") params.set("mode", mode);
    if (statusFilter) params.set("status", statusFilter);
    if (collabFilter) params.set("collab", collabFilter);
    if (quickFilter) params.set("quick", quickFilter);
    if (search) params.set("q", search);
    const qs = params.toString();
    router.replace(qs ? `/?${qs}` : "/", { scroll: false });
  }, [mode, statusFilter, collabFilter, quickFilter, search, router]);

  const [currentUser, setCurrentUser] = useState<{ name: string; role: string } | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "calendar" | "collab" | "week" | "clients" | "kanban">("list");
  const [clientSearch, setClientSearch] = useState("");
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [selectedMonteurStats, setSelectedMonteurStats] = useState<string>("");
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [conflictFilter, setConflictFilter] = useState<string | null>(null);

  const MODE_API: Record<string, string> = {
    dashboard: "/api/projects",
    mesures: "/api/projects/mesures",
    "mesures-termine": "/api/projects/mesures-termine",
    cmd: "/api/projects",
    "cmd-termine": "/api/projects/cmd-termine",
    services: "/api/projects/services",
    "services-termine": "/api/projects/services-termine",
    sav: "/api/projects/sav",
    "sav-termine": "/api/projects/sav-termine",
    rapport: "/api/projects/cmd-termine",
  };

  const [rapportSearch, setRapportSearch] = useState("");

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

    // 2. Pré-charger TOUS les onglets en arrière-plan
    const allModes = Object.entries(MODE_API) as [string, string][];
    Promise.all(
      allModes.map(([key, url]) =>
        fetchWithRetry(url, undefined, 2, (msg, retry) => showRetryToast(msg, () => { retry().catch(() => {}); })).then((r) => r.json()).then((data) => ({ key, data })).catch(() => ({ key, data: null }))
      )
    ).then((results) => {
      const newData: Record<string, any> = {};
      results.forEach(({ key, data }) => {
        if (Array.isArray(data)) newData[key] = data;
      });
      setProjectsData((prev) => {
        const merged = { ...prev, ...newData };
        try { localStorage.setItem("tm-projects-cache", JSON.stringify(merged)); } catch {}
        return merged;
      });
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);



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

  const rdvFixeCount = mode === "cmd" ? projects.filter((p) => p.etatCMD === "RDV - fixé").length
    : projects.filter((p) => {
      const date = mode.startsWith("mesures") ? p.dateMesures : p.dateMontage;
      return !!date;
    }).length;
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
    if (mode.startsWith("mesures")) {
      // Mesures : trier par statut prioritaire
      const orderA = STATUS_MESURES_SORT_ORDER[a.etatMesures] ?? 99;
      const orderB = STATUS_MESURES_SORT_ORDER[b.etatMesures] ?? 99;
      if (orderA !== orderB) return orderA - orderB;
      // Même statut : trier par date
      const dateA = a.dateMesures || "";
      const dateB = b.dateMesures || "";
      return dateA.localeCompare(dateB);
    }
    const dateA = a.dateMontage;
    const dateB = b.dateMontage;
    if (dateA && dateB) return dateA.localeCompare(dateB);
    if (dateA && !dateB) return -1;
    if (!dateA && dateB) return 1;
    const orderA = STATUS_SORT_ORDER[a.etatCMD] ?? 5;
    const orderB = STATUS_SORT_ORDER[b.etatCMD] ?? 5;
    return orderA - orderB;
  });

  // --- Drag & Drop handler ---
  const handleDrop = useCallback(async (projectId: string, newDate: string) => {
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;
    const dateField = mode.startsWith("mesures") ? "dateMesures" : "dateMontage";
    const oldDate = mode.startsWith("mesures") ? project.dateMesures : project.dateMontage;
    if (oldDate === newDate) return;

    // Optimistic local update
    setProjectsData((prev) => {
      const updated = { ...prev };
      const list = (updated[mode] || []).map((p) => {
        if (p.id !== projectId) return p;
        return { ...p, [dateField]: newDate };
      });
      updated[mode] = list;
      try { localStorage.setItem("tm-projects-cache", JSON.stringify(updated)); } catch {}
      return updated;
    });

    const formattedDate = formatDateLong(newDate);
    setToast(`RDV d\u00e9plac\u00e9 au ${formattedDate}`);
    setTimeout(() => setToast(null), 3000);

    // PATCH API
    try {
      await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [dateField]: newDate }),
      });
    } catch {}

    // Log
    try {
      await fetch("/api/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          projectName: project.projet,
          action: "D\u00e9placement RDV (drag & drop)",
          details: `${formatDateFR(oldDate)} \u2192 ${formatDateFR(newDate)}`,
        }),
      });
    } catch {}

    // Notify admin
    try {
      await fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectName: project.projet,
          action: "D\u00e9placement RDV",
          details: `${formatDateFR(oldDate)} \u2192 ${formatDateFR(newDate)}`,
        }),
      });
    } catch {}
  }, [projects, mode, setProjectsData]);

  // --- Kanban status change handler ---
  const handleStatusChange = useCallback(async (projectId: string, newStatus: string) => {
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;
    const statusField = mode.startsWith("mesures") ? "etatMesures" : "etatCMD";
    const oldStatus = mode.startsWith("mesures") ? project.etatMesures : project.etatCMD;

    // 1. Optimistic local update
    setProjectsData((prev) => {
      const updated = { ...prev };
      const list = (updated[mode] || []).map((p) => {
        if (p.id !== projectId) return p;
        return { ...p, [statusField]: newStatus };
      });
      updated[mode] = list;
      try { localStorage.setItem("tm-projects-cache", JSON.stringify(updated)); } catch {}
      return updated;
    });

    // 5. Toast
    setToast(`Statut changé : ${newStatus}`);
    setTimeout(() => setToast(null), 3000);

    // 2. PATCH API
    try {
      await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [statusField]: newStatus }),
      });
    } catch {}

    // 3. Log
    try {
      await fetch("/api/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          projectName: project.projet,
          action: "Changement statut (Kanban)",
          details: `${oldStatus} → ${newStatus}`,
        }),
      });
    } catch {}

    // 4. Notify
    try {
      await fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectName: project.projet,
          action: "Changement statut (Kanban)",
          details: `${oldStatus} → ${newStatus}`,
        }),
      });
    } catch {}
  }, [projects, mode, setProjectsData]);

  // --- Scheduling conflict detection ---
  const conflicts: { type: "conflict" | "overload"; collaborateur: string; date: string; count: number; projectIds: string[] }[] = [];
  {
    // Track per-collaborator per-day: projectIds, cabines, and effective capacity
    const collabDateMap: Record<string, { projectIds: string[]; cabines: number; effectiveCabines: number }> = {};
    filtered.forEach((p) => {
      const date = mode.startsWith("mesures") ? p.dateMesures : p.dateMontage;
      if (!date) return;
      const collabField = mode === "mesures" ? p.mesuresTraiteePar : p.collaborateurs;
      const collabs = (collabField || "").split(" & ").map((n) => n.trim()).filter(Boolean);
      const isBinome = collabs.length >= 2;
      // En binôme, les cabines sont partagées entre les collaborateurs
      const cabinesPerPerson = isBinome ? (p.nbCabines || 0) / collabs.length : (p.nbCabines || 0);
      collabs.forEach((collab) => {
        const key = `${collab}::${date.split("T")[0]}`;
        if (!collabDateMap[key]) collabDateMap[key] = { projectIds: [], cabines: 0, effectiveCabines: 0 };
        collabDateMap[key].projectIds.push(p.id);
        collabDateMap[key].cabines += p.nbCabines || 0;
        collabDateMap[key].effectiveCabines += cabinesPerPerson;
      });
    });
    Object.entries(collabDateMap).forEach(([key, val]) => {
      const [collaborateur, date] = key.split("::");
      if (mode.startsWith("mesures")) {
        // Mesures : ~15min par mesure, ~32 mesures/jour max
        if (val.projectIds.length > 25) {
          conflicts.push({ type: "conflict", collaborateur, date, count: val.projectIds.length, projectIds: val.projectIds });
        } else if (val.projectIds.length > 20) {
          conflicts.push({ type: "overload", collaborateur, date, count: val.projectIds.length, projectIds: val.projectIds });
        }
      } else {
        // Montages : ~3.5 cabines/jour par personne
        // effectiveCabines tient compte des binômes (cabines / nb personnes)
        if (val.projectIds.length >= 3) {
          conflicts.push({ type: "conflict", collaborateur, date, count: val.projectIds.length, projectIds: val.projectIds });
        }
        if (val.effectiveCabines > 4) {
          conflicts.push({ type: "overload", collaborateur, date, count: Math.round(val.effectiveCabines), projectIds: val.projectIds });
        }
      }
    });
  }

  // Build a set of conflicting day strings for calendar highlighting
  const conflictDates = new Set(conflicts.map((c) => c.date));

  // Filtered list respecting conflict filter
  const displayedFiltered = conflictFilter
    ? filtered.filter((p) => {
        const c = conflicts.find((cf) => cf.collaborateur + "::" + cf.date === conflictFilter);
        return c ? c.projectIds.includes(p.id) : true;
      })
    : filtered;

  return (
    <div className="px-4 py-4 max-w-5xl mx-auto w-full">
      <Onboarding />
      {/* Toast notification */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-green-600 text-white px-5 py-3 rounded-xl shadow-lg text-sm font-medium animate-in fade-in slide-in-from-top-2 duration-300">
          {toast}
        </div>
      )}
      {/* Onglets navigation */}
      <NavBar mode={mode} projectsData={projectsData} onSwitchMode={(m: Mode) => { setMode(m); setStatusFilter(null); setQuickFilter(null); setViewMode("list"); }} />

      {/* VUE DASHBOARD */}
      {mode === "dashboard" && (
        <div>
          {/* Recherche globale */}
          <div className="relative mb-4 max-w-lg">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Rechercher dans tous les projets..."
              className="pl-9 h-11 rounded-xl glass-input"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                if (e.target.value.trim()) setMode("cmd");
              }}
            />
          </div>
          {currentUser && (projectsData["cmd"] || []).length > 0 && (
            <MonteurDashboard userName={currentUser.name} projects={projectsData["cmd"] || []} isAdmin={currentUser?.role === "admin"} />
          )}
          {currentUser && (projectsData["cmd"] || []).length > 0 && (
            <>
              {currentUser.role === "admin" && (
                <div className="mt-4">
                  <label className="text-sm font-medium text-gray-600 dark:text-gray-400 mr-2">
                    Stats monteur :
                  </label>
                  <select
                    value={selectedMonteurStats}
                    onChange={(e) => setSelectedMonteurStats(e.target.value)}
                    className="glass-card rounded-lg px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  >
                    <option value="">-- Choisir un monteur --</option>
                    {COLLABORATEURS_LIST.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                  {selectedMonteurStats && (
                    <PersonalStats userName={selectedMonteurStats} projects={[...(projectsData["cmd"] || []), ...(projectsData["cmd-termine"] || [])]} />
                  )}
                </div>
              )}
            </>
          )}
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          )}
        </div>
      )}

      {/* VUE RAPPORT */}
      {mode === "rapport" && (() => {
        // Gather completed projects from cmd-termine and all projects with rapportMonteur/heureArrivee
        const allCompleted: Project[] = [];
        const seenIds = new Set<string>();
        const sources = ["cmd-termine", "cmd", "services-termine", "services", "sav-termine", "sav"];
        sources.forEach((key) => {
          (projectsData[key] || []).forEach((p) => {
            if (!seenIds.has(p.id) && (p.rapportMonteur || p.heureArrivee)) {
              seenIds.add(p.id);
              allCompleted.push(p);
            }
          });
        });

        // Sort by date descending
        const sorted = allCompleted.sort((a, b) => {
          const dA = a.dateMontage || a.dateMesures || "";
          const dB = b.dateMontage || b.dateMesures || "";
          return dB.localeCompare(dA);
        });

        // Filter by search
        const q = rapportSearch.toLowerCase();
        const rapportFiltered = q
          ? sorted.filter((p) =>
              p.projet.toLowerCase().includes(q) ||
              p.ofrTM.toLowerCase().includes(q) ||
              p.collaborateurs.toLowerCase().includes(q) ||
              p.nomChantier.toLowerCase().includes(q)
            )
          : sorted;

        // Group by month
        const grouped: Record<string, Project[]> = {};
        rapportFiltered.forEach((p) => {
          const date = p.dateMontage || p.dateMesures || "";
          const monthKey = date ? date.substring(0, 7) : "Sans date";
          if (!grouped[monthKey]) grouped[monthKey] = [];
          grouped[monthKey].push(p);
        });

        const monthNames = ["Janvier", "Fevrier", "Mars", "Avril", "Mai", "Juin", "Juillet", "Aout", "Septembre", "Octobre", "Novembre", "Decembre"];
        const formatMonth = (key: string) => {
          if (key === "Sans date") return key;
          const [y, m] = key.split("-");
          return `${monthNames[parseInt(m, 10) - 1]} ${y}`;
        };

        return (
          <div>
            <div className="relative mb-4 max-w-lg">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Rechercher un rapport (projet, OFR, collaborateur...)"
                className="pl-9 h-11 rounded-xl glass-input"
                value={rapportSearch}
                onChange={(e) => setRapportSearch(e.target.value)}
              />
            </div>
            <p className="text-sm text-gray-500 mb-4">{rapportFiltered.length} rapport{rapportFiltered.length !== 1 ? "s" : ""} completes</p>
            {loading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            )}
            {Object.entries(grouped).sort(([a], [b]) => b.localeCompare(a)).map(([monthKey, projs]) => (
              <div key={monthKey} className="mb-6">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <CalendarDays className="w-4 h-4" />
                  {formatMonth(monthKey)} ({projs.length})
                </h3>
                <div className="space-y-3">
                  {projs.map((p) => {
                    const date = p.dateMontage || p.dateMesures;
                    const status = p.etatCMD || p.etatMesures || "";
                    const allStatusColors: Record<string, string> = { ...STATUS_CMD_COLORS, ...STATUS_MESURES_COLORS };
                    const isTermine = status.toLowerCase().includes("termin") || status.toLowerCase().includes("monté");
                    const statusColor = isTermine ? "bg-green-100 text-green-700" : allStatusColors[status] || "bg-gray-100 text-gray-700";
                    return (
                      <div key={p.id} className="glass-card rounded-2xl p-4 hover:bg-white/80 transition-all">
                        <div className="flex items-start justify-between gap-3">
                          <Link href={`/projet/${p.id}?mode=cmd`} className="flex-1 min-w-0">
                            <h4 className="font-semibold text-gray-900 dark:text-gray-100 truncate text-base">
                              {p.projet || "Sans nom"}
                            </h4>
                            {p.ofrTM && (
                              <p className="text-xs text-gray-500 mt-0.5">OFR {p.ofrTM}</p>
                            )}
                            <div className="flex items-center gap-1.5 mt-2 text-sm text-gray-600 dark:text-gray-400">
                              <Calendar className="w-3.5 h-3.5 shrink-0" />
                              <span>{date ? formatDateFR(date) : "---"}</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {(p.collaborateurs || "").split(" & ").filter(Boolean).map((name) => (
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
                          </Link>
                          <div className="flex flex-col items-end gap-2 shrink-0">
                            <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${isTermine || !status ? "bg-green-100 text-green-700" : statusColor}`}>
                              {status || "Terminé"}
                            </span>
                            <a
                              href={`/api/pdf/${p.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 active:scale-95 transition-all text-[11px] font-medium"
                            >
                              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M7 2C5.9 2 5 2.9 5 4v16c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V8l-6-6H7zm0 2h5v5h5v11H7V4zm2 8v2h6v-2H9zm0 4v2h4v-2H9z"/></svg>
                              PDF
                            </a>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            {rapportFiltered.length === 0 && !loading && (
              <div className="text-center py-12 text-gray-400">
                <FileText className="w-10 h-10 mx-auto mb-3 opacity-50" />
                <p className="text-lg">Aucun rapport trouve</p>
              </div>
            )}
          </div>
        );
      })()}

      {/* VUE CLIENTS - CRM Notion */}
      {mode.startsWith("clients-") && (
        <CRMClients mode={mode as "clients-contacts" | "clients-entreprises" | "clients-fournisseurs" | "clients-grossistes"} isAdmin={currentUser?.role === "admin"} />
      )}

      {/* Boutons Calendrier / Collaborateurs */}
      {!loading && mode !== "dashboard" && !mode.endsWith("-termine") && !mode.startsWith("clients-") && mode !== "rapport" && viewMode === "list" && (
        <div className="flex gap-3 mb-4">
          <button
            onClick={() => setViewMode("calendar")}
            className="glass-card flex items-center gap-2 px-4 py-3 rounded-xl hover:bg-white/80 transition-all active:scale-95"
          >
            <span className="text-2xl font-bold text-[#1e3a5f] dark:text-white">{rdvFixeCount}</span>
            <CalendarDays className="w-5 h-5 text-blue-500" />
          </button>
          <button
            onClick={() => setViewMode("collab")}
            className="glass-card flex items-center gap-2 px-4 py-3 rounded-xl hover:bg-white/80 transition-all active:scale-95"
          >
            <span className="text-2xl font-bold text-[#1e3a5f] dark:text-white">
              {new Set(
                projects
                  .filter((p) => mode === "cmd" ? p.etatCMD === "RDV - fixé" : !!(mode.startsWith("mesures") ? p.dateMesures : p.dateMontage))
                  .map((p) => mode.startsWith("mesures") ? p.mesuresTraiteePar : p.collaborateurs)
                  .filter(Boolean)
              ).size}
            </span>
            <UsersIcon className="w-5 h-5 text-purple-500" />
          </button>
          <button
            onClick={() => setViewMode("week")}
            className="glass-card flex items-center gap-2 px-4 py-3 rounded-xl hover:bg-white/80 transition-all active:scale-95"
          >
            <div className="text-left">
              <span className="text-xs font-semibold text-[#1e3a5f] dark:text-white">Semaine</span>
              <p className="text-[10px] text-gray-400">{new Date().toLocaleDateString("fr-CH", { day: "2-digit", month: "short" })}</p>
            </div>
            <Calendar className="w-5 h-5 text-green-500" />
          </button>
          <button
            onClick={() => setViewMode("clients")}
            className="glass-card flex items-center gap-2 px-4 py-3 rounded-xl hover:bg-white/80 transition-all active:scale-95"
          >
            <span className="text-xs font-semibold text-[#1e3a5f] dark:text-white">Clients</span>
            <Building className="w-5 h-5 text-amber-500" />
          </button>
          <button
            onClick={() => setViewMode("kanban")}
            className="glass-card flex items-center gap-2 px-4 py-3 rounded-xl hover:bg-white/80 transition-all active:scale-95"
          >
            <span className="text-xs font-semibold text-[#1e3a5f] dark:text-white">Kanban</span>
            <LayoutGrid className="w-5 h-5 text-indigo-500" />
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
          <WeekPlanning projects={projects} mode={mode} onDrop={handleDrop} />
        </div>
      )}

      {/* VUE KANBAN */}
      {viewMode === "kanban" && (
        <div className="mb-4">
          <div className="flex items-center gap-3 mb-4">
            <button onClick={() => setViewMode("list")} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-semibold flex-1">Kanban</h2>
          </div>
          <KanbanBoard projects={projects} mode={mode} onStatusChange={handleStatusChange} />
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
              <button
                onClick={() => {
                  const monthStr = `${calendarMonth.year}-${String(calendarMonth.month + 1).padStart(2, "0")}`;
                  window.open(`/api/planning-pdf?month=${monthStr}`, "_blank");
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#1e3a5f] text-white hover:bg-[#2a4f7f] transition-colors active:scale-95"
              >
                <Printer className="w-3.5 h-3.5" />
                Imprimer planning
              </button>
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
                  const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  const hasConflict = conflictDates.has(dateStr);
                  const isDropTarget = dragOverDate === dateStr;
                  return (
                    <div
                      key={day}
                      data-date={dateStr}
                      onClick={() => hasRdv ? setSelectedDay(selectedDay === day ? null : day) : setSelectedDay(null)}
                      onDragOver={(e) => { e.preventDefault(); setDragOverDate(dateStr); }}
                      onDragLeave={() => setDragOverDate(null)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOverDate(null);
                        const projectId = e.dataTransfer.getData("text/plain");
                        if (projectId) handleDrop(projectId, dateStr);
                      }}
                      className={`relative aspect-square flex flex-col items-center justify-center rounded-lg text-sm transition-colors ${
                        isDropTarget ? "ring-2 ring-blue-500 bg-blue-100" :
                        selectedDay === day ? "ring-2 ring-[#1e3a5f] bg-blue-50 text-[#1e3a5f] dark:text-white font-bold" :
                        isToday(day) ? "bg-[#1e3a5f] text-white font-bold" :
                        hasRdv ? "bg-green-100 text-green-800 font-medium cursor-pointer hover:bg-green-200" :
                        "text-gray-600 hover:bg-gray-50"
                      } ${hasConflict && !isToday(day) ? "ring-2 ring-red-400" : ""}`}
                    >
                      {day}
                      {hasRdv && (
                        <span className={`text-[9px] font-bold ${isToday(day) ? "text-white/80" : "text-green-600"}`}>
                          {dayProjects.length}
                        </span>
                      )}
                      {hasConflict && (
                        <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border border-white" />
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
                      draggable
                      data-project-id={p.id}
                      onDragStart={(e) => { e.dataTransfer.setData("text/plain", p.id); e.currentTarget.style.opacity = "0.5"; }}
                      onDragEnd={(e) => { e.currentTarget.style.opacity = "1"; }}
                      className="block glass-card rounded-xl p-3 mb-1.5 cursor-grab active:cursor-grabbing">
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
          const collab = mode.startsWith("mesures") ? p.mesuresTraiteePar : p.collaborateurs;
          if (!collab) return; // Exclure les non-assignés
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

      {/* VUE CLIENTS */}
      {viewMode === "clients" && (() => {
        // Gather ALL projects from all modes
        const allProjects: Project[] = [];
        const seenIds = new Set<string>();
        Object.values(projectsData).forEach((list) => {
          (list || []).forEach((p) => {
            if (!seenIds.has(p.id)) {
              seenIds.add(p.id);
              allProjects.push(p);
            }
          });
        });

        // Group by client name (nomChantier or first meaningful part of projet)
        const clientMap: Record<string, Project[]> = {};
        allProjects.forEach((p) => {
          const clientName = (p.nomChantier || p.projet.split(" - ")[0] || p.projet || "Sans nom").trim();
          if (!clientMap[clientName]) clientMap[clientName] = [];
          clientMap[clientName].push(p);
        });

        // Build client data sorted by most recent activity
        const clientEntries = Object.entries(clientMap).map(([name, projs]) => {
          const totalCabines = projs.reduce((sum, p) => sum + (p.nbCabines || 0), 0);
          const dates = projs.map((p) => p.dateMontage || p.dateMesures || "").filter(Boolean).sort();
          const mostRecent = dates.length > 0 ? dates[dates.length - 1] : "";
          return { name, projects: projs, totalCabines, mostRecent };
        }).sort((a, b) => (b.mostRecent || "").localeCompare(a.mostRecent || ""));

        const q = clientSearch.toLowerCase();
        const filteredClients = q
          ? clientEntries.filter((c) =>
              c.name.toLowerCase().includes(q) ||
              c.projects.some((p) => p.projet.toLowerCase().includes(q))
            )
          : clientEntries;

        const toggleClient = (name: string) => {
          setExpandedClients((prev) => {
            const next = new Set(prev);
            if (next.has(name)) next.delete(name);
            else next.add(name);
            return next;
          });
        };

        return (
          <div className="mb-4">
            <div className="flex items-center gap-3 mb-4">
              <button onClick={() => setViewMode("list")} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h2 className="text-lg font-semibold flex-1">Historique par client</h2>
              <span className="text-xs text-gray-500">{filteredClients.length} client{filteredClients.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="relative mb-4 max-w-lg">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Rechercher un client ou projet..."
                className="pl-9 h-11 rounded-xl glass-input"
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
              />
            </div>
            <div className="space-y-3">
              {filteredClients.map((client) => {
                const isExpanded = expandedClients.has(client.name);
                return (
                  <div key={client.name} className="glass-card rounded-2xl overflow-hidden">
                    <button
                      onClick={() => toggleClient(client.name)}
                      className="w-full text-left p-4 hover:bg-white/60 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Building className="w-4 h-4 text-amber-500 shrink-0" />
                            <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate">{client.name}</h3>
                          </div>
                          <div className="flex flex-wrap gap-2 mt-2">
                            <Badge variant="secondary" className="text-xs">
                              {client.projects.length} projet{client.projects.length !== 1 ? "s" : ""}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {client.totalCabines} cabine{client.totalCabines !== 1 ? "s" : ""}
                            </Badge>
                            {client.mostRecent && (
                              <span className="text-xs text-gray-500 flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {formatDateFR(client.mostRecent)}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0 mt-1">
                          {isExpanded ? (
                            <ChevronUp className="w-5 h-5 text-gray-400" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-gray-400" />
                          )}
                        </div>
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="border-t border-gray-100 px-4 pb-3 pt-2 space-y-1.5">
                        {client.projects
                          .sort((a, b) => ((b.dateMontage || b.dateMesures || "").localeCompare(a.dateMontage || a.dateMesures || "")))
                          .map((p) => {
                            const date = p.dateMontage || p.dateMesures;
                            const status = p.etatCMD || p.etatMesures || "";
                            const statusColors: Record<string, string> = { ...STATUS_CMD_COLORS, ...STATUS_MESURES_COLORS };
                            const statusColor = statusColors[status] || "bg-gray-100 text-gray-700";
                            const collabField = p.collaborateurs || p.mesuresTraiteePar || "";
                            return (
                              <Link
                                key={p.id}
                                href={`/projet/${p.id}?mode=${p.etatMesures ? "mesures" : "cmd"}`}
                                className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/60 transition-colors"
                              >
                                <span className="text-xs font-mono text-gray-500 w-20 shrink-0">
                                  {date ? new Date(date).toLocaleDateString("fr-CH", { day: "2-digit", month: "short" }) : "---"}
                                </span>
                                <span className="text-sm flex-1 truncate">{p.projet}</span>
                                {status && (
                                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${statusColor}`}>
                                    {status}
                                  </span>
                                )}
                                {collabField && collabField.split(" & ").filter(Boolean).map((n) => (
                                  <span
                                    key={n}
                                    className="inline-flex items-center gap-1 text-[10px]"
                                    style={{ color: getCollaboratorColor(n.trim()).text }}
                                  >
                                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: getCollaboratorColor(n.trim()).dot }} />
                                    {n.trim()}
                                  </span>
                                ))}
                                <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                              </Link>
                            );
                          })}
                      </div>
                    )}
                  </div>
                );
              })}
              {filteredClients.length === 0 && (
                <div className="text-center py-12 text-gray-400">
                  <p className="text-lg">Aucun client trouve</p>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {mode !== "dashboard" && mode !== "rapport" && !mode.startsWith("clients-") && (<>
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
            {/* Conflict / overload warnings */}
            {conflicts.length > 0 && (
              <div className="space-y-2 mb-4">
                {conflicts.map((c, i) => {
                  const key = c.collaborateur + "::" + c.date;
                  const isActive = conflictFilter === key;
                  const dateLabel = new Date(c.date).toLocaleDateString("fr-CH", { day: "2-digit", month: "long" });
                  return (
                    <button
                      key={i}
                      onClick={() => setConflictFilter(isActive ? null : key)}
                      className={`w-full text-left text-sm font-medium px-4 py-2.5 rounded-xl border-2 transition-colors ${
                        c.type === "conflict"
                          ? isActive ? "bg-red-600 text-white border-red-600" : "bg-red-50 text-red-800 border-red-200 hover:bg-red-100"
                          : isActive ? "bg-yellow-600 text-white border-yellow-600" : "bg-yellow-50 text-yellow-800 border-yellow-200 hover:bg-yellow-100"
                      }`}
                    >
                      {c.type === "conflict"
                        ? `\u26A0 Conflit : ${c.collaborateur} a ${c.count} projets le ${dateLabel}`
                        : `\u26A0 Surcharge : ${c.collaborateur} a ${c.count} cabines le ${dateLabel}`}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="space-y-3">
              {displayedFiltered.map((project) => (
                <ProjectCard key={project.id} project={project} mode={mode} />
              ))}
              {displayedFiltered.length === 0 && !error && (
                <div className="text-center py-12 text-gray-400">
                  <p className="text-lg">Aucun projet trouvé</p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
      </>)}
    </div>
  );
}
