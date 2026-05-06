"use client";

import { Suspense, useCallback, useEffect, useState, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Onboarding } from "@/components/onboarding";
import { PullToRefresh } from "@/components/pull-to-refresh";
import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { Search, MapPin, Calendar, ChevronRight, AlertCircle, X, FileText, CalendarDays, Users as UsersIcon, ArrowLeft, ChevronLeft, ChevronRight as ChevronRightIcon, Star, Loader2, Building, Printer, ChevronDown, ChevronUp, LayoutGrid, Plus, Trash2, ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { Project } from "@/lib/notion";
import { getCollaboratorColor } from "@/lib/collaborators";
import { formatDateFR, formatDateLong, STATUS_CMD_COLORS, STATUS_MESURES_COLORS, STATUS_SORT_ORDER, STATUS_MESURES_SORT_ORDER, COLLABORATEURS_LIST, getISOWeek } from "@/lib/constants";
import { dateInRange, formatLocalDate } from "@/lib/time-utils";
import { getFavorites } from "@/lib/favorites";
import { fetchWithRetry, prefetchProject } from "@/lib/api-helpers";
import { showRetryToast } from "@/components/error-toast";
import { StatsDateFilter, filterByStatsDate, type StatsDateMode } from "@/components/stats-date-filter";

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

function ProjectCard({ project, mode, isAdmin, onDelete }: { project: Project; mode: string; isAdmin?: boolean; onDelete?: (id: string) => void }) {
  const statusColors = mode.startsWith("mesures") ? STATUS_MESURES_COLORS : STATUS_CMD_COLORS;
  const statusValue = mode.startsWith("mesures") ? project.etatMesures : project.etatCMD;
  const statusColor = statusColors[statusValue] || "bg-gray-100 text-gray-700";

  return (
    <div className="relative group">
      <Link
        href={`/projet/${project.id}?mode=${mode}`}
        prefetch={true}
        onMouseEnter={() => prefetchProject(project.id)}
        onTouchStart={() => prefetchProject(project.id)}
        onFocus={() => prefetchProject(project.id)}
        className="block glass-card rounded-2xl p-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 line-clamp-2 break-words text-base leading-tight">
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

function NavBar({ mode, projectsData, onSwitchMode, isAdmin }: { mode: string; projectsData: Record<string, any[]>; onSwitchMode: (m: any) => void; isAdmin: boolean }) {
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
    "grossistes-bringhen": "/logos/fournisseurs/Bringhen-logo.jpg",
  };
  const isGrossisteActive = grossistesModes.includes(mode);
  const grossisteActiveLabel = grossistesLabels[mode] || "";

  const fournisseursModes = ["fournisseurs", "fournisseurs-duka", "fournisseurs-duscholux", "fournisseurs-ronal", "fournisseurs-nelo", "fournisseurs-novellini", "fournisseurs-samo"];
  const fournisseursLabels: Record<string, string> = { fournisseurs: "Tous", "fournisseurs-duka": "Duka.ch", "fournisseurs-duscholux": "Duscholux", "fournisseurs-ronal": "Ronal", "fournisseurs-nelo": "Nelo", "fournisseurs-novellini": "Novellini", "fournisseurs-samo": "Samo" };
  const fournisseursLogos: Record<string, string> = {
    "fournisseurs-duka": "/logos/fournisseurs/duka.ch-logo.png",
    "fournisseurs-duscholux": "/logos/fournisseurs/Duscholux-logo.png",
    "fournisseurs-ronal": "/logos/fournisseurs/ronal-logo-v2.png",
    "fournisseurs-nelo": "/logos/fournisseurs/Nelo-logo.jpg",
    "fournisseurs-novellini": "/logos/fournisseurs/Novellini-logo.png",
    "fournisseurs-samo": "/logos/fournisseurs/Samo-logo.jpg",
  };
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
    <div className="mb-4 space-y-1.5">
      {/* Ligne principale */}
      <div className="p-1.5 max-w-full overflow-x-auto scrollbar-hide">
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
          <button onClick={() => setOpen(open === "grossistes" ? null : "grossistes")} className={tabCls(isGrossisteActive || open === "grossistes")}>
            {isGrossisteActive && grossisteActiveLabel && grossisteActiveLabel !== "Tous" ? `Grossistes · ${grossisteActiveLabel}` : "Grossistes"}
            <ChevronDown className={`w-3 h-3 transition-transform ${open === "grossistes" ? "rotate-180" : ""}`} />
          </button>
          <button onClick={() => setOpen(open === "fournisseurs-menu" ? null : "fournisseurs-menu")} className={tabCls(isFournisseursActive || open === "fournisseurs-menu")}>
            {isFournisseursActive && fournisseurActiveLabel && fournisseurActiveLabel !== "Tous" ? `Fournisseurs · ${fournisseurActiveLabel}` : "Fournisseurs"}
            <ChevronDown className={`w-3 h-3 transition-transform ${open === "fournisseurs-menu" ? "rotate-180" : ""}`} />
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
          {isAdmin && (
            <button
              onClick={() => { handleSelect("archives"); setOpen(null); }}
              className={`shrink-0 text-xs font-semibold py-1.5 px-3 rounded-lg transition-all duration-200 inline-flex items-center gap-1.5 border ${
                mode === "archives"
                  ? "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700"
                  : "bg-white/70 dark:bg-white/5 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800/60 hover:bg-amber-50 dark:hover:bg-amber-900/20"
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                <rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>
              </svg>
              Archives
            </button>
          )}
          {isAdmin && (
            <button onClick={() => { handleSelect("projets-tous"); setOpen(null); }} className={tabCls(mode === "projets-tous")}>
              Projets
            </button>
          )}
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

      {/* Sous-menu Grossistes */}
      {open === "grossistes" && (
        <div className="flex gap-2 overflow-x-auto scrollbar-hide px-1 items-center">
          {grossistesModes.map((m) => {
            const logo = grossistesLogos[m];
            const isActive = mode === m;
            const logoScale: Record<string, number> = {
              "grossistes-bms": 1,
              "grossistes-dubat": 1.6,
              "grossistes-tema": 1.5,
              "grossistes-matway": 2,
              "grossistes-bringhen": 1,
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
                    style={{ width: `${w}px`, height: `${h}px` }}
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
      {open === "fournisseurs-menu" && (
        <div className="flex gap-2 overflow-x-auto scrollbar-hide px-1 items-center">
          {fournisseursModes.map((m) => {
            const logo = fournisseursLogos[m];
            const isActive = mode === m;
            const logoScale: Record<string, number> = {
              "fournisseurs-duka": 1.8,
              "fournisseurs-duscholux": 1.6,
              "fournisseurs-ronal": 2.2,
              "fournisseurs-nelo": 2,
              "fournisseurs-novellini": 1,
              "fournisseurs-samo": 2.2,
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
                    style={{ width: `${w}px`, height: `${h}px` }}
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
function matchesSearch(p: import("@/lib/notion").Project, q: string): boolean {
  if (!q) return true;
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
  const searchParams = useSearchParams();
  const router = useRouter();
  const collaborateurParam = searchParams.get("collaborateur");
  const modeParam = searchParams.get("mode");
  const statusParam = searchParams.get("status");
  const collabParam = searchParams.get("collab");
  const quickParam = searchParams.get("quick");
  const qParam = searchParams.get("q");
  type Mode = "dashboard" | "mesures" | "mesures-termine" | "cmd" | "cmd-termine" | "services" | "services-termine" | "sav" | "sav-termine" | "rapport" | "clients-contacts" | "clients-entreprises" | "clients-fournisseurs" | "clients-grossistes" | "grossistes" | "grossistes-bms" | "grossistes-dubat" | "grossistes-tema" | "grossistes-matway" | "grossistes-bringhen" | "fournisseurs" | "fournisseurs-duka" | "fournisseurs-duscholux" | "fournisseurs-ronal" | "fournisseurs-nelo" | "fournisseurs-novellini" | "fournisseurs-samo" | "stats" | "archives" | "projets-tous" | "destockage" | "sanitaires";
  const validModes: Mode[] = ["dashboard", "mesures", "mesures-termine", "cmd", "cmd-termine", "services", "services-termine", "sav", "sav-termine", "rapport", "clients-contacts", "clients-entreprises", "clients-fournisseurs", "clients-grossistes", "grossistes", "grossistes-bms", "grossistes-dubat", "grossistes-tema", "grossistes-matway", "grossistes-bringhen", "fournisseurs", "fournisseurs-duka", "fournisseurs-duscholux", "fournisseurs-ronal", "fournisseurs-nelo", "fournisseurs-novellini", "fournisseurs-samo", "stats", "archives", "projets-tous", "destockage", "sanitaires"];
  const initialMode: Mode = validModes.includes(modeParam as Mode) ? (modeParam as Mode) : "dashboard";
  const [mode, setMode] = useState<Mode>(initialMode);
  const [projectsData, setProjectsData] = useState<Record<string, Project[]>>({});
  const [search, setSearch] = useState(qParam || "");
  const [statusFilter, setStatusFilter] = useState<string | null>(statusParam);
  const [collabFilter, setCollabFilter] = useState<string | null>(collabParam || collaborateurParam);
  const [quickFilter, setQuickFilter] = useState<string | null>(quickParam);
  const [subView, setSubView] = useState<"projets" | "stats">("projets");
  const [statsDateMode, setStatsDateMode] = useState<StatsDateMode>("all");
  const [statsDateFrom, setStatsDateFrom] = useState("");
  const [statsDateTo, setStatsDateTo] = useState("");
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
    const header = document.getElementById("main-header");
    if (header) {
      document.documentElement.style.setProperty("--header-h", `${header.offsetHeight}px`);
    }
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
  const [statsExpandedSections, setStatsExpandedSections] = useState<Set<string>>(new Set(["kpis", "monthly"]));

  // Stats from dedicated Notion databases
  const [statsServices, setStatsServices] = useState<any[]>([]);
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
  const statsLoadedRef = useRef(false);
  const [cabineAttributions, setCabineAttributions] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (mode !== "stats" || statsLoadedRef.current) return;
    statsLoadedRef.current = true;
    setStatsLoading(true);
    Promise.all([
      fetch("/api/stats/services").then((r) => r.json()).catch(() => []),
      fetch("/api/stats/clients").then((r) => r.json()).catch(() => []),
      fetch("/api/stats/marques").then((r) => r.json()).catch(() => []),
      fetch("/api/stats/series").then((r) => r.json()).catch(() => []),
      fetch("/api/cabine-attribution").then((r) => r.json()).catch(() => []),
      fetch("/api/stats/consultations").then((r) => r.ok ? r.json() : null).catch(() => null),
    ]).then(([svc, cli, mrq, ser, attrs, consults]) => {
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
      setStatsLoading(false);
    });
  }, [mode]);

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
    "fournisseurs-nelo": "/api/projects/all-active",
    "fournisseurs-novellini": "/api/projects/all-active",
    "fournisseurs-samo": "/api/projects/all-active",
    stats: "/api/projects/all-active",
    archives: "/api/projects/cmd-termine",
    "projets-tous": "/api/projects/all",
    sanitaires: "/api/projects/all-active",
  };

  const [rapportSearch, setRapportSearch] = useState("");

  // Cache-first: afficher le cache instantanément, puis mettre à jour en arrière-plan
  useEffect(() => {
    // 1. Charger le cache local IMMÉDIATEMENT — affichage instantané
    try {
      const cached = localStorage.getItem("tm-projects-cache");
      if (cached) {
        const parsed = JSON.parse(cached);
        setProjectsData(parsed);
        setLoading(false); // Afficher immédiatement avec les données cachées
      }
    } catch {}

    // Charger l'utilisateur connecté
    fetch("/api/auth").then((r) => r.json()).then((d) => {
      if (d.user) {
        setCurrentUser(d.user);
        fetch("/api/user-activity", { method: "POST" }).catch(() => {});
      }
    }).catch(() => {});

    // 2. Mettre à jour chaque endpoint INDIVIDUELLEMENT dès qu'il arrive
    const allModes = Object.entries(MODE_API) as [string, string][];
    const uniqueUrls = [...new Set(allModes.map(([, url]) => url))];

    // Fetch each unique URL and update state as soon as each arrives
    uniqueUrls.forEach((url) => {
      fetch(url).then((r) => r.json()).then((data) => {
        if (!Array.isArray(data)) return;
        // Map this URL's data to all modes that use it
        const modesForUrl = allModes.filter(([, u]) => u === url);
        setProjectsData((prev) => {
          const updated = { ...prev };
          modesForUrl.forEach(([key]) => { updated[key] = data; });
          try { localStorage.setItem("tm-projects-cache", JSON.stringify(updated)); } catch {}
          return updated;
        });
        setLoading(false);
      }).catch(() => {
        setLoading(false);
      });
    });
  }, []);

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
        if (Array.isArray(data)) newData[key] = data;
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
    return matchesSearch(p, search.toLowerCase());
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
    <div className="px-4 py-4 max-w-7xl mx-auto w-full">
      <PullToRefresh />
      <Onboarding />
      {/* Toast notification */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-green-600 text-white px-5 py-3 rounded-xl shadow-lg text-sm font-medium animate-in fade-in slide-in-from-top-2 duration-300">
          {toast}
        </div>
      )}
      {/* Onglets navigation + Nouveau projet — fixé en haut.
          glass-navbar : fond translucide flouté pour que les libellés
          restent lisibles quand on scrolle la page derrière. */}
      <div className="sticky z-40 -mx-4 px-4 pb-2 pt-1 glass-navbar" style={{top: `var(--header-h, 60px)`}}>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <NavBar mode={mode} projectsData={projectsData} isAdmin={currentUser?.role === "admin"} onSwitchMode={(m: Mode) => { setMode(m); setStatusFilter(null); setQuickFilter(null); setViewMode("list"); setSubView("projets"); }} />
        </div>
        {currentUser?.role === "admin" && mode !== "dashboard" && mode !== "rapport" && !mode.startsWith("grossistes") && !mode.startsWith("fournisseurs") && mode !== "stats" && mode !== "archives" && mode !== "projets-tous" && mode !== "destockage" && mode !== "sanitaires" && !mode.startsWith("clients-") && (
          <button
            onClick={() => setShowNewProject(true)}
            className="shrink-0 mt-1.5 w-9 h-9 rounded-xl bg-[#1e3a5f] text-white flex items-center justify-center hover:bg-[#2a4f7f] active:scale-95 transition-all shadow-md"
            title="Nouveau projet"
          >
            <Plus className="w-5 h-5" />
          </button>
        )}
      </div>
      </div>

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
          {/* Recherche globale */}
          <div className="relative mb-4 max-w-lg">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Rechercher dans tous les projets..."
              className="pl-9 h-11 rounded-xl glass-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                // Ne bascule vers la vue liste qu'à Entrée : éviter de
                // démonter l'input à la 1ère lettre (bug perte de focus).
                if (e.key === "Enter" && e.currentTarget.value.trim()) {
                  setMode("cmd");
                }
              }}
            />
          </div>
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
              />
            );
          })()}
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
                          <Link
                            href={`/projet/${p.id}?mode=rapport`}
                            onMouseEnter={() => prefetchProject(p.id)}
                            onTouchStart={() => prefetchProject(p.id)}
                            className="flex-1 min-w-0"
                          >
                            <h4 className="font-semibold text-gray-900 dark:text-gray-100 line-clamp-2 break-words text-base leading-tight">
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

      {/* VUE GROSSISTES */}
      {mode.startsWith("grossistes") && (() => {
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
          return matchesSearch(p, search.toLowerCase());
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
                    <ProjectCard key={project.id} project={project} mode="cmd" isAdmin={currentUser?.role === "admin"} onDelete={handleDeleteProject} />
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
                          <span className="text-sm text-gray-700 dark:text-gray-300 truncate max-w-[60%]">{p.projet}</span>
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
      {mode.startsWith("fournisseurs") && !mode.startsWith("fournisseurs-menu") && (() => {
        const allCmd = projectsData[mode] || projectsData["fournisseurs"] || [];
        const fournisseurNameFilter: Record<string, string> = {
          "fournisseurs-duka": "Duka", "fournisseurs-duscholux": "Duscholux", "fournisseurs-ronal": "Ronal",
          "fournisseurs-nelo": "Nelo", "fournisseurs-novellini": "Novellini", "fournisseurs-samo": "Samo",
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
          return matchesSearch(p, search.toLowerCase());
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
                    <ProjectCard key={project.id} project={project} mode="cmd" isAdmin={currentUser?.role === "admin"} onDelete={handleDeleteProject} />
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
                          <span className="text-sm text-gray-700 dark:text-gray-300 truncate max-w-[60%]">{p.projet}</span>
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

        const q = search.toLowerCase();
        const sanitairesFiltered = sanitairesProjects.filter((p) => {
          if (collabFilter && !p.collaborateurs.toLowerCase().includes(collabFilter.toLowerCase())) return false;
          if (statusFilter && p.etatCMD !== statusFilter) return false;
          return (
            p.projet.toLowerCase().includes(q) ||
            p.ofrTM.toLowerCase().includes(q) ||
            p.nomChantier.toLowerCase().includes(q) ||
            p.fournisseurs.some((f) => f.toLowerCase().includes(q)) ||
            (p.sanitaireNames || []).some((s: string) => s.toLowerCase().includes(q))
          );
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
                    <ProjectCard key={project.id} project={project} mode="cmd" isAdmin={currentUser?.role === "admin"} onDelete={handleDeleteProject} />
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
                          <span className="text-sm text-gray-700 dark:text-gray-300 truncate max-w-[60%]">{p.projet}</span>
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
        // Filter helpers for the 4 databases
        const filterYear = statsDateMode === "year" ? Number(statsYear) : null;
        const filterMonth = statsDateMode === "month" ? statsMonth : null; // "YYYY-MM"
        const filterMonthNum = filterMonth ? Number(filterMonth.split("-")[1]) : null;
        const filterMonthYear = filterMonth ? Number(filterMonth.split("-")[0]) : null;

        // DB1: daily services data
        const svcFiltered = statsServices.filter((r: any) => {
          if (statsDateMode === "year" && filterYear && r.annee !== filterYear) return false;
          if (statsDateMode === "month" && filterMonth && r.mois !== filterMonth) return false;
          if (statsDateMode === "range" && (statsDateFrom || statsDateTo)) {
            // Build date from available fields
            let rowDate: string | null = null;
            const jourNum = r.jour ? parseInt(r.jour, 10) : 1;
            const jour = isNaN(jourNum) ? "01" : String(jourNum).padStart(2, "0");

            if (r.mois) {
              rowDate = `${r.mois}-${jour}`;
            } else if (r.annee) {
              rowDate = `${r.annee}-01-${jour}`;
            }

            if (!rowDate) return true; // no date info, keep it
            // Compare only the parts we have (from/to are "YYYY-MM-DD")
            const fromDate = statsDateFrom || "0000-00-00";
            const toDate = statsDateTo || "9999-12-31";
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
          if (statsDateMode === "range" && filterYear && r.annee !== filterYear) return false;
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
          if (statsDateMode === "range" && filterYear && r.annee !== filterYear) return false;
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
          if (statsDateMode === "range" && filterYear && r.annee !== filterYear) return false;
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

        // Collaborator stats (only completed/archived projects)
        const allProjectsRaw = projectsData["cmd-termine"] || projectsData["archives"] || [];
        const allProjects: Project[] = filterByStatsDate(allProjectsRaw, statsDateMode, statsDateFrom, statsDateTo, statsMonth, statsYear);
        const buildCollabStats = (projects: Project[]) => COLLABORATEURS_LIST.map((name) => {
          const collabProjects = projects.filter((p) => p.collaborateurs.toLowerCase().includes(name.toLowerCase()));
          const cabines = collabProjects.reduce((s, p) => {
            const attr = cabineAttributions[p.id];
            if (attr?.length) return s + attr.filter((m) => m.toLowerCase() === name.toLowerCase()).length;
            return s + (p.nbCabines || 0);
          }, 0);
          const soucisCount = collabProjects.filter((p) => p.soucisMontage).length;
          const soucisRate = collabProjects.length > 0 ? Math.round((soucisCount / collabProjects.length) * 100) : 0;
          return { name, projects: collabProjects.length, cabines, soucisCount, soucisRate };
        }).sort((a, b) => b.cabines - a.cabines);
        const collabStats = buildCollabStats(allProjects);
        const allProjectsB: Project[] = statsCompare
          ? filterByStatsDate(allProjectsRaw, statsBMode, statsBFrom, statsBTo, statsBMonth, statsBYear)
          : [];
        const collabStatsB = statsCompare ? buildCollabStats(allProjectsB) : [];

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

            {/* Filtre de dates + bouton VS */}
            <div>
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
            </div>

            {/* KPIs */}
            <div>
              <button onClick={() => toggleSection("kpis")} className="flex items-center gap-2 text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 w-full text-left">
                {expandedSections.has("kpis") ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                Indicateurs cles
              </button>
              {expandedSections.has("kpis") && (() => {
                const totalDemontages = svcFiltered.reduce((s: number, r: any) => s + r.demontages, 0);
                const bDemontages = svcFilteredB.reduce((s: number, r: any) => s + r.demontages, 0);
                const kpis = [
                  { label: "Montages",       valA: totalMontages, valB: bMontages,  color: "text-[#1e3a5f] dark:text-white",  size: "text-3xl" },
                  { label: "Cabines mesurées",valA: totalCabines,  valB: bCabines,   color: "text-[#1e3a5f] dark:text-white",  size: "text-3xl" },
                  { label: "Mesures",        valA: totalMesures,  valB: bMesures,   color: "text-green-600",                   size: "text-3xl" },
                  { label: "CA (CHF)",       valA: totalCA,       valB: bCA,        color: "text-blue-600",                    size: "text-3xl", fmt: (v: number) => v > 0 ? `${(v / 1000).toFixed(0)}k` : "0" },
                  { label: "Services",       valA: totalServices, valB: bServices,  color: "text-purple-600",                  size: "text-2xl" },
                  { label: "SAV",            valA: totalSAV,      valB: bSAV,       color: "text-red-500",                     size: "text-2xl" },
                  { label: "Offres",         valA: totalOFR,      valB: bOFR,       color: "text-amber-600",                   size: "text-2xl" },
                  { label: "Demontages",     valA: totalDemontages,valB: bDemontages,color: "text-teal-600",                   size: "text-2xl" },
                ];
                return (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {kpis.map(({ label, valA, valB, color, size, fmt }) => {
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
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* Tendance mensuelle (12 mois) from DB1 */}
            <div>
              <button onClick={() => toggleSection("monthly")} className="flex items-center gap-2 text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 w-full text-left">
                {expandedSections.has("monthly") ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                Tendance mensuelle (12 mois)
              </button>
              {expandedSections.has("monthly") && (
                <div className="glass-card rounded-2xl p-4">
                  <div className="space-y-3">
                    {last12.map((key) => {
                      const d = svcByMonth[key];
                      const [yy, mm] = key.split("-");
                      const label = `${monthNames12[Number(mm) - 1]} ${yy}`;
                      const maxVal = Math.max(...last12.map((k) => Math.max(svcByMonth[k].montages, svcByMonth[k].cabines, svcByMonth[k].mesures, svcByMonth[k].ofr)), 1);
                      const bars = [
                        { label: "Mesures", val: d.mesures, color: "bg-cyan-500" },
                        { label: "Cabines", val: d.cabines, color: "bg-green-500" },
                        { label: "Montages", val: d.montages, color: "bg-orange-500" },
                        { label: "Démontages", val: d.demontages, color: "bg-rose-500" },
                        { label: "Services", val: d.services, color: "bg-emerald-500" },
                        { label: "SAV", val: d.sav, color: "bg-red-400" },
                        { label: "Nb. OFR", val: d.ofr, color: "bg-blue-500" },
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
                                {/* Valeur affichée À DROITE de la barre — toujours
                                    lisible, même si la barre est minuscule (1, 5,
                                    9 démontages etc. qui passaient avant invisibles
                                    dans la barre car le texte blanc était clippé
                                    par le overflow-hidden de la mini-barre). */}
                                <span className="text-[10px] font-bold text-gray-700 dark:text-gray-200 tabular-nums w-9 shrink-0 text-right">{b.val}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    {last12.length === 0 && <p className="text-xs text-gray-400 text-center py-4">Aucune donnee pour cette periode</p>}
                  </div>
                </div>
              )}
            </div>

            {/* Collaborators breakdown */}
            <div>
              <button onClick={() => toggleSection("collabs")} className="flex items-center gap-2 text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 w-full text-left">
                {expandedSections.has("collabs") ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                Par collaborateur
              </button>
              {expandedSections.has("collabs") && (
                <div className="space-y-2">
                  {collabStats.filter((cs) => cs.projects > 0 || (statsCompare && collabStatsB.find(b => b.name === cs.name && b.projects > 0))).map((cs) => {
                    const colors = getCollaboratorColor(cs.name);
                    const maxCollabProjects = Math.max(...collabStats.map((c) => c.projects), 1);
                    const csB = statsCompare ? (collabStatsB.find((b) => b.name === cs.name) ?? { projects: 0, cabines: 0, soucisCount: 0, soucisRate: 0 }) : null;
                    return (
                      <div key={cs.name} className="glass-card rounded-2xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: colors.dot }} />
                          <span className="text-sm font-semibold">{cs.name}</span>
                          <span className="ml-auto text-xs text-gray-500">
                            {statsCompare
                              ? <><span className="text-blue-500 font-bold">{cs.projects}A</span> <span className="text-gray-300">|</span> <span className="text-orange-400 font-bold">{csB!.projects}B</span> projets</>
                              : <>{cs.projects} projets</>}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-3 text-center mb-2">
                          <div>
                            {statsCompare ? (
                              <div className="flex items-end justify-center gap-1">
                                <p className="text-lg font-bold text-blue-600">{cs.cabines}</p>
                                <p className="text-sm font-semibold text-orange-400 mb-0.5">/{csB!.cabines}</p>
                              </div>
                            ) : (
                              <p className="text-lg font-bold text-[#1e3a5f] dark:text-white">{cs.cabines}</p>
                            )}
                            <p className="text-[10px] text-gray-400">cabines</p>
                          </div>
                          <div>
                            {statsCompare ? (
                              <div className="flex items-end justify-center gap-1">
                                <p className="text-lg font-bold text-blue-600">{cs.soucisCount}</p>
                                <p className="text-sm font-semibold text-orange-400 mb-0.5">/{csB!.soucisCount}</p>
                              </div>
                            ) : (
                              <p className="text-lg font-bold text-[#1e3a5f] dark:text-white">{cs.soucisCount}</p>
                            )}
                            <p className="text-[10px] text-gray-400">soucis</p>
                          </div>
                          <div>
                            {statsCompare ? (
                              <div className="flex items-end justify-center gap-1">
                                <p className={`text-lg font-bold ${cs.soucisRate > 20 ? "text-red-500" : cs.soucisRate > 10 ? "text-yellow-500" : "text-green-500"}`}>{cs.soucisRate}%</p>
                                <p className="text-sm font-semibold text-orange-400 mb-0.5">/{csB!.soucisRate}%</p>
                              </div>
                            ) : (
                              <p className={`text-lg font-bold ${cs.soucisRate > 20 ? "text-red-500" : cs.soucisRate > 10 ? "text-yellow-500" : "text-green-500"}`}>{cs.soucisRate}%</p>
                            )}
                            <p className="text-[10px] text-gray-400">taux soucis</p>
                          </div>
                        </div>
                        <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${(cs.projects / maxCollabProjects) * 100}%`, backgroundColor: colors.dot }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Consultation des rapports */}
            {consultationsData && (
              <div>
                <button onClick={() => toggleSection("consultations")} className="flex items-center gap-2 text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 w-full text-left">
                  {expandedSections.has("consultations") ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  Consultation des rapports
                  <span className="ml-auto text-xs font-bold text-emerald-600 normal-case tracking-normal">{consultationsData.summary.percentage}%</span>
                </button>
                {expandedSections.has("consultations") && (() => {
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
                    <div className="space-y-3">
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
                              href={`/projet/${p.projectId}?mode=stats`}
                              className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-slate-800/50"
                            >
                              <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${p.consulted ? "bg-emerald-500" : "bg-gray-300 dark:bg-gray-600"}`} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{p.projet || "Projet sans nom"}</p>
                                <p className="text-[10px] text-gray-400 truncate">
                                  {p.typeClient || "—"}
                                  {p.dateMontage && ` · ${new Date(p.dateMontage).toLocaleDateString("fr-CH", { day: "2-digit", month: "short", year: "2-digit" })}`}
                                </p>
                              </div>
                              <div className="text-right shrink-0">
                                {p.consulted ? (
                                  <>
                                    <p className="text-xs font-semibold text-emerald-600">
                                      👁 {p.viewCount} · 📄 {p.pdfCount}
                                    </p>
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
              </div>
            )}

            {/* Par type de client (from DB2) */}
            <div>
              <button onClick={() => toggleSection("typeclient")} className="flex items-center gap-2 text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 w-full text-left">
                {expandedSections.has("typeclient") ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                Par type de client
              </button>
              {expandedSections.has("typeclient") && (
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
                  {typeClientStats.length === 0 && <p className="text-xs text-gray-400 text-center py-4 col-span-2">Aucune donnee</p>}
                </div>
              )}
            </div>

            {/* Par fournisseur/marque (from DB3) */}
            <div>
              <button onClick={() => toggleSection("marques")} className="flex items-center gap-2 text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 w-full text-left">
                {expandedSections.has("marques") ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                Par fournisseur / marque
              </button>
              {expandedSections.has("marques") && (
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
                    {mrqFiltered.length === 0 && <p className="text-xs text-gray-400 text-center py-4">Aucune donnee</p>}
                  </div>
                </div>
              )}
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
      {!loading && mode !== "dashboard" && !mode.endsWith("-termine") && !mode.startsWith("clients-") && !mode.startsWith("grossistes") && !mode.startsWith("fournisseurs") && mode !== "rapport" && mode !== "stats" && mode !== "archives" && mode !== "projets-tous" && mode !== "destockage" && mode !== "sanitaires" && viewMode === "list" && (
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

        const q = search.toLowerCase();
        const archiveFiltered = q
          ? archiveProjects.filter((p: any) =>
              p.projet.toLowerCase().includes(q) ||
              p.ofrTM.toLowerCase().includes(q) ||
              p.nomChantier.toLowerCase().includes(q) ||
              p.collaborateurs.toLowerCase().includes(q) ||
              p.fournisseurs.some((f: string) => f.toLowerCase().includes(q))
            )
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
                          <h4 className="font-semibold text-gray-900 dark:text-gray-100 line-clamp-2 break-words leading-tight">{p.projet || "Sans nom"}</h4>
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
      {mode === "projets-tous" && (() => {
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

        const q = search.toLowerCase();
        const matchesQuery = (p: any) =>
          !q ||
          p.projet.toLowerCase().includes(q) ||
          p.ofrTM.toLowerCase().includes(q) ||
          p.nomChantier.toLowerCase().includes(q) ||
          p.collaborateurs.toLowerCase().includes(q) ||
          p.fournisseurs.some((f: string) => f.toLowerCase().includes(q));

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
                    {Object.keys(STATUS_CMD_COLORS).concat(["Terminé", "Annulé"]).map((s) => {
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
                          <h4 className="font-semibold text-gray-900 dark:text-gray-100 line-clamp-2 break-words leading-tight">{p.projet || "Sans nom"}</h4>
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

      {/* VUE DÉSTOCKAGE — inventaire des cabines en stock + action déstocker */}
      {mode === "destockage" && (
        <DestockageView isAdmin={currentUser?.role === "admin"} />
      )}


      {mode !== "dashboard" && mode !== "rapport" && !mode.startsWith("grossistes") && !mode.startsWith("fournisseurs") && mode !== "stats" && mode !== "archives" && mode !== "projets-tous" && mode !== "destockage" && mode !== "sanitaires" && !mode.startsWith("clients-") && (<>
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
                <ProjectCard key={project.id} project={project} mode={mode} isAdmin={currentUser?.role === "admin"} onDelete={handleDeleteProject} />
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
