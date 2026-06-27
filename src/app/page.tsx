"use client";

import { Suspense, useCallback, useEffect, useState, useRef, useDeferredValue, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Onboarding } from "@/components/onboarding";
import { PullToRefresh } from "@/components/pull-to-refresh";
import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { Search, MapPin, Calendar, ChevronRight, AlertCircle, X, FileText, CalendarDays, Users as UsersIcon, ArrowLeft, ChevronLeft, ChevronRight as ChevronRightIcon, Star, Loader2, Building, Printer, ChevronDown, ChevronUp, LayoutGrid, Plus, Trash2, ExternalLink, PanelRightOpen, Home, Ruler, Wrench, Settings, ShoppingBag, Package, Droplets, BarChart2, Archive, FolderOpen, ShieldCheck, Compass, Receipt, AlertTriangle, CheckCircle2, Clock, Truck } from "lucide-react";
import { FloatingWindow } from "@/components/floating-window";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { Project } from "@/lib/notion";
import { getCollaboratorColor } from "@/lib/collaborators";
import { computeMonteurCabStats } from "@/lib/monteur-stats";
import { useNotionColors } from "@/lib/notion-colors";
import { formatDateFR, formatDateLong, STATUS_CMD_COLORS, STATUS_MESURES_COLORS, STATUS_SORT_ORDER, STATUS_MESURES_SORT_ORDER, COLLABORATEURS_LIST, getISOWeek } from "@/lib/constants";
import { dateInRange, formatLocalDate } from "@/lib/time-utils";
import { getFavorites } from "@/lib/favorites";
import { fetchWithRetry, prefetchProject } from "@/lib/api-helpers";
import { showRetryToast } from "@/components/error-toast";
import { StatsDateFilter, filterByStatsDate, type StatsDateMode } from "@/components/stats-date-filter";
import { ChartTypeSelector, TimeSeriesChart, ColumnChart, MultiColumnChart, DonutChart, PieChart2, TreemapChart, RadarChart, StackedBarChart, StackedAreaChart, type ChartType } from "@/components/stat-charts";
import { prefetchTodaysProjects } from "@/lib/offline-prefetch";
import { getCache } from "@/lib/offline";

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

const DestockageView = dynamic(() => import("@/components/destockage-view").then(m => ({ default: m.DestockageView })), {
  ssr: false,
  loading: () => <div className="animate-pulse bg-gray-200 rounded-xl h-32" />,
});

const ArrivagePage = dynamic(() => import("@/components/arrivage-page"), {
  ssr: false,
  loading: () => <div className="animate-pulse bg-gray-200 rounded-xl h-32" />,
});

function ProjectCard({ project, mode, isAdmin, onDelete, compact, noPrefetch }: { project: Project; mode: string; isAdmin?: boolean; onDelete?: (id: string) => void; compact?: boolean; noPrefetch?: boolean }) {
  const statusColors = mode.startsWith("mesures") ? STATUS_MESURES_COLORS : STATUS_CMD_COLORS;
  const statusValue = mode.startsWith("mesures") ? project.etatMesures : project.etatCMD;
  const statusColor = statusColors[statusValue] || "bg-gray-100 text-gray-700";

  return (
    <div className="relative group">
      <Link
        href={`/projet/${project.id}?mode=${mode}`}
        prefetch={!noPrefetch}
        onMouseEnter={() => !noPrefetch && prefetchProject(project.id)}
        onTouchStart={() => !noPrefetch && prefetchProject(project.id)}
        onFocus={() => !noPrefetch && prefetchProject(project.id)}
        className="block glass-card rounded-2xl p-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 line-clamp-3 sm:line-clamp-2 break-words text-base leading-tight">
              {project.projet || "Sans nom"}
            </h3>
            {project.ofrTM && (
              <p className="text-xs text-gray-500 mt-0.5">OFR {project.ofrTM}</p>
            )}
            {!compact && project.nomChantier && (
              <div className="flex items-center gap-1.5 mt-2 text-sm text-gray-600 dark:text-gray-400">
                <FileText className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{project.nomChantier}</span>
              </div>
            )}
            {!compact && (
              <div className="flex items-center gap-1.5 mt-1 text-sm text-gray-600 dark:text-gray-400">
                <MapPin className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">
                  {project.adresseChantier || "---"}
                </span>
              </div>
            )}
            {!compact && (
              <div className="flex items-center gap-1.5 mt-1 text-sm text-gray-600 dark:text-gray-400">
                <Calendar className="w-3.5 h-3.5 shrink-0" />
                <span>{formatDateFR(mode.startsWith("mesures") ? project.dateMesures : project.dateMontage)}</span>
              </div>
            )}
            {!compact && (
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
            )}
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
      {/* Bouton "Ouvrir dans un nouvel onglet" — utile pour comparer
          deux projets côte à côte sans perdre la liste courante.
          Placé en bas à gauche pour ne pas entrer en conflit avec le
          bouton d'archivage admin (top right). */}
      <a
        href={`/projet/${project.id}?mode=${mode}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="absolute bottom-3 right-10 w-7 h-7 rounded-full bg-white/80 dark:bg-slate-700/80 text-gray-500 dark:text-gray-300 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-white dark:hover:bg-slate-600 hover:text-blue-600 dark:hover:text-cyan-300 transition-all z-10"
        title="Ouvrir dans un nouvel onglet"
      >
        <ExternalLink className="w-3.5 h-3.5" />
      </a>
      {isAdmin && onDelete && (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (confirm(`Archiver le projet "${project.projet}" ? Cette action est reversible depuis Notion.`)) {
              onDelete(project.id);
            }
          }}
          className="absolute top-3 right-3 w-7 h-7 rounded-full bg-red-50 dark:bg-red-900/30 text-red-500 dark:text-red-400 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-100 dark:hover:bg-red-900/50 transition-all z-10"
          title="Archiver le projet"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

function NavBar({ mode, projectsData, onSwitchMode, isAdmin, isCmm }: { mode: string; projectsData: Record<string, any[]>; onSwitchMode: (m: any) => void; isAdmin: boolean; isCmm?: boolean }) {
  const [open, setOpen] = useState<string | null>(
    mode.startsWith("grossistes") ? "grossistes" :
    mode.startsWith("fournisseurs") ? "fournisseurs-menu" :
    mode.startsWith("services") || mode === "mesures" || mode === "cmd" || mode === "sav" ? "services" :
    mode.startsWith("clients") ? "clients" :
    null
  );
  const count = (m: string) => (projectsData[m]?.length ?? "...");

  const servicesModes = ["mesures", "cmd", "services", "sav"];
  const servicesLabels: Record<string, string> = { mesures: "Mesures", cmd: "Montages", services: "Services", sav: "SAV" };
  const isServicesActive = servicesModes.includes(mode) || mode.endsWith("-termine");
  const servicesActiveLabel = servicesLabels[mode] || servicesLabels[mode.replace("-termine", "")] || "";

  const clientsModes = ["clients-contacts", "clients-entreprises", "clients-fournisseurs", "clients-grossistes"];
  const clientsLabels: Record<string, string> = { "clients-contacts": "Contacts", "clients-entreprises": "Entreprises", "clients-fournisseurs": "Fournisseurs", "clients-grossistes": "Grossistes" };
  const isClientsActive = clientsModes.includes(mode);
  const clientsActiveLabel = clientsLabels[mode] || "";

  const grossistesModes = ["grossistes", "grossistes-bms", "grossistes-dubat", "grossistes-tema", "grossistes-matway", "grossistes-bringhen"];
  const grossistesLabels: Record<string, string> = { grossistes: "Tous", "grossistes-bms": "BMS", "grossistes-dubat": "Dubat", "grossistes-tema": "Tema Sàrl", "grossistes-matway": "MatWay", "grossistes-bringhen": "Bringhen" };
  const grossistesLogos: Record<string, string> = {
    "grossistes-bms": "/logos/fournisseurs/BMS-Logo.png",
    "grossistes-dubat": "/logos/fournisseurs/Dubat-Logo.png",
    "grossistes-tema": "/logos/fournisseurs/Tema-Logo.png",
    "grossistes-matway": "/logos/fournisseurs/Matway-Logo.png",
    "grossistes-bringhen": "/logos/fournisseurs/Bringhen-logo.png",
  };
  const isGrossisteActive = grossistesModes.includes(mode);
  const grossisteActiveLabel = grossistesLabels[mode] || "";

  const fournisseursModes = ["fournisseurs", "fournisseurs-duka", "fournisseurs-duscholux", "fournisseurs-kermi", "fournisseurs-koralle", "fournisseurs-nelo", "fournisseurs-novellini", "fournisseurs-ronal", "fournisseurs-samo", "fournisseurs-vismaravetro"];
  const fournisseursLabels: Record<string, string> = { fournisseurs: "Tous", "fournisseurs-duka": "Duka.ch", "fournisseurs-duscholux": "Duscholux", "fournisseurs-kermi": "Kermi", "fournisseurs-koralle": "Koralle", "fournisseurs-nelo": "Nelo", "fournisseurs-novellini": "Novellini", "fournisseurs-ronal": "Ronal", "fournisseurs-samo": "Samo", "fournisseurs-vismaravetro": "Vismaravetro" };
  const fournisseursLogos: Record<string, string> = {
    "fournisseurs-duka": "/logos/fournisseurs/Duka-logo.png",
    "fournisseurs-duscholux": "/logos/fournisseurs/Duscholux-logo.png",
    "fournisseurs-kermi": "/logos/fournisseurs/Kermi-logo.png",
    "fournisseurs-koralle": "/logos/fournisseurs/Koralle-logo.png",
    "fournisseurs-nelo": "/logos/fournisseurs/Nelo-logo.png",
    "fournisseurs-novellini": "/logos/fournisseurs/Novellini-logo.png",
    "fournisseurs-ronal": "/logos/fournisseurs/ronal-logo.png",
    "fournisseurs-samo": "/logos/fournisseurs/Samo-logo.png",
    "fournisseurs-vismaravetro": "/logos/fournisseurs/Vismaravetro-logo.png",
  };
  // Logos fournis en BLANC sur transparent → invisibles sur la pastille blanche.
  // On les inverse (→ noir) pour qu'ils s'affichent dans la barre de navigation.
  const WHITE_LOGOS = new Set([
    "grossistes-tema", "grossistes-matway",
    "fournisseurs-nelo", "fournisseurs-novellini",
  ]);
  const isFournisseursActive = fournisseursModes.includes(mode);
  const fournisseurActiveLabel = fournisseursLabels[mode] || "";

  const tabCls = (active: boolean) =>
    `shrink-0 text-xs font-medium py-2 px-3 rounded-lg transition-all duration-200 inline-flex items-center gap-1 ${
      active ? "glass-tab-active text-[#1e3a5f] dark:text-white" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-white/30"
    }`;

  const handleSelect = (m: string) => {
    // Garder le sous-menu ouvert pour grossistes et fournisseurs
    if (m.startsWith("grossistes")) {
      setOpen("grossistes");
    } else if (m.startsWith("fournisseurs")) {
      setOpen("fournisseurs-menu");
    } else {
      setOpen(null);
    }
    onSwitchMode(m);
  };

  return (
    <>
    {/* Sidebar CMM desktop — uniquement rendu quand isCmm est actif */}
    {isCmm && (
      <div className="hidden lg:flex flex-col h-full">
        <CmmSidebarContent mode={mode} projectsData={projectsData} onSwitchMode={handleSelect} isAdmin={isAdmin} />
      </div>
    )}
    {/* Sur mobile CleanMyMac : les onglets horizontaux sont entièrement masqués
        (remplacés par le CmmMobileDrawer rendu au niveau HomePage). */}
    <div className={`mb-4 space-y-1.5${isCmm ? " hidden" : ""}`}>
      {/* Ligne principale */}
      <div className="p-1.5 max-w-full overflow-x-auto scrollbar-hide touch-pan-x overscroll-x-contain">
        <div className="flex gap-1">
          <button onClick={() => { handleSelect("dashboard"); setOpen(null); }} className={tabCls(mode === "dashboard")}>
            Dashboard
          </button>
          <button onClick={() => setOpen(open === "services" ? null : "services")} className={tabCls(isServicesActive || open === "services")}>
            Services
            <ChevronDown className={`w-3 h-3 transition-transform ${open === "services" ? "rotate-180" : ""}`} />
          </button>
          <button onClick={() => setOpen(open === "clients" ? null : "clients")} className={tabCls(isClientsActive || open === "clients")}>
            CRM
            <ChevronDown className={`w-3 h-3 transition-transform ${open === "clients" ? "rotate-180" : ""}`} />
          </button>
          <button onClick={() => isCmm ? (onSwitchMode("grossistes"), setOpen(null)) : setOpen(open === "grossistes" ? null : "grossistes")} className={tabCls(isGrossisteActive || open === "grossistes")}>
            {isGrossisteActive && grossisteActiveLabel && grossisteActiveLabel !== "Tous" ? `Grossistes · ${grossisteActiveLabel}` : "Grossistes"}
            {!isCmm && <ChevronDown className={`w-3 h-3 transition-transform ${open === "grossistes" ? "rotate-180" : ""}`} />}
          </button>
          <button onClick={() => isCmm ? (onSwitchMode("fournisseurs"), setOpen(null)) : setOpen(open === "fournisseurs-menu" ? null : "fournisseurs-menu")} className={tabCls(isFournisseursActive || open === "fournisseurs-menu")}>
            {isFournisseursActive && fournisseurActiveLabel && fournisseurActiveLabel !== "Tous" ? `Fournisseurs · ${fournisseurActiveLabel}` : "Fournisseurs"}
            {!isCmm && <ChevronDown className={`w-3 h-3 transition-transform ${open === "fournisseurs-menu" ? "rotate-180" : ""}`} />}
          </button>
          <button onClick={() => { handleSelect("sanitaires"); setOpen(null); }} className={tabCls(mode === "sanitaires")}>
            Sanitaires
          </button>
          <button onClick={() => { handleSelect("rapport"); setOpen(null); }} className={`shrink-0 text-xs font-medium py-2 px-3 rounded-lg transition-all duration-200 inline-flex items-center gap-1 ${
            mode === "rapport" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-white/30"
          }`}>
            Rapport
          </button>
          <button onClick={() => { handleSelect("destockage"); setOpen(null); }} className={tabCls(mode === "destockage")}>
            Déstockage
          </button>
          {isAdmin && (
            <button onClick={() => { handleSelect("stats"); setOpen(null); }} className={tabCls(mode === "stats")}>
              Stats
            </button>
          )}
        </div>
      </div>

      {/* Sous-menu Services - deuxième ligne */}
      {open === "services" && (
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide px-1 touch-pan-x overscroll-x-contain">
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
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide px-1 touch-pan-x overscroll-x-contain">
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

      {/* Sous-menu Grossistes */}
      {open === "grossistes" && !isCmm && (
        <div className="flex gap-2 overflow-x-auto scrollbar-hide px-1 items-center touch-pan-x overscroll-x-contain">
          {grossistesModes.map((m) => {
            const logo = grossistesLogos[m];
            const isActive = mode === m;
            const logoScale: Record<string, number> = {
              "grossistes-bms": 1,
              "grossistes-dubat": 1.6,
              "grossistes-tema": 1.5,
              "grossistes-matway": 2,
              "grossistes-bringhen": 3,
            };
            const scale = logoScale[m] || 1;
            // On utilise Next.js Image avec une taille intrinsèque
            // post-scale (largeur/hauteur réellement affichées) pour
            // que le pipeline d'optimisation génère un srcset Retina.
            // Le transform: scale() précédent rasterisait le logo à
            // 104×36 puis l'agrandissait — d'où l'aspect pixelisé sur
            // macOS Retina. Ici l'image est rendue à sa taille finale.
            const w = Math.round(104 * scale);
            const h = Math.round(36 * scale);
            return (
              <button key={m} onClick={() => handleSelect(m)}
                className={`shrink-0 rounded-xl transition-all w-[120px] h-[44px] flex items-center justify-center overflow-hidden ${
                  isActive
                    ? "bg-white ring-2 ring-[#1e3a5f] ring-offset-1 shadow-md"
                    : "bg-white dark:bg-slate-800 border border-gray-200 dark:border-gray-700 hover:shadow-md"
                }`}>
                {logo ? (
                  <Image
                    src={logo}
                    alt={grossistesLabels[m]}
                    width={w}
                    height={h}
                    quality={100}
                    unoptimized={logo.endsWith(".svg")}
                    className="object-contain"
                    style={{ width: `${w}px`, height: `${h}px`, ...(WHITE_LOGOS.has(m) ? { filter: "invert(1)" } : {}) }}
                  />
                ) : (
                  <span className={`text-xs font-semibold ${isActive ? "text-[#1e3a5f]" : "text-gray-600 dark:text-gray-300"}`}>
                    {grossistesLabels[m]}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Sous-menu Fournisseurs */}
      {open === "fournisseurs-menu" && !isCmm && (
        <div className="flex gap-2 overflow-x-auto scrollbar-hide px-1 items-center touch-pan-x overscroll-x-contain">
          {fournisseursModes.map((m) => {
            const logo = fournisseursLogos[m];
            const isActive = mode === m;
            const logoScale: Record<string, number> = {
              "fournisseurs-duka": 1.8,
              "fournisseurs-duscholux": 2,
              "fournisseurs-kermi": 1.6,
              "fournisseurs-koralle": 1.8,
              "fournisseurs-ronal": 2.2,
              "fournisseurs-nelo": 2,
              "fournisseurs-novellini": 1,
              "fournisseurs-samo": 1.8,
              "fournisseurs-vismaravetro": 1.6,
            };
            const scale = logoScale[m] || 1;
            const w = Math.round(104 * scale);
            const h = Math.round(36 * scale);
            return (
              <button key={m} onClick={() => handleSelect(m)}
                className={`shrink-0 rounded-xl transition-all w-[120px] h-[44px] flex items-center justify-center overflow-hidden ${
                  isActive
                    ? "bg-white ring-2 ring-[#1e3a5f] ring-offset-1 shadow-md"
                    : "bg-white dark:bg-slate-800 border border-gray-200 dark:border-gray-700 hover:shadow-md"
                }`}>
                {logo ? (
                  <Image
                    src={logo}
                    alt={fournisseursLabels[m]}
                    width={w}
                    height={h}
                    quality={100}
                    unoptimized={logo.endsWith(".svg")}
                    className="object-contain"
                    style={{ width: `${w}px`, height: `${h}px`, ...(WHITE_LOGOS.has(m) ? { filter: "invert(1)" } : {}) }}
                  />
                ) : (
                  <span className={`text-xs font-semibold ${isActive ? "text-[#1e3a5f]" : "text-gray-600 dark:text-gray-300"}`}>
                    {fournisseursLabels[m]}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
    </>
  );
}

/* ---- Sidebar de navigation pour le thème CleanMyMac (desktop ≥ lg) ---- */
function CmmSidebarContent({ mode, projectsData, onSwitchMode, isAdmin }: {
  mode: string;
  projectsData: Record<string, any[]>;
  onSwitchMode: (m: string) => void;
  isAdmin: boolean;
}) {
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const count = (m: string): number | null => {
    const v = projectsData[m];
    return Array.isArray(v) ? v.length : null;
  };
  const isActive = (m: string) => mode === m || mode === `${m}-termine` || ((m === "grossistes" || m === "fournisseurs") && mode.startsWith(`${m}-`)) || (m === "signalements" && mode.startsWith("signalements"));

  const activeSection =
    (mode === "projets-tous" || mode === "archives") ? "suivi" :
    (["mesures", "cmd", "arrivage", "services", "sav", "garanties", "rdv"].some(m => isActive(m))) ? "services" :
    mode.startsWith("clients-") ? "crm" :
    mode.startsWith("grossistes") ? "grossistes" :
    mode.startsWith("fournisseurs") ? "fournisseurs" :
    mode === "sanitaires" ? "sanitaires" :
    mode === "rapport" ? "rapport" :
    mode === "destockage" ? "destockage" :
    mode === "stats" ? "stats" :
    mode.startsWith("signalements") ? "signalements" : "dashboard";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const SideItem = ({ m, Icon, label, showCount = true }: { m: string; Icon: any; label: string; showCount?: boolean }) => {
    const active = isActive(m);
    const cnt = showCount ? count(m) : null;
    return (
      <button
        onClick={() => onSwitchMode(m)}
        className={`w-full text-left px-3 py-2 rounded-xl text-sm flex items-center gap-2.5 transition-all duration-150 ${
          active
            ? "bg-white/[0.13] text-white font-semibold"
            : "text-white/55 hover:text-white/85 hover:bg-white/[0.07]"
        }`}
        style={active ? { borderLeft: "3px solid rgba(210,190,255,0.80)", paddingLeft: "calc(0.75rem - 3px)" } : {}}
      >
        <Icon className={`w-4 h-4 shrink-0 ${active ? "text-violet-300" : ""}`} />
        <span className="flex-1 truncate">{label}</span>
        {cnt !== null && (
          <span className={`text-xs tabular-nums ${active ? "text-white/60" : "text-white/30"}`}>{cnt}</span>
        )}
      </button>
    );
  };

  const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    <div className="px-2.5 pt-5 pb-1 text-[10px] font-semibold uppercase tracking-widest text-white/25 select-none">
      {children}
    </div>
  );

  const grossistesModes = ["grossistes", "grossistes-bms", "grossistes-dubat", "grossistes-tema", "grossistes-matway", "grossistes-bringhen"];
  const grossistesLabels: Record<string, string> = { grossistes: "Tous", "grossistes-bms": "BMS", "grossistes-dubat": "Dubat", "grossistes-tema": "Tema Sàrl", "grossistes-matway": "MatWay", "grossistes-bringhen": "Bringhen" };
  const fournisseursModes = ["fournisseurs", "fournisseurs-duka", "fournisseurs-duscholux", "fournisseurs-kermi", "fournisseurs-koralle", "fournisseurs-nelo", "fournisseurs-novellini", "fournisseurs-ronal", "fournisseurs-samo", "fournisseurs-vismaravetro"];
  const fournisseursLabels: Record<string, string> = { fournisseurs: "Tous", "fournisseurs-duka": "Duka.ch", "fournisseurs-duscholux": "Duscholux", "fournisseurs-kermi": "Kermi", "fournisseurs-koralle": "Koralle", "fournisseurs-nelo": "Nelo", "fournisseurs-novellini": "Novellini", "fournisseurs-ronal": "Ronal", "fournisseurs-samo": "Samo", "fournisseurs-vismaravetro": "Vismaravetro" };

  const SubItem = ({ m, label }: { m: string; label: string }) => {
    const active = mode === m;
    return (
      <button
        onClick={() => onSwitchMode(m)}
        className={`w-full text-left py-1.5 pl-8 pr-3 rounded-lg text-xs flex items-center gap-2 transition-all duration-150 ${
          active ? "text-white bg-white/10 font-medium" : "text-white/45 hover:text-white/75 hover:bg-white/[0.05]"
        }`}
      >
        <span className={`w-1 h-1 rounded-full shrink-0 ${active ? "bg-violet-300" : "bg-white/25"}`} />
        {label}
      </button>
    );
  };

  return (
    <nav
      data-cmm-active-section={activeSection}
      className="flex flex-col gap-0.5 py-2 px-1.5 overflow-y-auto h-full"
    >
      <SectionLabel>Suivi</SectionLabel>
      <SideItem m="projets-tous" Icon={FolderOpen} label="Projets en cours" showCount={false} />
      <SideItem m="archives" Icon={Archive} label="Archives" showCount={false} />

      <SectionLabel>Services</SectionLabel>
      <SideItem m="mesures" Icon={Ruler} label="Mesures" />
      <SideItem m="cmd" Icon={Wrench} label="Montages" />
      <SideItem m="arrivage" Icon={Truck} label="Arrivage" showCount={false} />
      <SideItem m="services" Icon={Settings} label="Services" />
      <SideItem m="sav" Icon={AlertCircle} label="SAV" />
      <SideItem m="garanties" Icon={ShieldCheck} label="Garanties" showCount={false} />
      <SideItem m="rdv" Icon={CalendarDays} label="RDV" showCount={false} />

      <SectionLabel>CRM</SectionLabel>
      <SideItem m="clients-contacts" Icon={UsersIcon} label="Contacts" showCount={false} />
      <SideItem m="clients-entreprises" Icon={Building} label="Entreprises" showCount={false} />

      <SectionLabel>Clients</SectionLabel>

      {/* Grossistes — navigation directe (thème CMM) */}
      <SideItem m="grossistes" Icon={ShoppingBag} label="Grossistes" showCount={false} />

      {/* Fournisseurs — navigation directe (thème CMM) */}
      <SideItem m="fournisseurs" Icon={Package} label="Fournisseurs" showCount={false} />
      <SideItem m="sanitaires" Icon={Droplets} label="Sanitaires" showCount={false} />

      <SectionLabel>Autres</SectionLabel>
      <SideItem m="signalements" Icon={AlertTriangle} label="Signalements" showCount={false} />
      <SideItem m="a-facturer" Icon={Receipt} label="À facturer" showCount={false} />
      <SideItem m="collaborateurs" Icon={UsersIcon} label="Collaborateurs" showCount={false} />
      <SideItem m="emplacement-cabines" Icon={MapPin} label="Emplacement cabines" showCount={false} />
      <SideItem m="calendrier" Icon={Calendar} label="Calendrier" showCount={false} />
      <SideItem m="rapport" Icon={FileText} label="Rapport" showCount={false} />
      <SideItem m="destockage" Icon={Archive} label="Déstockage" showCount={false} />
      {isAdmin && <SideItem m="stats" Icon={BarChart2} label="Stats" showCount={false} />}
    </nav>
  );
}

/* ---- Drawer mobile CleanMyMac (iOS) ---- */
/* Visible uniquement sur mobile (< lg). Activé par swipe depuis le bord   */
/* gauche ou tap sur l'onglet triangulaire. Contient CmmSidebarContent.    */
function CmmMobileDrawer({ mode, projectsData, onSwitchMode, isAdmin }: {
  mode: string;
  projectsData: Record<string, any[]>;
  onSwitchMode: (m: string) => void;
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const DRAWER_W = 252;

  // Détection swipe bord gauche → ouvrir, swipe gauche sur drawer → fermer
  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
    };
    const onEnd = (e: TouchEvent) => {
      if (touchStartX.current === null || touchStartY.current === null) return;
      const dx = e.changedTouches[0].clientX - touchStartX.current;
      const dy = Math.abs(e.changedTouches[0].clientY - (touchStartY.current ?? 0));
      // Ignorer les swipes principalement verticaux
      if (dy > Math.abs(dx) * 1.2) { touchStartX.current = null; touchStartY.current = null; return; }
      if (dx > 45 && (touchStartX.current ?? 999) < 40 && !open) setOpen(true);
      else if (dx < -45 && open) setOpen(false);
      touchStartX.current = null;
      touchStartY.current = null;
    };
    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchend", onEnd);
    };
  }, [open]);

  // Ferme le drawer et navigue
  const handleNav = (m: string) => { onSwitchMode(m); setOpen(false); };

  return (
    <>
      {/* ---- Onglet déclencheur (handle) ---- */}
      {/* Se déplace avec le drawer pour rester visible sur le bord */}
      <div
        className="fixed z-[45] lg:hidden transition-[left] duration-300"
        style={{
          left: open ? DRAWER_W : 0,
          top: "50%",
          transform: "translateY(-50%)",
          pointerEvents: "auto",
        }}
      >
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
          style={{
            background: "linear-gradient(135deg, rgba(90,40,180,0.85) 0%, rgba(30,10,64,0.90) 100%)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            border: "1px solid rgba(210,190,255,0.22)",
            borderLeft: "none",
            borderRadius: "0 10px 10px 0",
            padding: "16px 7px 16px 5px",
            display: "flex",
            alignItems: "center",
            cursor: "pointer",
            boxShadow: "3px 0 16px rgba(120,60,220,0.35)",
          }}
        >
          {/* Triangle SVG : pointe à droite quand fermé, à gauche quand ouvert */}
          <svg width="9" height="18" viewBox="0 0 9 18" fill="none">
            {open
              ? <path d="M9 0L0 9L9 18V0Z" fill="rgba(210,190,255,0.90)" />
              : <path d="M0 0L9 9L0 18V0Z" fill="rgba(210,190,255,0.90)" />
            }
          </svg>
        </button>
      </div>

      {/* ---- Backdrop semi-transparent ---- */}
      <div
        className="fixed inset-0 z-[43] lg:hidden transition-all duration-300"
        style={{
          background: open ? "rgba(4,1,14,0.60)" : "transparent",
          backdropFilter: open ? "blur(2px)" : "none",
          WebkitBackdropFilter: open ? "blur(2px)" : "none",
          pointerEvents: open ? "auto" : "none",
        }}
        onClick={() => setOpen(false)}
      />

      {/* ---- Drawer panel ---- */}
      <div
        className="fixed top-0 bottom-0 left-0 z-[44] lg:hidden"
        style={{
          width: DRAWER_W,
          transform: open ? "translateX(0)" : `translateX(-${DRAWER_W}px)`,
          transition: "transform 0.28s cubic-bezier(0.32, 0.72, 0, 1)",
          background: "rgba(7,2,20,0.97)",
          backdropFilter: "blur(40px) saturate(200%)",
          WebkitBackdropFilter: "blur(40px) saturate(200%)",
          borderRight: "1px solid rgba(255,255,255,0.07)",
          boxShadow: open ? "8px 0 40px rgba(0,0,0,0.65)" : "none",
          paddingTop: "var(--header-h, 56px)",
          overflowY: "auto",
          overflowX: "hidden",
          WebkitOverflowScrolling: "touch",
        } as React.CSSProperties}
      >
        <CmmSidebarContent
          mode={mode}
          projectsData={projectsData}
          onSwitchMode={handleNav}
          isAdmin={isAdmin}
        />
      </div>
    </>
  );
}

/* ====================================================================
   SignalementListView — liste pièces manquantes ou défauts depuis KV
   ==================================================================== */
function SignalementListView({ subMode }: { subMode: "pieces" | "defauts" }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setLoading(true);
    const url = subMode === "pieces" ? "/api/pieces" : "/api/defauts";
    fetch(url).then((r) => r.ok ? r.json() : []).then((data) => {
      setItems(Array.isArray(data) ? data.sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0)) : []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [subMode]);

  const q = search.toLowerCase();
  const filtered = items.filter((it) =>
    !q ||
    (it.projectName || "").toLowerCase().includes(q) ||
    (it.description || "").toLowerCase().includes(q) ||
    (it.reference || "").toLowerCase().includes(q) ||
    (it.cabineLabel || "").toLowerCase().includes(q)
  );

  const isPieces = subMode === "pieces";
  const isClosed = (it: any) => isPieces ? it.status === "recu" : it.status === "resolu";
  const open   = filtered.filter((it) => !isClosed(it));
  const closed = filtered.filter((it) => isClosed(it));

  const statusLabel = (it: any): { label: string; cls: string } => {
    if (isPieces) {
      if (it.status === "recu")     return { label: "Reçue",      cls: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" };
      if (it.status === "commande") return { label: "Commandée",  cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" };
      return { label: "Demandée", cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" };
    } else {
      if (it.status === "resolu")   return { label: "Résolu",    cls: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" };
      if (it.status === "en-cours") return { label: "En cours",  cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" };
      return { label: "Signalé", cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" };
    }
  };

  const Card = ({ it }: { it: any }) => {
    const st = statusLabel(it);
    const photos: string[] = it.photoUrls?.length ? it.photoUrls : (it.photoUrl ? [it.photoUrl] : []);
    const date = it.timestamp ? new Date(it.timestamp).toLocaleDateString("fr-CH", { day: "2-digit", month: "short", year: "numeric" }) : null;
    return (
      <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-4 space-y-2 hover:shadow-sm transition-shadow">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-[#1e3a5f] dark:text-blue-300 truncate">{it.projectName || "Projet inconnu"}</p>
            {it.cabineLabel && <p className="text-[11px] text-purple-600 dark:text-purple-400">{it.cabineLabel}</p>}
          </div>
          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 ${st.cls}`}>{st.label}</span>
        </div>
        {it.description && <p className="text-sm text-gray-700 dark:text-gray-300 leading-snug">{it.description}</p>}
        {it.reference && <p className="text-xs text-gray-400">Réf : {it.reference}</p>}
        {it.typesLabel && <p className="text-xs text-gray-500 dark:text-gray-400">{it.typesLabel}</p>}
        {photos.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {photos.map((url: string, i: number) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                <img src={url.replace("/upload/", "/upload/w_80,h_80,c_fill/")} alt="" className="w-12 h-12 object-cover rounded-lg border border-gray-200 dark:border-slate-600" loading="lazy" />
              </a>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 pt-0.5">
          {it.user && <span className="text-[11px] text-gray-400">{it.user}</span>}
          {date && <span className="text-[11px] text-gray-300 dark:text-gray-600">· {date}</span>}
        </div>
      </div>
    );
  };

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
    </div>
  );

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Barre de recherche */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          placeholder="Rechercher (projet, description…)"
          className="w-full pl-9 pr-4 h-11 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Ouverts */}
      {open.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-orange-500" />
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              En cours <span className="text-gray-400 font-normal">({open.length})</span>
            </h3>
          </div>
          <div className="space-y-3">
            {open.map((it: any) => <Card key={it.id} it={it} />)}
          </div>
        </section>
      )}

      {/* Clôturés */}
      {closed.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Clôturés <span className="text-gray-400 font-normal">({closed.length})</span>
            </h3>
          </div>
          <div className="space-y-3 opacity-70">
            {closed.map((it: any) => <Card key={it.id} it={it} />)}
          </div>
        </section>
      )}

      {filtered.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <AlertTriangle className="w-8 h-8 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Aucun signalement trouvé</p>
        </div>
      )}
    </div>
  );
}

/* ====================================================================
   CmmSectionLanding — page d'accueil style CleanMyMac pour un mode
   Grande icône à gauche avec parallaxe souris + boutons d'action à droite
   ==================================================================== */
function CmmSectionLanding({ icon: Icon, title, subtitle, actions, onAction }: {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  actions: { id: string; icon: React.ElementType; label: string; sublabel?: string; logoSrc?: string; logoH?: number; logoFilter?: string }[];
  onAction: (id: string) => void;
}) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Parallaxe souris — amplitude ±18px horizontal, ±12px vertical
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const el = containerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setOffset({
        x: ((e.clientX - (r.left + r.width  / 2)) / (r.width  / 2)) * 18,
        y: ((e.clientY - (r.top  + r.height / 2)) / (r.height / 2)) * 12,
      });
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  return (
    <div
      ref={containerRef}
      className="flex flex-col lg:flex-row items-center justify-center gap-4 sm:gap-8 lg:gap-20 pt-6 pb-8 sm:pt-8 lg:min-h-[62vh] px-3 sm:px-6 select-none"
    >
      {/* ---- Icône seule (gauche) — sans titre en dessous ---- */}
      <div className="flex items-center justify-center flex-shrink-0">
        <div
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px)`,
            transition: "transform 0.14s cubic-bezier(0.25,0.46,0.45,0.94)",
          }}
        >
          <div className="relative">
            {/* Halo extérieur */}
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: "radial-gradient(circle, rgba(124,58,237,0.55) 0%, transparent 70%)",
                transform: "scale(2.2)",
                filter: "blur(28px)",
                pointerEvents: "none",
              }}
            />
            {/* Cercle principal */}
            <div
              className="relative w-36 h-36 sm:w-44 sm:h-44 lg:w-52 lg:h-52 rounded-full flex items-center justify-center"
              style={{
                background: "linear-gradient(150deg, rgba(140,70,255,0.22) 0%, rgba(14,5,40,0.65) 100%)",
                border: "1px solid rgba(210,190,255,0.18)",
                boxShadow: "0 0 70px rgba(124,58,237,0.22), inset 0 1px 0 rgba(255,255,255,0.07)",
              }}
            >
              <Icon
                className="w-16 h-16 sm:w-20 sm:h-20 lg:w-[104px] lg:h-[104px]"
                style={{ color: "rgba(210,190,255,0.88)", strokeWidth: 1.2 }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ---- Titre + sous-titre + boutons (droite) ---- */}
      <div className={`flex flex-col w-full ${actions.length > 5 ? "sm:max-w-[420px]" : "sm:max-w-[320px]"}`}>
        {/* Titre en haut */}
        <h2
          className="text-2xl sm:text-3xl font-bold tracking-tight mb-1"
          style={{ color: "rgba(255,255,255,0.95)" }}
        >
          {title}
        </h2>
        {subtitle && (
          <p className="text-sm mb-4 sm:mb-8" style={{ color: "rgba(210,190,255,0.50)" }}>
            {subtitle}
          </p>
        )}
        {/* Boutons — 1 colonne mobile si ≤5 actions, grille 2×N si >5 */}
        <div className={actions.length > 5 ? "grid grid-cols-1 sm:grid-cols-2 gap-2" : "flex flex-col gap-2"}>
          {actions.map((action) => (
            <button
              key={action.id}
              onClick={() => onAction(action.id)}
              className={`w-full flex items-center rounded-xl text-left transition-all duration-150 active:scale-[0.97] ${action.logoSrc ? "justify-center py-4 px-6 gap-0" : "gap-3 px-4 py-3.5 sm:py-3"}`}
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget;
                el.style.background = "rgba(255,255,255,0.10)";
                el.style.borderColor = "rgba(210,190,255,0.25)";
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget;
                el.style.background = "rgba(255,255,255,0.06)";
                el.style.borderColor = "rgba(255,255,255,0.08)";
              }}
            >
              {action.logoSrc ? (
                /* Mode logo : image centrée grande, pas de texte */
                <img
                  src={action.logoSrc}
                  alt={action.label}
                  className="w-auto max-w-[280px] object-contain"
                  style={{ height: `${action.logoH ?? 32}px`, filter: action.logoFilter ?? "drop-shadow(0 0 4px rgba(255,255,255,0.08))" }}
                />
              ) : (
                <>
                  {/* Icône action */}
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: "rgba(124,58,237,0.25)" }}
                  >
                    <action.icon style={{ width: 15, height: 15, color: "rgba(210,190,255,0.85)" }} />
                  </div>
                  {/* Texte */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.90)" }}>
                      {action.label}
                    </div>
                    {action.sublabel && (
                      <div className="text-xs mt-0.5 truncate" style={{ color: "rgba(210,190,255,0.38)" }}>
                        {action.sublabel}
                      </div>
                    )}
                  </div>
                  {/* Chevron */}
                  <ChevronRight style={{ width: 14, height: 14, color: "rgba(210,190,255,0.30)", flexShrink: 0 }} />
                </>
              )}
            </button>
          ))}
        </div>
      </div>
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

function NewProjectModal({ open, onClose, onCreated, currentMode }: { open: boolean; onClose: () => void; onCreated: () => void; currentMode: string }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const emptyForm = {
    projet: "", ofrTM: "", cmdTM: "", cmdTMUsine: "", ofrGrossiste: "", cmdGrossiste: "",
    cmdFournisseurs: "", servMesuresFournisseurs: "", servCmdFournisseurs: "",
    nomChantier: "", adresseChantier: "", emplacementCabine: "", nbCabines: "",
    typeClient: "", contactsRDV: "", commentairesMesures: "", commentairesMontages: "",
    dateMontage: "", dateMesures: "", collaborateur: "", mesuresTraiteePar: "", status: "",
  };
  const [form, setForm] = useState(emptyForm);
  const set = (field: string, value: string) => setForm((prev) => ({ ...prev, [field]: value }));

  const isMesuresMode = currentMode.startsWith("mesures");
  const statusOptions = isMesuresMode ? STATUS_MESURES_COLORS : STATUS_CMD_COLORS;
  const inputCls = "h-9 rounded-lg text-sm border border-gray-200 dark:border-gray-700 dark:bg-gray-800 px-2.5 w-full";
  const labelCls = "text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-0.5 block uppercase tracking-wide";
  const sectionCls = "text-xs font-bold text-[#1e3a5f] dark:text-blue-300 uppercase tracking-wider pb-1 border-b border-gray-100 dark:border-gray-800 mb-2";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.projet.trim()) { setError("Le nom du projet est requis"); return; }
    setSaving(true);
    setError("");
    try {
      const body: any = { projet: form.projet.trim() };
      if (form.ofrTM) body.ofrTM = form.ofrTM;
      if (form.cmdTM) body.cmdTM = form.cmdTM;
      if (form.cmdTMUsine) body.cmdTMUsine = form.cmdTMUsine;
      if (form.ofrGrossiste) body.ofrGrossiste = form.ofrGrossiste;
      if (form.cmdGrossiste) body.cmdGrossiste = form.cmdGrossiste;
      if (form.cmdFournisseurs) body.cmdFournisseurs = form.cmdFournisseurs;
      if (form.servMesuresFournisseurs) body.servMesuresFournisseurs = form.servMesuresFournisseurs;
      if (form.servCmdFournisseurs) body.servCmdFournisseurs = form.servCmdFournisseurs;
      if (form.nomChantier) body.nomChantier = form.nomChantier;
      if (form.adresseChantier) body.adresseChantier = form.adresseChantier;
      if (form.nbCabines) body.nbCabines = Number(form.nbCabines);
      if (form.contactsRDV) body.contactsRDV = form.contactsRDV;
      if (form.commentairesMesures) body.commentairesMesures = form.commentairesMesures;
      if (form.commentairesMontages) body.commentairesMontages = form.commentairesMontages;
      if (form.dateMontage) body.dateMontage = form.dateMontage;
      if (form.dateMesures) body.dateMesures = form.dateMesures;
      if (form.collaborateur) body.collaborateurs = form.collaborateur;
      if (form.mesuresTraiteePar) body.mesuresTraiteePar = form.mesuresTraiteePar;
      if (form.status) {
        if (isMesuresMode) { body.etatMesures = form.status; body.etatCMD = "En attente de mesures"; }
        else { body.etatCMD = form.status; }
      }
      const res = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { const data = await res.json(); setError(data.error || "Erreur"); return; }
      // Notify admin if non-admin creates — on récupère le pageId
      // retourné par POST pour que la notif soit cliquable.
      let newProjectId: string | undefined;
      try { const created = await res.clone().json(); newProjectId = created?.pageId; } catch {}
      fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectName: form.projet, action: "Nouveau projet créé", details: `Par un collaborateur — ${form.nomChantier || form.projet}`, projectId: newProjectId })
      }).catch(() => {});
      setForm(emptyForm);
      onCreated();
      onClose();
    } catch { setError("Erreur réseau"); } finally { setSaving(false); }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800 sticky top-0 bg-white dark:bg-slate-900 z-10">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Nouveau projet</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-5">
          {error && (
            <div className="flex items-center gap-2 bg-red-50 text-red-700 px-3 py-2 rounded-lg text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />{error}
            </div>
          )}

          {/* === Informations projet === */}
          <div>
            <p className={sectionCls}>Informations projet</p>
            <div className="space-y-2">
              <div>
                <label className={labelCls}>Projet (nom) *</label>
                <input value={form.projet} onChange={(e) => set("projet", e.target.value)} placeholder="Nom du projet" className={inputCls} required />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div><label className={labelCls}>N° OFR TM</label><input value={form.ofrTM} onChange={(e) => set("ofrTM", e.target.value)} className={inputCls} /></div>
                <div><label className={labelCls}>N° CMD TM</label><input value={form.cmdTM} onChange={(e) => set("cmdTM", e.target.value)} className={inputCls} /></div>
                <div><label className={labelCls}>N° CMD TM - Usine</label><input value={form.cmdTMUsine} onChange={(e) => set("cmdTMUsine", e.target.value)} className={inputCls} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className={labelCls}>N° OFR Grossiste</label><input value={form.ofrGrossiste} onChange={(e) => set("ofrGrossiste", e.target.value)} className={inputCls} /></div>
                <div><label className={labelCls}>N° CMD Grossiste</label><input value={form.cmdGrossiste} onChange={(e) => set("cmdGrossiste", e.target.value)} className={inputCls} /></div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div><label className={labelCls}>N° CMD Fournisseurs</label><input value={form.cmdFournisseurs} onChange={(e) => set("cmdFournisseurs", e.target.value)} className={inputCls} /></div>
                <div><label className={labelCls}>N° Serv. Mesures Fourn.</label><input value={form.servMesuresFournisseurs} onChange={(e) => set("servMesuresFournisseurs", e.target.value)} className={inputCls} /></div>
                <div><label className={labelCls}>N° CMD Services</label><input value={form.servCmdFournisseurs} onChange={(e) => set("servCmdFournisseurs", e.target.value)} className={inputCls} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className={labelCls}>Nom chantier</label><input value={form.nomChantier} onChange={(e) => set("nomChantier", e.target.value)} className={inputCls} /></div>
                <div><label className={labelCls}>Adresse chantier</label><input value={form.adresseChantier} onChange={(e) => set("adresseChantier", e.target.value)} className={inputCls} /></div>
              </div>
            </div>
          </div>

          {/* === Informations client === */}
          <div>
            <p className={sectionCls}>Informations client</p>
            <div className="space-y-2">
              <div><label className={labelCls}>Contacts pour RDV</label><input value={form.contactsRDV} onChange={(e) => set("contactsRDV", e.target.value)} placeholder="Nom : +41 79 ..." className={inputCls} /></div>
            </div>
          </div>

          {/* === Informations dates === */}
          <div>
            <p className={sectionCls}>Informations dates</p>
            <div className="grid grid-cols-2 gap-2">
              <div><label className={labelCls}>Date de mesures</label><input type="date" value={form.dateMesures} onChange={(e) => set("dateMesures", e.target.value)} className={inputCls} /></div>
              <div><label className={labelCls}>Mesures traitée par</label>
                <select value={form.mesuresTraiteePar} onChange={(e) => set("mesuresTraiteePar", e.target.value)} className={inputCls}>
                  <option value="">-- Aucun --</option>
                  {COLLABORATEURS_LIST.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div><label className={labelCls}>Date de montage</label><input type="date" value={form.dateMontage} onChange={(e) => set("dateMontage", e.target.value)} className={inputCls} /></div>
              <div><label className={labelCls}>Collaborateurs montage</label>
                <select value={form.collaborateur} onChange={(e) => set("collaborateur", e.target.value)} className={inputCls}>
                  <option value="">-- Aucun --</option>
                  {COLLABORATEURS_LIST.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* === Informations cabines === */}
          <div>
            <p className={sectionCls}>Informations cabines</p>
            <div className="grid grid-cols-2 gap-2">
              <div><label className={labelCls}>Nb. Cabines</label><input type="number" min={0} value={form.nbCabines} onChange={(e) => set("nbCabines", e.target.value)} className={inputCls} /></div>
              <div><label className={labelCls}>Emplacement cabine</label><input value={form.emplacementCabine} onChange={(e) => set("emplacementCabine", e.target.value)} className={inputCls} /></div>
            </div>
          </div>

          {/* === Commentaires === */}
          <div>
            <p className={sectionCls}>Commentaires</p>
            <div className="space-y-2">
              <div><label className={labelCls}>Commentaires Mesures</label><textarea value={form.commentairesMesures} onChange={(e) => set("commentairesMesures", e.target.value)} rows={2} className={`${inputCls} py-1.5 resize-none`} /></div>
              <div><label className={labelCls}>Commentaires Montages</label><textarea value={form.commentairesMontages} onChange={(e) => set("commentairesMontages", e.target.value)} rows={2} className={`${inputCls} py-1.5 resize-none`} /></div>
            </div>
          </div>

          {/* === Statut === */}
          <div>
            <p className={sectionCls}>Statut</p>
            <select value={form.status} onChange={(e) => set("status", e.target.value)} className={inputCls}>
              <option value="">-- Par défaut --</option>
              {Object.keys(statusOptions).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="flex gap-3 pt-2 sticky bottom-0 bg-white dark:bg-slate-900 pb-2">
            <button type="button" onClick={onClose}
              className="flex-1 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-200 transition-colors">
              Annuler
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 h-10 rounded-xl bg-[#1e3a5f] text-white text-sm font-medium hover:bg-[#2a4f7f] transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Créer
            </button>
          </div>
        </form>
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

// Recherche multi-champs : retourne true si le projet correspond à la
// requête q (déjà en minuscules). Couvre tous les identifiants et
// informations pertinents pour retrouver un projet rapidement.
// Si `prebuilt` est fourni (chaîne pré-indexée en minuscules), une seule
// comparaison .includes() suffit → beaucoup plus rapide.
function matchesSearch(
  p: import("@/lib/notion").Project,
  q: string,
  prebuilt?: string,
): boolean {
  if (!q) return true;
  if (prebuilt !== undefined) return prebuilt.includes(q);
  const check = (v: string | null | undefined) => (v || "").toLowerCase().includes(q);
  return (
    check(p.projet) ||
    check(p.ofrTM) ||
    check(p.ofrGrossiste) ||
    check(p.nomChantier) ||
    check(p.adresseChantier) ||
    check(p.cmdTM) ||
    check(p.cmdTMUsine) ||
    check(p.cmdGrossiste) ||
    check(p.cmdFournisseurs) ||
    check(p.servCmdFournisseurs) ||
    check(p.servMesuresFournisseurs) ||
    check(p.bonLivraison) ||
    check(p.collaborateurs) ||
    check(p.contacts) ||
    check(p.emplacementCabine) ||
    (p.fournisseurs || []).some((f) => check(f)) ||
    (p.fournisseursNames || []).some((f) => check(f)) ||
    (p.grossistesNames || []).some((f) => check(f)) ||
    (p.sanitaireNames || []).some((f) => check(f)) ||
    (p.seriesCabines || []).some((f) => check(f))
  );
}

function HomePage() {
  useNotionColors(); // couleurs Notion : applique aux badges/menus de statut
  const searchParams = useSearchParams();
  const router = useRouter();
  const collaborateurParam = searchParams.get("collaborateur");
  const modeParam = searchParams.get("mode");
  // Fenêtre flottante : désactive tous les prefetch pour éviter de doubler les appels API
  const isFloatingWindow = searchParams.get("_fw") === "1";
  const statusParam = searchParams.get("status");
  const collabParam = searchParams.get("collab");
  const quickParam = searchParams.get("quick");
  const qParam = searchParams.get("q");
  type Mode = "dashboard" | "mesures" | "mesures-termine" | "cmd" | "cmd-termine" | "services" | "services-termine" | "sav" | "sav-termine" | "garanties" | "rapport" | "collaborateurs" | "emplacement-cabines" | "calendrier" | "clients-contacts" | "clients-entreprises" | "clients-fournisseurs" | "clients-grossistes" | "grossistes" | "grossistes-bms" | "grossistes-dubat" | "grossistes-tema" | "grossistes-matway" | "grossistes-bringhen" | "fournisseurs" | "fournisseurs-duka" | "fournisseurs-duscholux" | "fournisseurs-ronal" | "fournisseurs-nelo" | "fournisseurs-novellini" | "fournisseurs-samo" | "fournisseurs-kermi" | "fournisseurs-vismaravetro" | "fournisseurs-koralle" | "stats" | "archives" | "projets-tous" | "destockage" | "sanitaires" | "a-facturer" | "signalements" | "signalements-pieces" | "signalements-defauts" | "rdv" | "arrivage";
  const validModes: Mode[] = ["dashboard", "mesures", "mesures-termine", "cmd", "cmd-termine", "services", "services-termine", "sav", "sav-termine", "garanties", "rdv", "rapport", "collaborateurs", "emplacement-cabines", "calendrier", "clients-contacts", "clients-entreprises", "clients-fournisseurs", "clients-grossistes", "grossistes", "grossistes-bms", "grossistes-dubat", "grossistes-tema", "grossistes-matway", "grossistes-bringhen", "fournisseurs", "fournisseurs-duka", "fournisseurs-duscholux", "fournisseurs-ronal", "fournisseurs-nelo", "fournisseurs-novellini", "fournisseurs-samo", "fournisseurs-kermi", "fournisseurs-vismaravetro", "fournisseurs-koralle", "stats", "archives", "projets-tous", "destockage", "sanitaires", "a-facturer", "signalements", "signalements-pieces", "signalements-defauts", "arrivage"];
  const initialMode: Mode = validModes.includes(modeParam as Mode) ? (modeParam as Mode) : "dashboard";
  const [mode, setMode] = useState<Mode>(initialMode);
  const [projectsData, setProjectsData] = useState<Record<string, Project[]>>({});

  // Détecte si le thème CleanMyMac est actif (attribut data-ui sur <html>)
  // Réagit aux changements via MutationObserver (ex: basculement depuis UserMenu)
  const [isCmm, setIsCmm] = useState(false);
  useEffect(() => {
    const check = () => setIsCmm(document.documentElement.getAttribute("data-ui") === "cleanmymac");
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-ui"] });
    return () => obs.disconnect();
  }, []);
  const [search, setSearch] = useState(qParam || "");
  // useDeferredValue : l'input répond immédiatement, le filtrage (coûteux)
  // est décalé en tâche de priorité basse → recherche instantanée.
  const deferredSearch = useDeferredValue(search);

  // Index de recherche pré-calculé : un string unique par projet contenant
  // tous les champs recherchables (en minuscules). Recalculé uniquement quand
  // projectsData change, pas à chaque frappe.
  const searchIndex = useMemo(() => {
    const map = new Map<string, string>();
    for (const projects of Object.values(projectsData)) {
      for (const p of projects) {
        if (map.has(p.id)) continue;
        map.set(p.id, [
          p.projet, p.ofrTM, p.ofrGrossiste, p.nomChantier, p.adresseChantier,
          p.cmdTM, p.cmdTMUsine, p.cmdGrossiste, p.cmdFournisseurs,
          p.servCmdFournisseurs, p.servMesuresFournisseurs, p.bonLivraison,
          p.collaborateurs, p.contacts, p.emplacementCabine,
          ...(p.fournisseurs || []), ...(p.fournisseursNames || []),
          ...(p.grossistesNames || []), ...(p.sanitaireNames || []),
          ...(p.seriesCabines || []),
        ].join(" ").toLowerCase());
      }
    }
    return map;
  }, [projectsData]);

  // Expose les projets sur window.__TM_PROJECTS__ pour GlobalSearch (header)
  useEffect(() => {
    const seen = new Set<string>();
    const all: import("@/lib/notion").Project[] = [];
    for (const arr of Object.values(projectsData)) {
      for (const p of arr) {
        if (p?.id && !seen.has(p.id)) { seen.add(p.id); all.push(p); }
      }
    }
    (window as any).__TM_PROJECTS__ = all;
  }, [projectsData]);

  const [statusFilter, setStatusFilter] = useState<string | null>(statusParam);
  const [collabFilter, setCollabFilter] = useState<string | null>(collabParam || collaborateurParam);
  const [quickFilter, setQuickFilter] = useState<string | null>(quickParam);
  const [rapportSubFilter, setRapportSubFilter] = useState<"en-cours" | "en-attente" | "cloture" | null>(null);
  // CleanMyMac : contrôle l'affichage du hero par mode (null = liste normale)
  const [cmmHeroMode, setCmmHeroMode] = useState<string | null>(null);
  const [crmTagFilter, setCrmTagFilter] = useState<string | null>(null);
  const [subView, setSubView] = useState<"projets" | "stats">("projets");
  const [statsDateMode, setStatsDateMode] = useState<StatsDateMode>("all");
  const [statsDateFrom, setStatsDateFrom] = useState("");
  const [statsDateTo, setStatsDateTo] = useState("");

  // Bouton Accueil (header) → réinitialise vraiment la vue au dashboard.
  // `mode` étant un état figé à l'init, un simple changement d'URL ne le remet
  // pas à "dashboard" : on le force ici via l'événement "tm-go-home".
  useEffect(() => {
    const handler = () => {
      setMode("dashboard");
      setQuickFilter(null);
      setStatusFilter(null);
      setCollabFilter(null);
      setSearch("");
      setCmmHeroMode(null);
      setCrmTagFilter(null);
      setSubView("projets");
      try { window.scrollTo({ top: 0 }); } catch {}
    };
    window.addEventListener("tm-go-home", handler);
    return () => window.removeEventListener("tm-go-home", handler);
  }, []);
  const [statsMonth, setStatsMonth] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; });
  const [statsYear, setStatsYear] = useState(() => String(new Date().getFullYear()));
  // Mode comparaison VS — période B
  const [statsCompare, setStatsCompare] = useState(false);
  const [statsBMode, setStatsBMode] = useState<StatsDateMode>("month");
  const [statsBFrom, setStatsBFrom] = useState("");
  const [statsBTo, setStatsBTo] = useState("");
  const [statsBMonth, setStatsBMonth] = useState(() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; });
  const [statsBYear, setStatsBYear] = useState(() => String(new Date().getFullYear()));
  // Filtres dédiés à la vue "Projets" (admin) — distincts des filtres
  // Stats pour ne pas qu'ils s'écrasent quand on bascule entre les
  // sections.
  const [pAllYearFilter, setPAllYearFilter] = useState<string>("all");
  const [pAllMonthRangeStart, setPAllMonthRangeStart] = useState<string | null>(null);
  const [pAllMonthRangeEnd, setPAllMonthRangeEnd] = useState<string | null>(null);
  const [pAllStatusCMD, setPAllStatusCMD] = useState<string[]>([]);
  const [pAllStatusMesures, setPAllStatusMesures] = useState<string[]>([]);
  const [pAllSAV, setPAllSAV] = useState(false);
  const [pAllSoucis, setPAllSoucis] = useState(false);
  const [pAllShowFilters, setPAllShowFilters] = useState(false);
  const isInitialMount = useRef(true);

  // Sync filters to URL search params
  useEffect(() => {
    const setHeights = () => {
      const header = document.getElementById("main-header");
      if (header) document.documentElement.style.setProperty("--header-h", `${header.offsetHeight}px`);
      const navbar = document.getElementById("main-navbar");
      if (navbar) document.documentElement.style.setProperty("--navbar-h", `${navbar.offsetHeight}px`);
    };
    setHeights();
    window.addEventListener("resize", setHeights);
    return () => window.removeEventListener("resize", setHeights);
  }, []);

  // Sync filters to URL (without search — search uses debounce to avoid losing focus)
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
    const qs = params.toString();
    router.replace(qs ? `/?${qs}` : "/", { scroll: false });
  }, [mode, statusFilter, collabFilter, quickFilter, router]);

  const [currentUser, setCurrentUser] = useState<{ name: string; role: string } | null>(null);

  // Pré-cache les projets du jour pour l'accès hors ligne (silencieux, best-effort)
  useEffect(() => {
    if (!currentUser) return;
    const all: Project[] = [];
    const seen = new Set<string>();
    for (const arr of Object.values(projectsData)) {
      for (const p of arr) {
        if (p?.id && !seen.has(p.id)) { seen.add(p.id); all.push(p); }
      }
    }
    if (all.length > 0 && !isFloatingWindow) {
      prefetchTodaysProjects(all, currentUser.name).catch(() => {});
    }
  }, [projectsData, currentUser]);

  const [viewMode, setViewMode] = useState<"list" | "calendar" | "collab" | "week" | "kanban">("list");
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
  const [showNewProject, setShowNewProject] = useState(false);
  // Fenêtres flottantes : max 2, chacune avec id unique + mode initial + z-index
  const [floatingWindows, setFloatingWindows] = useState<{ id: number; mode: string; z: number }[]>([]);
  const topZ = useRef(9999);
  const bringToFront = useCallback((id: number) => {
    topZ.current += 1;
    setFloatingWindows((prev) => prev.map((w) => w.id === id ? { ...w, z: topZ.current } : w));
  }, []);
  const openFloatingWindow = useCallback(() => {
    if (floatingWindows.length >= 2) return;
    topZ.current += 1;
    const newMode = mode !== "dashboard" ? mode : "mesures";
    setFloatingWindows((prev) => [...prev, { id: Date.now(), mode: newMode, z: topZ.current }]);
  }, [floatingWindows.length, mode]);
  const closeFloatingWindow = useCallback((id: number) => {
    setFloatingWindows((prev) => prev.filter((w) => w.id !== id));
  }, []);
  const [statsExpandedSections, setStatsExpandedSections] = useState<Set<string>>(new Set(["kpis", "monthly", "compare"]));

  // Stats from dedicated Notion databases
  const [statsServices, setStatsServices] = useState<any[]>([]);
  // Stat isolée pour la section "Comparaison annuelle" (une ligne par année).
  const [compareMetric, setCompareMetric] = useState<string>("montages");
  const [statsClients, setStatsClients] = useState<any[]>([]);
  const [statsMarques, setStatsMarques] = useState<any[]>([]);
  const [statsSeries, setStatsSeries] = useState<any[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);
  const [consultationsData, setConsultationsData] = useState<{
    summary: { totalRapports: number; consulted: number; notConsulted: number; percentage: number; totalViews: number; totalPdfOpens: number };
    projects: { projectId: string; projet: string; typeClient: string; dateMontage: string | null; viewCount: number; pdfCount: number; total: number; firstView: string | null; lastView: string | null; consulted: boolean }[];
  } | null>(null);
  const [consultationsSearch, setConsultationsSearch] = useState("");
  const [consultationsFilter, setConsultationsFilter] = useState<"all" | "viewed" | "not-viewed">("all");
  const [showRapportConsultations, setShowRapportConsultations] = useState(true);

  // Préférences de type de graphique par section — persistées en localStorage
  const [chartTypePrefs, setChartTypePrefs] = useState<Record<string, ChartType>>(() => {
    try {
      const saved = typeof window !== "undefined" ? localStorage.getItem("tm-stat-chart-types") : null;
      if (saved) return JSON.parse(saved);
    } catch {}
    return {};
  });
  const setChartType = (section: string, type: ChartType) => {
    setChartTypePrefs((prev) => {
      const next = { ...prev, [section]: type };
      try { localStorage.setItem("tm-stat-chart-types", JSON.stringify(next)); } catch {}
      return next;
    });
  };
  const statsLoadedRef = useRef(false);
  const statsPrefetchedRef = useRef(false);
  const [cabineAttributions, setCabineAttributions] = useState<Record<string, string[]>>({});

  // Pré-chargement silencieux des stats au montage de la page.
  // Lance le fetch en arrière-plan (après 5 s pour ne pas concurrencer les
  // fetch principaux), uniquement si le cache localStorage est périmé.
  // Quand l'utilisateur clique "Stats", les données sont déjà disponibles.
  useEffect(() => {
    const LS_DATA = "tm-stats-data-v2";
    const LS_TS   = "tm-stats-ts-v2";
    const FRESH_MS = 60 * 60 * 1000; // 1 h

    const timer = setTimeout(() => {
      try {
        const ts = Number(localStorage.getItem(LS_TS) || "0");
        if (Date.now() - ts < FRESH_MS) return; // cache encore frais
      } catch { /* localStorage inaccessible */ }

      Promise.all([
        fetch("/api/stats/services").then((r) => r.json()).catch(() => []),
        fetch("/api/stats/clients").then((r) => r.json()).catch(() => []),
        fetch("/api/stats/marques").then((r) => r.json()).catch(() => []),
        fetch("/api/stats/series").then((r) => r.json()).catch(() => []),
        fetch("/api/cabine-attribution").then((r) => r.json()).catch(() => []),
        fetch("/api/stats/consultations").then((r) => r.ok ? r.json() : null).catch(() => null),
      ]).then((results) => {
        // Idem : ne pas figer un cache vide (cf. fetchFromAPI).
        const valid = Array.isArray(results[0]) && results[0].length > 0;
        if (!valid) return;
        try {
          localStorage.setItem(LS_DATA, JSON.stringify(results));
          localStorage.setItem(LS_TS, String(Date.now()));
        } catch { /* quota dépassé */ }
      });
    }, 5000);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (mode !== "stats" || statsLoadedRef.current) return;
    statsLoadedRef.current = true;

    const LS_DATA = "tm-stats-data-v2";
    const LS_TS   = "tm-stats-ts-v2";
    const FRESH_MS = 60 * 60 * 1000; // 1 h

    /** Injecte un tableau de résultats dans les états React. */
    const applyResults = ([svc, cli, mrq, ser, attrs, consults]: any[]) => {
      if (Array.isArray(svc)) setStatsServices(svc);
      if (Array.isArray(cli)) setStatsClients(cli);
      if (Array.isArray(mrq)) setStatsMarques(mrq);
      if (Array.isArray(ser)) setStatsSeries(ser);
      if (Array.isArray(attrs)) {
        const attrMap: Record<string, string[]> = {};
        attrs.forEach((a: { projectId: string; attribution: string[] }) => { attrMap[a.projectId] = a.attribution; });
        setCabineAttributions(attrMap);
      }
      if (consults && consults.summary) setConsultationsData(consults);
    };

    /** Récupère les données depuis les 6 API Notion et met à jour le cache. */
    const fetchFromAPI = (showSpinner: boolean) => {
      if (showSpinner) setStatsLoading(true);
      Promise.all([
        fetch("/api/stats/services").then((r) => r.json()).catch(() => []),
        fetch("/api/stats/clients").then((r) => r.json()).catch(() => []),
        fetch("/api/stats/marques").then((r) => r.json()).catch(() => []),
        fetch("/api/stats/series").then((r) => r.json()).catch(() => []),
        fetch("/api/cabine-attribution").then((r) => r.json()).catch(() => []),
        fetch("/api/stats/consultations").then((r) => r.ok ? r.json() : null).catch(() => null),
      ]).then((results) => {
        applyResults(results);
        setStatsLoading(false);
        // Ne PAS mettre en cache un résultat vide/échoué (services manquant) :
        // sinon le stale-while-revalidate (<1h) figerait des stats à 0 pendant
        // une heure, même après rétablissement du serveur.
        const valid = Array.isArray(results[0]) && results[0].length > 0;
        if (valid) {
          try {
            localStorage.setItem(LS_DATA, JSON.stringify(results));
            localStorage.setItem(LS_TS, String(Date.now()));
          } catch { /* quota dépassé — on continue sans cache */ }
        }
      });
    };

    // Stratégie stale-while-revalidate :
    // • Cache chaud (< 1 h) → affichage immédiat, pas d'appel réseau.
    // • Cache tiède (> 1 h) → affichage immédiat depuis cache + refresh silencieux.
    // • Pas de cache → spinner + fetch bloquant.
    try {
      const ts  = Number(localStorage.getItem(LS_TS) || "0");
      const raw = localStorage.getItem(LS_DATA);
      if (raw && ts > 0) {
        const parsed = JSON.parse(raw);
        // Cache valide uniquement si les données services sont présentes.
        const cacheValid = Array.isArray(parsed?.[0]) && parsed[0].length > 0;
        if (cacheValid) {
          applyResults(parsed);
          setStatsLoading(false);
          if (Date.now() - ts >= FRESH_MS) {
            // Cache périmé → rafraîchissement silencieux en arrière-plan.
            fetchFromAPI(false);
          }
          return; // Ne pas afficher le spinner si le cache est exploitable.
        }
      }
    } catch { /* localStorage inaccessible → fetch normal */ }

    fetchFromAPI(true);
  }, [mode]);

  const MODE_API: Record<string, string> = {
    dashboard: "/api/projects",
    mesures: "/api/projects/mesures",
    "mesures-termine": "/api/projects/mesures-termine",
    "mesures-sans-commande": "/api/projects/mesures-sans-commande",
    cmd: "/api/projects",
    "cmd-termine": "/api/projects/cmd-termine",
    services: "/api/projects/services",
    "services-termine": "/api/projects/services-termine",
    sav: "/api/projects/sav",
    "sav-termine": "/api/projects/sav-termine",
    rapport: "/api/projects/cmd-termine",
    "collaborateurs": "/api/projects/all-active",
    "emplacement-cabines": "/api/projects/all-active",
    "calendrier": "/api/projects/all-active",
    grossistes: "/api/projects/all-active",
    "grossistes-bms": "/api/projects/all-active",
    "grossistes-dubat": "/api/projects/all-active",
    "grossistes-tema": "/api/projects/all-active",
    "grossistes-matway": "/api/projects/all-active",
    "grossistes-bringhen": "/api/projects/all-active",
    fournisseurs: "/api/projects/all-active",
    "fournisseurs-duka": "/api/projects/all-active",
    "fournisseurs-duscholux": "/api/projects/all-active",
    "fournisseurs-ronal": "/api/projects/all-active",
    "fournisseurs-kermi": "/api/projects/all-active",
    "fournisseurs-koralle": "/api/projects/all-active",
    "fournisseurs-nelo": "/api/projects/all-active",
    "fournisseurs-novellini": "/api/projects/all-active",
    "fournisseurs-samo": "/api/projects/all-active",
    "fournisseurs-vismaravetro": "/api/projects/all-active",
    stats: "/api/projects/all-active",
    archives: "/api/projects/all",
    "projets-tous": "/api/projects/all",
    sanitaires: "/api/projects/all-active",
    "a-facturer": "/api/projects/all-active",
  };

  const [rapportSearch, setRapportSearch] = useState("");

  // Cache-first: afficher le cache instantanément, puis mettre à jour en arrière-plan
  useEffect(() => {
    // 1. Charger le cache local IMMÉDIATEMENT — affichage instantané
    let localCacheAge = Infinity;
    try {
      const cached = localStorage.getItem("tm-projects-cache");
      const cachedTs = localStorage.getItem("tm-projects-cache-ts");
      if (cached) {
        const parsed = JSON.parse(cached);
        // Vérifier que le cache contient des données réelles (pas des [] vides corrompus)
        const hasRealData = Object.values(parsed).some((v) => Array.isArray(v) && (v as any[]).length > 0);
        if (hasRealData) {
          setProjectsData(parsed);
          setLoading(false);
          localCacheAge = cachedTs ? (Date.now() - Number(cachedTs)) / (1000 * 60 * 60) : Infinity;
        }
      }
    } catch {}

    // 1b. Fallback : données du warm hors-ligne si le cache principal est vide/corrompu
    if (localCacheAge === Infinity) {
      try {
        const offlineCache = getCache(); // { "warm-projects": [...], ... }
        const warmData: Record<string, any> = {};
        const warmKeys: Record<string, string> = {
          "warm-projects": "dashboard",
          "warm-all-active": "grossistes",
          "warm-all": "projets-tous",
          "warm-mesures": "mesures",
          "warm-mesures-termine": "mesures-termine",
          "warm-mesures-sans-commande": "mesures-sans-commande",
          "warm-cmd-termine": "cmd-termine",
          "warm-services": "services",
          "warm-sav": "sav",
        };
        let found = false;
        for (const [cacheKey, modeKey] of Object.entries(warmKeys)) {
          const d = offlineCache[cacheKey];
          if (Array.isArray(d) && d.length > 0) { warmData[modeKey] = d; found = true; }
        }
        if (found) { setProjectsData(warmData); setLoading(false); }
      } catch {}
    }

    // Charger l'utilisateur connecté
    fetch("/api/auth").then((r) => r.json()).then((d) => {
      if (d.user) {
        setCurrentUser(d.user);
        fetch("/api/user-activity", { method: "POST" }).catch(() => {});
      }
    }).catch(() => {});

    // 2a. Si le cache local est absent ou vieux (> 6h), charger le snapshot
    //     nocturne en UNE seule requête → toutes les données d'un coup
    const loadSnapshot = localCacheAge > 6;
    if (loadSnapshot) {
      fetch("/api/projects/snapshot")
        .then((r) => r.json())
        .then((snap) => {
          if (snap.ok && snap.data && typeof snap.data === "object") {
            setProjectsData((prev) => {
              const merged = { ...prev, ...snap.data };
              try {
                localStorage.setItem("tm-projects-cache", JSON.stringify(merged));
                localStorage.setItem("tm-projects-cache-ts", String(Date.now()));
              } catch {}
              return merged;
            });
            setLoading(false);
          }
        })
        .catch(() => {});
    }

    // 2b. Mettre à jour chaque endpoint INDIVIDUELLEMENT dès qu'il arrive
    //     (données fraîches en parallèle, complète / remplace le snapshot)
    const allModes = Object.entries(MODE_API) as [string, string][];
    const uniqueUrls = [...new Set(allModes.map(([, url]) => url))];

    uniqueUrls.forEach((url) => {
      fetch(url).then((r) => r.json()).then((data) => {
        // Ne pas écraser le cache avec un tableau vide :
        // le SW retourne [] comme fallback quand il n'a pas de données hors-ligne.
        if (!Array.isArray(data) || data.length === 0) return;
        const modesForUrl = allModes.filter(([, u]) => u === url);
        setProjectsData((prev) => {
          const updated = { ...prev };
          modesForUrl.forEach(([key]) => { updated[key] = data; });
          try {
            localStorage.setItem("tm-projects-cache", JSON.stringify(updated));
            localStorage.setItem("tm-projects-cache-ts", String(Date.now()));
          } catch {}
          return updated;
        });
        setLoading(false);
      }).catch(() => {
        setLoading(false);
      });
    });
  }, []);

  // Si projets-tous est déjà chargé (ex. retour depuis cet onglet),
  // on l'utilise aussi comme source pour archives pour la cohérence.
  useEffect(() => {
    const all = projectsData["projets-tous"];
    if (!all || all.length === 0) return;
    if ((projectsData["archives"] || []).length === all.length) return;
    setProjectsData((prev) => {
      const updated = { ...prev, archives: all };
      try { localStorage.setItem("tm-projects-cache", JSON.stringify(updated)); } catch {}
      return updated;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectsData["projets-tous"]]);

  const refreshAllProjects = useCallback(() => {
    const allModes = Object.entries(MODE_API) as [string, string][];
    const uniqueUrls = [...new Set(allModes.map(([, url]) => url))];
    const urlDataMap: Record<string, any> = {};
    Promise.all(
      uniqueUrls.map((url) =>
        fetchWithRetry(url, undefined, 2, (msg, retry) => showRetryToast(msg, () => { retry().catch(() => {}); })).then((r) => r.json()).then((data) => { urlDataMap[url] = data; }).catch(() => {})
      )
    ).then(() => {
      const newData: Record<string, any> = {};
      allModes.forEach(([key, url]) => {
        const data = urlDataMap[url];
        // Ne pas écraser avec [] : le SW retourne [] hors ligne sans cache.
        if (Array.isArray(data) && (data.length > 0 || navigator.onLine)) newData[key] = data;
      });
      setProjectsData((prev) => {
        const merged = { ...prev, ...newData };
        try { localStorage.setItem("tm-projects-cache", JSON.stringify(merged)); } catch {}
        return merged;
      });
    });
  }, []);

  // Refetch automatique quand l'utilisateur revient sur l'app/onglet.
  // Effet "instant on app open" : à chaque retour de visibilité, on
  // déclenche un refetch en arrière-plan. Le cache local s'affiche
  // toujours immédiatement pendant ce temps. Throttle 20 s pour éviter
  // de spammer le serveur si l'utilisateur fait des aller-retour rapides.
  useEffect(() => {
    let lastRefresh = Date.now();
    const onVisible = () => {
      if (typeof document === "undefined" || document.hidden) return;
      const now = Date.now();
      if (now - lastRefresh < 20000) return;
      lastRefresh = now;
      refreshAllProjects();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [refreshAllProjects]);

  // ── Polling arrière-plan : toutes les 30 s, rafraîchit l'endpoint du
  // mode courant (uniquement si la page est visible). Silencieux — aucune
  // interruption UI. Garantit que les changements Notion apparaissent en
  // ≤ 10 s sans aucune action de l'utilisateur.
  useEffect(() => {
    const POLL_MS = 10_000; // 10 s
    const poll = () => {
      if (typeof document !== "undefined" && document.hidden) return; // page en arrière-plan : skip
      const url = MODE_API[mode];
      if (!url) return;
      fetch(url)
        .then((r) => r.json())
        .then((data) => {
          // Hors ligne : le SW retourne [] comme fallback → ignorer pour garder le cache local.
          if (!Array.isArray(data) || (data.length === 0 && !navigator.onLine)) return;
          setProjectsData((prev) => {
            // Met à jour toutes les clés qui pointent vers cette URL
            const updated = { ...prev };
            Object.entries(MODE_API).forEach(([key, u]) => {
              if (u === url) updated[key] = data;
            });
            try { localStorage.setItem("tm-projects-cache", JSON.stringify(updated)); } catch {}
            return updated;
          });
        })
        .catch(() => {}); // silencieux en cas d'erreur réseau
    };
    const timer = setInterval(poll, POLL_MS);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]); // relancé à chaque changement de mode

  const handleDeleteProject = useCallback(async (projectId: string) => {
    // Optimistic removal
    setProjectsData((prev) => {
      const updated: Record<string, Project[]> = {};
      Object.entries(prev).forEach(([key, list]) => {
        updated[key] = (list || []).filter((p) => p.id !== projectId);
      });
      try { localStorage.setItem("tm-projects-cache", JSON.stringify(updated)); } catch {}
      return updated;
    });

    try {
      const res = await fetch("/api/projects", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId: projectId }),
      });
      if (res.ok) {
        setToast("Projet archive avec succes");
        setTimeout(() => setToast(null), 3000);
      } else {
        // Revert on failure
        refreshAllProjects();
        setToast("Erreur lors de l'archivage");
        setTimeout(() => setToast(null), 3000);
      }
    } catch {
      refreshAllProjects();
      setToast("Erreur reseau");
      setTimeout(() => setToast(null), 3000);
    }
  }, [refreshAllProjects]);

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

  // Le responsable d'un projet de MESURES est dans "Mesures traitée par"
  // (mesuresTraiteePar), pas dans "collaborateurs". Sans ça, les compteurs et
  // le filtre par collaborateur affichaient 0 partout en mode mesures.
  const collabFieldOf = (p: Project) =>
    (mode.startsWith("mesures") ? p.mesuresTraiteePar : p.collaborateurs) || "";

  const collabCounts = COLLABORATEURS.reduce<Record<string, number>>((acc, name) => {
    acc[name] = projects.filter((p) => collabFieldOf(p).toLowerCase().includes(name.toLowerCase())).length;
    return acc;
  }, {});
  // Compteur "Team TM" — projets dont le champ responsable contient "team tm"
  const teamTMCount = projects.filter((p) => collabFieldOf(p).toLowerCase().includes("team tm")).length;

  const rdvFixeCount = mode === "cmd" ? projects.filter((p) => p.etatCMD === "RDV - fixé").length
    : projects.filter((p) => {
      const date = mode.startsWith("mesures") ? p.dateMesures : p.dateMontage;
      return !!date;
    }).length;
  const rdvAFixerCount = mode === "cmd" ? projects.filter((p) => p.etatCMD === "Cabine à aller chercher" || p.etatCMD === "Récéptionné - RDV à fixer").length : 0;

  const filtered = projects.filter((p) => {
    if (collabFilter === "Binôme") {
      if (!p.collaborateurs.includes(",")) return false;
    } else if (collabFilter && !collabFieldOf(p).toLowerCase().includes(collabFilter.toLowerCase())) {
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
    // ---- Filtres CMM Mesures ----
    if (quickFilter === "mesures-today" && p.dateMesures !== formatLocalDate(new Date())) return false;
    if (quickFilter === "mesures-rdv" && !p.dateMesures) return false;
    if (quickFilter === "mesures-rdv-a-fixer" && !!p.dateMesures) return false;
    if (quickFilter === "mesures-non-cmd" && !(p.etatMesures === "Terminé" && p.etatCMD === "Cabines mesurées")) return false;
    // ---- Filtres CMM Montages ----
    if (quickFilter === "cmd-today" && p.dateMontage !== formatLocalDate(new Date())) return false;
    if (quickFilter === "cmd-rdv-a-fixer" && p.etatCMD !== "Cabine à aller chercher" && p.etatCMD !== "Récéptionné - RDV à fixer") return false;
    if (quickFilter === "cmd-rdv-etablis" && !p.dateMontage) return false;
    // ---- Filtres CMM Services ----
    if (quickFilter === "services-today" && p.dateMontage !== formatLocalDate(new Date())) return false;
    if (quickFilter === "services-rdv-a-fixer" && p.etatCMD !== "Cabine à aller chercher" && p.etatCMD !== "Récéptionné - RDV à fixer") return false;
    if (quickFilter === "services-rdv-etablis" && !p.dateMontage) return false;
    // ---- Filtres CMM SAV ----
    if (quickFilter === "sav-today" && p.dateSAVRecu !== formatLocalDate(new Date())) return false;
    if (quickFilter === "sav-rdv-a-fixer" && !!p.dateSAVRecu) return false;
    if (quickFilter === "sav-rdv-etablis" && !p.dateSAVRecu) return false;
    if (quickFilter === "sav-cloture" && p.etatSAV !== "Terminé") return false;
    // ---- Filtres CMM Garanties ----
    if (quickFilter === "garanties-today" && p.dateMontage !== formatLocalDate(new Date())) return false;
    if (quickFilter === "garanties-rdv-a-fixer" && !!p.dateMontage) return false;
    if (quickFilter === "garanties-rdv-etablis" && !p.dateMontage) return false;
    if (quickFilter === "garanties-cloture" && p.etatCMD !== "Terminé") return false;
    return matchesSearch(p, deferredSearch.toLowerCase(), searchIndex.get(p.id));
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
          projectId: project.id,
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
          projectId: project.id,
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
    <div className="px-3 sm:px-4 py-3 sm:py-4 w-full">
      <PullToRefresh />
      <Onboarding />
      {/* Drawer mobile CleanMyMac — rendu en dehors du flux normal car position:fixed */}
      {isCmm && (
        <CmmMobileDrawer
          mode={mode}
          projectsData={projectsData}
          isAdmin={currentUser?.role === "admin" || false}
          onSwitchMode={(m: string) => {
            setMode(m as Mode); setStatusFilter(null); setQuickFilter(null); setCrmTagFilter(null); setViewMode("list"); setSubView("projets");
            const cmmHeroModes = ["mesures", "cmd", "services", "sav", "garanties", "rdv", "clients-contacts", "clients-entreprises", "projets-tous", "archives", "grossistes", "fournisseurs", "rapport", "collaborateurs", "emplacement-cabines", "calendrier", "signalements", "arrivage"];
            setCmmHeroMode(isCmm && cmmHeroModes.includes(m) ? m : null);
            if (m === "archives") {
              fetch("/api/projects/all").then((r) => r.json()).then((data) => {
                const all = Array.isArray(data) ? data : [];
                setProjectsData((prev) => {
                  const updated = { ...prev, archives: all };
                  try { localStorage.setItem("tm-projects-cache", JSON.stringify(updated)); } catch {}
                  return updated;
                });
              }).catch(() => {});
            }
          }}
        />
      )}
      {/* Toast notification */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-green-600 text-white px-5 py-3 rounded-xl shadow-lg text-sm font-medium animate-in fade-in slide-in-from-top-2 duration-300">
          {toast}
        </div>
      )}
      {/* Onglets navigation + Nouveau projet — fixé en haut.
          glass-navbar : fond translucide flouté pour que les libellés
          restent lisibles quand on scrolle la page derrière. */}
      <div id="main-navbar" className="sticky z-40 -mx-4 px-4 pb-2 pt-1 glass-navbar" style={{top: `var(--header-h, 60px)`}}>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <NavBar mode={mode} projectsData={projectsData} isAdmin={currentUser?.role === "admin"} isCmm={isCmm} onSwitchMode={(m: Mode) => {
            setMode(m); setStatusFilter(null); setQuickFilter(null); setCrmTagFilter(null); setViewMode("list"); setSubView("projets");
            // CMM : afficher le hero pour les modes qui en ont un
            const cmmHeroModes = ["mesures", "cmd", "services", "sav", "garanties", "rdv", "clients-contacts", "clients-entreprises", "projets-tous", "archives", "grossistes", "fournisseurs", "rapport", "collaborateurs", "emplacement-cabines", "calendrier", "signalements", "arrivage"];
            setCmmHeroMode(isCmm && cmmHeroModes.includes(m) ? m : null);
            if (m === "archives") {
              // Archives = tous les projets Notion (même source que l'onglet "Projets")
              fetch("/api/projects/all").then((r) => r.json()).then((data) => {
                const all = Array.isArray(data) ? data : [];
                setProjectsData((prev) => {
                  const updated = { ...prev, archives: all };
                  try { localStorage.setItem("tm-projects-cache", JSON.stringify(updated)); } catch {}
                  return updated;
                });
              }).catch(() => {});
            }
          }} />
        </div>
        <div className="flex items-center gap-1.5 shrink-0 mt-1.5">
          {/* Bouton fenêtre flottante — max 2 */}
          <button
            onClick={openFloatingWindow}
            disabled={floatingWindows.length >= 2}
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all shadow-md active:scale-95 relative ${
              floatingWindows.length > 0
                ? "bg-cyan-600 text-white hover:bg-cyan-700"
                : "bg-white/80 dark:bg-slate-700 text-gray-500 dark:text-gray-300 hover:bg-white dark:hover:bg-slate-600 border border-gray-200 dark:border-gray-600"
            } disabled:opacity-40 disabled:cursor-not-allowed`}
            title={
              floatingWindows.length === 0 ? "Ouvrir une fenêtre secondaire" :
              floatingWindows.length === 1 ? "Ouvrir une 2ème fenêtre" :
              "2 fenêtres ouvertes (maximum)"
            }
          >
            <PanelRightOpen className="w-4 h-4" />
            {floatingWindows.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-white text-cyan-700 text-[9px] font-bold flex items-center justify-center shadow">
                {floatingWindows.length}
              </span>
            )}
          </button>

          {currentUser?.role === "admin" && mode !== "dashboard" && mode !== "rapport" && mode !== "collaborateurs" && mode !== "emplacement-cabines" && mode !== "calendrier" && !mode.startsWith("grossistes") && !mode.startsWith("fournisseurs") && mode !== "stats" && mode !== "archives" && mode !== "projets-tous" && mode !== "destockage" && mode !== "sanitaires" && !mode.startsWith("clients-") && (
            <button
              onClick={() => setShowNewProject(true)}
              className="w-9 h-9 rounded-xl bg-[#1e3a5f] text-white flex items-center justify-center hover:bg-[#2a4f7f] active:scale-95 transition-all shadow-md"
              title="Nouveau projet"
            >
              <Plus className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
      </div>

      {/* Fenêtres flottantes — rendues via portal dans document.body */}
      {floatingWindows.map((w, idx) => (
        <FloatingWindow
          key={w.id}
          initialMode={w.mode}
          initialPos={{ x: 20 + idx * 40, y: 80 + idx * 30 }}
          zIndex={w.z}
          onClose={() => closeFloatingWindow(w.id)}
          onFocus={() => bringToFront(w.id)}
        />
      ))}

      {/* Modal nouveau projet */}
      <NewProjectModal
        open={showNewProject}
        onClose={() => setShowNewProject(false)}
        onCreated={refreshAllProjects}
        currentMode={mode}
      />

      {/* VUE DASHBOARD */}
      {mode === "dashboard" && (
        <div>
          {currentUser && (() => {
            const tagged = [
              ...(projectsData["cmd"] || []).map((p) => ({ ...p, _source: "montage" as const })),
              ...(projectsData["mesures"] || []).map((p) => ({ ...p, _source: "mesures" as const })),
              ...(projectsData["services"] || []).map((p) => ({ ...p, _source: "services" as const })),
              ...(projectsData["sav"] || []).map((p) => ({ ...p, _source: "sav" as const })),
            ].filter((p, i, arr) => arr.findIndex((x) => x.id === p.id) === i);
            return (
              <MonteurDashboard
                userName={currentUser.name}
                projects={tagged}
                isAdmin={currentUser?.role === "admin"}
                cmmMode={isCmm}
                onNavigate={(m) => {
                  setMode(m as Mode); setStatusFilter(null); setQuickFilter(null); setCrmTagFilter(null); setViewMode("list"); setSubView("projets");
                  const cmmHeroModes = ["mesures", "cmd", "services", "sav", "garanties", "clients-contacts", "clients-entreprises", "projets-tous", "archives", "grossistes", "fournisseurs"];
                  setCmmHeroMode(isCmm && cmmHeroModes.includes(m) ? m : null);
                }}
                terminatedProjectsInit={projectsData["cmd-termine"] || []}
              />
            );
          })()}
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

        // Filtrage par sous-catégorie CMM
        const rapportBase = rapportSubFilter
          ? sorted.filter((p) => {
              const isTermine = ["cmd-termine", "services-termine", "sav-termine"].some((k) =>
                (projectsData[k] || []).some((r: any) => r.id === p.id)
              );
              if (rapportSubFilter === "en-cours") return !isTermine;
              if (rapportSubFilter === "en-attente") return isTermine && !p.rapportMonteur;
              if (rapportSubFilter === "cloture") return isTermine && !!p.rapportMonteur;
              return true;
            })
          : sorted;

        // Filter by search
        const q = rapportSearch.toLowerCase();
        const rapportFiltered = q
          ? rapportBase.filter((p) =>
              p.projet.toLowerCase().includes(q) ||
              p.ofrTM.toLowerCase().includes(q) ||
              p.collaborateurs.toLowerCase().includes(q) ||
              p.nomChantier.toLowerCase().includes(q)
            )
          : rapportBase;

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
            {/* Chip sous-filtre CMM Rapport */}
            {rapportSubFilter && (
              <div className="mb-4 flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-100 text-purple-800 text-sm font-medium">
                  {rapportSubFilter === "en-cours" ? "Rapport en cours" : rapportSubFilter === "en-attente" ? "Rapport en attente" : "Rapport clôturé"}
                  <button onClick={() => setRapportSubFilter(null)} className="ml-1 hover:text-purple-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              </div>
            )}
            {/* Consultation des rapports — déplacé depuis Stats */}
            {consultationsData && (
              <div className="mb-5">
                <button
                  onClick={() => setShowRapportConsultations((v) => !v)}
                  className="flex items-center gap-2 text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 w-full text-left"
                >
                  {showRapportConsultations ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  Consultation des rapports
                  <span className="ml-auto text-xs font-bold text-emerald-600 normal-case tracking-normal">{consultationsData.summary.percentage}%</span>
                </button>
                {showRapportConsultations && (() => {
                  const s = consultationsData.summary;
                  const sortedProjects = consultationsData.projects.slice().sort((a, b) => {
                    const at = a.lastView ? new Date(a.lastView).getTime() : 0;
                    const bt = b.lastView ? new Date(b.lastView).getTime() : 0;
                    if (bt !== at) return bt - at;
                    return (b.dateMontage || "").localeCompare(a.dateMontage || "");
                  });
                  const q = consultationsSearch.trim().toLowerCase();
                  const filteredList = sortedProjects.filter((p) => {
                    if (consultationsFilter === "viewed" && !p.consulted) return false;
                    if (consultationsFilter === "not-viewed" && p.consulted) return false;
                    if (q && !p.projet.toLowerCase().includes(q)) return false;
                    return true;
                  });
                  return (
                    <div className="space-y-3 mb-4">
                      <div className="glass-card rounded-2xl p-4">
                        <div className="flex items-center gap-4">
                          <div className="text-center shrink-0">
                            <p className="text-4xl font-bold text-emerald-600">{s.percentage}%</p>
                            <p className="text-[10px] text-gray-500 mt-0.5">consultés</p>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden mb-2">
                              <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${s.percentage}%` }} />
                            </div>
                            <p className="text-xs text-gray-600 dark:text-gray-300">
                              <span className="font-bold text-emerald-600">{s.consulted}</span> consultés
                              <span className="text-gray-400"> / </span>
                              <span className="font-bold">{s.totalRapports}</span> rapports terminés
                            </p>
                            <p className="text-[10px] text-gray-400 mt-1">
                              👁 {s.totalViews} ouverture{s.totalViews > 1 ? "s" : ""} portail · 📄 {s.totalPdfOpens} ouverture{s.totalPdfOpens > 1 ? "s" : ""} PDF
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          value={consultationsSearch}
                          onChange={(e) => setConsultationsSearch(e.target.value)}
                          placeholder="Rechercher un projet..."
                          className="flex-1 h-9 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-800 text-sm"
                        />
                        <div className="flex gap-1">
                          {(["all", "viewed", "not-viewed"] as const).map((f) => (
                            <button
                              key={f}
                              onClick={() => setConsultationsFilter(f)}
                              className={`h-9 px-3 rounded-lg text-xs font-medium transition-colors ${
                                consultationsFilter === f
                                  ? "bg-emerald-500 text-white"
                                  : "bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200"
                              }`}
                            >
                              {f === "all" ? "Tous" : f === "viewed" ? "Consultés" : "Non lus"}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="glass-card rounded-2xl divide-y divide-gray-100 dark:divide-gray-700 max-h-96 overflow-y-auto">
                        {filteredList.length === 0 ? (
                          <p className="text-center text-xs text-gray-400 py-8">Aucun rapport</p>
                        ) : (
                          filteredList.map((p) => (
                            <Link
                              key={p.projectId}
                              href={`/projet/${p.projectId}?mode=rapport`}
                              className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-slate-800/50"
                            >
                              <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${p.consulted ? "bg-emerald-500" : "bg-gray-300 dark:bg-gray-600"}`} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-800 dark:text-gray-100 line-clamp-3 sm:line-clamp-1">{p.projet || "Projet sans nom"}</p>
                                <p className="text-[10px] text-gray-400 truncate">
                                  {p.typeClient || "—"}
                                  {p.dateMontage && ` · ${new Date(p.dateMontage).toLocaleDateString("fr-CH", { day: "2-digit", month: "short", year: "2-digit" })}`}
                                </p>
                              </div>
                              <div className="text-right shrink-0">
                                {p.consulted ? (
                                  <>
                                    <p className="text-xs font-semibold text-emerald-600">👁 {p.viewCount} · 📄 {p.pdfCount}</p>
                                    {p.lastView && (
                                      <p className="text-[10px] text-gray-400">
                                        {new Date(p.lastView).toLocaleString("fr-CH", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                                      </p>
                                    )}
                                  </>
                                ) : (
                                  <span className="text-[10px] text-gray-400">Non lu</span>
                                )}
                              </div>
                            </Link>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })()}
                <div className="border-b border-gray-100 dark:border-gray-800 mb-5" />
              </div>
            )}

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
            {Object.entries(grouped).sort(([a], [b]) => b.localeCompare(a)).map(([monthKey, projs]) => {
              // Dans chaque groupe mensuel, re-trier du plus récent au plus ancien (jour précis).
              const sortedProjs = [...projs].sort((a, b) => {
                const dA = a.dateMontage || a.dateMesures || "";
                const dB = b.dateMontage || b.dateMesures || "";
                return dB.localeCompare(dA);
              });
              return (
              <div key={monthKey} className="mb-6">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <CalendarDays className="w-4 h-4" />
                  {formatMonth(monthKey)} ({projs.length})
                </h3>
                <div className="space-y-3">
                  {sortedProjs.map((p) => {
                    const date = p.dateMontage || p.dateMesures;
                    const status = p.etatCMD || p.etatMesures || "";
                    const allStatusColors: Record<string, string> = { ...STATUS_CMD_COLORS, ...STATUS_MESURES_COLORS };
                    const isTermine = status.toLowerCase().includes("termin") || status.toLowerCase().includes("monté");
                    const statusColor = isTermine ? "bg-green-100 text-green-700" : allStatusColors[status] || "bg-gray-100 text-gray-700";
                    return (
                      <div key={p.id} className="glass-card rounded-2xl p-4 hover:bg-white/80 transition-all">
                        <div className="flex items-start justify-between gap-3">
                          <Link
                            href={`/projet/${p.id}?mode=rapport`}
                            onMouseEnter={() => !isFloatingWindow && prefetchProject(p.id)}
                            onTouchStart={() => !isFloatingWindow && prefetchProject(p.id)}
                            className="flex-1 min-w-0"
                          >
                            {/* Date de montage — badge proéminent, première info visible */}
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-800">
                                <Calendar className="w-3 h-3 shrink-0" />
                                {date ? formatDateFR(date) : "Date non définie"}
                              </span>
                            </div>
                            <h4 className="font-semibold text-gray-900 dark:text-gray-100 line-clamp-2 break-words text-base leading-tight">
                              {p.projet || "Sans nom"}
                            </h4>
                            {p.ofrTM && (
                              <p className="text-xs text-gray-500 mt-0.5">OFR {p.ofrTM}</p>
                            )}
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
              );
            })}
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
      {mode.startsWith("clients-") && !(isCmm && (mode === "clients-contacts" || mode === "clients-entreprises") && cmmHeroMode === mode) && (
        <>
          {/* Bouton retour vers hero CMM Contacts / Entreprises */}
          {isCmm && (mode === "clients-contacts" || mode === "clients-entreprises") && cmmHeroMode === null && (
            <button
              onClick={() => { setCmmHeroMode(mode); setCrmTagFilter(null); }}
              className="mb-4 flex items-center gap-1.5 text-sm transition-all duration-150"
              style={{ color: "rgba(210,190,255,0.60)" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(210,190,255,0.90)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(210,190,255,0.60)"; }}
            >
              <ChevronLeft style={{ width: 15, height: 15 }} />
              {mode === "clients-contacts" ? "Contacts" : "Entreprises"}
              {crmTagFilter && <span className="ml-1 text-xs opacity-70">— {crmTagFilter}</span>}
            </button>
          )}
          <CRMClients
            mode={mode as "clients-contacts" | "clients-entreprises" | "clients-fournisseurs" | "clients-grossistes"}
            isAdmin={currentUser?.role === "admin"}
            filterTag={isCmm ? crmTagFilter : null}
          />
        </>
      )}

      {/* VUE GROSSISTES */}
      {mode.startsWith("grossistes") && !(isCmm && mode === "grossistes" && cmmHeroMode === "grossistes") && (() => {
        // Utiliser les données all-active qui contiennent TOUS les projets non terminés/non annulés
        const allCmd = projectsData[mode] || projectsData["grossistes"] || [];

        const grossisteKeywords: Record<string, string[]> = {
          "grossistes-bms": ["Gétaz", "Getaz"],
          "grossistes-dubat": ["Dubat"],
          "grossistes-tema": ["Tema"],
          "grossistes-matway": ["Matway", "MatWay"],
          "grossistes-bringhen": ["Bringhen"],
        };
        const keywords = grossisteKeywords[mode];

        const grossistesProjects = allCmd.filter((p) => {
          // 1. État CMD ≠ Annulé et ≠ Terminé
          if (p.etatCMD === "Annulé" || p.etatCMD === "Terminé") return false;
          // 2. Type de client = Grossistes
          if (p.typeClient !== "Grossistes" && p.typeClient !== "Grossiste") return false;

          if (keywords) {
            // Sous-menu : le titre du projet COMMENCE par le mot-clé
            const projetLower = p.projet.toLowerCase();
            return keywords.some((kw) => projetLower.startsWith(kw.toLowerCase()));
          }

          // "Tous" : tous les projets Grossistes non terminés
          return true;
        });

        const grossistesFiltered = grossistesProjects.filter((p) => {
          if (collabFilter && !p.collaborateurs.toLowerCase().includes(collabFilter.toLowerCase())) return false;
          if (statusFilter && p.etatCMD !== statusFilter) return false;
          return matchesSearch(p, deferredSearch.toLowerCase(), searchIndex.get(p.id));
        }).sort((a, b) => {
          const dateA = a.dateMontage;
          const dateB = b.dateMontage;
          if (dateA && dateB) return dateA.localeCompare(dateB);
          if (dateA && !dateB) return -1;
          if (!dateA && dateB) return 1;
          return (STATUS_SORT_ORDER[a.etatCMD] ?? 5) - (STATUS_SORT_ORDER[b.etatCMD] ?? 5);
        });

        const gStatusCounts = grossistesProjects.reduce<Record<string, number>>((acc, p) => {
          if (p.etatCMD) acc[p.etatCMD] = (acc[p.etatCMD] || 0) + 1;
          return acc;
        }, {});


        const gStatsFiltered = filterByStatsDate(grossistesProjects, statsDateMode, statsDateFrom, statsDateTo, statsMonth, statsYear);
        const gArchivesAll = (projectsData["archives"] || []).filter((p: any) => {
          if (keywords) return keywords.some(kw => p.projet.toLowerCase().startsWith(kw.toLowerCase()));
          return p.typeClient === "Grossistes" || p.typeClient === "Grossiste";
        });
        const gArchivesFiltered = filterByStatsDate(gArchivesAll, statsDateMode, statsDateFrom, statsDateTo, statsMonth, statsYear);
        const totalCab = gStatsFiltered.reduce((s: number, p: any) => s + (p.nbCabines || 0), 0);
        const rdvFixe = gStatsFiltered.filter((p: any) => p.etatCMD === "RDV - fixé");
        const termineCount = gArchivesFiltered.length;

        return (
          <div>
            {/* Onglets Projets / Stats */}
            <div className="flex gap-2 mb-4">
              <button onClick={() => setSubView("projets")}
                className={`text-sm font-medium px-4 py-2 rounded-lg transition-colors ${subView === "projets" ? "bg-[#1e3a5f] text-white" : "bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300"}`}>
                Projets ({grossistesProjects.length})
              </button>
              <button onClick={() => setSubView("stats")}
                className={`text-sm font-medium px-4 py-2 rounded-lg transition-colors ${subView === "stats" ? "bg-[#1e3a5f] text-white" : "bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300"}`}>
                Stats
              </button>
            </div>

            {subView === "projets" ? (
              <>
                <div className="relative mb-4 max-w-lg">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input placeholder="Rechercher..." className="pl-9 h-11 rounded-xl glass-input" value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                <div className="flex gap-1.5 overflow-x-auto pb-1 mb-2 scrollbar-hide">
                  <button onClick={() => setStatusFilter(null)} className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${!statusFilter ? "bg-[#1e3a5f] text-white border-[#1e3a5f]" : "bg-white text-gray-600 border-gray-200"}`}>
                    Tous ({grossistesProjects.length})
                  </button>
                  {Object.entries(gStatusCounts).map(([status, count]) => (
                    <button key={status} onClick={() => setStatusFilter(statusFilter === status ? null : status)}
                      className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors whitespace-nowrap ${statusFilter === status ? "bg-[#1e3a5f] text-white border-[#1e3a5f]" : `${STATUS_CMD_COLORS[status] || "bg-gray-100 text-gray-700"} border-transparent`}`}>
                      {status} ({count})
                    </button>
                  ))}
                </div>
                <p className="text-sm text-gray-500 mb-3">
                  {grossistesFiltered.length} projet{grossistesFiltered.length !== 1 ? "s" : ""}{" · "}{grossistesFiltered.reduce((sum, p) => sum + (p.nbCabines || 0), 0)} cabine{grossistesFiltered.reduce((sum, p) => sum + (p.nbCabines || 0), 0) !== 1 ? "s" : ""}
                </p>
                {loading && <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>}
                <div className="space-y-3">
                  {grossistesFiltered.map((project) => (
                    <ProjectCard key={project.id} project={project} mode="cmd" isAdmin={currentUser?.role === "admin"} onDelete={handleDeleteProject} compact noPrefetch={isFloatingWindow} />
                  ))}
                  {grossistesFiltered.length === 0 && !loading && (
                    <div className="text-center py-12 text-gray-400"><p className="text-lg">Aucun projet</p></div>
                  )}
                </div>
              </>
            ) : (
              <div className="space-y-4">
                <StatsDateFilter mode={statsDateMode} from={statsDateFrom} to={statsDateTo} month={statsMonth} year={statsYear}
                  onModeChange={setStatsDateMode} onFromChange={setStatsDateFrom} onToChange={setStatsDateTo} onMonthChange={setStatsMonth} onYearChange={setStatsYear} />
                {/* KPIs */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700 text-center">
                    <p className="text-2xl font-bold text-[#1e3a5f] dark:text-blue-300">{gStatsFiltered.length}</p>
                    <p className="text-xs text-gray-500 mt-1">Projets en cours</p>
                  </div>
                  <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700 text-center">
                    <p className="text-2xl font-bold text-green-600">{totalCab}</p>
                    <p className="text-xs text-gray-500 mt-1">Cabines</p>
                  </div>
                  <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700 text-center">
                    <p className="text-2xl font-bold text-blue-600">{rdvFixe.length}</p>
                    <p className="text-xs text-gray-500 mt-1">RDV fixés</p>
                  </div>
                  <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700 text-center">
                    <p className="text-2xl font-bold text-purple-600">{termineCount}</p>
                    <p className="text-xs text-gray-500 mt-1">Terminés</p>
                  </div>
                </div>
                {/* Répartition par statut */}
                <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
                  <h3 className="font-semibold text-sm mb-3 text-gray-700 dark:text-gray-200">Répartition par statut</h3>
                  <div className="space-y-2">
                    {(() => {
                      const sc: Record<string, number> = {};
                      gStatsFiltered.forEach((p: any) => { if (p.etatCMD) sc[p.etatCMD] = (sc[p.etatCMD] || 0) + 1; });
                      return Object.entries(sc).sort(([,a],[,b]) => b - a).map(([status, count]) => (
                        <div key={status} className="flex items-center gap-2">
                          <div className="w-32 sm:w-40 text-xs text-gray-600 dark:text-gray-400 truncate">{status}</div>
                          <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-5 overflow-hidden">
                            <div className="h-full bg-[#1e3a5f] rounded-full flex items-center justify-end pr-1.5"
                              style={{width:`${Math.max((count / gStatsFiltered.length) * 100, 8)}%`}}>
                              <span className="text-[10px] text-white font-medium">{count}</span>
                            </div>
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
                {/* Répartition par collaborateur */}
                <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
                  <h3 className="font-semibold text-sm mb-3 text-gray-700 dark:text-gray-200">Par collaborateur</h3>
                  <div className="space-y-2">
                    {(() => {
                      const collabCount: Record<string, {projets: number, cabines: number}> = {};
                      gStatsFiltered.forEach((p: any) => {
                        const names = p.collaborateurs ? p.collaborateurs.split("&").map((n: string) => n.trim()).filter(Boolean) : ["Non assigné"];
                        names.forEach((n: string) => {
                          if (!collabCount[n]) collabCount[n] = {projets:0, cabines:0};
                          collabCount[n].projets++;
                          collabCount[n].cabines += (p.nbCabines || 0);
                        });
                      });
                      return Object.entries(collabCount).sort(([,a],[,b]) => b.cabines - a.cabines).map(([name, data]) => (
                        <div key={name} className="flex items-center justify-between py-1 border-b border-gray-50 dark:border-gray-700 last:border-0">
                          <span className="text-sm text-gray-700 dark:text-gray-300">{name}</span>
                          <span className="text-xs text-gray-500">{data.projets} proj. · {data.cabines} cab.</span>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
                {/* === ACTIVITÉ PAR TYPE === Mesures / Montages / Services / SAV
                    Mêmes blocs que la vue Fournisseurs — voir commit
                    "Stats fournisseurs : activité par type, ..." pour la
                    logique. Sources : gStatsFiltered (en cours) et
                    gArchivesFiltered (terminés). */}
                {(() => {
                  const hasType = (p: any, kw: string) =>
                    Array.isArray(p.typeServices) && p.typeServices.some((t: string) => (t || "").toLowerCase().includes(kw));
                  const stats = [
                    { label: "Mesures", color: "text-cyan-600 dark:text-cyan-300", pred: (p: any) => hasType(p, "mesure") || !!p.dateMesures || !!p.etatMesures },
                    { label: "Montages", color: "text-orange-600 dark:text-orange-300", pred: (p: any) => hasType(p, "montage") },
                    { label: "Services", color: "text-emerald-600 dark:text-emerald-300", pred: (p: any) => hasType(p, "service") },
                    { label: "SAV", color: "text-red-600 dark:text-red-300", pred: (p: any) => p.sav === true || (p.etatSAV && p.etatSAV !== "Aucun SAV") },
                  ];
                  return (
                    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
                      <h3 className="font-semibold text-sm mb-3 text-gray-700 dark:text-gray-200">Activité par type</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {stats.map((s) => {
                          const enCours = gStatsFiltered.filter(s.pred).length;
                          const enCoursCab = gStatsFiltered.filter(s.pred).reduce((sum: number, p: any) => sum + (p.nbCabines || 0), 0);
                          const termine = gArchivesFiltered.filter(s.pred).length;
                          const termineCab = gArchivesFiltered.filter(s.pred).reduce((sum: number, p: any) => sum + (p.nbCabines || 0), 0);
                          return (
                            <div key={s.label} className="rounded-lg border border-gray-100 dark:border-gray-700 p-3">
                              <p className={`text-xs font-semibold uppercase tracking-wider ${s.color}`}>{s.label}</p>
                              <div className="grid grid-cols-2 gap-2 mt-2">
                                <div>
                                  <p className="text-[10px] text-gray-400 dark:text-gray-500">En cours</p>
                                  <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{enCours}</p>
                                  {enCoursCab > 0 && <p className="text-[10px] text-gray-400">{enCoursCab} cab.</p>}
                                </div>
                                <div>
                                  <p className="text-[10px] text-gray-400 dark:text-gray-500">Terminés</p>
                                  <p className="text-xl font-bold text-gray-700 dark:text-gray-300">{termine}</p>
                                  {termineCab > 0 && <p className="text-[10px] text-gray-400">{termineCab} cab.</p>}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* === STATS PRODUITS — cabines par série === */}
                {(() => {
                  const aggBySerie = (list: any[]) => {
                    const m: Record<string, number> = {};
                    list.forEach((p: any) => {
                      (p.seriesCabines || []).forEach((s: string) => {
                        m[s] = (m[s] || 0) + (p.nbCabines || 0);
                      });
                    });
                    return m;
                  };
                  const enCours = aggBySerie(gStatsFiltered);
                  const termine = aggBySerie(gArchivesFiltered);
                  const allSeries = Array.from(new Set([...Object.keys(enCours), ...Object.keys(termine)]));
                  if (allSeries.length === 0) return null;
                  const totalEnCours = Object.values(enCours).reduce((a, b) => a + b, 0);
                  const totalTermine = Object.values(termine).reduce((a, b) => a + b, 0);
                  const sorted = allSeries
                    .map((s) => ({ s, ec: enCours[s] || 0, t: termine[s] || 0, total: (enCours[s] || 0) + (termine[s] || 0) }))
                    .sort((a, b) => b.total - a.total);
                  const max = Math.max(1, ...sorted.map((x) => x.total));
                  return (
                    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
                      <h3 className="font-semibold text-sm mb-3 text-gray-700 dark:text-gray-200">Stats produits — cabines par série</h3>
                      <div className="flex items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400 mb-3">
                        <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-blue-500" />En cours ({totalEnCours})</span>
                        <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-500" />Terminés ({totalTermine})</span>
                      </div>
                      <div className="space-y-2">
                        {sorted.map(({ s, ec, t, total }) => {
                          const ecPct = (ec / max) * 100;
                          const tPct = (t / max) * 100;
                          return (
                            <div key={s}>
                              <div className="flex items-center justify-between text-xs mb-1">
                                <span className="text-gray-700 dark:text-gray-200 truncate">{s}</span>
                                <span className="font-mono text-gray-500 dark:text-gray-400">
                                  {ec > 0 && <span className="text-blue-600 dark:text-blue-300">{ec}</span>}
                                  {ec > 0 && t > 0 && <span> · </span>}
                                  {t > 0 && <span className="text-emerald-600 dark:text-emerald-400">{t}</span>}
                                  <span className="ml-1 text-gray-400">({total})</span>
                                </span>
                              </div>
                              <div className="flex h-2 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                {ec > 0 && <div className="bg-blue-500" style={{ width: `${ecPct}%` }} />}
                                {t > 0 && <div className="bg-emerald-500" style={{ width: `${tPct}%` }} />}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* === TAUX D'ERREUR === en cours + déjà exécuté */}
                {(() => {
                  type Bucket = { soucis: number; pieces: number; defauts: number; total: number };
                  const compute = (list: any[]): Bucket => ({
                    soucis: list.filter((p) => p.soucisMontage === true).length,
                    pieces: list.filter((p) => (p.infoPiecesManquantes || "").trim().length > 0).length,
                    defauts: list.filter((p) => (p.infoDefautsSignale || "").trim().length > 0).length,
                    total: list.length,
                  });
                  const enCoursB = compute(gStatsFiltered);
                  const termineB = compute(gArchivesFiltered);
                  if (enCoursB.total === 0 && termineB.total === 0) return null;
                  const pct = (n: number, d: number) => d === 0 ? 0 : Math.round((n / d) * 100);
                  const rows: { label: string; key: keyof Bucket; color: string }[] = [
                    { label: "Soucis montage", key: "soucis", color: "bg-orange-500" },
                    { label: "Pièces manquantes", key: "pieces", color: "bg-amber-500" },
                    { label: "Défauts signalés", key: "defauts", color: "bg-red-500" },
                  ];
                  return (
                    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
                      <h3 className="font-semibold text-sm mb-3 text-gray-700 dark:text-gray-200">Taux d&apos;erreur</h3>
                      <div className="grid grid-cols-2 gap-3 mb-3 text-[11px] text-gray-500 dark:text-gray-400">
                        <div>Sur <strong className="text-gray-800 dark:text-gray-200">{enCoursB.total}</strong> projets en cours</div>
                        <div>Sur <strong className="text-gray-800 dark:text-gray-200">{termineB.total}</strong> projets terminés</div>
                      </div>
                      <div className="space-y-3">
                        {rows.map(({ label, key, color }) => {
                          const ec = enCoursB[key] as number;
                          const t = termineB[key] as number;
                          const ecPct = pct(ec, enCoursB.total);
                          const tPct = pct(t, termineB.total);
                          return (
                            <div key={label}>
                              <div className="flex items-center justify-between text-xs mb-1">
                                <span className="text-gray-700 dark:text-gray-200">{label}</span>
                                <span className="font-mono text-gray-500 dark:text-gray-400">
                                  <span className="text-blue-600 dark:text-blue-300">{ec}</span> / <span className="text-emerald-600 dark:text-emerald-400">{t}</span>
                                </span>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <div className="flex items-center gap-1.5">
                                    <div className="flex-1 h-2 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                      <div className={color} style={{ width: `${ecPct}%`, height: "100%" }} />
                                    </div>
                                    <span className="text-[10px] font-mono text-gray-500 w-9 text-right">{ecPct}%</span>
                                  </div>
                                  <p className="text-[9px] text-gray-400 mt-0.5">en cours</p>
                                </div>
                                <div>
                                  <div className="flex items-center gap-1.5">
                                    <div className="flex-1 h-2 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                      <div className={color} style={{ width: `${tPct}%`, height: "100%", opacity: 0.6 }} />
                                    </div>
                                    <span className="text-[10px] font-mono text-gray-500 w-9 text-right">{tPct}%</span>
                                  </div>
                                  <p className="text-[9px] text-gray-400 mt-0.5">déjà exécutés</p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* Prochains RDV */}
                {rdvFixe.length > 0 && (
                  <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
                    <h3 className="font-semibold text-sm mb-3 text-gray-700 dark:text-gray-200">Prochains RDV fixés</h3>
                    <div className="space-y-2">
                      {rdvFixe.sort((a,b) => (a.dateMontage||"").localeCompare(b.dateMontage||"")).slice(0, 8).map(p => (
                        <div key={p.id} className="flex items-center justify-between py-1 border-b border-gray-50 dark:border-gray-700 last:border-0">
                          <span className="text-sm text-gray-700 dark:text-gray-300 line-clamp-3 sm:line-clamp-1 max-w-[60%]">{p.projet}</span>
                          <span className="text-xs text-gray-500">{p.dateMontage ? new Date(p.dateMontage).toLocaleDateString("fr-CH", {day:"numeric",month:"short"}) : "—"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* VUE FOURNISSEURS */}
      {mode.startsWith("fournisseurs") && !mode.startsWith("fournisseurs-menu") && !(isCmm && mode === "fournisseurs" && cmmHeroMode === "fournisseurs") && (() => {
        const allCmd = projectsData[mode] || projectsData["fournisseurs"] || [];
        const fournisseurNameFilter: Record<string, string> = {
          "fournisseurs-duka": "Duka", "fournisseurs-duscholux": "Duscholux", "fournisseurs-kermi": "Kermi",
          "fournisseurs-koralle": "Koralle", "fournisseurs-nelo": "Nelo", "fournisseurs-novellini": "Novellini",
          "fournisseurs-ronal": "Ronal", "fournisseurs-samo": "Samo", "fournisseurs-vismaravetro": "Vismaravetro",
        };
        const nameFilter = fournisseurNameFilter[mode];
        const fournisseursProjects = allCmd.filter((p) => {
          // 1. État CMD ≠ Annulé et ≠ Terminé
          if (p.etatCMD === "Annulé" || p.etatCMD === "Terminé") return false;
          // 2. Type de client = Fournisseurs
          if (p.typeClient !== "Fournisseurs" && p.typeClient !== "Fournisseur") return false;

          if (nameFilter) {
            // Sous-menu : le titre du projet COMMENCE par le mot-clé
            return p.projet.toLowerCase().startsWith(nameFilter.toLowerCase());
          }

          // "Tous" : tous les projets Fournisseurs non terminés
          return true;
        });

        const fournisseursFiltered = fournisseursProjects.filter((p) => {
          if (collabFilter && !p.collaborateurs.toLowerCase().includes(collabFilter.toLowerCase())) return false;
          if (statusFilter && p.etatCMD !== statusFilter) return false;
          return matchesSearch(p, deferredSearch.toLowerCase(), searchIndex.get(p.id));
        }).sort((a, b) => {
          const dateA = a.dateMontage;
          const dateB = b.dateMontage;
          if (dateA && dateB) return dateA.localeCompare(dateB);
          if (dateA && !dateB) return -1;
          if (!dateA && dateB) return 1;
          return (STATUS_SORT_ORDER[a.etatCMD] ?? 5) - (STATUS_SORT_ORDER[b.etatCMD] ?? 5);
        });

        const fStatusCounts = fournisseursProjects.reduce<Record<string, number>>((acc, p) => {
          if (p.etatCMD) acc[p.etatCMD] = (acc[p.etatCMD] || 0) + 1;
          return acc;
        }, {});

        const fStatsFiltered = filterByStatsDate(fournisseursProjects, statsDateMode, statsDateFrom, statsDateTo, statsMonth, statsYear);
        const fArchivesAll = (projectsData["archives"] || []).filter((p: any) => {
          if (nameFilter) return p.projet.toLowerCase().startsWith(nameFilter.toLowerCase());
          return p.typeClient === "Fournisseurs" || p.typeClient === "Fournisseur";
        });
        const fArchivesFiltered = filterByStatsDate(fArchivesAll, statsDateMode, statsDateFrom, statsDateTo, statsMonth, statsYear);
        const fTotalCab = fStatsFiltered.reduce((s: number, p: any) => s + (p.nbCabines || 0), 0);
        const fRdvFixe = fStatsFiltered.filter((p: any) => p.etatCMD === "RDV - fixé");
        const fTermineCount = fArchivesFiltered.length;

        return (
          <div>
            {/* Onglets Projets / Stats */}
            <div className="flex gap-2 mb-4">
              <button onClick={() => setSubView("projets")}
                className={`text-sm font-medium px-4 py-2 rounded-lg transition-colors ${subView === "projets" ? "bg-[#1e3a5f] text-white" : "bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300"}`}>
                Projets ({fournisseursProjects.length})
              </button>
              <button onClick={() => setSubView("stats")}
                className={`text-sm font-medium px-4 py-2 rounded-lg transition-colors ${subView === "stats" ? "bg-[#1e3a5f] text-white" : "bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300"}`}>
                Stats
              </button>
            </div>

            {subView === "projets" ? (
              <>
                <div className="relative mb-4 max-w-lg">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input placeholder="Rechercher..." className="pl-9 h-11 rounded-xl glass-input" value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                <div className="flex gap-1.5 overflow-x-auto pb-1 mb-2 scrollbar-hide">
                  <button onClick={() => setStatusFilter(null)} className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${!statusFilter ? "bg-[#1e3a5f] text-white border-[#1e3a5f]" : "bg-white text-gray-600 border-gray-200"}`}>
                    Tous ({fournisseursProjects.length})
                  </button>
                  {Object.entries(fStatusCounts).map(([status, count]) => (
                    <button key={status} onClick={() => setStatusFilter(statusFilter === status ? null : status)}
                      className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors whitespace-nowrap ${statusFilter === status ? "bg-[#1e3a5f] text-white border-[#1e3a5f]"
                      : `${STATUS_CMD_COLORS[status] || "bg-gray-100 text-gray-700"} border-transparent`
                  }`}
                >
                  {status} ({count})
                </button>
              ))}
                </div>
                <p className="text-sm text-gray-500 mb-3">
                  {fournisseursFiltered.length} projet{fournisseursFiltered.length !== 1 ? "s" : ""}{" · "}{fournisseursFiltered.reduce((sum, p) => sum + (p.nbCabines || 0), 0)} cabine{fournisseursFiltered.reduce((sum, p) => sum + (p.nbCabines || 0), 0) !== 1 ? "s" : ""}
                </p>
                {loading && <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>}
                <div className="space-y-3">
                  {fournisseursFiltered.map((project) => (
                    <ProjectCard key={project.id} project={project} mode="cmd" isAdmin={currentUser?.role === "admin"} onDelete={handleDeleteProject} compact noPrefetch={isFloatingWindow} />
                  ))}
                  {fournisseursFiltered.length === 0 && !loading && (
                    <div className="text-center py-12 text-gray-400"><p className="text-lg">Aucun projet</p></div>
                  )}
                </div>
              </>
            ) : (
              <div className="space-y-4">
                <StatsDateFilter mode={statsDateMode} from={statsDateFrom} to={statsDateTo} month={statsMonth} year={statsYear}
                  onModeChange={setStatsDateMode} onFromChange={setStatsDateFrom} onToChange={setStatsDateTo} onMonthChange={setStatsMonth} onYearChange={setStatsYear} />
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700 text-center">
                    <p className="text-2xl font-bold text-[#1e3a5f] dark:text-blue-300">{fStatsFiltered.length}</p>
                    <p className="text-xs text-gray-500 mt-1">Projets en cours</p>
                  </div>
                  <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700 text-center">
                    <p className="text-2xl font-bold text-green-600">{fTotalCab}</p>
                    <p className="text-xs text-gray-500 mt-1">Cabines</p>
                  </div>
                  <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700 text-center">
                    <p className="text-2xl font-bold text-blue-600">{fRdvFixe.length}</p>
                    <p className="text-xs text-gray-500 mt-1">RDV fixés</p>
                  </div>
                  <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700 text-center">
                    <p className="text-2xl font-bold text-purple-600">{fTermineCount}</p>
                    <p className="text-xs text-gray-500 mt-1">Terminés</p>
                  </div>
                </div>
                <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
                  <h3 className="font-semibold text-sm mb-3 text-gray-700 dark:text-gray-200">Répartition par statut</h3>
                  <div className="space-y-2">
                    {(() => {
                      const sc: Record<string, number> = {};
                      fStatsFiltered.forEach((p: any) => { if (p.etatCMD) sc[p.etatCMD] = (sc[p.etatCMD] || 0) + 1; });
                      return Object.entries(sc).sort(([,a],[,b]) => b - a).map(([status, count]) => (
                        <div key={status} className="flex items-center gap-2">
                          <div className="w-32 sm:w-40 text-xs text-gray-600 dark:text-gray-400 truncate">{status}</div>
                          <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-5 overflow-hidden">
                            <div className="h-full bg-[#1e3a5f] rounded-full flex items-center justify-end pr-1.5"
                              style={{width:`${Math.max((count / fStatsFiltered.length) * 100, 8)}%`}}>
                              <span className="text-[10px] text-white font-medium">{count}</span>
                            </div>
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
                <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
                  <h3 className="font-semibold text-sm mb-3 text-gray-700 dark:text-gray-200">Par collaborateur</h3>
                  <div className="space-y-2">
                    {(() => {
                      const collabCount: Record<string, {projets: number, cabines: number}> = {};
                      fStatsFiltered.forEach((p: any) => {
                        const names = p.collaborateurs ? p.collaborateurs.split("&").map((n: string) => n.trim()).filter(Boolean) : ["Non assigné"];
                        names.forEach((n: string) => {
                          if (!collabCount[n]) collabCount[n] = {projets:0, cabines:0};
                          collabCount[n].projets++;
                          collabCount[n].cabines += (p.nbCabines || 0);
                        });
                      });
                      return Object.entries(collabCount).sort(([,a],[,b]) => b.cabines - a.cabines).map(([name, data]) => (
                        <div key={name} className="flex items-center justify-between py-1 border-b border-gray-50 dark:border-gray-700 last:border-0">
                          <span className="text-sm text-gray-700 dark:text-gray-300">{name}</span>
                          <span className="text-xs text-gray-500">{data.projets} proj. · {data.cabines} cab.</span>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
                {/* === ACTIVITÉ PAR TYPE === Mesures / Montages / Services / SAV
                    Décomposition "en cours" vs "déjà exécuté" pour chacun.
                    Sources :
                      - en cours  → fStatsFiltered (CMD non terminé du fournisseur)
                      - terminé   → fArchivesFiltered (archives du fournisseur)
                    Heuristiques : typeServices contient le mot-clé,
                    ou p.sav === true pour le bloc SAV. */}
                {(() => {
                  const hasType = (p: any, kw: string) =>
                    Array.isArray(p.typeServices) && p.typeServices.some((t: string) => (t || "").toLowerCase().includes(kw));
                  const stats = [
                    {
                      label: "Mesures",
                      color: "text-cyan-600 dark:text-cyan-300",
                      pred: (p: any) => hasType(p, "mesure") || !!p.dateMesures || !!p.etatMesures,
                    },
                    {
                      label: "Montages",
                      color: "text-orange-600 dark:text-orange-300",
                      pred: (p: any) => hasType(p, "montage"),
                    },
                    {
                      label: "Services",
                      color: "text-emerald-600 dark:text-emerald-300",
                      pred: (p: any) => hasType(p, "service"),
                    },
                    {
                      label: "SAV",
                      color: "text-red-600 dark:text-red-300",
                      pred: (p: any) => p.sav === true || (p.etatSAV && p.etatSAV !== "Aucun SAV"),
                    },
                  ];
                  return (
                    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
                      <h3 className="font-semibold text-sm mb-3 text-gray-700 dark:text-gray-200">Activité par type</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {stats.map((s) => {
                          const enCours = fStatsFiltered.filter(s.pred).length;
                          const enCoursCab = fStatsFiltered.filter(s.pred).reduce((sum: number, p: any) => sum + (p.nbCabines || 0), 0);
                          const termine = fArchivesFiltered.filter(s.pred).length;
                          const termineCab = fArchivesFiltered.filter(s.pred).reduce((sum: number, p: any) => sum + (p.nbCabines || 0), 0);
                          return (
                            <div key={s.label} className="rounded-lg border border-gray-100 dark:border-gray-700 p-3">
                              <p className={`text-xs font-semibold uppercase tracking-wider ${s.color}`}>{s.label}</p>
                              <div className="grid grid-cols-2 gap-2 mt-2">
                                <div>
                                  <p className="text-[10px] text-gray-400 dark:text-gray-500">En cours</p>
                                  <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{enCours}</p>
                                  {enCoursCab > 0 && <p className="text-[10px] text-gray-400">{enCoursCab} cab.</p>}
                                </div>
                                <div>
                                  <p className="text-[10px] text-gray-400 dark:text-gray-500">Terminés</p>
                                  <p className="text-xl font-bold text-gray-700 dark:text-gray-300">{termine}</p>
                                  {termineCab > 0 && <p className="text-[10px] text-gray-400">{termineCab} cab.</p>}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* === STATS PRODUITS === cabines par série, en cours + déjà exécuté
                    On agrège seriesCabines × nbCabines pour chaque source,
                    puis on liste séries triées par total décroissant. */}
                {(() => {
                  const aggBySerie = (list: any[]) => {
                    const m: Record<string, number> = {};
                    list.forEach((p: any) => {
                      (p.seriesCabines || []).forEach((s: string) => {
                        m[s] = (m[s] || 0) + (p.nbCabines || 0);
                      });
                    });
                    return m;
                  };
                  const enCours = aggBySerie(fStatsFiltered);
                  const termine = aggBySerie(fArchivesFiltered);
                  const allSeries = Array.from(new Set([...Object.keys(enCours), ...Object.keys(termine)]));
                  if (allSeries.length === 0) return null;
                  const totalEnCours = Object.values(enCours).reduce((a, b) => a + b, 0);
                  const totalTermine = Object.values(termine).reduce((a, b) => a + b, 0);
                  const sorted = allSeries
                    .map((s) => ({ s, ec: enCours[s] || 0, t: termine[s] || 0, total: (enCours[s] || 0) + (termine[s] || 0) }))
                    .sort((a, b) => b.total - a.total);
                  const max = Math.max(1, ...sorted.map((x) => x.total));
                  return (
                    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
                      <h3 className="font-semibold text-sm mb-3 text-gray-700 dark:text-gray-200">Stats produits — cabines par série</h3>
                      <div className="flex items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400 mb-3">
                        <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-blue-500" />En cours ({totalEnCours})</span>
                        <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-500" />Terminés ({totalTermine})</span>
                      </div>
                      <div className="space-y-2">
                        {sorted.map(({ s, ec, t, total }) => {
                          const ecPct = (ec / max) * 100;
                          const tPct = (t / max) * 100;
                          return (
                            <div key={s}>
                              <div className="flex items-center justify-between text-xs mb-1">
                                <span className="text-gray-700 dark:text-gray-200 truncate">{s}</span>
                                <span className="font-mono text-gray-500 dark:text-gray-400">
                                  {ec > 0 && <span className="text-blue-600 dark:text-blue-300">{ec}</span>}
                                  {ec > 0 && t > 0 && <span> · </span>}
                                  {t > 0 && <span className="text-emerald-600 dark:text-emerald-400">{t}</span>}
                                  <span className="ml-1 text-gray-400">({total})</span>
                                </span>
                              </div>
                              <div className="flex h-2 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                {ec > 0 && <div className="bg-blue-500" style={{ width: `${ecPct}%` }} />}
                                {t > 0 && <div className="bg-emerald-500" style={{ width: `${tPct}%` }} />}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* === TAUX D'ERREUR === %
                    Trois indicateurs sur l'ensemble des projets fournisseur :
                      - Soucis montage  (p.soucisMontage === true)
                      - Pièces manquantes (p.infoPiecesManquantes non vide)
                      - Défauts signalés (p.infoDefautsSignale non vide)
                    Décomposition en cours / déjà exécuté pour comparer si
                    les soucis se résorbent ou pas après livraison. */}
                {(() => {
                  type Bucket = { soucis: number; pieces: number; defauts: number; total: number };
                  const compute = (list: any[]): Bucket => ({
                    soucis: list.filter((p) => p.soucisMontage === true).length,
                    pieces: list.filter((p) => (p.infoPiecesManquantes || "").trim().length > 0).length,
                    defauts: list.filter((p) => (p.infoDefautsSignale || "").trim().length > 0).length,
                    total: list.length,
                  });
                  const enCours = compute(fStatsFiltered);
                  const termine = compute(fArchivesFiltered);
                  if (enCours.total === 0 && termine.total === 0) return null;
                  const pct = (n: number, d: number) => d === 0 ? 0 : Math.round((n / d) * 100);
                  const rows: { label: string; ecKey: keyof Bucket; tKey: keyof Bucket; color: string }[] = [
                    { label: "Soucis montage", ecKey: "soucis", tKey: "soucis", color: "bg-orange-500" },
                    { label: "Pièces manquantes", ecKey: "pieces", tKey: "pieces", color: "bg-amber-500" },
                    { label: "Défauts signalés", ecKey: "defauts", tKey: "defauts", color: "bg-red-500" },
                  ];
                  return (
                    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
                      <h3 className="font-semibold text-sm mb-3 text-gray-700 dark:text-gray-200">Taux d&apos;erreur</h3>
                      <div className="grid grid-cols-2 gap-3 mb-3 text-[11px] text-gray-500 dark:text-gray-400">
                        <div>Sur <strong className="text-gray-800 dark:text-gray-200">{enCours.total}</strong> projets en cours</div>
                        <div>Sur <strong className="text-gray-800 dark:text-gray-200">{termine.total}</strong> projets terminés</div>
                      </div>
                      <div className="space-y-3">
                        {rows.map(({ label, ecKey, tKey, color }) => {
                          const ec = enCours[ecKey] as number;
                          const t = termine[tKey] as number;
                          const ecPct = pct(ec, enCours.total);
                          const tPct = pct(t, termine.total);
                          return (
                            <div key={label}>
                              <div className="flex items-center justify-between text-xs mb-1">
                                <span className="text-gray-700 dark:text-gray-200">{label}</span>
                                <span className="font-mono text-gray-500 dark:text-gray-400">
                                  <span className="text-blue-600 dark:text-blue-300">{ec}</span> / <span className="text-emerald-600 dark:text-emerald-400">{t}</span>
                                </span>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <div className="flex items-center gap-1.5">
                                    <div className="flex-1 h-2 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                      <div className={color} style={{ width: `${ecPct}%`, height: "100%" }} />
                                    </div>
                                    <span className="text-[10px] font-mono text-gray-500 w-9 text-right">{ecPct}%</span>
                                  </div>
                                  <p className="text-[9px] text-gray-400 mt-0.5">en cours</p>
                                </div>
                                <div>
                                  <div className="flex items-center gap-1.5">
                                    <div className="flex-1 h-2 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                      <div className={color} style={{ width: `${tPct}%`, height: "100%", opacity: 0.6 }} />
                                    </div>
                                    <span className="text-[10px] font-mono text-gray-500 w-9 text-right">{tPct}%</span>
                                  </div>
                                  <p className="text-[9px] text-gray-400 mt-0.5">déjà exécutés</p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {fRdvFixe.length > 0 && (
                  <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
                    <h3 className="font-semibold text-sm mb-3 text-gray-700 dark:text-gray-200">Prochains RDV fixés</h3>
                    <div className="space-y-2">
                      {fRdvFixe.sort((a,b) => (a.dateMontage||"").localeCompare(b.dateMontage||"")).slice(0, 8).map(p => (
                        <div key={p.id} className="flex items-center justify-between py-1 border-b border-gray-50 dark:border-gray-700 last:border-0">
                          <span className="text-sm text-gray-700 dark:text-gray-300 line-clamp-3 sm:line-clamp-1 max-w-[60%]">{p.projet}</span>
                          <span className="text-xs text-gray-500">{p.dateMontage ? new Date(p.dateMontage).toLocaleDateString("fr-CH", {day:"numeric",month:"short"}) : "—"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* VUE SANITAIRES — projets dont typeClient == "Sanitaire(s)".
          Même UX que la vue Fournisseurs / Grossistes : sous-onglets
          Projets / Stats avec filtres et stats enrichies. */}
      {mode === "sanitaires" && (() => {
        const allCmd = projectsData["sanitaires"] || projectsData["all-active"] || [];
        const sanitairesProjects = allCmd.filter((p) => {
          if (p.etatCMD === "Annulé" || p.etatCMD === "Terminé") return false;
          return p.typeClient === "Sanitaire" || p.typeClient === "Sanitaires";
        });

        const q = deferredSearch.toLowerCase();
        const sanitairesFiltered = sanitairesProjects.filter((p) => {
          if (collabFilter && !p.collaborateurs.toLowerCase().includes(collabFilter.toLowerCase())) return false;
          if (statusFilter && p.etatCMD !== statusFilter) return false;
          return matchesSearch(p, q, searchIndex.get(p.id));
        }).sort((a, b) => {
          const dateA = a.dateMontage;
          const dateB = b.dateMontage;
          if (dateA && dateB) return dateA.localeCompare(dateB);
          if (dateA && !dateB) return -1;
          if (!dateA && dateB) return 1;
          return (STATUS_SORT_ORDER[a.etatCMD] ?? 5) - (STATUS_SORT_ORDER[b.etatCMD] ?? 5);
        });

        const sStatusCounts = sanitairesProjects.reduce<Record<string, number>>((acc, p) => {
          if (p.etatCMD) acc[p.etatCMD] = (acc[p.etatCMD] || 0) + 1;
          return acc;
        }, {});

        const sStatsFiltered = filterByStatsDate(sanitairesProjects, statsDateMode, statsDateFrom, statsDateTo, statsMonth, statsYear);
        const sArchivesAll = (projectsData["archives"] || []).filter((p: any) =>
          p.typeClient === "Sanitaire" || p.typeClient === "Sanitaires",
        );
        const sArchivesFiltered = filterByStatsDate(sArchivesAll, statsDateMode, statsDateFrom, statsDateTo, statsMonth, statsYear);
        const sTotalCab = sStatsFiltered.reduce((s: number, p: any) => s + (p.nbCabines || 0), 0);
        const sRdvFixe = sStatsFiltered.filter((p: any) => p.etatCMD === "RDV - fixé");
        const sTermineCount = sArchivesFiltered.length;

        return (
          <div>
            <div className="flex gap-2 mb-4">
              <button onClick={() => setSubView("projets")}
                className={`text-sm font-medium px-4 py-2 rounded-lg transition-colors ${subView === "projets" ? "bg-[#1e3a5f] text-white" : "bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300"}`}>
                Projets ({sanitairesProjects.length})
              </button>
              <button onClick={() => setSubView("stats")}
                className={`text-sm font-medium px-4 py-2 rounded-lg transition-colors ${subView === "stats" ? "bg-[#1e3a5f] text-white" : "bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300"}`}>
                Stats
              </button>
            </div>

            {subView === "projets" ? (
              <>
                <div className="relative mb-4 max-w-lg">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input placeholder="Rechercher (nom, sanitaire, OFR...)" className="pl-9 h-11 rounded-xl glass-input" value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                <div className="flex gap-1.5 overflow-x-auto pb-1 mb-2 scrollbar-hide">
                  <button onClick={() => setStatusFilter(null)} className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${!statusFilter ? "bg-[#1e3a5f] text-white border-[#1e3a5f]" : "bg-white text-gray-600 border-gray-200"}`}>
                    Tous ({sanitairesProjects.length})
                  </button>
                  {Object.entries(sStatusCounts).map(([status, count]) => (
                    <button key={status} onClick={() => setStatusFilter(statusFilter === status ? null : status)}
                      className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors whitespace-nowrap ${statusFilter === status ? "bg-[#1e3a5f] text-white border-[#1e3a5f]" : `${STATUS_CMD_COLORS[status] || "bg-gray-100 text-gray-700"} border-transparent`}`}>
                      {status} ({count})
                    </button>
                  ))}
                </div>
                <p className="text-sm text-gray-500 mb-3">
                  {sanitairesFiltered.length} projet{sanitairesFiltered.length !== 1 ? "s" : ""}{" · "}{sanitairesFiltered.reduce((sum, p) => sum + (p.nbCabines || 0), 0)} cabine{sanitairesFiltered.reduce((sum, p) => sum + (p.nbCabines || 0), 0) !== 1 ? "s" : ""}
                </p>
                {loading && <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>}
                <div className="space-y-3">
                  {sanitairesFiltered.map((project) => (
                    <ProjectCard key={project.id} project={project} mode="cmd" isAdmin={currentUser?.role === "admin"} onDelete={handleDeleteProject} compact noPrefetch={isFloatingWindow} />
                  ))}
                  {sanitairesFiltered.length === 0 && !loading && (
                    <div className="text-center py-12 text-gray-400"><p className="text-lg">Aucun projet sanitaire</p></div>
                  )}
                </div>
              </>
            ) : (
              <div className="space-y-4">
                <StatsDateFilter mode={statsDateMode} from={statsDateFrom} to={statsDateTo} month={statsMonth} year={statsYear}
                  onModeChange={setStatsDateMode} onFromChange={setStatsDateFrom} onToChange={setStatsDateTo} onMonthChange={setStatsMonth} onYearChange={setStatsYear} />

                {/* KPIs */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700 text-center">
                    <p className="text-2xl font-bold text-[#1e3a5f] dark:text-blue-300">{sStatsFiltered.length}</p>
                    <p className="text-xs text-gray-500 mt-1">Projets en cours</p>
                  </div>
                  <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700 text-center">
                    <p className="text-2xl font-bold text-green-600">{sTotalCab}</p>
                    <p className="text-xs text-gray-500 mt-1">Cabines</p>
                  </div>
                  <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700 text-center">
                    <p className="text-2xl font-bold text-blue-600">{sRdvFixe.length}</p>
                    <p className="text-xs text-gray-500 mt-1">RDV fixés</p>
                  </div>
                  <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700 text-center">
                    <p className="text-2xl font-bold text-purple-600">{sTermineCount}</p>
                    <p className="text-xs text-gray-500 mt-1">Terminés</p>
                  </div>
                </div>

                {/* === RÉPARTITION PAR SANITAIRE (entreprise) === */}
                {(() => {
                  const aggBySanitaire = (list: any[]) => {
                    const m: Record<string, { projets: number; cabines: number }> = {};
                    list.forEach((p: any) => {
                      const names: string[] = (p.sanitaireNames && p.sanitaireNames.length > 0) ? p.sanitaireNames : ["Non assigné"];
                      names.forEach((n) => {
                        if (!m[n]) m[n] = { projets: 0, cabines: 0 };
                        m[n].projets++;
                        m[n].cabines += (p.nbCabines || 0);
                      });
                    });
                    return m;
                  };
                  const enCours = aggBySanitaire(sStatsFiltered);
                  const termine = aggBySanitaire(sArchivesFiltered);
                  const allNames = Array.from(new Set([...Object.keys(enCours), ...Object.keys(termine)]));
                  if (allNames.length === 0) return null;
                  const sorted = allNames
                    .map((n) => ({
                      n,
                      ec: enCours[n]?.projets || 0,
                      ecCab: enCours[n]?.cabines || 0,
                      t: termine[n]?.projets || 0,
                      tCab: termine[n]?.cabines || 0,
                    }))
                    .sort((a, b) => (b.ec + b.t) - (a.ec + a.t));
                  return (
                    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
                      <h3 className="font-semibold text-sm mb-3 text-gray-700 dark:text-gray-200">Par entreprise sanitaire</h3>
                      <div className="space-y-2">
                        {sorted.map(({ n, ec, ecCab, t, tCab }) => (
                          <div key={n} className="flex items-center justify-between py-1.5 border-b border-gray-50 dark:border-gray-700 last:border-0">
                            <span className="text-sm text-gray-700 dark:text-gray-300 truncate flex-1 mr-3">{n}</span>
                            <span className="text-xs text-gray-500 whitespace-nowrap">
                              <span className="text-blue-600 dark:text-blue-300">{ec}p · {ecCab}c</span>
                              {" / "}
                              <span className="text-emerald-600 dark:text-emerald-400">{t}p · {tCab}c</span>
                            </span>
                          </div>
                        ))}
                      </div>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-3">
                        <span className="text-blue-600 dark:text-blue-300">●</span> en cours / <span className="text-emerald-600 dark:text-emerald-400">●</span> terminés (p = projets, c = cabines)
                      </p>
                    </div>
                  );
                })()}

                {/* === ACTIVITÉ PAR TYPE === */}
                {(() => {
                  const hasType = (p: any, kw: string) =>
                    Array.isArray(p.typeServices) && p.typeServices.some((t: string) => (t || "").toLowerCase().includes(kw));
                  const stats = [
                    { label: "Mesures", color: "text-cyan-600 dark:text-cyan-300", pred: (p: any) => hasType(p, "mesure") || !!p.dateMesures || !!p.etatMesures },
                    { label: "Montages", color: "text-orange-600 dark:text-orange-300", pred: (p: any) => hasType(p, "montage") },
                    { label: "Services", color: "text-emerald-600 dark:text-emerald-300", pred: (p: any) => hasType(p, "service") },
                    { label: "SAV", color: "text-red-600 dark:text-red-300", pred: (p: any) => p.sav === true || (p.etatSAV && p.etatSAV !== "Aucun SAV") },
                  ];
                  return (
                    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
                      <h3 className="font-semibold text-sm mb-3 text-gray-700 dark:text-gray-200">Activité par type</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {stats.map((s) => {
                          const enCours = sStatsFiltered.filter(s.pred).length;
                          const enCoursCab = sStatsFiltered.filter(s.pred).reduce((sum: number, p: any) => sum + (p.nbCabines || 0), 0);
                          const termine = sArchivesFiltered.filter(s.pred).length;
                          const termineCab = sArchivesFiltered.filter(s.pred).reduce((sum: number, p: any) => sum + (p.nbCabines || 0), 0);
                          return (
                            <div key={s.label} className="rounded-lg border border-gray-100 dark:border-gray-700 p-3">
                              <p className={`text-xs font-semibold uppercase tracking-wider ${s.color}`}>{s.label}</p>
                              <div className="grid grid-cols-2 gap-2 mt-2">
                                <div>
                                  <p className="text-[10px] text-gray-400 dark:text-gray-500">En cours</p>
                                  <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{enCours}</p>
                                  {enCoursCab > 0 && <p className="text-[10px] text-gray-400">{enCoursCab} cab.</p>}
                                </div>
                                <div>
                                  <p className="text-[10px] text-gray-400 dark:text-gray-500">Terminés</p>
                                  <p className="text-xl font-bold text-gray-700 dark:text-gray-300">{termine}</p>
                                  {termineCab > 0 && <p className="text-[10px] text-gray-400">{termineCab} cab.</p>}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* === STATS PRODUITS — cabines par série === */}
                {(() => {
                  const aggBySerie = (list: any[]) => {
                    const m: Record<string, number> = {};
                    list.forEach((p: any) => {
                      (p.seriesCabines || []).forEach((s: string) => {
                        m[s] = (m[s] || 0) + (p.nbCabines || 0);
                      });
                    });
                    return m;
                  };
                  const enCours = aggBySerie(sStatsFiltered);
                  const termine = aggBySerie(sArchivesFiltered);
                  const allSeries = Array.from(new Set([...Object.keys(enCours), ...Object.keys(termine)]));
                  if (allSeries.length === 0) return null;
                  const totalEnCours = Object.values(enCours).reduce((a, b) => a + b, 0);
                  const totalTermine = Object.values(termine).reduce((a, b) => a + b, 0);
                  const sorted = allSeries
                    .map((s) => ({ s, ec: enCours[s] || 0, t: termine[s] || 0, total: (enCours[s] || 0) + (termine[s] || 0) }))
                    .sort((a, b) => b.total - a.total);
                  const max = Math.max(1, ...sorted.map((x) => x.total));
                  return (
                    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
                      <h3 className="font-semibold text-sm mb-3 text-gray-700 dark:text-gray-200">Stats produits — cabines par série</h3>
                      <div className="flex items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400 mb-3">
                        <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-blue-500" />En cours ({totalEnCours})</span>
                        <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-500" />Terminés ({totalTermine})</span>
                      </div>
                      <div className="space-y-2">
                        {sorted.map(({ s, ec, t, total }) => {
                          const ecPct = (ec / max) * 100;
                          const tPct = (t / max) * 100;
                          return (
                            <div key={s}>
                              <div className="flex items-center justify-between text-xs mb-1">
                                <span className="text-gray-700 dark:text-gray-200 truncate">{s}</span>
                                <span className="font-mono text-gray-500 dark:text-gray-400">
                                  {ec > 0 && <span className="text-blue-600 dark:text-blue-300">{ec}</span>}
                                  {ec > 0 && t > 0 && <span> · </span>}
                                  {t > 0 && <span className="text-emerald-600 dark:text-emerald-400">{t}</span>}
                                  <span className="ml-1 text-gray-400">({total})</span>
                                </span>
                              </div>
                              <div className="flex h-2 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                {ec > 0 && <div className="bg-blue-500" style={{ width: `${ecPct}%` }} />}
                                {t > 0 && <div className="bg-emerald-500" style={{ width: `${tPct}%` }} />}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* === TAUX D'ERREUR === */}
                {(() => {
                  type Bucket = { soucis: number; pieces: number; defauts: number; total: number };
                  const compute = (list: any[]): Bucket => ({
                    soucis: list.filter((p) => p.soucisMontage === true).length,
                    pieces: list.filter((p) => (p.infoPiecesManquantes || "").trim().length > 0).length,
                    defauts: list.filter((p) => (p.infoDefautsSignale || "").trim().length > 0).length,
                    total: list.length,
                  });
                  const enCoursB = compute(sStatsFiltered);
                  const termineB = compute(sArchivesFiltered);
                  if (enCoursB.total === 0 && termineB.total === 0) return null;
                  const pct = (n: number, d: number) => d === 0 ? 0 : Math.round((n / d) * 100);
                  const rows: { label: string; key: keyof Bucket; color: string }[] = [
                    { label: "Soucis montage", key: "soucis", color: "bg-orange-500" },
                    { label: "Pièces manquantes", key: "pieces", color: "bg-amber-500" },
                    { label: "Défauts signalés", key: "defauts", color: "bg-red-500" },
                  ];
                  return (
                    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
                      <h3 className="font-semibold text-sm mb-3 text-gray-700 dark:text-gray-200">Taux d&apos;erreur</h3>
                      <div className="grid grid-cols-2 gap-3 mb-3 text-[11px] text-gray-500 dark:text-gray-400">
                        <div>Sur <strong className="text-gray-800 dark:text-gray-200">{enCoursB.total}</strong> projets en cours</div>
                        <div>Sur <strong className="text-gray-800 dark:text-gray-200">{termineB.total}</strong> projets terminés</div>
                      </div>
                      <div className="space-y-3">
                        {rows.map(({ label, key, color }) => {
                          const ec = enCoursB[key] as number;
                          const t = termineB[key] as number;
                          const ecPct = pct(ec, enCoursB.total);
                          const tPct = pct(t, termineB.total);
                          return (
                            <div key={label}>
                              <div className="flex items-center justify-between text-xs mb-1">
                                <span className="text-gray-700 dark:text-gray-200">{label}</span>
                                <span className="font-mono text-gray-500 dark:text-gray-400">
                                  <span className="text-blue-600 dark:text-blue-300">{ec}</span> / <span className="text-emerald-600 dark:text-emerald-400">{t}</span>
                                </span>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <div className="flex items-center gap-1.5">
                                    <div className="flex-1 h-2 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                      <div className={color} style={{ width: `${ecPct}%`, height: "100%" }} />
                                    </div>
                                    <span className="text-[10px] font-mono text-gray-500 w-9 text-right">{ecPct}%</span>
                                  </div>
                                  <p className="text-[9px] text-gray-400 mt-0.5">en cours</p>
                                </div>
                                <div>
                                  <div className="flex items-center gap-1.5">
                                    <div className="flex-1 h-2 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                      <div className={color} style={{ width: `${tPct}%`, height: "100%", opacity: 0.6 }} />
                                    </div>
                                    <span className="text-[10px] font-mono text-gray-500 w-9 text-right">{tPct}%</span>
                                  </div>
                                  <p className="text-[9px] text-gray-400 mt-0.5">déjà exécutés</p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* Prochains RDV */}
                {sRdvFixe.length > 0 && (
                  <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
                    <h3 className="font-semibold text-sm mb-3 text-gray-700 dark:text-gray-200">Prochains RDV fixés</h3>
                    <div className="space-y-2">
                      {sRdvFixe.sort((a,b) => (a.dateMontage||"").localeCompare(b.dateMontage||"")).slice(0, 8).map(p => (
                        <div key={p.id} className="flex items-center justify-between py-1 border-b border-gray-50 dark:border-gray-700 last:border-0">
                          <span className="text-sm text-gray-700 dark:text-gray-300 line-clamp-3 sm:line-clamp-1 max-w-[60%]">{p.projet}</span>
                          <span className="text-xs text-gray-500">{p.dateMontage ? new Date(p.dateMontage).toLocaleDateString("fr-CH", {day:"numeric",month:"short"}) : "—"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* VUE STATS */}
      {mode === "stats" && (() => {
        // Plage effective pour rolling12
        const _r12Today = new Date();
        const statsR12From = new Date(_r12Today.getFullYear() - 1, _r12Today.getMonth(), _r12Today.getDate() + 1).toISOString().split("T")[0];
        const statsR12To   = _r12Today.toISOString().split("T")[0];
        const statsEffFrom = statsDateMode === "rolling12" ? statsR12From : statsDateFrom;
        const statsEffTo   = statsDateMode === "rolling12" ? statsR12To   : statsDateTo;

        // Filter helpers for the 4 databases
        const filterYear = statsDateMode === "year" ? Number(statsYear) : null;
        const filterMonth = statsDateMode === "month" ? statsMonth : null; // "YYYY-MM"
        const filterMonthNum = filterMonth ? Number(filterMonth.split("-")[1]) : null;
        const filterMonthYear = filterMonth ? Number(filterMonth.split("-")[0]) : null;

        // DB1: daily services data
        const svcFiltered = statsServices.filter((r: any) => {
          if (r.objectif) return false; // lignes "Objectif" exclues des chiffres réels
          if (statsDateMode === "year" && filterYear && r.annee !== filterYear) return false;
          if (statsDateMode === "month" && filterMonth && r.mois !== filterMonth) return false;
          if ((statsDateMode === "range" || statsDateMode === "rolling12") && (statsEffFrom || statsEffTo)) {
            const jourNum = r.jour ? parseInt(r.jour, 10) : 1;
            const jour = isNaN(jourNum) ? "01" : String(jourNum).padStart(2, "0");
            let rowDate: string | null = null;
            if (r.mois) rowDate = `${r.mois}-${jour}`;
            else if (r.annee) rowDate = `${r.annee}-01-${jour}`;
            if (!rowDate) return true;
            const fromDate = statsEffFrom || "0000-00-00";
            const toDate   = statsEffTo   || "9999-12-31";
            if (rowDate < fromDate || rowDate > toDate) return false;
          }
          return true;
        });

        // Aggregate DB1 by month for tendance (last 12 months or filtered)
        const monthNames12 = ["Jan", "Fev", "Mar", "Avr", "Mai", "Jun", "Jul", "Aou", "Sep", "Oct", "Nov", "Dec"];
        const svcByMonth: Record<string, { mesures: number; cabines: number; montages: number; demontages: number; services: number; sav: number; ofr: number; ca: number }> = {};
        svcFiltered.forEach((r: any) => {
          const key = r.mois || "unknown";
          if (key === "unknown") return;
          if (!svcByMonth[key]) svcByMonth[key] = { mesures: 0, cabines: 0, montages: 0, demontages: 0, services: 0, sav: 0, ofr: 0, ca: 0 };
          svcByMonth[key].mesures += r.mesures;
          svcByMonth[key].cabines += r.cabines;
          svcByMonth[key].montages += r.montages;
          svcByMonth[key].demontages += r.demontages;
          svcByMonth[key].services += r.services;
          svcByMonth[key].sav += r.sav;
          svcByMonth[key].ofr += r.ofr;
          svcByMonth[key].ca += r.ca;
        });
        const monthlyKeys = Object.keys(svcByMonth).sort();
        const last12 = monthlyKeys.slice(-12);

        // KPIs from DB1
        const totalMesures = svcFiltered.reduce((s: number, r: any) => s + r.mesures, 0);
        const totalMontages = svcFiltered.reduce((s: number, r: any) => s + r.montages, 0);
        const totalCabines = svcFiltered.reduce((s: number, r: any) => s + r.cabines, 0);
        const totalCA = svcFiltered.reduce((s: number, r: any) => s + r.ca, 0);
        const totalServices = svcFiltered.reduce((s: number, r: any) => s + r.services, 0);
        const totalSAV = svcFiltered.reduce((s: number, r: any) => s + r.sav, 0);
        const totalOFR = svcFiltered.reduce((s: number, r: any) => s + r.ofr, 0);

        // ── Période B (mode comparaison) ──────────────────────────────────
        const filterBYear = statsBMode === "year" ? Number(statsBYear) : null;
        const filterBMonth = statsBMode === "month" ? statsBMonth : null;
        const svcFilteredB = statsCompare ? statsServices.filter((r: any) => {
          if (r.objectif) return false; // lignes "Objectif" exclues des chiffres réels
          if (statsBMode === "year" && filterBYear && r.annee !== filterBYear) return false;
          if (statsBMode === "month" && filterBMonth && r.mois !== filterBMonth) return false;
          if (statsBMode === "range" && (statsBFrom || statsBTo)) {
            const jourNum = r.jour ? parseInt(r.jour, 10) : 1;
            const jour = isNaN(jourNum) ? "01" : String(jourNum).padStart(2, "0");
            const rowDate = r.mois ? `${r.mois}-${jour}` : null;
            if (!rowDate) return true;
            if (statsBFrom && rowDate < statsBFrom) return false;
            if (statsBTo && rowDate > statsBTo) return false;
          }
          return true;
        }) : [];
        const bMontages  = svcFilteredB.reduce((s: number, r: any) => s + r.montages, 0);
        const bCabines   = svcFilteredB.reduce((s: number, r: any) => s + r.cabines, 0);
        const bMesures   = svcFilteredB.reduce((s: number, r: any) => s + r.mesures, 0);
        const bCA        = svcFilteredB.reduce((s: number, r: any) => s + r.ca, 0);
        const bServices  = svcFilteredB.reduce((s: number, r: any) => s + r.services, 0);
        const bSAV       = svcFilteredB.reduce((s: number, r: any) => s + r.sav, 0);
        const bOFR       = svcFilteredB.reduce((s: number, r: any) => s + r.ofr, 0);

        /** Delta formaté : "+12%" / "-5%" / "=" */
        const delta = (a: number, b: number) => {
          if (b === 0 && a === 0) return null;
          if (b === 0) return { pct: null, up: true, label: "Nouveau" };
          const pct = Math.round(((a - b) / b) * 100);
          return { pct, up: pct >= 0, label: pct === 0 ? "=" : `${pct > 0 ? "+" : ""}${pct}%` };
        };

        // DB2: clients by type
        const cliByYear = statsClients.filter((r: any) => {
          if (statsDateMode === "year" && filterYear && r.annee !== filterYear) return false;
          if ((statsDateMode === "range" || statsDateMode === "rolling12") && filterYear && r.annee !== filterYear) return false;
          return true;
        });
        // Group clients by name, sum monthly across years
        const cliGrouped: Record<string, any> = {};
        cliByYear.forEach((r: any) => {
          const name = r.client;
          if (!cliGrouped[name]) {
            cliGrouped[name] = { ...r, monthly: { ...r.monthly }, total: r.total || 0 };
          } else {
            Object.keys(r.monthly || {}).forEach((m: string) => {
              cliGrouped[name].monthly[m] = (cliGrouped[name].monthly[m] || 0) + (r.monthly[m] || 0);
            });
            cliGrouped[name].total = (cliGrouped[name].total || 0) + (r.total || 0);
          }
        });
        const cliFiltered = Object.values(cliGrouped);
        const MOIS_NAMES = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
        const typeClientAgg: Record<string, number> = {};
        cliFiltered.forEach((r: any) => {
          const tc = r.typeClient || "Non defini";
          let val = 0;
          if (filterMonthNum && filterMonthYear) {
            val = r.monthly[MOIS_NAMES[filterMonthNum - 1]] || 0;
          } else {
            val = r.total || Object.values(r.monthly as Record<string, number>).reduce((a: number, b: number) => a + b, 0);
          }
          typeClientAgg[tc] = (typeClientAgg[tc] || 0) + val;
        });
        const typeClientStats = Object.entries(typeClientAgg).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);

        // Grossiste vs Fournisseur from DB2
        const grossisteTotal = typeClientAgg["Grossiste"] || 0;
        const fournisseurTotal = typeClientAgg["Fournisseur"] || 0;
        const sanitaireTotal = typeClientAgg["Sanitaire"] || 0;
        const gfTotal = grossisteTotal + fournisseurTotal + sanitaireTotal;

        // DB3: marques — group by name, sum monthly across years
        const mrqByYear = statsMarques.filter((r: any) => {
          if (statsDateMode === "year" && filterYear && r.annee !== filterYear) return false;
          if ((statsDateMode === "range" || statsDateMode === "rolling12") && filterYear && r.annee !== filterYear) return false;
          return true;
        });
        const mrqGrouped: Record<string, any> = {};
        mrqByYear.forEach((r: any) => {
          const name = r.marque;
          if (!mrqGrouped[name]) {
            mrqGrouped[name] = { ...r, monthly: { ...r.monthly }, total: r.total || 0 };
          } else {
            // Sum monthly values
            Object.keys(r.monthly || {}).forEach((m: string) => {
              mrqGrouped[name].monthly[m] = (mrqGrouped[name].monthly[m] || 0) + (r.monthly[m] || 0);
            });
            mrqGrouped[name].total = (mrqGrouped[name].total || 0) + (r.total || 0);
          }
        });
        const mrqFiltered = Object.values(mrqGrouped);

        // DB4: series
        const serByYear = statsSeries.filter((r: any) => {
          if (statsDateMode === "year" && filterYear && r.annee !== filterYear) return false;
          if ((statsDateMode === "range" || statsDateMode === "rolling12") && filterYear && r.annee !== filterYear) return false;
          return true;
        });
        // Group series by fournisseur+serie name, sum counts across years
        const seriesByFournisseur: Record<string, { serie: string; count: number }[]> = {};
        const serDedup: Record<string, number> = {};
        serByYear.forEach((r: any) => {
          const f = r.fournisseur || "Autre";
          const key = `${f}::${r.serie}`;
          serDedup[key] = (serDedup[key] || 0) + (r.count || 0);
        });
        Object.entries(serDedup).forEach(([key, count]) => {
          const [f, serie] = key.split("::");
          if (!seriesByFournisseur[f]) seriesByFournisseur[f] = [];
          seriesByFournisseur[f].push({ serie, count });
        });
        Object.values(seriesByFournisseur).forEach((arr) => arr.sort((a, b) => b.count - a.count));

        // Collaborator stats — tous les projets clôturés (cmd + services + sav terminés)
        // + projets actifs dont la date de montage est passée (réalisés mais pas encore clôturés)
        const todayForStats = new Date().toISOString().split("T")[0];
        const allProjectsRaw: Project[] = (() => {
          const seenIds = new Set<string>();
          const add = (list: Project[]) => list.filter(p => !seenIds.has(p.id) && !!seenIds.add(p.id));
          // 1. Projets clôturés (toutes sources)
          const terminated = [
            ...add(projectsData["cmd-termine"] || []),
            ...add(projectsData["services-termine"] || []),
            ...add(projectsData["sav-termine"] || []),
            ...add(projectsData["mesures-termine"] || []),
          ];
          // 2. Projets actifs dont le montage est déjà passé (clôture pas encore faite dans Notion)
          const active = [
            ...(projectsData["cmd"] || []),
            ...(projectsData["services"] || []),
            ...(projectsData["sav"] || []),
          ].filter(p => {
            const date = (p.dateMontage || "").split("T")[0];
            return date && date <= todayForStats;
          });
          add(active);
          return [...terminated, ...active.filter(p => !terminated.some(t => t.id === p.id))];
        })();
        const allProjects: Project[] = filterByStatsDate(allProjectsRaw, statsDateMode, statsDateFrom, statsDateTo, statsMonth, statsYear);

        // Helper: split collaborateurs field into array of trimmed names
        const splitCollabs = (p: Project): string[] =>
          (p.collaborateurs || "").split("&").map((n) => n.trim()).filter(Boolean);

        // SAV helpers
        const hasSAV = (p: Project) => p.sav === true || (p.etatSAV && p.etatSAV !== "Aucun SAV");
        const isFournisseurSAV = (p: Project) => hasSAV(p) && (p.causeSAV || "").toLowerCase().includes("fournisseur");
        const isTMSAV = (p: Project) => hasSAV(p) && (p.causeSAV || "").toLowerCase().includes("tm");

        // Mesures par collaborateur — on agrège TOUTES les sources disponibles
        // et on garde uniquement celles qui ont un dateMesures (mesures faites).
        // L'endpoint "mesures-termine" retourne [] (TODO non implémenté), d'où ce contournement.
        const allMesuresRaw: Project[] = [
          ...(projectsData["cmd-termine"] || []),
          ...(projectsData["services-termine"] || []),
          ...(projectsData["sav-termine"] || []),
          ...(projectsData["archives"] || []),
          ...(projectsData["cmd"] || []),
          ...(projectsData["services"] || []),
          ...(projectsData["sav"] || []),
          ...(projectsData["mesures"] || []),
          ...(projectsData["mesures-sans-commande"] || []),
        ].filter((p, i, arr) => {
          if (!(p.dateMesures || "").split("T")[0]) return false; // mesures faites = dateMesures renseigné
          return arr.findIndex(x => x.id === p.id) === i; // dédupliquer
        });
        const filterMesuresByMode = (list: Project[], mode: string, from: string, to: string, month: string, year: string) => {
          if (mode === "all") return list;
          const effFrom = mode === "rolling12" ? statsR12From : from;
          const effTo   = mode === "rolling12" ? statsR12To   : to;
          return list.filter(p => {
            const d = (p.dateMesures || "").split("T")[0];
            if (!d) return false;
            if (mode === "range" || mode === "rolling12") { if (effFrom && d < effFrom) return false; if (effTo && d > effTo) return false; return true; }
            if (mode === "month") return d.startsWith(month);
            if (mode === "year") return d.startsWith(year);
            return true;
          });
        };
        const allMesures = filterMesuresByMode(allMesuresRaw, statsDateMode, statsDateFrom, statsDateTo, statsMonth, statsYear);
        const allMesuresB = statsCompare ? filterMesuresByMode(allMesuresRaw, statsBMode, statsBFrom, statsBTo, statsBMonth, statsBYear) : [];

        // Solo only (1 collaborateur)
        const buildCollabStats = (projects: Project[], mesuresProjects: Project[]) => COLLABORATEURS_LIST.map((name) => {
          const nl = name.toLowerCase();
          const soloProjects = projects.filter((p) => {
            const c = splitCollabs(p);
            return c.length === 1 && c[0].toLowerCase() === nl;
          });
          const soloMesures = mesuresProjects.filter((p) => {
            // Les mesures utilisent "mesuresTraiteePar", pas "collaborateurs"
            const traiteePar = (p.mesuresTraiteePar || "").trim().toLowerCase();
            return traiteePar === nl;
          });
          const cabines = soloProjects.reduce((s, p) => s + (p.nbCabines || 0), 0);
          const soucisCount = soloProjects.filter((p) => p.soucisMontage).length;
          const soucisRate = soloProjects.length > 0 ? Math.round((soucisCount / soloProjects.length) * 100) : 0;
          const savProjects = soloProjects.filter(hasSAV);
          const savCount = savProjects.length;
          const savFournisseurCount = savProjects.filter(isFournisseurSAV).length;
          const savFournisseurPct = savCount > 0 ? Math.round((savFournisseurCount / savCount) * 100) : 0;
          const savPersonnelCount = savProjects.filter(isTMSAV).length;
          const savRate = soloProjects.length > 0 ? Math.round((savCount / soloProjects.length) * 100) : 0;
          return { name, projects: soloProjects.length, mesures: soloMesures.length, cabines, soucisCount, soucisRate, savCount, savRate, savFournisseurCount, savFournisseurPct, savPersonnelCount };
        }).sort((a, b) => b.cabines - a.cabines);

        // Binôme (exactement 2 collaborateurs) — groupé par paire canonique
        const buildBinomeStats = (projects: Project[]) => {
          const map = new Map<string, { label: string; projects: number; cabines: number; soucisCount: number; savCount: number; savFournisseurCount: number; savFournisseurPct: number; savPersonnelCount: number }>();
          projects.forEach((p) => {
            const collabs = splitCollabs(p);
            if (collabs.length !== 2) return;
            const key = [...collabs].sort((a, b) => a.localeCompare(b, "fr")).join(" & ");
            const existing = map.get(key);
            if (existing) {
              existing.projects++;
              existing.cabines += p.nbCabines || 0;
              existing.soucisCount += p.soucisMontage ? 1 : 0;
              if (hasSAV(p)) { existing.savCount++; if (isFournisseurSAV(p)) existing.savFournisseurCount++; if (isTMSAV(p)) existing.savPersonnelCount++; }
            } else {
              map.set(key, { label: key, projects: 1, cabines: p.nbCabines || 0, soucisCount: p.soucisMontage ? 1 : 0, savCount: hasSAV(p) ? 1 : 0, savFournisseurCount: isFournisseurSAV(p) ? 1 : 0, savFournisseurPct: 0, savPersonnelCount: isTMSAV(p) ? 1 : 0 });
            }
          });
          return Array.from(map.values())
            .map((b) => ({ ...b, soucisRate: b.projects > 0 ? Math.round((b.soucisCount / b.projects) * 100) : 0, savFournisseurPct: b.savCount > 0 ? Math.round((b.savFournisseurCount / b.savCount) * 100) : 0 }))
            .sort((a, b) => b.cabines - a.cabines);
        };

        // Team TM — projets dont le champ collaborateurs contient "team tm"
        const buildTeamTMStats = (projects: Project[]) => {
          const ps = projects.filter((p) => (p.collaborateurs || "").toLowerCase().includes("team tm"));
          const cabines = ps.reduce((s, p) => s + (p.nbCabines || 0), 0);
          const soucisCount = ps.filter((p) => p.soucisMontage).length;
          const savPs = ps.filter(hasSAV);
          const savCount = savPs.length;
          const savFournisseurCount = savPs.filter(isFournisseurSAV).length;
          const savPersonnelCount = savPs.filter(isTMSAV).length;
          return {
            projects: ps.length,
            cabines,
            soucisCount,
            soucisRate: ps.length > 0 ? Math.round((soucisCount / ps.length) * 100) : 0,
            savCount,
            savFournisseurCount,
            savFournisseurPct: savCount > 0 ? Math.round((savFournisseurCount / savCount) * 100) : 0,
            savPersonnelCount,
            savRate: ps.length > 0 ? Math.round((savCount / ps.length) * 100) : 0,
          };
        };

        const collabStats = buildCollabStats(allProjects, allMesures);
        const binomeStats = buildBinomeStats(allProjects);
        const teamTMStats = buildTeamTMStats(allProjects);
        const allProjectsB: Project[] = statsCompare
          ? filterByStatsDate(allProjectsRaw, statsBMode, statsBFrom, statsBTo, statsBMonth, statsBYear)
          : [];
        const collabStatsB = statsCompare ? buildCollabStats(allProjectsB, allMesuresB) : [];
        const binomeStatsB = statsCompare ? buildBinomeStats(allProjectsB) : [];
        const teamTMStatsB = statsCompare ? buildTeamTMStats(allProjectsB) : null;

        const expandedSections = statsExpandedSections;
        const toggleSection = (s: string) => {
          setStatsExpandedSections((prev) => {
            const next = new Set(prev);
            if (next.has(s)) next.delete(s); else next.add(s);
            return next;
          });
        };

        return (
          <div className="space-y-4" key={`stats-${statsDateMode}-${statsYear}-${statsMonth}`}>
            {statsLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            )}

            {/* Filtre de dates + bouton VS — sticky */}
            <div className="sticky z-30 -mx-4 px-4 pt-2 pb-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm shadow-sm" style={{top: `calc(var(--header-h, 60px) + var(--navbar-h, 48px))`}}>
              {/* Période A */}
              <div className="flex items-center gap-2 mb-1">
                {statsCompare && <span className="text-[10px] font-bold text-blue-600 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-full">A</span>}
                <span className="text-[10px] text-gray-400 flex-1">{statsCompare ? "Période de référence" : ""}</span>
                <button
                  onClick={() => setStatsCompare((v) => !v)}
                  className={`text-[10px] font-bold px-3 py-1.5 rounded-full border transition-colors ${statsCompare ? "bg-orange-500 text-white border-orange-500" : "border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-orange-400 hover:text-orange-500"}`}
                >
                  ⚡ VS
                </button>
              </div>
              <StatsDateFilter mode={statsDateMode} from={statsDateFrom} to={statsDateTo} month={statsMonth} year={statsYear}
                onModeChange={setStatsDateMode} onFromChange={setStatsDateFrom} onToChange={setStatsDateTo} onMonthChange={setStatsMonth} onYearChange={setStatsYear} />

              {/* Période B */}
              {statsCompare && (
                <>
                  <div className="flex items-center gap-2 mb-1 mt-2">
                    <span className="text-[10px] font-bold text-orange-500 bg-orange-50 dark:bg-orange-900/30 px-2 py-0.5 rounded-full">B</span>
                    <span className="text-[10px] text-gray-400">Période comparée</span>
                  </div>
                  <StatsDateFilter mode={statsBMode} from={statsBFrom} to={statsBTo} month={statsBMonth} year={statsBYear}
                    onModeChange={setStatsBMode} onFromChange={setStatsBFrom} onToChange={setStatsBTo} onMonthChange={setStatsBMonth} onYearChange={setStatsBYear} />
                </>
              )}
            </div> {/* fin sticky */}

            {/* KPIs */}
            <div>
              <button onClick={() => toggleSection("kpis")} className="flex items-center gap-2 text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 w-full text-left">
                {expandedSections.has("kpis") ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                Indicateurs cles
              </button>
              {expandedSections.has("kpis") && (() => {
                const totalDemontages = svcFiltered.reduce((s: number, r: any) => s + r.demontages, 0);
                const bDemontages = svcFilteredB.reduce((s: number, r: any) => s + r.demontages, 0);
                const savPct = totalMontages > 0 ? ((totalSAV / totalMontages) * 100).toFixed(1) : null;
                const kpis = [
                  { label: "Montages",       valA: totalMontages, valB: bMontages,  color: "text-[#1e3a5f] dark:text-white",  size: "text-3xl" },
                  { label: "Cabines mesurées",valA: totalCabines,  valB: bCabines,   color: "text-[#1e3a5f] dark:text-white",  size: "text-3xl" },
                  { label: "Mesures",        valA: totalMesures,  valB: bMesures,   color: "text-green-600",                   size: "text-3xl" },
                  { label: "CA (CHF)",       valA: totalCA,       valB: bCA,        color: "text-blue-600",                    size: "text-3xl", fmt: (v: number) => v > 0 ? `${(v / 1000).toFixed(0)}k` : "0" },
                  { label: "Services",       valA: totalServices, valB: bServices,  color: "text-purple-600",                  size: "text-2xl" },
                  { label: "SAV",            valA: totalSAV,      valB: bSAV,       color: "text-red-500",                     size: "text-2xl", sub: savPct ? `${savPct}% des montages` : undefined },
                  { label: "Offres",         valA: totalOFR,      valB: bOFR,       color: "text-amber-600",                   size: "text-2xl" },
                  { label: "Demontages",     valA: totalDemontages,valB: bDemontages,color: "text-teal-600",                   size: "text-2xl" },
                ];
                return (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {kpis.map(({ label, valA, valB, color, size, fmt, sub }: any) => {
                      const display = fmt ? fmt : (v: number) => String(v);
                      const d = statsCompare ? delta(valA, valB) : null;
                      return (
                        <div key={label} className="glass-card rounded-2xl p-4 text-center">
                          {statsCompare ? (
                            <>
                              <div className="flex items-end justify-center gap-3">
                                <div>
                                  <p className={`${size} font-bold ${color}`}>{display(valA)}</p>
                                  <p className="text-[9px] font-semibold text-blue-500 mt-0.5">A</p>
                                </div>
                                <div className="pb-4 text-gray-300 dark:text-gray-600 font-light text-lg">|</div>
                                <div>
                                  <p className="text-xl font-semibold text-orange-400">{display(valB)}</p>
                                  <p className="text-[9px] font-semibold text-orange-400 mt-0.5">B</p>
                                </div>
                              </div>
                              {d && (
                                <p className={`text-[11px] font-bold mt-1 ${d.pct === 0 ? "text-gray-400" : d.up ? "text-green-500" : "text-red-500"}`}>
                                  {d.label}
                                </p>
                              )}
                            </>
                          ) : (
                            <p className={`${size} font-bold ${color}`}>{display(valA)}</p>
                          )}
                          <p className="text-xs text-gray-500 mt-1">{label}</p>
                          {sub && <p className="text-[10px] text-red-400 dark:text-red-500 mt-0.5 font-medium">{sub}</p>}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* Tendance mensuelle (12 mois) from DB1 */}
            <div>
              {(() => {
                const monthlyChartType = chartTypePrefs["monthly"] || "bar-h";
                const monthlySeries = [
                  { key: "mesures",    label: "Mesures",    color: "#06b6d4" },
                  { key: "cabines",    label: "Cabines",    color: "#22c55e" },
                  { key: "montages",   label: "Montages",   color: "#f97316" },
                  { key: "demontages", label: "Démontages", color: "#fb7185" },
                  { key: "services",   label: "Services",   color: "#10b981" },
                  { key: "sav",        label: "SAV",        color: "#f87171" },
                  { key: "ofr",        label: "Nb. OFR",    color: "#3b82f6" },
                ];
                const monthlyData = last12.map((key) => {
                  const [yy, mm] = key.split("-");
                  return { label: `${monthNames12[Number(mm) - 1]} ${yy.slice(2)}`, values: svcByMonth[key] as Record<string, number> };
                });
                return (
                  <button onClick={() => toggleSection("monthly")} className="flex items-center gap-2 text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 w-full text-left">
                    {expandedSections.has("monthly") ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    Tendance mensuelle (12 mois)
                    <ChartTypeSelector value={monthlyChartType} onChange={(t) => setChartType("monthly", t)} types={["bar-h", "line", "area", "bar-v", "bar-stack", "area-stack"]} />
                  </button>
                );
              })()}
              {expandedSections.has("monthly") && (() => {
                const monthlyChartType = chartTypePrefs["monthly"] || "bar-h";
                const monthlySeries = [
                  { key: "mesures",    label: "Mesures",    color: "#06b6d4" },
                  { key: "cabines",    label: "Cabines",    color: "#22c55e" },
                  { key: "montages",   label: "Montages",   color: "#f97316" },
                  { key: "demontages", label: "Démontages", color: "#fb7185" },
                  { key: "services",   label: "Services",   color: "#10b981" },
                  { key: "sav",        label: "SAV",        color: "#f87171" },
                  { key: "ofr",        label: "Nb. OFR",    color: "#3b82f6" },
                ];
                const monthlyData = last12.map((key) => {
                  const [yy, mm] = key.split("-");
                  return { label: `${monthNames12[Number(mm) - 1]} ${yy.slice(2)}`, values: svcByMonth[key] as Record<string, number> };
                });
                return (
                  <div className="glass-card rounded-2xl p-4">
                    {monthlyChartType === "line" || monthlyChartType === "area" ? (
                      <TimeSeriesChart data={monthlyData} series={monthlySeries} chartType={monthlyChartType} height={170} />
                    ) : monthlyChartType === "bar-v" ? (
                      <MultiColumnChart data={monthlyData} series={monthlySeries} />
                    ) : monthlyChartType === "bar-stack" ? (
                      <StackedBarChart data={monthlyData} series={monthlySeries} />
                    ) : monthlyChartType === "area-stack" ? (
                      <StackedAreaChart data={monthlyData} series={monthlySeries} />
                    ) : (
                      /* bar-h — vue actuelle */
                      <div className="space-y-3">
                        {last12.map((key) => {
                          const d = svcByMonth[key];
                          const [yy, mm] = key.split("-");
                          const label = `${monthNames12[Number(mm) - 1]} ${yy}`;
                          const maxVal = Math.max(...last12.map((k) => Math.max(svcByMonth[k].montages, svcByMonth[k].cabines, svcByMonth[k].mesures, svcByMonth[k].ofr)), 1);
                          const bars = [
                            { label: "Mesures",    val: d.mesures,    color: "bg-cyan-500" },
                            { label: "Cabines",    val: d.cabines,    color: "bg-green-500" },
                            { label: "Montages",   val: d.montages,   color: "bg-orange-500" },
                            { label: "Démontages", val: d.demontages, color: "bg-rose-500" },
                            { label: "Services",   val: d.services,   color: "bg-emerald-500" },
                            { label: "SAV",        val: d.sav,        color: "bg-red-400" },
                            { label: "Nb. OFR",    val: d.ofr,        color: "bg-blue-500" },
                          ];
                          return (
                            <div key={key}>
                              <div className="flex items-center gap-3 mb-1">
                                <span className="text-xs font-medium text-gray-500 w-20 shrink-0">{label}</span>
                                <span className="text-[10px] text-gray-400 ml-auto">CA: {d.ca > 0 ? `${(d.ca / 1000).toFixed(1)}k` : "0"}</span>
                              </div>
                              <div className="space-y-0.5 ml-[84px]">
                                {bars.filter((b) => b.val > 0).map((b) => (
                                  <div key={b.label} className="flex items-center gap-2">
                                    <span className="text-[9px] text-gray-400 w-14 shrink-0">{b.label}</span>
                                    <div className="flex-1 h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                      <div className={`h-full ${b.color} rounded-full transition-all`}
                                        style={{ width: `${Math.max((b.val / maxVal) * 100, 3)}%` }} />
                                    </div>
                                    <span className="text-[10px] font-bold text-gray-700 dark:text-gray-200 tabular-nums w-9 shrink-0 text-right">{b.val}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                        {last12.length === 0 && <p className="text-xs text-gray-400 text-center py-4">Aucune donnée pour cette période</p>}
                      </div>
                    )}
                    {/* Légende couleur → métrique (les vues ligne/aire/colonnes
                        n'ont pas de libellé inline comme la vue barres). */}
                    {monthlyChartType !== "bar-h" && (
                      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                        {monthlySeries.map((s) => (
                          <span key={s.key} className="flex items-center gap-1.5 text-[11px] text-gray-600 dark:text-gray-300">
                            <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                            {s.label}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Comparaison annuelle — une stat isolée, une ligne par année */}
            <div>
              <button onClick={() => toggleSection("compare")} className="flex items-center gap-2 text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 w-full text-left">
                {expandedSections.has("compare") ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                Comparaison annuelle
                <ChartTypeSelector value={chartTypePrefs["compare"] || "line"} onChange={(t) => setChartType("compare", t)} types={["line", "area"]} />
              </button>
              {expandedSections.has("compare") && (() => {
                const compareType = chartTypePrefs["compare"] || "line";
                const METRICS = [
                  { key: "montages",   label: "Montages" },
                  { key: "cabines",    label: "Cabines" },
                  { key: "mesures",    label: "Mesures" },
                  { key: "services",   label: "Services" },
                  { key: "sav",        label: "SAV" },
                  { key: "demontages", label: "Démontages" },
                  { key: "ofr",        label: "Nb. OFR" },
                  { key: "ca",         label: "CA" },
                ];
                const metric = METRICS.some((m) => m.key === compareMetric) ? compareMetric : "montages";
                // Objectif disponible uniquement pour Montages / Mesures / CA.
                const OBJECTIF_METRICS = ["montages", "mesures", "ca"];
                // Agrège la base journalière par (mois 1-12, clé série) pour la stat choisie.
                // Clé série = année (ex. "2026") ou "Objectif" pour les lignes cibles.
                const agg: Record<number, Record<string, number>> = {};
                const yearSet = new Set<number>();
                let hasObjectif = false;
                statsServices.forEach((r: any) => {
                  const mn = Number(r.moisNum);
                  if (!mn || mn < 1 || mn > 12) return;
                  const val = Number(r[metric]) || 0;
                  if (r.objectif) {
                    if (!OBJECTIF_METRICS.includes(metric)) return;
                    agg[mn] = agg[mn] || {};
                    agg[mn]["Objectif"] = (agg[mn]["Objectif"] || 0) + val;
                    if (val > 0) hasObjectif = true;
                    return;
                  }
                  const y = typeof r.annee === "number" ? r.annee : Number(r.annee);
                  if (!y) return;
                  yearSet.add(y);
                  agg[mn] = agg[mn] || {};
                  agg[mn][String(y)] = (agg[mn][String(y)] || 0) + val;
                });
                const years = [...yearSet].sort((a, b) => a - b);
                const YEAR_COLORS = ["#22c55e", "#f97316", "#ec4899", "#3b82f6", "#06b6d4", "#a855f7", "#eab308"];
                const series = years.map((y, i) => ({ key: String(y), label: String(y), color: YEAR_COLORS[i % YEAR_COLORS.length] }));
                if (hasObjectif) series.push({ key: "Objectif", label: "Objectif", color: "#ef4444" });
                const seriesKeys = series.map((s) => s.key);
                const compareData = Array.from({ length: 12 }, (_, m) => {
                  const values: Record<string, number> = {};
                  seriesKeys.forEach((k) => { values[k] = agg[m + 1]?.[k] || 0; });
                  return { label: monthNames12[m], values };
                });
                const legendSeries = series.filter((s) => compareData.some((d) => (d.values[s.key] || 0) > 0));
                return (
                  <div className="glass-card rounded-2xl p-4">
                    {/* Sélecteur de la statistique à isoler */}
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {METRICS.map((mt) => (
                        <button key={mt.key} onClick={() => setCompareMetric(mt.key)}
                          className={`text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${
                            metric === mt.key
                              ? "bg-[#1e3a5f] text-white shadow-sm"
                              : "bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-700"
                          }`}>
                          {mt.label}
                        </button>
                      ))}
                    </div>
                    {years.length === 0
                      ? <p className="text-xs text-gray-400 text-center py-4">Aucune donnée</p>
                      : <TimeSeriesChart data={compareData} series={series} chartType={compareType === "area" ? "area" : "line"} height={180} />
                    }
                    {/* Légende des années */}
                    {legendSeries.length > 0 && (
                      <div className="flex flex-wrap gap-3 justify-center mt-2">
                        {legendSeries.map((s) => (
                          <span key={s.key} className="inline-flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                            {s.label}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Collaborators breakdown */}
            <div>
              <button onClick={() => toggleSection("collabs")} className="flex items-center gap-2 text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 w-full text-left">
                {expandedSections.has("collabs") ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                Par collaborateur
                <span className="text-[10px] font-normal text-gray-400 normal-case tracking-normal">solo</span>
                <ChartTypeSelector value={chartTypePrefs["collabs"] || "bar-h"} onChange={(t) => setChartType("collabs", t)} types={["bar-h", "bar-v", "donut", "pie", "treemap", "radar"]} />
              </button>
              {expandedSections.has("collabs") && (() => {
                const ct = chartTypePrefs["collabs"] || "bar-h";
                const distribData = collabStats.filter((cs) => cs.cabines > 0)
                  .map((cs) => ({ label: cs.name.split(" ")[0], value: cs.cabines, color: getCollaboratorColor(cs.name).dot }));
                if (ct === "donut") return <div className="glass-card rounded-2xl p-4"><DonutChart data={distribData} /></div>;
                if (ct === "pie")   return <div className="glass-card rounded-2xl p-4"><PieChart2 data={distribData} /></div>;
                if (ct === "treemap") return <div className="glass-card rounded-2xl p-4"><TreemapChart data={distribData} /></div>;
                if (ct === "radar") return <div className="glass-card rounded-2xl p-4"><RadarChart data={distribData} /></div>;
                if (ct === "bar-v") return <div className="glass-card rounded-2xl p-4"><ColumnChart data={distribData} /></div>;
                return (
                  <div className="space-y-2">
                    {collabStats.filter((cs) => cs.projects > 0 || (statsCompare && collabStatsB.find(b => b.name === cs.name && b.projects > 0))).map((cs) => {
                      const colors = getCollaboratorColor(cs.name);
                      const maxCollabProjects = Math.max(...collabStats.map((c) => c.projects), 1);
                      const csB = statsCompare ? (collabStatsB.find((b) => b.name === cs.name) ?? { projects: 0, mesures: 0, cabines: 0, soucisCount: 0, soucisRate: 0, savCount: 0, savRate: 0, savFournisseurCount: 0, savFournisseurPct: 0, savPersonnelCount: 0 }) : null;
                      const savRateColor = cs.savRate > 10 ? "text-red-500" : cs.savRate > 5 ? "text-orange-500" : cs.savRate > 0 ? "text-yellow-500" : "text-gray-400";
                      return (
                        <div key={cs.name} className="glass-card rounded-2xl p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: colors.dot }} />
                            <span className="text-sm font-semibold">{cs.name}</span>
                            <span className="ml-auto text-xs text-gray-500">
                              {statsCompare
                                ? <><span className="text-blue-500 font-bold">{cs.projects}A</span> <span className="text-gray-300">|</span> <span className="text-orange-400 font-bold">{csB!.projects}B</span> projets</>
                                : <>{cs.projects} projet{cs.projects > 1 ? "s" : ""}</>}
                            </span>
                          </div>
                          {/* 3 colonnes : [Cabines+Mesures] [Soucis+Taux soucis] [SAV+Taux SAV] */}
                          <div className="grid grid-cols-3 gap-3 text-center mb-3">
                            {/* Colonne 1 : Cabines + Mesures */}
                            <div className="space-y-2">
                              <div>
                                {statsCompare ? (<div className="flex items-end justify-center gap-1"><p className="text-xl font-bold text-[#1e3a5f] dark:text-white">{cs.cabines}</p><p className="text-sm font-semibold text-orange-400 mb-0.5">/{csB!.cabines}</p></div>) : (<p className="text-xl font-bold text-[#1e3a5f] dark:text-white">{cs.cabines}</p>)}
                                <p className="text-[10px] text-gray-400">cabines</p>
                              </div>
                              <div>
                                {statsCompare ? (<div className="flex items-end justify-center gap-1"><p className="text-lg font-bold text-cyan-600 dark:text-cyan-400">{cs.mesures}</p><p className="text-sm font-semibold text-orange-400 mb-0.5">/{csB!.mesures}</p></div>) : (<p className="text-lg font-bold text-cyan-600 dark:text-cyan-400">{cs.mesures}</p>)}
                                <p className="text-[10px] text-gray-400">mesures</p>
                              </div>
                            </div>
                            {/* Colonne 2 : Soucis + Taux soucis */}
                            <div className="space-y-2 border-x border-gray-100 dark:border-gray-700">
                              <div>
                                {statsCompare ? (<div className="flex items-end justify-center gap-1"><p className="text-xl font-bold text-[#1e3a5f] dark:text-white">{cs.soucisCount}</p><p className="text-sm font-semibold text-orange-400 mb-0.5">/{csB!.soucisCount}</p></div>) : (<p className="text-xl font-bold text-[#1e3a5f] dark:text-white">{cs.soucisCount}</p>)}
                                <p className="text-[10px] text-gray-400">soucis</p>
                              </div>
                              <div>
                                {statsCompare ? (<div className="flex items-end justify-center gap-1"><p className={`text-lg font-bold ${cs.soucisRate > 20 ? "text-red-500" : cs.soucisRate > 10 ? "text-yellow-500" : "text-green-500"}`}>{cs.soucisRate}%</p><p className="text-sm font-semibold text-orange-400 mb-0.5">/{csB!.soucisRate}%</p></div>) : (<p className={`text-lg font-bold ${cs.soucisRate > 20 ? "text-red-500" : cs.soucisRate > 10 ? "text-yellow-500" : "text-green-500"}`}>{cs.soucisRate}%</p>)}
                                <p className="text-[10px] text-gray-400">taux soucis</p>
                              </div>
                            </div>
                            {/* Colonne 3 : SAV + Taux SAV */}
                            <div className="space-y-2">
                              <div>
                                {statsCompare ? (<div className="flex items-end justify-center gap-1"><p className={`text-xl font-bold ${cs.savCount > 0 ? "text-red-500" : "text-gray-400"}`}>{cs.savCount}</p><p className="text-sm font-semibold text-orange-400 mb-0.5">/{csB!.savCount}</p></div>) : (<p className={`text-xl font-bold ${cs.savCount > 0 ? "text-red-500" : "text-gray-400"}`}>{cs.savCount}</p>)}
                                <p className="text-[10px] text-gray-400">SAV</p>
                              </div>
                              <div>
                                <p className={`text-lg font-bold ${savRateColor}`}>{cs.projects > 0 ? `${cs.savRate}%` : "—"}</p>
                                <p className="text-[10px] text-gray-400">taux SAV</p>
                                {cs.savCount > 0 && (
                                  <p className="text-[9px] text-gray-400 mt-0.5 leading-tight">
                                    {cs.savFournisseurPct > 0 && <span className="text-orange-500">{cs.savFournisseurPct}% fo. </span>}
                                    {cs.savPersonnelCount > 0 && <span className="text-red-500">{cs.savPersonnelCount} TM</span>}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${(cs.projects / maxCollabProjects) * 100}%`, backgroundColor: colors.dot }} />
                          </div>
                        </div>
                      );
                    })}
                    {collabStats.filter((cs) => cs.projects > 0).length === 0 && (
                      <p className="text-xs text-gray-400 text-center py-4">Aucun montage solo sur cette période</p>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Binômes */}
            {(() => {
              // Cabines installées par monteur (seul / en équipe), DEPUIS TOUJOURS
              // (attribution par cabine) — mêmes chiffres que l'assistant IA.
              const monteurCabStats = computeMonteurCabStats(allProjectsRaw);
              if (monteurCabStats.length === 0) return null;
              const maxTotal = Math.max(...monteurCabStats.map((m) => m.total), 1);
              const totalSolo = monteurCabStats.reduce((s, m) => s + m.solo, 0);
              const totalTeam = monteurCabStats.reduce((s, m) => s + m.team, 0);
              return (
                <div>
                  <button onClick={() => toggleSection("monteurs-cab")} className="flex items-center gap-2 text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 w-full text-left">
                    {expandedSections.has("monteurs-cab") ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    Cabines par monteur
                    <span className="text-[10px] font-bold text-indigo-500 normal-case tracking-normal">depuis toujours · {totalSolo} seul / {totalTeam} en équipe</span>
                  </button>
                  {expandedSections.has("monteurs-cab") && (
                    <div className="space-y-2">
                      {monteurCabStats.map((m) => {
                        const c = getCollaboratorColor(m.name);
                        return (
                          <div key={m.name} className="glass-card rounded-2xl p-4">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: c.dot }} />
                                <span className="font-semibold text-sm text-gray-800 dark:text-gray-100">{m.name}</span>
                              </div>
                              <span className="text-sm font-bold text-gray-800 dark:text-gray-100">{m.total}<span className="text-[11px] font-normal text-gray-400 ml-1">cabines</span></span>
                            </div>
                            <div className="flex h-3 rounded-full overflow-hidden bg-gray-100 dark:bg-slate-700">
                              {m.solo > 0 && <div className="bg-emerald-500" style={{ width: `${(m.solo / maxTotal) * 100}%` }} title={`${m.solo} seul`} />}
                              {m.team > 0 && <div className="bg-indigo-500" style={{ width: `${(m.team / maxTotal) * 100}%` }} title={`${m.team} en équipe`} />}
                            </div>
                            <div className="flex gap-4 mt-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                              <span><span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1 align-middle" />{m.solo} seul</span>
                              <span><span className="inline-block w-2 h-2 rounded-full bg-indigo-500 mr-1 align-middle" />{m.team} en équipe</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}
            {(binomeStats.length > 0 || teamTMStats.projects > 0) && (() => {
              const ct = chartTypePrefs["binomes"] || "bar-h";
              const tmColors = getCollaboratorColor("Team TM");
              const distribData = [
                ...binomeStats.map((bs) => {
                  const names = bs.label.split(" & ");
                  const c1 = getCollaboratorColor(names[0] || "");
                  return { label: names[0]?.split(" ")[0] + (names[1] ? " & " + names[1].split(" ")[0] : ""), value: bs.cabines, color: c1.dot };
                }),
                ...(teamTMStats.projects > 0 ? [{ label: "Team TM", value: teamTMStats.cabines, color: tmColors.dot }] : []),
              ];
              const totalEquipes = binomeStats.length + (teamTMStats.projects > 0 ? 1 : 0);
              return (
                <div>
                  <button onClick={() => toggleSection("binomes")} className="flex items-center gap-2 text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 w-full text-left">
                    {expandedSections.has("binomes") ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    Par équipe
                    <span className="text-[10px] font-bold text-indigo-500 normal-case tracking-normal">{totalEquipes} équipe{totalEquipes > 1 ? "s" : ""}</span>
                    <ChartTypeSelector value={ct} onChange={(t) => setChartType("binomes", t)} types={["bar-h", "bar-v", "donut", "pie", "treemap", "radar"]} />
                  </button>
                  {expandedSections.has("binomes") && (() => {
                    if (ct === "donut") return <div className="glass-card rounded-2xl p-4"><DonutChart data={distribData} /></div>;
                    if (ct === "pie")   return <div className="glass-card rounded-2xl p-4"><PieChart2 data={distribData} /></div>;
                    if (ct === "treemap") return <div className="glass-card rounded-2xl p-4"><TreemapChart data={distribData} /></div>;
                    if (ct === "radar") return <div className="glass-card rounded-2xl p-4"><RadarChart data={distribData} /></div>;
                    if (ct === "bar-v") return <div className="glass-card rounded-2xl p-4"><ColumnChart data={distribData} /></div>;
                    return (
                      <div className="space-y-2">
                        {binomeStats.map((bs) => {
                          const names = bs.label.split(" & ");
                          const c1 = getCollaboratorColor(names[0] || "");
                          const c2 = getCollaboratorColor(names[1] || "");
                          const maxProjects = Math.max(...binomeStats.map((b) => b.projects), teamTMStats.projects, 1);
                          const bsB = statsCompare ? (binomeStatsB.find((b) => b.label === bs.label) ?? { projects: 0, cabines: 0, soucisCount: 0, soucisRate: 0, savCount: 0, savFournisseurCount: 0, savFournisseurPct: 0, savPersonnelCount: 0 }) : null;
                          return (
                            <div key={bs.label} className="glass-card rounded-2xl p-4">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="flex -space-x-1 shrink-0">
                                  <span className="w-4 h-4 rounded-full border-2 border-white dark:border-slate-800" style={{ backgroundColor: c1.dot }} />
                                  <span className="w-4 h-4 rounded-full border-2 border-white dark:border-slate-800" style={{ backgroundColor: c2.dot }} />
                                </span>
                                <span className="text-sm font-semibold truncate">{bs.label}</span>
                                <span className="ml-auto text-xs text-gray-500 shrink-0">
                                  {statsCompare ? <><span className="text-blue-500 font-bold">{bs.projects}A</span> <span className="text-gray-300">|</span> <span className="text-orange-400 font-bold">{bsB!.projects}B</span> projets</> : <>{bs.projects} projet{bs.projects > 1 ? "s" : ""}</>}
                                </span>
                              </div>
                              <div className="grid grid-cols-5 gap-2 text-center mb-2">
                                <div>{statsCompare ? (<div className="flex items-end justify-center gap-1"><p className="text-lg font-bold text-blue-600">{bs.cabines}</p><p className="text-sm font-semibold text-orange-400 mb-0.5">/{bsB!.cabines}</p></div>) : (<p className="text-lg font-bold text-[#1e3a5f] dark:text-white">{bs.cabines}</p>)}<p className="text-[10px] text-gray-400">cabines</p></div>
                                <div>{statsCompare ? (<div className="flex items-end justify-center gap-1"><p className="text-lg font-bold text-blue-600">{bs.soucisCount}</p><p className="text-sm font-semibold text-orange-400 mb-0.5">/{bsB!.soucisCount}</p></div>) : (<p className="text-lg font-bold text-[#1e3a5f] dark:text-white">{bs.soucisCount}</p>)}<p className="text-[10px] text-gray-400">soucis</p></div>
                                <div>{statsCompare ? (<div className="flex items-end justify-center gap-1"><p className={`text-lg font-bold ${bs.soucisRate > 20 ? "text-red-500" : bs.soucisRate > 10 ? "text-yellow-500" : "text-green-500"}`}>{bs.soucisRate}%</p><p className="text-sm font-semibold text-orange-400 mb-0.5">/{bsB!.soucisRate}%</p></div>) : (<p className={`text-lg font-bold ${bs.soucisRate > 20 ? "text-red-500" : bs.soucisRate > 10 ? "text-yellow-500" : "text-green-500"}`}>{bs.soucisRate}%</p>)}<p className="text-[10px] text-gray-400">taux soucis</p></div>
                                <div>{statsCompare ? (<div className="flex items-end justify-center gap-1"><p className="text-lg font-bold text-red-500">{bs.savCount}</p><p className="text-sm font-semibold text-orange-400 mb-0.5">/{bsB!.savCount}</p></div>) : (<p className={`text-lg font-bold ${bs.savCount > 0 ? "text-red-500" : "text-gray-400"}`}>{bs.savCount}</p>)}<p className="text-[10px] text-gray-400">SAV</p></div>
                                <div><p className={`text-sm font-bold ${bs.savFournisseurPct > 50 ? "text-orange-500" : "text-gray-500"}`}>{bs.savCount > 0 ? `${bs.savFournisseurPct}% fo.` : "—"}</p><p className={`text-sm font-bold ${bs.savPersonnelCount > 0 ? "text-red-500" : "text-gray-400"}`}>{bs.savCount > 0 ? `${bs.savPersonnelCount} TM` : ""}</p><p className="text-[10px] text-gray-400">erreurs</p></div>
                              </div>
                              <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                <div className="h-full rounded-full transition-all" style={{ width: `${(bs.projects / maxProjects) * 100}%`, background: `linear-gradient(90deg, ${c1.dot}, ${c2.dot})` }} />
                              </div>
                            </div>
                          );
                        })}
                        {/* Team TM — intégré dans Par équipe */}
                        {teamTMStats.projects > 0 && (() => {
                          const ts = teamTMStats;
                          const tsB = statsCompare ? teamTMStatsB : null;
                          const maxProjects = Math.max(...binomeStats.map((b) => b.projects), ts.projects, 1);
                          return (
                            <div className="glass-card rounded-2xl p-4">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="w-4 h-4 rounded-full border-2 border-white dark:border-slate-800 shrink-0" style={{ backgroundColor: tmColors.dot }} />
                                <span className="text-sm font-semibold truncate">Team TM</span>
                                <span className="ml-auto text-xs text-gray-500 shrink-0">
                                  {statsCompare && tsB ? <><span className="text-blue-500 font-bold">{ts.projects}A</span> <span className="text-gray-300">|</span> <span className="text-orange-400 font-bold">{tsB.projects}B</span> projets</> : <>{ts.projects} projet{ts.projects > 1 ? "s" : ""}</>}
                                </span>
                              </div>
                              <div className="grid grid-cols-5 gap-2 text-center mb-2">
                                <div>{statsCompare && tsB ? (<div className="flex items-end justify-center gap-1"><p className="text-lg font-bold text-blue-600">{ts.cabines}</p><p className="text-sm font-semibold text-orange-400 mb-0.5">/{tsB.cabines}</p></div>) : (<p className="text-lg font-bold text-[#1e3a5f] dark:text-white">{ts.cabines}</p>)}<p className="text-[10px] text-gray-400">cabines</p></div>
                                <div>{statsCompare && tsB ? (<div className="flex items-end justify-center gap-1"><p className="text-lg font-bold text-blue-600">{ts.soucisCount}</p><p className="text-sm font-semibold text-orange-400 mb-0.5">/{tsB.soucisCount}</p></div>) : (<p className="text-lg font-bold text-[#1e3a5f] dark:text-white">{ts.soucisCount}</p>)}<p className="text-[10px] text-gray-400">soucis</p></div>
                                <div>{statsCompare && tsB ? (<div className="flex items-end justify-center gap-1"><p className={`text-lg font-bold ${ts.soucisRate > 20 ? "text-red-500" : ts.soucisRate > 10 ? "text-yellow-500" : "text-green-500"}`}>{ts.soucisRate}%</p><p className="text-sm font-semibold text-orange-400 mb-0.5">/{tsB.soucisRate}%</p></div>) : (<p className={`text-lg font-bold ${ts.soucisRate > 20 ? "text-red-500" : ts.soucisRate > 10 ? "text-yellow-500" : "text-green-500"}`}>{ts.soucisRate}%</p>)}<p className="text-[10px] text-gray-400">taux soucis</p></div>
                                <div>{statsCompare && tsB ? (<div className="flex items-end justify-center gap-1"><p className={`text-lg font-bold ${ts.savCount > 0 ? "text-red-500" : "text-gray-400"}`}>{ts.savCount}</p><p className="text-sm font-semibold text-orange-400 mb-0.5">/{tsB.savCount}</p></div>) : (<p className={`text-lg font-bold ${ts.savCount > 0 ? "text-red-500" : "text-gray-400"}`}>{ts.savCount}</p>)}<p className="text-[10px] text-gray-400">SAV</p></div>
                                <div><p className={`text-sm font-bold ${ts.savFournisseurPct > 50 ? "text-orange-500" : "text-gray-500"}`}>{ts.savCount > 0 ? `${ts.savFournisseurPct}% fo.` : "—"}</p><p className={`text-sm font-bold ${ts.savPersonnelCount > 0 ? "text-red-500" : "text-gray-400"}`}>{ts.savCount > 0 ? `${ts.savPersonnelCount} TM` : ""}</p><p className="text-[10px] text-gray-400">erreurs</p></div>
                              </div>
                              <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                <div className="h-full rounded-full transition-all" style={{ width: `${(ts.projects / maxProjects) * 100}%`, backgroundColor: tmColors.dot }} />
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })()}
                </div>
              );
            })()}

            {/* Par type de client (from DB2) */}
            <div>
              <button onClick={() => toggleSection("typeclient")} className="flex items-center gap-2 text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 w-full text-left">
                {expandedSections.has("typeclient") ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                Par type de client
                <ChartTypeSelector value={chartTypePrefs["typeclient"] || "bar-h"} onChange={(t) => setChartType("typeclient", t)} types={["bar-h", "bar-v", "donut", "pie", "treemap", "radar"]} />
              </button>
              {expandedSections.has("typeclient") && (() => {
                const ct = chartTypePrefs["typeclient"] || "bar-h";
                const tcPalette = ["#6366f1", "#8b5cf6", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444"];
                const tcData = typeClientStats.map(([type, total], i) => ({ label: type, value: total, color: tcPalette[i % tcPalette.length] }));
                if (ct === "donut") return <div className="glass-card rounded-2xl p-4"><DonutChart data={tcData} /></div>;
                if (ct === "pie")   return <div className="glass-card rounded-2xl p-4"><PieChart2 data={tcData} /></div>;
                if (ct === "treemap") return <div className="glass-card rounded-2xl p-4"><TreemapChart data={tcData} /></div>;
                if (ct === "radar") return <div className="glass-card rounded-2xl p-4"><RadarChart data={tcData} /></div>;
                if (ct === "bar-v") return <div className="glass-card rounded-2xl p-4"><ColumnChart data={tcData} /></div>;
                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {typeClientStats.map(([type, total]) => {
                      const grandTotal = typeClientStats.reduce((s, [, v]) => s + v, 0);
                      const pct = grandTotal > 0 ? Math.round((total / grandTotal) * 100) : 0;
                      return (
                        <div key={type} className="glass-card rounded-2xl p-4">
                          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">{type}</h4>
                          <div className="text-center mb-3">
                            <p className="text-2xl font-bold text-[#1e3a5f] dark:text-white">{total}</p>
                            <p className="text-[10px] text-gray-400">montages</p>
                          </div>
                          <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                            <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                          <p className="text-[10px] text-gray-400 mt-1 text-right">{pct}% du total</p>
                        </div>
                      );
                    })}
                    {typeClientStats.length === 0 && <p className="text-xs text-gray-400 text-center py-4 col-span-2">Aucune donnée</p>}
                  </div>
                );
              })()}
            </div>

            {/* Par fournisseur/marque (from DB3) */}
            <div>
              <button onClick={() => toggleSection("marques")} className="flex items-center gap-2 text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 w-full text-left">
                {expandedSections.has("marques") ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                Par fournisseur / marque
                <ChartTypeSelector value={chartTypePrefs["marques"] || "bar-h"} onChange={(t) => setChartType("marques", t)} types={["bar-h", "bar-v", "donut", "pie", "treemap", "radar"]} />
              </button>
              {expandedSections.has("marques") && (() => {
                const ctMrq = chartTypePrefs["marques"] || "bar-h";
                const MARQUE_HEX: Record<string, string> = { "RONAL": "#2563eb", "Duka": "#059669", "Duscholux": "#7c3aed", "NELO": "#0284c7", "Koralle": "#e11d48", "Novellini": "#0d9488", "Megius": "#c026d3", "Samo": "#4f46e5" };
                const fallbackHex = ["#0891b2", "#db2777", "#65a30d", "#ea580c", "#84cc16"];
                const mrqDistribData = mrqFiltered.map((r: any, idx: number) => {
                  const val = filterMonthNum ? (r.monthly[MOIS_NAMES[filterMonthNum - 1]] || 0) : (r.total || Object.values(r.monthly as Record<string, number>).reduce((a: number, b: number) => a + b, 0));
                  return { label: r.marque, value: val, color: MARQUE_HEX[r.marque] || fallbackHex[idx % fallbackHex.length] };
                }).filter((d: { value: number }) => d.value > 0).sort((a: { value: number }, b: { value: number }) => b.value - a.value);
                if (ctMrq === "donut") return <div className="glass-card rounded-2xl p-4"><DonutChart data={mrqDistribData} /></div>;
                if (ctMrq === "pie")   return <div className="glass-card rounded-2xl p-4"><PieChart2 data={mrqDistribData} /></div>;
                if (ctMrq === "treemap") return <div className="glass-card rounded-2xl p-4"><TreemapChart data={mrqDistribData} /></div>;
                if (ctMrq === "radar") return <div className="glass-card rounded-2xl p-4"><RadarChart data={mrqDistribData} /></div>;
                if (ctMrq === "bar-v") return <div className="glass-card rounded-2xl p-4"><ColumnChart data={mrqDistribData} /></div>;
                return (
                <div className="glass-card rounded-2xl p-4">
                  <div className="space-y-3">
                    {mrqFiltered.filter((r: any) => {
                      if (filterMonthNum) return (r.monthly[MOIS_NAMES[filterMonthNum - 1]] || 0) > 0;
                      return (r.total || Object.values(r.monthly as Record<string, number>).reduce((a: number, b: number) => a + b, 0)) > 0;
                    }).sort((a: any, b: any) => {
                      const aVal = filterMonthNum ? (a.monthly[MOIS_NAMES[filterMonthNum - 1]] || 0) : (a.total || Object.values(a.monthly as Record<string, number>).reduce((x: number, y: number) => x + y, 0));
                      const bVal = filterMonthNum ? (b.monthly[MOIS_NAMES[filterMonthNum - 1]] || 0) : (b.total || Object.values(b.monthly as Record<string, number>).reduce((x: number, y: number) => x + y, 0));
                      return bVal - aVal;
                    }).map((r: any, idx: number) => {
                      const totalVal = filterMonthNum ? (r.monthly[MOIS_NAMES[filterMonthNum - 1]] || 0) : (r.total || Object.values(r.monthly as Record<string, number>).reduce((a: number, b: number) => a + b, 0));
                      const maxMrq = Math.max(...mrqFiltered.map((m: any) => filterMonthNum ? (m.monthly[MOIS_NAMES[filterMonthNum - 1]] || 0) : (m.total || Object.values(m.monthly as Record<string, number>).reduce((a: number, b: number) => a + b, 0))), 1);
                      const marqueColors: Record<string, { bar: string; mini: string }> = {
                        "RONAL": { bar: "bg-blue-600", mini: "bg-blue-400" },
                        "Duka": { bar: "bg-emerald-600", mini: "bg-emerald-400" },
                        "Duscholux": { bar: "bg-violet-600", mini: "bg-violet-400" },
                        "NELO": { bar: "bg-sky-600", mini: "bg-sky-400" },
                        "Koralle": { bar: "bg-rose-600", mini: "bg-rose-400" },
                        "Novellini": { bar: "bg-teal-600", mini: "bg-teal-400" },
                        "Megius": { bar: "bg-fuchsia-600", mini: "bg-fuchsia-400" },
                        "Samo": { bar: "bg-indigo-600", mini: "bg-indigo-400" },
                      };
                      const fallbackColors = [
                        { bar: "bg-cyan-600", mini: "bg-cyan-400" },
                        { bar: "bg-pink-600", mini: "bg-pink-400" },
                        { bar: "bg-lime-600", mini: "bg-lime-400" },
                      ];
                      const colors = marqueColors[r.marque] || fallbackColors[idx % fallbackColors.length];
                      const grandTotalMrq = mrqFiltered.reduce((s: number, m: any) => s + (filterMonthNum ? (m.monthly[MOIS_NAMES[filterMonthNum - 1]] || 0) : (m.total || Object.values(m.monthly as Record<string, number>).reduce((a: number, b: number) => a + b, 0))), 0);
                      const pctMrq = grandTotalMrq > 0 ? Math.round((totalVal / grandTotalMrq) * 100) : 0;
                      return (
                        <div key={r.id || r.marque}>
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 w-32 shrink-0 truncate">{r.marque}</span>
                            <div className="flex-1 h-5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                              <div className={`h-full ${colors.bar} rounded-full transition-all flex items-center justify-end pr-1.5`}
                                style={{ width: `${Math.max((totalVal / maxMrq) * 100, 5)}%` }}>
                                <span className="text-[9px] font-bold text-white">{pctMrq}% · {totalVal}</span>
                              </div>
                            </div>
                          </div>
                          {!filterMonthNum && (
                            <div className="ml-[140px] flex gap-0.5 mt-1">
                              {MOIS_NAMES.map((m, i) => {
                                const v = r.monthly[m] || 0;
                                return (
                                  <div key={m} className="flex flex-col items-center" style={{ width: "calc(100%/12)" }}>
                                    <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-sm overflow-hidden" style={{ height: 20 }}>
                                      <div className={`${colors.mini} w-full rounded-sm`} style={{ height: v > 0 ? Math.max((v / Math.max(...Object.values(r.monthly as Record<string, number>), 1)) * 20, 2) : 0, marginTop: 20 - (v > 0 ? Math.max((v / Math.max(...Object.values(r.monthly as Record<string, number>), 1)) * 20, 2) : 0) }} />
                                    </div>
                                    <span className="text-[7px] text-gray-400 mt-0.5">{monthNames12[i]}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {mrqFiltered.length === 0 && <p className="text-xs text-gray-400 text-center py-4">Aucune donnée</p>}
                  </div>
                </div>
                );
              })()}
            </div>

            {/* Par serie de cabine (from DB4) */}
            <div>
              <button onClick={() => toggleSection("series")} className="flex items-center gap-2 text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 w-full text-left">
                {expandedSections.has("series") ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                Par serie de cabine
              </button>
              {expandedSections.has("series") && (
                <div className="space-y-3">
                  {Object.entries(seriesByFournisseur).sort(([, a], [, b]) => b.reduce((s, x) => s + x.count, 0) - a.reduce((s, x) => s + x.count, 0)).map(([fournisseur, items]) => (
                    <div key={fournisseur} className="glass-card rounded-2xl p-4">
                      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">{fournisseur}</h4>
                      <div className="space-y-1.5">
                        {items.map((it) => {
                          const maxCount = Math.max(...items.map((x) => x.count), 1);
                          return (
                            <div key={it.serie} className="flex items-center gap-3">
                              <span className="text-xs text-gray-600 dark:text-gray-400 w-36 shrink-0 truncate">{it.serie}</span>
                              <div className="flex-1 h-4 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                <div className="h-full bg-teal-500 rounded-full transition-all flex items-center justify-end pr-1"
                                  style={{ width: `${Math.max((it.count / maxCount) * 100, 5)}%` }}>
                                  <span className="text-[8px] font-bold text-white">{it.count}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  {Object.keys(seriesByFournisseur).length === 0 && <p className="text-xs text-gray-400 text-center py-4">Aucune donnee</p>}
                </div>
              )}
            </div>

            {/* Repartition Grossistes vs Fournisseurs vs Sanitaires (from DB2) */}
            <div>
              <button onClick={() => toggleSection("gvf")} className="flex items-center gap-2 text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 w-full text-left">
                {expandedSections.has("gvf") ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                Repartition Grossistes / Fournisseurs / Sanitaires
              </button>
              {expandedSections.has("gvf") && (
                <div className="glass-card rounded-2xl p-4">
                  <div className="grid grid-cols-3 gap-3 text-center mb-4">
                    <div>
                      <p className="text-3xl font-bold text-blue-600">{grossisteTotal}</p>
                      <p className="text-xs text-gray-500 mt-1">Grossistes</p>
                    </div>
                    <div>
                      <p className="text-3xl font-bold text-amber-600">{fournisseurTotal}</p>
                      <p className="text-xs text-gray-500 mt-1">Fournisseurs</p>
                    </div>
                    <div>
                      <p className="text-3xl font-bold text-green-600">{sanitaireTotal}</p>
                      <p className="text-xs text-gray-500 mt-1">Sanitaires</p>
                    </div>
                  </div>
                  {gfTotal > 0 && (
                    <div className="h-5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden flex">
                      <div className="h-full bg-blue-500 transition-all" style={{ width: `${(grossisteTotal / gfTotal) * 100}%` }} />
                      <div className="h-full bg-amber-500 transition-all" style={{ width: `${(fournisseurTotal / gfTotal) * 100}%` }} />
                      <div className="h-full bg-green-500 transition-all" style={{ width: `${(sanitaireTotal / gfTotal) * 100}%` }} />
                    </div>
                  )}
                  {gfTotal > 0 && (
                    <div className="flex justify-between mt-1">
                      <span className="text-[10px] text-blue-600">{Math.round((grossisteTotal / gfTotal) * 100)}% Grossistes</span>
                      <span className="text-[10px] text-amber-600">{Math.round((fournisseurTotal / gfTotal) * 100)}% Fournisseurs</span>
                      <span className="text-[10px] text-green-600">{Math.round((sanitaireTotal / gfTotal) * 100)}% Sanitaires</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Boutons Calendrier / Collaborateurs */}
      {!loading && mode !== "dashboard" && !mode.endsWith("-termine") && !mode.startsWith("clients-") && !mode.startsWith("grossistes") && !mode.startsWith("fournisseurs") && mode !== "rapport" && mode !== "stats" && mode !== "archives" && mode !== "projets-tous" && mode !== "destockage" && mode !== "sanitaires" && mode !== "a-facturer" && mode !== "collaborateurs" && mode !== "emplacement-cabines" && mode !== "calendrier" && mode !== "arrivage" && viewMode === "list" && (
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
              <p className="text-[10px] text-gray-400">
                {new Date().toLocaleDateString("fr-CH", { day: "2-digit", month: "short" })}
                {" · "}
                <span className="font-semibold">S.{getISOWeek()}</span>
              </p>
            </div>
            <Calendar className="w-5 h-5 text-green-500" />
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

        // Un projet multi-jours (ex. 28-30 avril) apparaît sur CHAQUE
        // jour ouvrable de sa plage. En "mesures", dateMesures est une
        // date unique donc on ne parcourt qu'un seul jour.
        const projectsByDay: Record<number, Project[]> = {};
        rdvProjects.forEach((p) => {
          const startDate = mode.startsWith("mesures") ? p.dateMesures : p.dateMontage;
          const endDate = mode.startsWith("mesures") ? null : p.dateMontageEnd;
          if (!startDate) return;
          // On itère sur tous les jours du mois affiché et on demande à
          // `dateInRange` si le projet y est actif.
          for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = formatLocalDate(new Date(year, month, day));
            if (dateInRange(dateStr, startDate, endDate)) {
              if (!projectsByDay[day]) projectsByDay[day] = [];
              projectsByDay[day].push(p);
            }
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
      {/* VUE ARCHIVES */}
      {mode === "archives" && (() => {
        const archiveProjects = (projectsData["archives"] || projectsData["cmd-termine"] || [])
          .sort((a: any, b: any) => ((b.dateMontage || "").localeCompare(a.dateMontage || "")));

        const q = deferredSearch.toLowerCase();
        const archiveFiltered = q
          ? archiveProjects.filter((p: any) => matchesSearch(p, q, searchIndex.get(p.id)))
          : archiveProjects;

        // Group by month
        const grouped: Record<string, any[]> = {};
        archiveFiltered.forEach((p: any) => {
          const date = p.dateMontage || "";
          const monthKey = date ? date.substring(0, 7) : "Sans date";
          if (!grouped[monthKey]) grouped[monthKey] = [];
          grouped[monthKey].push(p);
        });

        const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
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
                placeholder="Rechercher dans les archives..."
                className="pl-9 h-11 rounded-xl glass-input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <p className="text-sm text-gray-500 mb-4">{archiveFiltered.length} projet{archiveFiltered.length !== 1 ? "s" : ""} terminé{archiveFiltered.length !== 1 ? "s" : ""}</p>
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
                  {projs.map((p: any) => (
                    <Link
                      key={p.id}
                      href={`/projet/${p.id}?mode=archives`}
                      onMouseEnter={() => prefetchProject(p.id)}
                      onTouchStart={() => prefetchProject(p.id)}
                      className="block glass-card rounded-2xl p-4 hover:bg-white/80 dark:hover:bg-white/10 transition-all"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-gray-900 dark:text-gray-100 line-clamp-3 sm:line-clamp-2 break-words leading-tight">{p.projet || "Sans nom"}</h4>
                          {p.ofrTM && <p className="text-xs text-gray-500 mt-0.5">OFR {p.ofrTM}</p>}
                          <div className="flex items-center gap-1.5 mt-1 text-sm text-gray-600 dark:text-gray-400">
                            <Calendar className="w-3.5 h-3.5 shrink-0" />
                            <span>{p.dateMontage ? formatDateFR(p.dateMontage) : "---"}</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {(p.collaborateurs || "").split(" & ").filter(Boolean).map((name: string) => (
                              <span key={name} className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full"
                                style={{ backgroundColor: getCollaboratorColor(name.trim()).bg, color: getCollaboratorColor(name.trim()).text }}>
                                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: getCollaboratorColor(name.trim()).dot }} />
                                {name.trim()}
                              </span>
                            ))}
                            {p.fournisseurs?.slice(0, 2).map((f: string) => (
                              <Badge key={f} variant="secondary" className="text-xs">{f}</Badge>
                            ))}
                            <Badge variant="outline" className="text-xs">{p.nbCabines || 0} cab.</Badge>
                          </div>
                        </div>
                        <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 whitespace-nowrap">
                          Terminé
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
            {archiveFiltered.length === 0 && !loading && (
              <div className="text-center py-12 text-gray-400">
                <p className="text-lg">Aucun projet archivé</p>
              </div>
            )}
          </div>
        );
      })()}

      {/* VUE PROJETS (admin) — absolument tous les projets, statut inclus */}
      {mode === "projets-tous" && !(isCmm && cmmHeroMode === "projets-tous") && (() => {
        const allProjects = (projectsData["projets-tous"] || [])
          .slice()
          .sort((a: any, b: any) => ((b.dateMontage || "").localeCompare(a.dateMontage || "")));

        // Étape 1 — filtre période (année + plage de mois)
        const inPeriod = (p: any) => {
          const month = (p.dateMontage || "").slice(0, 7); // YYYY-MM
          if (pAllYearFilter !== "all") {
            if (!p.dateMontage?.startsWith(pAllYearFilter)) return false;
          }
          if (pAllMonthRangeStart) {
            if (!month) return false;
            const end = pAllMonthRangeEnd || pAllMonthRangeStart;
            if (month < pAllMonthRangeStart || month > end) return false;
          }
          return true;
        };
        // Étape 2 — filtre par statut CMD / Mesures (multi-select OR)
        const inStatus = (p: any) => {
          if (pAllStatusCMD.length > 0 && !pAllStatusCMD.includes(p.etatCMD)) return false;
          if (pAllStatusMesures.length > 0 && !pAllStatusMesures.includes(p.etatMesures)) return false;
          return true;
        };
        // Étape 3 — toggles SAV / Soucis
        const inFlags = (p: any) => {
          if (pAllSAV && !p.sav) return false;
          if (pAllSoucis && !p.soucisMontage) return false;
          return true;
        };

        // Réutilise matchesSearch (fonction complète en tête de fichier) pour
        // chercher dans tous les champs : OFR, CMD, chantier, adresse,
        // collaborateurs, grossistes, fournisseurs, bon de livraison, etc.
        const matchesQuery = (p: any) => matchesSearch(p, deferredSearch.toLowerCase(), searchIndex.get(p.id));

        const allFiltered = allProjects.filter((p: any) =>
          inPeriod(p) && inStatus(p) && inFlags(p) && matchesQuery(p),
        );

        // Années disponibles depuis les données (décroissant + année courante en tête).
        const availableYears = Array.from(
          new Set(allProjects.map((p: any) => p.dateMontage?.slice(0, 4)).filter(Boolean) as string[]),
        ).sort().reverse();

        const monthShort = ["Janv.", "Fév.", "Mars", "Avril", "Mai", "Juin", "Juil.", "Août", "Sept.", "Oct.", "Nov.", "Déc."];
        const monthsForYear = pAllYearFilter !== "all"
          ? Array.from({ length: 12 }, (_, i) => `${pAllYearFilter}-${String(i + 1).padStart(2, "0")}`)
          : [];

        const monthLabel = (m: string) => {
          const [y, mo] = m.split("-");
          return `${monthShort[parseInt(mo, 10) - 1]} ${y}`;
        };

        const clearMonthRange = () => { setPAllMonthRangeStart(null); setPAllMonthRangeEnd(null); };
        const handleMonthClick = (month: string) => {
          const rangeActive = !!(pAllMonthRangeStart && pAllMonthRangeEnd);
          if (!pAllMonthRangeStart || rangeActive) { setPAllMonthRangeStart(month); setPAllMonthRangeEnd(null); return; }
          if (month === pAllMonthRangeStart) { clearMonthRange(); return; }
          if (month < pAllMonthRangeStart) { setPAllMonthRangeEnd(pAllMonthRangeStart); setPAllMonthRangeStart(month); }
          else { setPAllMonthRangeEnd(month); }
        };

        const toggleStatusCMD = (s: string) => setPAllStatusCMD((cur) => cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]);
        const toggleStatusMesures = (s: string) => setPAllStatusMesures((cur) => cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]);

        const resetAllFilters = () => {
          setPAllYearFilter("all");
          clearMonthRange();
          setPAllStatusCMD([]);
          setPAllStatusMesures([]);
          setPAllSAV(false);
          setPAllSoucis(false);
        };

        const activeFilterCount =
          (pAllYearFilter !== "all" ? 1 : 0) +
          (pAllMonthRangeStart ? 1 : 0) +
          pAllStatusCMD.length +
          pAllStatusMesures.length +
          (pAllSAV ? 1 : 0) +
          (pAllSoucis ? 1 : 0);

        const grouped: Record<string, any[]> = {};
        allFiltered.forEach((p: any) => {
          const date = p.dateMontage || "";
          const monthKey = date ? date.substring(0, 7) : "Sans date";
          if (!grouped[monthKey]) grouped[monthKey] = [];
          grouped[monthKey].push(p);
        });

        const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
        const formatMonth = (key: string) => {
          if (key === "Sans date") return key;
          const [y, m] = key.split("-");
          return `${monthNames[parseInt(m, 10) - 1]} ${y}`;
        };

        const statusBadgeColor = (status: string) => {
          if (!status) return "bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-gray-300";
          if (STATUS_CMD_COLORS[status]) return STATUS_CMD_COLORS[status];
          if (status === "Terminé") return "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300";
          if (status === "Annulé") return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300";
          return "bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-gray-300";
        };

        return (
          <div>
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <div className="relative max-w-md flex-1 min-w-[180px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Rechercher dans tous les projets..."
                  className="pl-9 h-11 rounded-xl glass-input"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <button
                onClick={() => setPAllShowFilters((v) => !v)}
                className={`shrink-0 h-11 px-3 rounded-xl border-2 text-xs font-medium flex items-center gap-2 transition-colors ${
                  activeFilterCount > 0
                    ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                    : "border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800"
                }`}
              >
                Filtres {activeFilterCount > 0 && `(${activeFilterCount})`}
                {pAllShowFilters ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
              {activeFilterCount > 0 && (
                <button
                  onClick={resetAllFilters}
                  className="shrink-0 h-11 px-3 rounded-xl text-xs font-medium text-gray-500 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800"
                >
                  Réinitialiser
                </button>
              )}
            </div>

            {pAllShowFilters && (
              <div className="glass-card rounded-2xl p-3 mb-4 space-y-3">
                {/* Année */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mr-1">Année</span>
                  <button
                    onClick={() => { setPAllYearFilter("all"); clearMonthRange(); }}
                    className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                      pAllYearFilter === "all" ? "glass-btn text-white" : "glass-card text-gray-600 dark:text-gray-300"
                    }`}
                  >
                    Toutes
                  </button>
                  {availableYears.map((y) => (
                    <button
                      key={y}
                      onClick={() => { setPAllYearFilter(pAllYearFilter === y ? "all" : y); clearMonthRange(); }}
                      className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                        pAllYearFilter === y ? "glass-btn text-white" : "glass-card text-gray-600 dark:text-gray-300"
                      }`}
                    >
                      {y}
                    </button>
                  ))}
                </div>

                {/* Mois (visible quand une année est choisie) */}
                {pAllYearFilter !== "all" && (
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mr-1">Mois</span>
                    <button
                      onClick={clearMonthRange}
                      className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                        !pAllMonthRangeStart ? "glass-btn text-white" : "glass-card text-gray-600 dark:text-gray-300"
                      }`}
                    >
                      Toute l&apos;année
                    </button>
                    {monthsForYear.map((m, idx) => {
                      const isBoundary = m === pAllMonthRangeStart || m === pAllMonthRangeEnd;
                      const inRange = pAllMonthRangeStart && pAllMonthRangeEnd && m >= pAllMonthRangeStart && m <= pAllMonthRangeEnd;
                      return (
                        <button
                          key={m}
                          onClick={() => handleMonthClick(m)}
                          className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                            isBoundary
                              ? "glass-btn text-white"
                              : inRange
                                ? "bg-blue-500/25 dark:bg-blue-400/20 text-blue-700 dark:text-blue-200 ring-1 ring-inset ring-blue-400/40"
                                : "glass-card text-gray-600 dark:text-gray-300"
                          }`}
                        >
                          {monthShort[idx]}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Indicateur plage */}
                {pAllMonthRangeStart && (
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 px-1">
                    {pAllMonthRangeEnd && pAllMonthRangeEnd !== pAllMonthRangeStart
                      ? <>Du <strong className="text-gray-700 dark:text-gray-100">{monthLabel(pAllMonthRangeStart)}</strong> au <strong className="text-gray-700 dark:text-gray-100">{monthLabel(pAllMonthRangeEnd)}</strong></>
                      : <>Mois : <strong className="text-gray-700 dark:text-gray-100">{monthLabel(pAllMonthRangeStart)}</strong></>
                    }
                  </p>
                )}

                {/* État CMD */}
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 block mb-1.5">État CMD</span>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.keys(STATUS_CMD_COLORS).map((s) => {
                      const active = pAllStatusCMD.includes(s);
                      return (
                        <button
                          key={s}
                          onClick={() => toggleStatusCMD(s)}
                          className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                            active
                              ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-400"
                              : "border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700/50"
                          }`}
                        >
                          {s}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* État Mesures */}
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 block mb-1.5">État Mesures</span>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.keys(STATUS_MESURES_COLORS).map((s) => {
                      const active = pAllStatusMesures.includes(s);
                      return (
                        <button
                          key={s}
                          onClick={() => toggleStatusMesures(s)}
                          className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                            active
                              ? "border-cyan-500 bg-cyan-50 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300 dark:border-cyan-400"
                              : "border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700/50"
                          }`}
                        >
                          {s}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* SAV / Soucis montage */}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setPAllSAV((v) => !v)}
                    className={`text-xs font-medium px-3 py-1.5 rounded-full border-2 transition-colors flex items-center gap-1.5 ${
                      pAllSAV
                        ? "border-red-500 bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-300 dark:border-red-400"
                        : "border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-300"
                    }`}
                  >
                    <AlertCircle className="w-3.5 h-3.5" />
                    Avec SAV
                  </button>
                  <button
                    onClick={() => setPAllSoucis((v) => !v)}
                    className={`text-xs font-medium px-3 py-1.5 rounded-full border-2 transition-colors flex items-center gap-1.5 ${
                      pAllSoucis
                        ? "border-orange-500 bg-orange-50 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-400"
                        : "border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-300"
                    }`}
                  >
                    <AlertCircle className="w-3.5 h-3.5" />
                    Soucis montage
                  </button>
                </div>
              </div>
            )}

            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {allFiltered.length} projet{allFiltered.length !== 1 ? "s" : ""} trouvé{allFiltered.length !== 1 ? "s" : ""}
              {activeFilterCount > 0 && allFiltered.length !== allProjects.length && ` sur ${allProjects.length}`}
            </p>
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
                  {projs.map((p: any) => (
                    <Link
                      key={p.id}
                      href={`/projet/${p.id}?mode=projets-tous`}
                      onMouseEnter={() => prefetchProject(p.id)}
                      onTouchStart={() => prefetchProject(p.id)}
                      className="block glass-card rounded-2xl p-4 hover:bg-white/80 dark:hover:bg-white/10 transition-all"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-gray-900 dark:text-gray-100 line-clamp-3 sm:line-clamp-2 break-words leading-tight">{p.projet || "Sans nom"}</h4>
                          {p.ofrTM && <p className="text-xs text-gray-500 mt-0.5">OFR {p.ofrTM}</p>}
                          <div className="flex items-center gap-1.5 mt-1 text-sm text-gray-600 dark:text-gray-400">
                            <Calendar className="w-3.5 h-3.5 shrink-0" />
                            <span>{p.dateMontage ? formatDateFR(p.dateMontage) : "---"}</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {(p.collaborateurs || "").split(" & ").filter(Boolean).map((name: string) => (
                              <span key={name} className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full"
                                style={{ backgroundColor: getCollaboratorColor(name.trim()).bg, color: getCollaboratorColor(name.trim()).text }}>
                                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: getCollaboratorColor(name.trim()).dot }} />
                                {name.trim()}
                              </span>
                            ))}
                            {p.fournisseurs?.slice(0, 2).map((f: string) => (
                              <Badge key={f} variant="secondary" className="text-xs">{f}</Badge>
                            ))}
                            <Badge variant="outline" className="text-xs">{p.nbCabines || 0} cab.</Badge>
                            {p.sav && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                                SAV
                              </span>
                            )}
                            {p.soucisMontage && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">
                                Soucis
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${statusBadgeColor(p.etatCMD)}`}>
                            {p.etatCMD || "---"}
                          </span>
                          {p.etatMesures && p.etatMesures !== p.etatCMD && (
                            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_MESURES_COLORS[p.etatMesures] || "bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-gray-300"}`}>
                              Mes : {p.etatMesures}
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
            {allFiltered.length === 0 && !loading && (
              <div className="text-center py-12 text-gray-400">
                <p className="text-lg">Aucun projet trouvé</p>
              </div>
            )}
          </div>
        );
      })()}

      {/* VUE À FACTURER */}
      {mode === "a-facturer" && (() => {
        const allActive = projectsData["a-facturer"] || projectsData["all-active"] || [];
        const afProjects = allActive.filter((p: any) => p.facturations === "A facturer");
        const q = deferredSearch.toLowerCase();
        const afFiltered = afProjects.filter((p: any) => matchesSearch(p, q, searchIndex.get(p.id)));
        return (
          <div>
            <div className="relative mb-4 max-w-lg">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input placeholder="Rechercher (nom, OFR...)" className="pl-9 h-11 rounded-xl glass-input" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <p className="text-sm text-gray-500 mb-3">
              {afFiltered.length} projet{afFiltered.length !== 1 ? "s" : ""} à facturer
            </p>
            {loading && <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>}
            <div className="space-y-3">
              {afFiltered.map((project: any) => (
                <ProjectCard key={project.id} project={project} mode="cmd" isAdmin={currentUser?.role === "admin"} onDelete={handleDeleteProject} compact noPrefetch={isFloatingWindow} />
              ))}
              {afFiltered.length === 0 && !loading && (
                <div className="text-center py-12 text-gray-400"><p className="text-lg">Aucun projet à facturer</p></div>
              )}
            </div>
          </div>
        );
      })()}

      {/* VUE EMPLACEMENT CABINES */}
      {mode === "emplacement-cabines" && !(isCmm && cmmHeroMode === "emplacement-cabines") && (() => {
        const EMPL_COLORS: Record<string, { badge: string; header: string }> = {
          "Dépôt TM":                { badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",         header: "bg-amber-600 dark:bg-amber-700"    },
          "Getaz Yverdon":           { badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",             header: "bg-blue-700 dark:bg-blue-800"      },
          "Getaz Bussigny":          { badge: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",     header: "bg-indigo-700 dark:bg-indigo-800"  },
          "Getaz Payerne":           { badge: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",                 header: "bg-sky-700 dark:bg-sky-800"        },
          "Dubat Villars-ste-Croix": { badge: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",    header: "bg-purple-700 dark:bg-purple-800"  },
          "Dubat Yverdon":           { badge: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",    header: "bg-violet-700 dark:bg-violet-800"  },
          "Sanitas Villars-sur-Glâne":{ badge: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",           header: "bg-rose-700 dark:bg-rose-800"      },
        };
        const getEmplColor = (e: string) => {
          if (EMPL_COLORS[e]) return EMPL_COLORS[e];
          if (e.startsWith("Bringhen")) return { badge: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300", header: "bg-orange-600 dark:bg-orange-700" };
          if (e.startsWith("Sanitas")) return { badge: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300", header: "bg-rose-700 dark:bg-rose-800" };
          return { badge: "bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-300", header: "bg-[#1e3a5f]" };
        };

        const allActive = projectsData["emplacement-cabines"] || projectsData["all-active"] || [];
        // Garder uniquement les projets avec un emplacement défini
        const withEmplacement = allActive.filter((p: any) => !!p.emplacementCabine);

        // Filtrer par quickFilter
        const emplacementFiltered = withEmplacement.filter((p: any) => {
          const e = (p.emplacementCabine || "").toLowerCase();
          if (quickFilter === "emplacement-depot")   return e.includes("dépôt tm") || e.includes("depot tm");
          if (quickFilter === "emplacement-getaz")   return e.includes("getaz");
          if (quickFilter === "emplacement-dubat")   return e.includes("dubat");
          if (quickFilter === "emplacement-bringhen")return e.includes("bringhen");
          if (quickFilter === "emplacement-sanitas") return e.includes("sanitas");
          return true;
        });

        // Grouper par emplacement
        const emplacementMap: Record<string, any[]> = {};
        emplacementFiltered.forEach((p: any) => {
          const keys = p.emplacementCabine ? p.emplacementCabine.split(", ") : ["Sans emplacement"];
          keys.forEach((k: string) => {
            if (!emplacementMap[k]) emplacementMap[k] = [];
            emplacementMap[k].push(p);
          });
        });
        const sortedKeys = Object.keys(emplacementMap).sort((a, b) => {
          if (a === "Dépôt TM") return 1;
          if (b === "Dépôt TM") return -1;
          return a.localeCompare(b);
        });

        const totalCabines = emplacementFiltered.reduce((s: number, p: any) => s + (p.nbCabines || 0), 0);

        return (
          <div>
            <div className="relative mb-4 max-w-lg">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input placeholder="Rechercher (nom, OFR...)" className="pl-9 h-11 rounded-xl glass-input" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <p className="text-sm text-gray-500 mb-4">
              {emplacementFiltered.length} projet{emplacementFiltered.length !== 1 ? "s" : ""} · {totalCabines} cabine{totalCabines !== 1 ? "s" : ""}
            </p>
            {loading && <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>}
            {sortedKeys.length === 0 && !loading && (
              <div className="text-center py-12 text-gray-400"><p className="text-lg">Aucune cabine à afficher</p></div>
            )}
            {sortedKeys.map((empl) => {
              const groupProjects = emplacementMap[empl];
              const { header } = getEmplColor(empl);
              const groupCab = groupProjects.reduce((s: number, p: any) => s + (p.nbCabines || 0), 0);
              return (
                <div key={empl} className="mb-3">
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-xl shadow-sm mb-1 ${header}`}>
                    <MapPin className="w-3.5 h-3.5 text-white/80 shrink-0" />
                    <span className="text-sm font-bold text-white truncate">{empl}</span>
                    <span className="ml-auto text-xs px-2 py-0.5 rounded-full font-semibold bg-white/20 text-white shrink-0">
                      {groupProjects.length} projet{groupProjects.length > 1 ? "s" : ""} · {groupCab} cab.
                    </span>
                  </div>
                  <div className="rounded-xl overflow-hidden border border-gray-100 dark:border-gray-800">
                    {groupProjects.map((p: any, idx: number) => {
                      const rowBg = idx % 2 === 0 ? "bg-white dark:bg-slate-800/60" : "bg-gray-50 dark:bg-slate-900/40";
                      return (
                        <a key={p.id} href={`/projet/${p.id}?mode=dashboard`}
                          className={`flex items-center gap-3 px-3 py-2.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors text-sm ${rowBg}`}>
                          <span className="font-mono text-xs text-gray-500 dark:text-gray-400 w-24 shrink-0 truncate">{p.ofrTM || "---"}</span>
                          <span className="flex-1 min-w-0 font-medium text-gray-800 dark:text-gray-100 truncate">{p.projet}</span>
                          {p.nbCabines > 0 && (
                            <span className="shrink-0 text-xs font-semibold bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">
                              {p.nbCabines} cab.
                            </span>
                          )}
                          <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 shrink-0" />
                        </a>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* VUE CALENDRIER */}
      {mode === "calendrier" && !(isCmm && cmmHeroMode === "calendrier") && (() => {
        const today = formatLocalDate(new Date());
        const allActive = projectsData["calendrier"] || projectsData["all-active"] || [];
        const q = deferredSearch.toLowerCase();
        const calProjects = allActive.filter((p: any) => {
          const date = p.dateMontage || p.dateMesures;
          if (quickFilter === "calendrier-today" && date !== today) return false;
          if (quickFilter === "calendrier-week") {
            if (!date) return false;
            const d = new Date(date);
            const now = new Date();
            const in7 = new Date(now); in7.setDate(now.getDate() + 7);
            if (d < now || d > in7) return false;
          }
          return matchesSearch(p, q, searchIndex.get(p.id));
        }).sort((a: any, b: any) => {
          const dA = a.dateMontage || a.dateMesures || "";
          const dB = b.dateMontage || b.dateMesures || "";
          return dA.localeCompare(dB);
        });
        return (
          <div>
            <div className="relative mb-4 max-w-lg">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input placeholder="Rechercher (nom, OFR...)" className="pl-9 h-11 rounded-xl glass-input" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <p className="text-sm text-gray-500 mb-3">
              {calProjects.length} intervention{calProjects.length !== 1 ? "s" : ""}
            </p>
            {loading && <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>}
            <div className="space-y-3">
              {calProjects.map((project: any) => (
                <ProjectCard key={project.id} project={project} mode="cmd" isAdmin={currentUser?.role === "admin"} onDelete={handleDeleteProject} compact noPrefetch={isFloatingWindow} />
              ))}
              {calProjects.length === 0 && !loading && (
                <div className="text-center py-12 text-gray-400"><p className="text-lg">Aucune intervention planifiée</p></div>
              )}
            </div>
          </div>
        );
      })()}

      {/* VUE DÉSTOCKAGE — inventaire des cabines en stock + action déstocker */}
      {mode === "destockage" && (
        <DestockageView isAdmin={currentUser?.role === "admin"} />
      )}

      {/* ======================================================== */}
      {/* VUE SIGNALEMENTS — pièces manquantes ou défauts (KV)     */}
      {/* ======================================================== */}
      {mode === "signalements-pieces" && !(isCmm && cmmHeroMode === "signalements") && (
        <div>
          <div className="flex items-center gap-2 mb-5">
            <Package className="w-5 h-5 text-orange-500" />
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">Pièces manquantes</h2>
          </div>
          <SignalementListView subMode="pieces" />
        </div>
      )}

      {mode === "signalements-defauts" && !(isCmm && cmmHeroMode === "signalements") && (
        <div>
          <div className="flex items-center gap-2 mb-5">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">Défauts signalés</h2>
          </div>
          <SignalementListView subMode="defauts" />
        </div>
      )}


      {/* ======================================================== */}
      {/* VUE ARRIVAGE — suivi de l'arrivage des cabines             */}
      {/* ======================================================== */}
      {mode === "arrivage" && <ArrivagePage />}

      {/* ======================================================== */}
      {/* CleanMyMac Hero — Mesures (affiché à la place de la liste)  */}
      {/* ======================================================== */}
      {isCmm && mode === "mesures" && cmmHeroMode === "mesures" && (
        <>
          <CmmSectionLanding
            icon={Ruler}
            title="Mesures"
            subtitle="Gérez et suivez vos rendez-vous de mesure"
            actions={[
              { id: "today",   icon: CalendarDays, label: "Mesures aujourd'hui",    sublabel: "Rendez-vous du jour"     },
              { id: "rdv",     icon: Calendar,     label: "RDV Mesures",            sublabel: "Tous les rendez-vous"    },
              { id: "non-cmd", icon: AlertCircle,  label: "Mesures non commandées", sublabel: "Mesures terminées — à commander" },
            ]}
            onAction={(id) => {
              setCmmHeroMode(null);
              setQuickFilter(
                id === "today"   ? "mesures-today"   :
                id === "rdv"     ? "mesures-rdv"     :
                "mesures-non-cmd"
              );
            }}
          />
        </>
      )}

      {/* ======================================================== */}
      {/* CleanMyMac Hero — Montages                               */}
      {/* ======================================================== */}
      {isCmm && mode === "cmd" && cmmHeroMode === "cmd" && (
        <CmmSectionLanding
          icon={Wrench}
          title="Montages"
          subtitle="Suivez et planifiez vos chantiers de montage"
          actions={[
            { id: "today",       icon: CalendarDays, label: "Montage aujourd'hui",      sublabel: "Chantiers du jour"            },
            { id: "rdv-a-fixer", icon: Calendar,     label: "RDV à fixer Montages",     sublabel: "Réception — date à planifier" },
          ]}
          onAction={(id) => {
            setCmmHeroMode(null);
            setQuickFilter(id === "today" ? "cmd-today" : "cmd-rdv-a-fixer");
          }}
        />
      )}

      {/* ======================================================== */}
      {/* CleanMyMac Hero — Services                               */}
      {/* ======================================================== */}
      {isCmm && mode === "services" && cmmHeroMode === "services" && (
        <CmmSectionLanding
          icon={Settings}
          title="Services"
          subtitle="Gérez vos interventions et services clients"
          actions={[
            { id: "today",       icon: CalendarDays, label: "Services aujourd'hui",     sublabel: "Interventions du jour"        },
            { id: "rdv-a-fixer", icon: Calendar,     label: "RDV à fixer Services",     sublabel: "Interventions — date à fixer" },
          ]}
          onAction={(id) => {
            setCmmHeroMode(null);
            setQuickFilter(id === "today" ? "services-today" : "services-rdv-a-fixer");
          }}
        />
      )}

      {/* ======================================================== */}
      {/* CleanMyMac Hero — SAV                                    */}
      {/* ======================================================== */}
      {isCmm && mode === "sav" && cmmHeroMode === "sav" && (
        <CmmSectionLanding
          icon={AlertCircle}
          title="SAV"
          subtitle="Suivi des retours et interventions SAV"
          actions={[
            { id: "today",   icon: CalendarDays, label: "SAV aujourd'hui",   sublabel: "SAV reçus aujourd'hui"  },
            { id: "rdv",     icon: Calendar,     label: "RDV à fixer SAV",   sublabel: "SAV sans date planifiée" },
            { id: "cloture", icon: Archive,      label: "SAV clôturé",       sublabel: "Dossiers terminés"       },
          ]}
          onAction={(id) => {
            setCmmHeroMode(null);
            setQuickFilter(
              id === "today"   ? "sav-today"       :
              id === "rdv"     ? "sav-rdv-a-fixer" :
              "sav-cloture"
            );
          }}
        />
      )}

      {/* ======================================================== */}
      {/* CleanMyMac Hero — Garanties                              */}
      {/* ======================================================== */}
      {isCmm && mode === "garanties" && cmmHeroMode === "garanties" && (
        <CmmSectionLanding
          icon={ShieldCheck}
          title="Garanties"
          subtitle="Gestion des dossiers de garantie"
          actions={[
            { id: "today",   icon: CalendarDays, label: "Garantie aujourd'hui",    sublabel: "Échéances du jour"     },
            { id: "rdv",     icon: Calendar,     label: "RDV à fixer garantie",    sublabel: "Dossiers sans RDV"     },
            { id: "cloture", icon: Archive,      label: "Garantie clôturé",        sublabel: "Dossiers terminés"     },
          ]}
          onAction={(id) => {
            setCmmHeroMode(null);
            setQuickFilter(
              id === "today"   ? "garanties-today"       :
              id === "rdv"     ? "garanties-rdv-a-fixer" :
              "garanties-cloture"
            );
          }}
        />
      )}

      {/* ======================================================== */}
      {/* CleanMyMac Hero — RDV                                    */}
      {/* ======================================================== */}
      {isCmm && mode === "rdv" && cmmHeroMode === "rdv" && (
        <CmmSectionLanding
          icon={CalendarDays}
          title="RDV"
          subtitle="Vue d'ensemble des rendez-vous par service"
          actions={[
            { id: "mesures:mesures-rdv-a-fixer",       icon: Ruler,        label: "Mesures",   sublabel: "RDV à fixer"  },
            { id: "mesures:mesures-rdv",               icon: Ruler,        label: "Mesures",   sublabel: "RDV établis"  },
            { id: "cmd:cmd-rdv-a-fixer",               icon: Wrench,       label: "Montages",  sublabel: "RDV à fixer"  },
            { id: "cmd:cmd-rdv-etablis",               icon: Wrench,       label: "Montages",  sublabel: "RDV établis"  },
            { id: "services:services-rdv-a-fixer",     icon: Settings,     label: "Services",  sublabel: "RDV à fixer"  },
            { id: "services:services-rdv-etablis",     icon: Settings,     label: "Services",  sublabel: "RDV établis"  },
            { id: "sav:sav-rdv-a-fixer",               icon: AlertCircle,  label: "SAV",       sublabel: "RDV à fixer"  },
            { id: "sav:sav-rdv-etablis",               icon: AlertCircle,  label: "SAV",       sublabel: "RDV établis"  },
            { id: "garanties:garanties-rdv-a-fixer",   icon: ShieldCheck,  label: "Garanties", sublabel: "RDV à fixer"  },
            { id: "garanties:garanties-rdv-etablis",   icon: ShieldCheck,  label: "Garanties", sublabel: "RDV établis"  },
          ]}
          onAction={(id) => {
            const [targetMode, filter] = id.split(":");
            setCmmHeroMode(null);
            setMode(targetMode as Mode);
            setQuickFilter(filter);
          }}
        />
      )}

      {/* ======================================================== */}
      {/* CleanMyMac Hero — Signalements                           */}
      {/* ======================================================== */}
      {isCmm && mode === "signalements" && cmmHeroMode === "signalements" && (
        <CmmSectionLanding
          icon={AlertTriangle}
          title="Signalements"
          subtitle="Pièces manquantes et défauts signalés sur les projets"
          actions={[
            { id: "pieces",  icon: Package,        label: "Pièces manquantes", sublabel: "Articles commandés ou en attente" },
            { id: "defauts", icon: AlertCircle,    label: "Défauts signalés",  sublabel: "Problèmes en cours ou résolus"    },
          ]}
          onAction={(id) => {
            setCmmHeroMode(null);
            setMode(id === "pieces" ? "signalements-pieces" : "signalements-defauts");
          }}
        />
      )}

      {/* ======================================================== */}
      {/* CleanMyMac Hero — Contacts                               */}
      {/* ======================================================== */}
      {isCmm && mode === "clients-contacts" && cmmHeroMode === "clients-contacts" && (
        <CmmSectionLanding
          icon={UsersIcon}
          title="Contacts"
          subtitle="Vos contacts classés par type de relation"
          actions={[
            { id: "Grossistes",           icon: ShoppingBag, label: "Grossistes"           },
            { id: "Fournisseurs",          icon: Package,     label: "Fournisseurs"          },
            { id: "Sanitaires",            icon: Droplets,    label: "Sanitaires"            },
            { id: "Architectes",           icon: Compass,     label: "Architectes"           },
            { id: "Entreprises générales", icon: Building,    label: "Entreprises générales" },
          ]}
          onAction={(id) => {
            setCmmHeroMode(null);
            setCrmTagFilter(id);
          }}
        />
      )}

      {/* ======================================================== */}
      {/* CleanMyMac Hero — Entreprises                            */}
      {/* ======================================================== */}
      {isCmm && mode === "clients-entreprises" && cmmHeroMode === "clients-entreprises" && (
        <CmmSectionLanding
          icon={Building}
          title="Entreprises"
          subtitle="Vos entreprises partenaires et clientes"
          actions={[
            { id: "Grossistes",              icon: ShoppingBag, label: "Grossistes"              },
            { id: "Fournisseurs",            icon: Package,     label: "Fournisseurs"            },
            { id: "Sanitaires",              icon: Droplets,    label: "Sanitaires"              },
            { id: "Bureau d'études sanitaire", icon: FileText,  label: "Bureau d'études"         },
            { id: "Carreleurs",              icon: LayoutGrid,  label: "Carreleurs"              },
            { id: "Entreprises générales",   icon: Building,    label: "Entreprises générales"   },
            { id: "Architectes",             icon: Compass,     label: "Architectes"             },
            { id: "Ingénieurs",              icon: Wrench,      label: "Ingénieurs"              },
            { id: "Agences immobilières",    icon: Home,        label: "Agences immobilières"    },
          ]}
          onAction={(id) => {
            setCmmHeroMode(null);
            setCrmTagFilter(id);
          }}
        />
      )}

      {/* ======================================================== */}
      {/* CleanMyMac Hero — Projets en cours                        */}
      {/* ======================================================== */}
      {isCmm && mode === "projets-tous" && cmmHeroMode === "projets-tous" && (
        <CmmSectionLanding
          icon={FolderOpen}
          title="Projets en cours"
          subtitle="Vue d'ensemble de tous vos dossiers actifs"
          actions={[
            { id: "en-attente-mesures",  icon: Ruler,        label: "En attente de mesures",          sublabel: "Projets sans mesures effectuées"        },
            { id: "cabines-mesurees",    icon: ShieldCheck,  label: "Cabines mesurées",               sublabel: "Mesurées — non encore commandées"        },
            { id: "ofr-sans-mesures",    icon: FileText,     label: "OFR envoyées sans mesures",      sublabel: "Offre envoyée avant mesures"             },
            { id: "cabines-cmd",         icon: Package,      label: "Cabines en CMD",                 sublabel: "Commandes en cours"                      },
            { id: "cabines-recevoir",    icon: Archive,      label: "Cabines à recevoir",             sublabel: "Livraison attendue"                      },
            { id: "cabines-aller",       icon: Wrench,       label: "Cabines à aller chercher",       sublabel: "Marchandise prête — à récupérer"         },
            { id: "receptionne-rdv",     icon: CalendarDays, label: "Réceptionné – RDV à fixer",      sublabel: "Reçu — date de montage à planifier"      },
            { id: "rdv-attendre",        icon: AlertCircle,  label: "RDV – Attendre NEWS",            sublabel: "En attente de nouvelles du client"       },
            { id: "rdv-fixe",            icon: Calendar,     label: "RDV – Fixé",                     sublabel: "Date de montage confirmée"               },
            { id: "montages-partiel",    icon: Settings,     label: "Montages partiel",               sublabel: "Montage partiellement effectué"          },
            { id: "soucis-montages",     icon: AlertCircle,  label: "Soucis montages",                sublabel: "Dossiers avec problème de montage"       },
          ]}
          onAction={(id) => {
            setCmmHeroMode(null);
            setPAllSAV(false);
            setPAllSoucis(false);
            setPAllStatusCMD(
              id === "en-attente-mesures" ? ["En attente de mesures"] :
              id === "cabines-mesurees"   ? ["Cabines mesurées"] :
              id === "ofr-sans-mesures"   ? ["OFR envoyées sans mesures"] :
              id === "cabines-cmd"        ? ["Cabines en CMD"] :
              id === "cabines-recevoir"   ? ["Cabines à recevoir"] :
              id === "cabines-aller"      ? ["Cabine à aller chercher"] :
              id === "receptionne-rdv"    ? ["Récéptionné - RDV à fixer"] :
              id === "rdv-attendre"       ? ["RDV - Attendre news"] :
              id === "rdv-fixe"           ? ["RDV - fixé"] :
              id === "montages-partiel"   ? ["Montage partiel"] :
              id === "soucis-montages"    ? ["Soucis montage"] :
              []
            );
          }}
        />
      )}

      {/* ======================================================== */}
      {/* CleanMyMac Hero — Archives                                */}
      {/* ======================================================== */}
      {isCmm && mode === "archives" && cmmHeroMode === "archives" && (
        <CmmSectionLanding
          icon={Archive}
          title="Archives"
          subtitle="Historique de vos projets terminés et clôturés"
          actions={[
            { id: "all", icon: CalendarDays, label: "Voir les archives",    sublabel: "Tous les projets terminés" },
          ]}
          onAction={(id) => {
            setCmmHeroMode(null);
          }}
        />
      )}

      {/* ======================================================== */}
      {/* CleanMyMac Hero — Rapport                                */}
      {/* ======================================================== */}
      {isCmm && mode === "rapport" && cmmHeroMode === "rapport" && (
        <CmmSectionLanding
          icon={FileText}
          title="Rapport"
          subtitle="Suivi et envoi des rapports de montage"
          actions={[
            { id: "en-cours",   icon: FolderOpen,   label: "Rapport en cours",   sublabel: "Montages débutés — cabines manquantes" },
            { id: "en-attente", icon: AlertCircle,  label: "Rapport en attente", sublabel: "Montage terminé — rapport non envoyé"  },
            { id: "cloture",    icon: Archive,      label: "Rapport clôturé",    sublabel: "Rapport envoyé au client"              },
          ]}
          onAction={(id) => {
            setCmmHeroMode(null);
            setRapportSubFilter(id as "en-cours" | "en-attente" | "cloture");
          }}
        />
      )}

      {/* ======================================================== */}
      {/* CleanMyMac Hero — Collaborateurs                         */}
      {/* ======================================================== */}
      {isCmm && mode === "collaborateurs" && cmmHeroMode === "collaborateurs" && (
        <CmmSectionLanding
          icon={UsersIcon}
          title="Collaborateurs"
          subtitle="Projets par collaborateur"
          actions={[
            { id: "Claudio",   icon: UsersIcon, label: "Claudio"   },
            { id: "Jean-Marc", icon: UsersIcon, label: "Jean-Marc" },
            { id: "Jacobo",    icon: UsersIcon, label: "Jacobo"    },
            { id: "Miguel",    icon: UsersIcon, label: "Miguel"     },
            { id: "Loïc",      icon: UsersIcon, label: "Loïc"      },
            { id: "binome",    icon: UsersIcon, label: "Binôme",   sublabel: "Projets à plusieurs collaborateurs" },
            { id: "Team TM",   icon: UsersIcon, label: "Team",     sublabel: "Projets assignés à toute l'équipe"  },
          ]}
          onAction={(id) => {
            setCmmHeroMode(null);
            if (id === "binome") {
              setCollabFilter("Binôme");
            } else {
              setCollabFilter(id);
            }
          }}
        />
      )}

      {/* ======================================================== */}
      {/* CleanMyMac Hero — Emplacement cabines                    */}
      {/* ======================================================== */}
      {isCmm && mode === "emplacement-cabines" && cmmHeroMode === "emplacement-cabines" && (
        <CmmSectionLanding
          icon={MapPin}
          title="Emplacement cabines"
          subtitle="Localisation et suivi des cabines installées"
          actions={[
            { id: "all",     icon: MapPin,      label: "Tous les emplacements", sublabel: "Vue complète"                         },
            { id: "depot",   icon: Archive,     label: "Dépôt TM",              sublabel: "Cabines stockées chez TM"             },
            { id: "getaz",   icon: ShoppingBag, label: "Getaz",                 sublabel: "Getaz Yverdon · Bussigny · Payerne"   },
            { id: "dubat",   icon: ShoppingBag, label: "Dubat",                 sublabel: "Dubat Villars-ste-Croix · Yverdon"    },
            { id: "bringhen",icon: ShoppingBag, label: "Bringhen",              sublabel: "Dépôt Bringhen"                       },
            { id: "sanitas", icon: ShoppingBag, label: "Sanitas Troesch",       sublabel: "Dépôt Sanitas"                        },
          ]}
          onAction={(id) => {
            setCmmHeroMode(null);
            setQuickFilter(id === "all" ? null : `emplacement-${id}`);
          }}
        />
      )}

      {/* ======================================================== */}
      {/* CleanMyMac Hero — Calendrier                             */}
      {/* ======================================================== */}
      {isCmm && mode === "calendrier" && cmmHeroMode === "calendrier" && (
        <CmmSectionLanding
          icon={Calendar}
          title="Calendrier"
          subtitle="Planning et agenda des interventions"
          actions={[
            { id: "today", icon: CalendarDays, label: "Aujourd'hui",      sublabel: "Interventions du jour"          },
            { id: "week",  icon: Calendar,     label: "Cette semaine",    sublabel: "Planning des 7 prochains jours" },
            { id: "all",   icon: FolderOpen,   label: "Tout le planning", sublabel: "Vue complète du calendrier"     },
          ]}
          onAction={(id) => {
            setCmmHeroMode(null);
            setQuickFilter(id === "all" ? null : `calendrier-${id}`);
          }}
        />
      )}

      {/* ======================================================== */}
      {/* CleanMyMac Hero — Grossistes                              */}
      {/* ======================================================== */}
      {isCmm && mode === "grossistes" && cmmHeroMode === "grossistes" && (
        <CmmSectionLanding
          icon={ShoppingBag}
          title="Grossistes"
          subtitle="Accédez aux projets par grossiste partenaire"
          actions={[
            { id: "grossistes-bms",      icon: ShoppingBag, label: "BMS",       logoSrc: "/logos/fournisseurs/BMS-Logo-cmm.png",      logoH: 32 },
            { id: "grossistes-dubat",     icon: ShoppingBag, label: "Dubat",     logoSrc: "/logos/fournisseurs/Dubat-Logo.png",         logoH: 33, logoFilter: "brightness(0) invert(1) drop-shadow(0 0 4px rgba(255,255,255,0.08))" },
            { id: "grossistes-matway",    icon: ShoppingBag, label: "Matway",    logoSrc: "/logos/fournisseurs/Matway-Logo.png",        logoH: 60 },
            { id: "grossistes-tema",      icon: ShoppingBag, label: "Tema Sàrl", logoSrc: "/logos/fournisseurs/Tema-Logo.png",          logoH: 46 },
            { id: "grossistes-bringhen",  icon: ShoppingBag, label: "Bringhen",  logoSrc: "/logos/fournisseurs/Bringhen-cmm.png",  logoH: 25 },
          ]}
          onAction={(id) => {
            setCmmHeroMode(null);
            setMode(id as Mode);
          }}
        />
      )}

      {/* ======================================================== */}
      {/* CleanMyMac Hero — Fournisseurs                            */}
      {/* ======================================================== */}
      {isCmm && mode === "fournisseurs" && cmmHeroMode === "fournisseurs" && (
        <CmmSectionLanding
          icon={Package}
          title="Fournisseurs"
          subtitle="Accédez aux projets par fournisseur de produits"
          actions={[
            { id: "fournisseurs-duka",         icon: Package, label: "Duka.ch",      logoSrc: "/logos/fournisseurs/Duka-cmm.png",              logoH: 33 },
            { id: "fournisseurs-duscholux",     icon: Package, label: "Duscholux",    logoSrc: "/logos/fournisseurs/Duscholux-logo-cmm.png",     logoH: 24 },
            { id: "fournisseurs-kermi",         icon: Package, label: "Kermi",        logoSrc: "/logos/fournisseurs/Kermi-logo-cmm.png",         logoH: 36 },
            { id: "fournisseurs-koralle",       icon: Package, label: "Koralle",      logoSrc: "/logos/fournisseurs/Koralle-logo-cmm.png",       logoH: 37 },
            { id: "fournisseurs-nelo",          icon: Package, label: "Nelo",         logoSrc: "/logos/fournisseurs/Nelo-logo-cmm.png",          logoH: 44 },
            { id: "fournisseurs-novellini",     icon: Package, label: "Novellini",    logoSrc: "/logos/fournisseurs/Novellini-logo-cmm.png",     logoH: 26 },
            { id: "fournisseurs-ronal",         icon: Package, label: "Ronal",        logoSrc: "/logos/fournisseurs/Ronal-cmm.png",              logoH: 25 },
            { id: "fournisseurs-samo",          icon: Package, label: "Samo",         logoSrc: "/logos/fournisseurs/Samo-logo-cmm.png",          logoH: 36 },
            { id: "fournisseurs-vismaravetro",  icon: Package, label: "Vismaravetro", logoSrc: "/logos/fournisseurs/Vismaravetro-cmm.png",       logoH: 48 },
          ]}
          onAction={(id) => {
            setCmmHeroMode(null);
            setMode(id as Mode);
          }}
        />
      )}

      {/* ======================================================== */}
      {/* Liste des projets (tous les modes sauf dashboard/rapport  */}
      {/* et sauf quand un hero CMM est affiché)                   */}
      {/* ======================================================== */}
      {(() => {
        const cmmHeroModes = ["mesures", "cmd", "services", "sav", "garanties", "rdv", "clients-contacts", "clients-entreprises", "projets-tous", "archives", "grossistes", "fournisseurs", "rapport", "collaborateurs", "emplacement-cabines", "calendrier", "signalements", "arrivage"];
        const cmmHeroActive = isCmm && cmmHeroModes.includes(mode) && cmmHeroMode === mode;
        return mode !== "dashboard" && mode !== "rapport" && !mode.startsWith("grossistes") && !mode.startsWith("fournisseurs") && mode !== "stats" && mode !== "archives" && mode !== "projets-tous" && mode !== "destockage" && mode !== "sanitaires" && !mode.startsWith("clients-") && mode !== "garanties" && mode !== "emplacement-cabines" && mode !== "calendrier" && mode !== "arrivage" && !cmmHeroActive;
      })() && (<>
        {/* Bouton retour vers hero CMM (visible après avoir cliqué un bouton d'action) */}
        {isCmm && ["mesures","cmd","services","sav","projets-tous","archives","rapport","collaborateurs","emplacement-cabines","calendrier"].includes(mode) && cmmHeroMode === null && (
          <button
            onClick={() => { setCmmHeroMode(mode); setQuickFilter(null); }}
            className="mb-4 flex items-center gap-1.5 text-sm transition-all duration-150"
            style={{ color: "rgba(210,190,255,0.60)" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(210,190,255,0.90)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(210,190,255,0.60)"; }}
          >
            <ChevronLeft style={{ width: 15, height: 15 }} />
            {mode === "mesures" ? "Mesures" : mode === "cmd" ? "Montages" : mode === "services" ? "Services" : mode === "projets-tous" ? "Projets en cours" : mode === "archives" ? "Archives" : mode === "rapport" ? "Rapport" : mode === "collaborateurs" ? "Collaborateurs" : mode === "emplacement-cabines" ? "Emplacement cabines" : mode === "calendrier" ? "Calendrier" : "SAV"}
          </button>
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
                  {/* Bouton "Team" — projets assignés à "Team TM" dans Notion */}
                  {(() => {
                    const teamColors = getCollaboratorColor("Team TM");
                    const isTeamSelected = collabFilter === "Team TM";
                    return (
                      <button
                        onClick={() => setCollabFilter(isTeamSelected ? null : "Team TM")}
                        className="w-full text-left text-xs font-medium px-3 py-2 rounded-lg transition-colors flex items-center gap-2"
                        style={isTeamSelected ? { backgroundColor: "#1e3a5f", color: "white" } : { backgroundColor: teamColors.bg, color: teamColors.text }}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: isTeamSelected ? "white" : teamColors.dot }}
                        />
                        Team ({teamTMCount})
                      </button>
                    );
                  })()}
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
              {/* Bouton "Team" mobile */}
              {(() => {
                const teamColors = getCollaboratorColor("Team TM");
                const isTeamSelected = collabFilter === "Team TM";
                return (
                  <button
                    onClick={() => setCollabFilter(isTeamSelected ? null : "Team TM")}
                    className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-full transition-colors inline-flex items-center gap-1 whitespace-nowrap"
                    style={isTeamSelected ? { backgroundColor: "#1e3a5f", color: "white" } : { backgroundColor: teamColors.bg, color: teamColors.text }}
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: isTeamSelected ? "white" : teamColors.dot }}
                    />
                    Team ({teamTMCount})
                  </button>
                );
              })()}
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

            {mode === "mesures" ? (() => {
              /* ── Vue Mesures : groupement par mois de dateMesures ── */
              const MONTH_NMS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
              const fmtMoisKey = (k: string) => {
                if (k === "Sans date") return k;
                const [y, m] = k.split("-");
                return `${MONTH_NMS[parseInt(m, 10) - 1]} ${y}`;
              };
              const mGroups: Record<string, Project[]> = {};
              displayedFiltered.forEach((p) => {
                const key = p.dateMesures ? p.dateMesures.slice(0, 7) : "Sans date";
                (mGroups[key] ??= []).push(p);
              });
              const sortedMonths = Object.keys(mGroups).sort((a, b) =>
                a === "Sans date" ? 1 : b === "Sans date" ? -1 : a.localeCompare(b)
              );
              if (sortedMonths.length === 0) return (
                <div className="text-center py-12 text-gray-400"><p className="text-lg">Aucun projet trouvé</p></div>
              );
              return (
                <div className="glass-card rounded-2xl overflow-hidden">
                  {/* En-tête colonnes */}
                  <div className="flex items-center gap-2 px-3 py-2 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                    <span className="w-20 shrink-0">N° OFR TM</span>
                    <span className="w-20 shrink-0 hidden sm:block">Date demande</span>
                    <span className="w-20 shrink-0 hidden sm:block">Date</span>
                    <span className="flex-1">Projet</span>
                    <span className="w-14 text-right">Cabines</span>
                  </div>
                  {sortedMonths.flatMap((monthKey) => [
                    /* ── Séparateur mois ── */
                    <div key={`sep-${monthKey}`} className="flex items-center gap-2 px-3 py-1.5">
                      <div className="flex-1 h-px bg-cyan-200/70 dark:bg-cyan-700/40" />
                      <span className="text-[10px] font-semibold text-cyan-600 dark:text-cyan-400 shrink-0 px-1.5 capitalize">
                        {fmtMoisKey(monthKey)} ({mGroups[monthKey].length})
                      </span>
                      <div className="flex-1 h-px bg-cyan-200/70 dark:bg-cyan-700/40" />
                    </div>,
                    /* ── Lignes projets ── */
                    ...mGroups[monthKey].map((p, idx) => {
                      const names = (p.mesuresTraiteePar || "").split(" & ").filter(Boolean);
                      const dateFmt = p.dateMesures
                        ? new Date(p.dateMesures + "T12:00:00").toLocaleDateString("fr-CH", { day: "2-digit", month: "short", year: "2-digit" })
                        : "---";
                      const dateDemandeFmt = p.dateMesuresRecue
                        ? new Date(p.dateMesuresRecue + "T12:00:00").toLocaleDateString("fr-CH", { day: "2-digit", month: "short", year: "2-digit" })
                        : "---";
                      const rowBg = idx % 2 === 0
                        ? "bg-cyan-50/30 dark:bg-cyan-950/10"
                        : "bg-white/40 dark:bg-white/5";
                      return (
                        <Link
                          key={p.id}
                          href={`/projet/${p.id}?mode=mesures`}
                          prefetch={true}
                          onMouseEnter={() => prefetchProject(p.id)}
                          onTouchStart={() => prefetchProject(p.id)}
                          className={`flex items-center gap-2 px-3 py-2 hover:bg-cyan-50/60 dark:hover:bg-cyan-900/20 transition-colors text-xs ${rowBg}`}
                        >
                          {/* N° OFR TM */}
                          <span className="w-20 shrink-0 font-mono text-gray-500 dark:text-gray-400 text-[11px] leading-tight truncate">
                            {p.ofrTM || "---"}
                          </span>
                          {/* Date de demande (Date Mesures reçue le) */}
                          <span className="w-20 shrink-0 font-mono text-gray-500 dark:text-gray-400 hidden sm:block">
                            {dateDemandeFmt}
                          </span>
                          {/* Date mesures (RDV) */}
                          <span className="w-20 shrink-0 font-mono text-cyan-600 dark:text-cyan-400 hidden sm:block">
                            {dateFmt}
                          </span>
                          {/* Nom projet */}
                          <span className="flex-1 min-w-0 text-gray-900 dark:text-gray-100 line-clamp-2 leading-snug">
                            {p.projet || "Sans nom"}
                          </span>
                          {/* Badges collaborateurs */}
                          <div className="flex -space-x-1 shrink-0">
                            {names.slice(0, 3).map((n) => (
                              <span key={n} className="w-5 h-5 rounded-full text-[7px] font-bold flex items-center justify-center border border-white dark:border-gray-800"
                                style={{ backgroundColor: getCollaboratorColor(n.trim()).bg, color: getCollaboratorColor(n.trim()).text }}>
                                {n.trim().split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                              </span>
                            ))}
                          </div>
                          {/* Badge statut */}
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap shrink-0 hidden sm:inline-flex ${STATUS_MESURES_COLORS[p.etatMesures] || "bg-gray-100 text-gray-700"}`}>
                            {p.etatMesures || "---"}
                          </span>
                          {/* Nb cabines */}
                          <Badge variant="outline" className="text-[10px] shrink-0 w-14 justify-center">
                            {p.nbCabines || 0} cab.
                          </Badge>
                        </Link>
                      );
                    }),
                  ])}
                </div>
              );
            })() : (
              <div className="space-y-3">
                {displayedFiltered.map((project) => (
                  <ProjectCard key={project.id} project={project} mode={mode} isAdmin={currentUser?.role === "admin"} onDelete={handleDeleteProject} noPrefetch={isFloatingWindow} />
                ))}
                {displayedFiltered.length === 0 && !error && (
                  <div className="text-center py-12 text-gray-400">
                    <p className="text-lg">Aucun projet trouvé</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : null}
      </>)}
    </div>
  );
}
