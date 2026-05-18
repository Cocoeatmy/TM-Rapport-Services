"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { Search, Mail, Phone, Building, User, Calendar, Loader2, AlertCircle, Tag, Pencil, Trash2, Plus, Check, X, Globe, MapPin, Hash, Camera, BarChart3, TrendingUp, Package, Layers, Filter, ChevronDown } from "lucide-react";
import { thumbnailUrl } from "@/lib/image-url";

interface CRMEntry {
  id: string;
  name: string;
  icon: string;
  properties: Record<string, any>;
}

type ClientMode = "clients-contacts" | "clients-entreprises" | "clients-fournisseurs" | "clients-grossistes";

const MODE_TO_TYPE: Record<ClientMode, string> = {
  "clients-contacts": "contacts",
  "clients-entreprises": "entreprises",
  "clients-fournisseurs": "fournisseurs",
  "clients-grossistes": "grossistes",
};

const POSTE_COLORS: Record<string, string> = {
  "Directeur": "bg-purple-100 text-purple-700",
  "Back Office": "bg-blue-100 text-blue-700",
  "Key Account Manager": "bg-amber-100 text-amber-700",
  "Technicien Sanitaire": "bg-green-100 text-green-700",
  "Représentant sanitaire": "bg-teal-100 text-teal-700",
  "Fondateur": "bg-red-100 text-red-700",
  "Employé de bureau": "bg-gray-100 text-gray-700",
  "Responsable site": "bg-indigo-100 text-indigo-700",
  "Architecte": "bg-orange-100 text-orange-700",
};

// ─── Cache global des projets pour les stats (chargé une seule fois) ─────────
let _projectsCache: any[] | null = null;
let _projectsCachePromise: Promise<any[]> | null = null;

function fetchAllProjectsCached(): Promise<any[]> {
  if (_projectsCache !== null) return Promise.resolve(_projectsCache);
  if (!_projectsCachePromise) {
    _projectsCachePromise = fetch("/api/projects/all")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => { _projectsCache = Array.isArray(data) ? data : []; return _projectsCache!; })
      .catch(() => { _projectsCache = []; return []; });
  }
  return _projectsCachePromise;
}

// Type de stats calculé pour une entité CRM
interface EntityStats {
  totalProjects: number;
  totalCabines: number;
  mesuresCount: number;
  montagesCount: number;
  fournisseurs: { name: string; projects: number; cabines: number }[];
  series: { name: string; projects: number; cabines: number }[];
  topClients: { name: string; projects: number; cabines: number }[];
}

// Champ de filtre selon le type d'entité CRM
const ENTITY_NAMEFIELD: Record<string, string> = {
  entreprises: "sanitaireNames",
  fournisseurs: "fournisseursNames",
  grossistes:   "grossistesNames",
};

interface StatsFilter {
  year: number | null;
  month: number | null; // 1–12
  from: string;         // "YYYY-MM" ou ""
  to: string;           // "YYYY-MM" ou ""
}

/** Retourne la date de référence d'un projet terminé (date montage > CMD reçue). */
function projectRefDate(p: any): string {
  return p.dateMontage || p.dateMontageEnd || p.dateCMDRecue || "";
}

function projectMatchesFilter(p: any, f: StatsFilter): boolean {
  const dateStr = projectRefDate(p);
  if (!dateStr) return !f.year && !f.month && !f.from && !f.to; // pas de date → exclure si filtre actif
  const [y, m] = dateStr.split("-").map(Number);
  if (f.year  && y !== f.year)  return false;
  if (f.month && m !== f.month) return false;
  if (f.from) {
    const [fy, fm] = f.from.split("-").map(Number);
    if (y < fy || (y === fy && m < fm)) return false;
  }
  if (f.to) {
    const [ty, tm] = f.to.split("-").map(Number);
    if (y > ty || (y === ty && m > tm)) return false;
  }
  return true;
}

function computeEntityStats(projects: any[], entityName: string, entityType: string, filter?: StatsFilter): EntityStats {
  const nameField = ENTITY_NAMEFIELD[entityType];
  if (!nameField) return { totalProjects: 0, totalCabines: 0, mesuresCount: 0, montagesCount: 0, fournisseurs: [], series: [], topClients: [] };

  const lc = entityName.toLowerCase();
  const noFilter = !filter || (!filter.year && !filter.month && !filter.from && !filter.to);

  const related = projects.filter((p) =>
    p.etatCMD === "Terminé" &&
    Array.isArray(p[nameField]) && p[nameField].some((n: string) => n.toLowerCase() === lc) &&
    (noFilter || projectMatchesFilter(p, filter!))
  );

  const fMap: Record<string, { projects: number; cabines: number }> = {};
  const sMap: Record<string, { projects: number; cabines: number }> = {};
  const cMap: Record<string, { projects: number; cabines: number }> = {};
  let totalCabines = 0, mesuresCount = 0, montagesCount = 0;
  let cabinesSansFournisseur = 0, cabinesSansSerie = 0;
  let projsSansFournisseur = 0, projsSansSerie = 0;

  for (const p of related) {
    const cab = p.nbCabines || 0;
    totalCabines += cab;
    const types: string[] = p.typeServices || [];
    if (types.some((t: string) => t.toLowerCase().includes("mesure")))  mesuresCount++;
    if (types.some((t: string) => t.toLowerCase().includes("montage"))) montagesCount++;

    const fList: string[] = p.fournisseurs || [];
    const sList: string[] = p.seriesCabines || [];

    // Distribuer les cabines équitablement entre fournisseurs (évite double-comptage)
    if (fList.length > 0) {
      const cabPerF = cab / fList.length;
      for (const f of fList) {
        if (!fMap[f]) fMap[f] = { projects: 0, cabines: 0 };
        fMap[f].projects++;
        fMap[f].cabines += cabPerF;
      }
    } else {
      cabinesSansFournisseur += cab;
      projsSansFournisseur++;
    }

    if (sList.length > 0) {
      const cabPerS = cab / sList.length;
      for (const s of sList) {
        if (!sMap[s]) sMap[s] = { projects: 0, cabines: 0 };
        sMap[s].projects++;
        sMap[s].cabines += cabPerS;
      }
    } else {
      cabinesSansSerie += cab;
      projsSansSerie++;
    }

    // Pour fournisseurs/grossistes → top clients entreprises
    for (const n of (p.sanitaireNames || [])) {
      if (!cMap[n]) cMap[n] = { projects: 0, cabines: 0 };
      cMap[n].projects++; cMap[n].cabines += cab;
    }
  }

  const sortDesc = (map: Record<string, { projects: number; cabines: number }>) =>
    Object.entries(map).map(([name, v]) => ({ name, projects: v.projects, cabines: Math.round(v.cabines) }))
      .sort((a, b) => b.cabines - a.cabines);

  const fournisseursList = sortDesc(fMap);
  if (cabinesSansFournisseur > 0) fournisseursList.push({ name: "Non renseigné", projects: projsSansFournisseur, cabines: cabinesSansFournisseur });

  const seriesList = sortDesc(sMap);
  if (cabinesSansSerie > 0) seriesList.push({ name: "Non renseigné", projects: projsSansSerie, cabines: cabinesSansSerie });

  return {
    totalProjects: related.length,
    totalCabines,
    mesuresCount,
    montagesCount,
    fournisseurs: fournisseursList,
    series:       seriesList,
    topClients:   entityType !== "entreprises" ? sortDesc(cMap).slice(0, 8) : [],
  };
}

// ─── Couleurs pour les barres ─────────────────────────────────────────────────
const BAR_PALETTES = [
  { bar: "bg-blue-500",    label: "text-blue-700 dark:text-blue-300"    },
  { bar: "bg-violet-500",  label: "text-violet-700 dark:text-violet-300" },
  { bar: "bg-emerald-500", label: "text-emerald-700 dark:text-emerald-300" },
  { bar: "bg-amber-500",   label: "text-amber-700 dark:text-amber-300"  },
  { bar: "bg-rose-500",    label: "text-rose-700 dark:text-rose-300"    },
  { bar: "bg-cyan-500",    label: "text-cyan-700 dark:text-cyan-300"    },
  { bar: "bg-orange-500",  label: "text-orange-700 dark:text-orange-300" },
  { bar: "bg-teal-500",    label: "text-teal-700 dark:text-teal-300"    },
];

function StatBar({ label, count, totalCabines, cabines, colorIdx }: {
  label: string; count: number; totalCabines: number; cabines: number; colorIdx: number;
}) {
  const pct = totalCabines > 0 ? Math.round((cabines / totalCabines) * 100) : 0;
  const isUnknown = label === "Non renseigné";
  const pal = isUnknown
    ? { bar: "bg-gray-300 dark:bg-gray-600", label: "text-gray-400" }
    : BAR_PALETTES[colorIdx % BAR_PALETTES.length];
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[11px] font-medium truncate flex-1 ${isUnknown ? "text-gray-400 dark:text-gray-500 italic" : "text-gray-700 dark:text-gray-300"}`}>{label}</span>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-gray-400">{count} proj.</span>
          {cabines > 0 && <span className="text-[10px] text-gray-400">{cabines} cab.</span>}
          <span className={`text-[11px] font-bold tabular-nums w-8 text-right ${pal.label}`}>{pct}%</span>
        </div>
      </div>
      <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full ${pal.bar} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const MONTHS_FR = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];

function StatsPanel({ entityName, entityType }: { entityName: string; entityType: string }) {
  const [allProjects, setAllProjects] = useState<any[] | null>(null);
  const [loading, setLoading]         = useState(true);

  // Filtres
  const [filterYear,  setFilterYear]  = useState<number | null>(null);
  const [filterMonth, setFilterMonth] = useState<number | null>(null);
  const [filterFrom,  setFilterFrom]  = useState("");
  const [filterTo,    setFilterTo]    = useState("");
  const [showRange,   setShowRange]   = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchAllProjectsCached().then((projects) => {
      if (!cancelled) { setAllProjects(projects); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [entityName, entityType]);

  // Années disponibles (depuis les projets liés terminés)
  const availableYears = useMemo(() => {
    if (!allProjects) return [];
    const lc = entityName.toLowerCase();
    const nf = ENTITY_NAMEFIELD[entityType];
    const years = new Set<number>();
    allProjects.forEach((p) => {
      if (p.etatCMD !== "Terminé") return;
      if (!Array.isArray(p[nf]) || !p[nf].some((n: string) => n.toLowerCase() === lc)) return;
      const d = projectRefDate(p);
      if (d) years.add(parseInt(d.slice(0, 4)));
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [allProjects, entityName, entityType]);

  const filter: StatsFilter = { year: filterYear, month: filterMonth, from: filterFrom, to: filterTo };
  const hasFilter = !!(filterYear || filterMonth || filterFrom || filterTo);

  const stats = useMemo(() => {
    if (!allProjects) return null;
    return computeEntityStats(allProjects, entityName, entityType, hasFilter ? filter : undefined);
  }, [allProjects, entityName, entityType, filterYear, filterMonth, filterFrom, filterTo]);

  const resetFilter = () => { setFilterYear(null); setFilterMonth(null); setFilterFrom(""); setFilterTo(""); setShowRange(false); };

  if (loading) {
    return (
      <div className="py-6 flex items-center justify-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
        <span className="text-xs text-gray-400">Calcul des statistiques…</span>
      </div>
    );
  }

  // ── UI Filtres ────────────────────────────────────────────────────────────────
  const filterBar = (
    <div className="space-y-2 mb-3">
      {/* Ligne 1 : années rapides + toggle range */}
      <div className="flex flex-wrap items-center gap-1">
        <Filter className="w-3 h-3 text-gray-400 shrink-0" />
        {/* Tout */}
        <button
          onClick={() => { setFilterYear(null); setFilterMonth(null); setShowRange(false); setFilterFrom(""); setFilterTo(""); }}
          className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${!hasFilter ? "bg-blue-600 text-white border-blue-600" : "border-gray-300 dark:border-gray-600 text-gray-500 hover:border-blue-400"}`}
        >Tout</button>
        {/* Années */}
        {availableYears.map((y) => (
          <button
            key={y}
            onClick={() => { setFilterYear(filterYear === y ? null : y); setFilterMonth(null); setShowRange(false); setFilterFrom(""); setFilterTo(""); }}
            className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${filterYear === y ? "bg-blue-600 text-white border-blue-600" : "border-gray-300 dark:border-gray-600 text-gray-500 hover:border-blue-400"}`}
          >{y}</button>
        ))}
        {/* Toggle range */}
        <button
          onClick={() => { setShowRange((v) => !v); setFilterYear(null); setFilterMonth(null); }}
          className={`ml-auto text-[10px] px-2 py-0.5 rounded-full border flex items-center gap-0.5 transition-colors ${showRange ? "bg-violet-600 text-white border-violet-600" : "border-gray-300 dark:border-gray-600 text-gray-500 hover:border-violet-400"}`}
        >
          <ChevronDown className="w-2.5 h-2.5" /> Période
        </button>
      </div>

      {/* Ligne 2 : mois (si année sélectionnée) */}
      {filterYear && !showRange && (
        <div className="flex flex-wrap gap-1 pl-4">
          <button
            onClick={() => setFilterMonth(null)}
            className={`text-[9px] px-1.5 py-0.5 rounded-full border transition-colors ${!filterMonth ? "bg-blue-500 text-white border-blue-500" : "border-gray-200 dark:border-gray-700 text-gray-400 hover:border-blue-300"}`}
          >Tous</button>
          {MONTHS_FR.map((m, i) => (
            <button
              key={i}
              onClick={() => setFilterMonth(filterMonth === i + 1 ? null : i + 1)}
              className={`text-[9px] px-1.5 py-0.5 rounded-full border transition-colors ${filterMonth === i + 1 ? "bg-blue-500 text-white border-blue-500" : "border-gray-200 dark:border-gray-700 text-gray-400 hover:border-blue-300"}`}
            >{m}</button>
          ))}
        </div>
      )}

      {/* Ligne 3 : range de/à */}
      {showRange && (
        <div className="flex items-center gap-1.5 pl-4 flex-wrap">
          <span className="text-[10px] text-gray-500">De</span>
          <input type="month" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)}
            className="text-[10px] h-6 px-1.5 rounded border border-gray-300 dark:border-gray-600 dark:bg-slate-800 dark:text-gray-100 focus:outline-none focus:border-blue-400" />
          <span className="text-[10px] text-gray-500">à</span>
          <input type="month" value={filterTo} onChange={(e) => setFilterTo(e.target.value)}
            className="text-[10px] h-6 px-1.5 rounded border border-gray-300 dark:border-gray-600 dark:bg-slate-800 dark:text-gray-100 focus:outline-none focus:border-blue-400" />
          {hasFilter && (
            <button onClick={resetFilter} className="text-[9px] text-red-400 hover:text-red-500 ml-1">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );

  if (!stats || stats.totalProjects === 0) {
    return (
      <div>
        {filterBar}
        <div className="py-5 text-center">
          <BarChart3 className="w-7 h-7 mx-auto mb-2 text-gray-200 dark:text-gray-700" />
          <p className="text-xs text-gray-400">{hasFilter ? "Aucun projet pour cette période" : "Aucun projet lié trouvé"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 mt-2">
      {filterBar}

      {/* ── Résumé ── */}
      <div className="grid grid-cols-3 gap-1.5">
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-2.5 text-center">
          <p className="text-xl font-bold text-blue-700 dark:text-blue-300 leading-none">{stats.totalProjects}</p>
          <p className="text-[9px] text-blue-500 mt-1">Projets</p>
        </div>
        <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-2.5 text-center">
          <p className="text-xl font-bold text-emerald-700 dark:text-emerald-300 leading-none">{stats.totalCabines}</p>
          <p className="text-[9px] text-emerald-500 mt-1">Cabines</p>
        </div>
        <div className="bg-violet-50 dark:bg-violet-900/20 rounded-xl p-2.5 text-center">
          <p className="text-[13px] font-bold text-violet-700 dark:text-violet-300 leading-none tabular-nums">
            {stats.mesuresCount}<span className="text-[9px] font-medium text-violet-400 ml-0.5">M</span>{" "}
            /{" "}
            {stats.montagesCount}<span className="text-[9px] font-medium text-violet-400 ml-0.5">I</span>
          </p>
          <p className="text-[9px] text-violet-500 mt-1">Mes. / Inst.</p>
        </div>
      </div>

      {/* ── Fournisseurs de cabines ── */}
      {stats.fournisseurs.length > 0 && (
        <div className="bg-white/70 dark:bg-white/5 border border-gray-100 dark:border-gray-700/50 rounded-xl p-3 space-y-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <Package className="w-3 h-3 text-gray-400" />
            <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Fournisseurs cabines</p>
          </div>
          {stats.fournisseurs.map((f, i) => (
            <StatBar key={f.name} label={f.name} count={f.projects} totalCabines={stats.totalCabines} cabines={f.cabines} colorIdx={i} />
          ))}
        </div>
      )}

      {/* ── Séries / Modèles ── */}
      {stats.series.length > 0 && (
        <div className="bg-white/70 dark:bg-white/5 border border-gray-100 dark:border-gray-700/50 rounded-xl p-3 space-y-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <Layers className="w-3 h-3 text-gray-400" />
            <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Séries / Modèles</p>
          </div>
          {stats.series.map((s, i) => (
            <StatBar key={s.name} label={s.name} count={s.projects} totalCabines={stats.totalCabines} cabines={s.cabines} colorIdx={i + 2} />
          ))}
        </div>
      )}

      {/* ── Top clients (fournisseurs/grossistes seulement) ── */}
      {stats.topClients.length > 0 && (
        <div className="bg-white/70 dark:bg-white/5 border border-gray-100 dark:border-gray-700/50 rounded-xl p-3 space-y-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp className="w-3 h-3 text-gray-400" />
            <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Top clients</p>
          </div>
          {stats.topClients.map((c, i) => (
            <StatBar key={c.name} label={c.name} count={c.projects} totalCabines={stats.totalCabines} cabines={c.cabines} colorIdx={i + 4} />
          ))}
        </div>
      )}
    </div>
  );
}

// Keys to skip in display/edit (internal, read-only, or relation IDs)
const SKIP_KEYS = new Set(["__entryName"]);
const HIDDEN_KEYS = new Set(["Dossiers (CMD)", "Dossiers", "Contacts", "Opportunités", "Projets CRM", "Entreprise", "Grossistes", "Fournisseurs"]);
const READONLY_KEYS = new Set(["Nb. Projets", "Projets terminé", "Projets terminés"]);

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("fr-CH", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return ""; }
}

function getIcon(key: string) {
  const k = key.toLowerCase();
  if (k.includes("email") || k.includes("mail")) return <Mail className="w-3.5 h-3.5 text-blue-500 shrink-0" />;
  if (k.includes("téléphone") || k.includes("portable") || k.includes("phone") || k.includes("mobile")) return <Phone className="w-3.5 h-3.5 text-green-500 shrink-0" />;
  if (k.includes("site") || k.includes("web") || k.includes("url")) return <Globe className="w-3.5 h-3.5 text-indigo-500 shrink-0" />;
  if (k.includes("adresse") || k.includes("address")) return <MapPin className="w-3.5 h-3.5 text-red-500 shrink-0" />;
  if (k.includes("rabais") || k.includes("nb") || k.includes("projet")) return <Hash className="w-3.5 h-3.5 text-gray-400 shrink-0" />;
  if (k.includes("étiquette") || k.includes("tag")) return <Tag className="w-3.5 h-3.5 text-sky-500 shrink-0" />;
  if (k.includes("date") || k.includes("contact") || k.includes("dernier")) return <Calendar className="w-3.5 h-3.5 text-amber-500 shrink-0" />;
  return null;
}

function isRelationIdArray(value: any): boolean {
  if (!Array.isArray(value)) return false;
  return value.length > 0 && typeof value[0] === "string" && /^[0-9a-f-]{30,}$/.test(value[0]);
}

function PropertyValue({ label, value }: { label: string; value: any }) {
  if (value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) return null;
  if (SKIP_KEYS.has(label) || HIDDEN_KEYS.has(label)) return null;
  if (isRelationIdArray(value)) return null;

  const k = label.toLowerCase();
  const icon = getIcon(label);

  // Email - clickable
  if ((k.includes("email") || k.includes("mail")) && typeof value === "string" && value.includes("@")) {
    return (
      <a href={`mailto:${value}`} className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400 hover:underline truncate">
        {icon} <span className="text-gray-400 shrink-0">{label}:</span> {value}
      </a>
    );
  }

  // Phone - clickable
  if ((k.includes("téléphone") || k.includes("portable") || k.includes("phone") || k.includes("mobile")) && typeof value === "string" && value) {
    return (
      <a href={`tel:${value}`} className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400 hover:underline">
        {icon} <span className="text-gray-400 shrink-0">{label}:</span> {value}
      </a>
    );
  }

  // URL - clickable
  if ((k.includes("site") || k.includes("web") || k.includes("url")) && typeof value === "string" && value) {
    const url = value.startsWith("http") ? value : `https://${value}`;
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-indigo-600 dark:text-indigo-400 hover:underline truncate">
        {icon} <span className="text-gray-400 shrink-0">{label}:</span> {value}
      </a>
    );
  }

  // Arrays (multi-select, relations)
  if (Array.isArray(value)) {
    return (
      <div className="flex items-start gap-2 text-xs">
        {icon} <span className="text-gray-400 shrink-0">{label}:</span>
        <div className="flex flex-wrap gap-1">
          {value.map((v, i) => (
            <span key={i} className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-1.5 py-0.5 rounded text-[10px]">{String(v)}</span>
          ))}
        </div>
      </div>
    );
  }

  // Percentage (rabais, etc.)
  if (k.includes("rabais") || k.includes("taux") || k.includes("marge")) {
    const num = typeof value === "number" ? value : parseFloat(String(value));
    if (!isNaN(num)) {
      const pct = num < 1 ? Math.round(num * 100) : Math.round(num);
      return (
        <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
          {icon} <span className="text-gray-400">{label}:</span> <span className="font-medium">{pct} %</span>
        </div>
      );
    }
  }

  // Boolean
  if (typeof value === "boolean") {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
        {icon} <span className="text-gray-400">{label}:</span> {value ? "Oui" : "Non"}
      </div>
    );
  }

  // Date
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
        {icon || <Calendar className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
        <span className="text-gray-400">{label}:</span> {formatDate(value)}
      </div>
    );
  }

  // Default string/number
  return (
    <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 truncate">
      {icon} <span className="text-gray-400 shrink-0">{label}:</span> <span className="truncate">{String(value)}</span>
    </div>
  );
}

function LogoImage({ src, name }: { src: string; name: string }) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: "200px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (error) {
    return (
      <div className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-gray-700 flex items-center justify-center shrink-0 text-[10px] font-bold text-gray-500">
        {initials}
      </div>
    );
  }

  return (
    <div ref={ref} className="w-8 h-8 rounded-lg shrink-0 relative">
      {!loaded && (
        <div className="absolute inset-0 bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center text-[10px] font-bold text-gray-400 animate-pulse">
          {initials}
        </div>
      )}
      {visible && (
        <img
          src={src.startsWith("http") ? thumbnailUrl(src, 64) : src}
          alt=""
          className={`w-8 h-8 rounded-lg object-contain transition-opacity duration-200 ${loaded ? "opacity-100" : "opacity-0"}`}
          decoding="async"
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
        />
      )}
    </div>
  );
}

function EntryCard({ entry, mode, isAdmin, onEdit, onDelete }: {
  entry: CRMEntry; mode: string; isAdmin: boolean;
  onEdit: (e: CRMEntry) => void; onDelete: (e: CRMEntry) => void;
}) {
  const p = entry.properties;
  const poste = p["Poste"] || "";
  const etiquettes = Array.isArray(p["Étiquettes"]) ? p["Étiquettes"] : [];
  const isEmoji = entry.icon && !entry.icon.startsWith("http");
  const isImage = entry.icon && entry.icon.startsWith("http");

  const titleKey = Object.entries(p).find(([, v]) => v === entry.name)?.[0] || "";
  const displayProps = Object.entries(p)
    .filter(([k, v]) => k !== titleKey && !SKIP_KEYS.has(k) && !HIDDEN_KEYS.has(k) && !isRelationIdArray(v) && v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0))
    .sort(([a], [b]) => {
      const priority = (k: string) => {
        const l = k.toLowerCase();
        if (l.includes("adresse")) return 0;
        if (l.includes("email") || l.includes("mail")) return 1;
        if (l.includes("portable") || l.includes("mobile")) return 2;
        if (l.includes("téléphone") || l.includes("phone")) return 3;
        if (l.includes("site") || l.includes("web")) return 4;
        if (l.includes("étiquette")) return 5;
        return 10;
      };
      return priority(a) - priority(b);
    });

  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<"infos" | "stats">("infos");

  // Stats disponibles pour tous sauf contacts
  const entityType = MODE_TO_TYPE[mode as ClientMode];
  const hasStats = entityType && entityType !== "contacts";

  return (
    <div className="glass-card rounded-2xl p-4 hover:shadow-lg transition-shadow">
      {/* ── En-tête : toujours visible ── */}
      <div className="flex items-start justify-between gap-2 cursor-pointer" onClick={() => setExpanded((v) => !v)}>
        <div className="flex items-center gap-2 mb-1 min-w-0">
          {isImage ? (
            <LogoImage src={entry.icon} name={entry.name} />
          ) : isEmoji ? (
            <span className="text-xl shrink-0">{entry.icon}</span>
          ) : (
            <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center shrink-0">
              <User className="w-4 h-4 text-gray-500" />
            </div>
          )}
          <div className="min-w-0">
            <h3 className="font-semibold text-[#1e3a5f] dark:text-white truncate text-sm">{entry.name}</h3>
            <div className="flex items-center gap-1 flex-wrap">
              {poste && <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${POSTE_COLORS[poste] || "bg-gray-100 text-gray-600"}`}>{poste}</span>}
              {etiquettes.map((t: string) => (
                <span key={t} className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700">{t}</span>
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <button onClick={(e) => { e.stopPropagation(); onEdit(entry); }} className="w-7 h-7 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center">
            <Pencil className="w-3 h-3 text-gray-400" />
          </button>
          {isAdmin && (
            <button onClick={(e) => { e.stopPropagation(); onDelete(entry); }} className="w-7 h-7 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center">
              <Trash2 className="w-3 h-3 text-red-400" />
            </button>
          )}
        </div>
      </div>

      {/* ── Contenu expansible ── */}
      {expanded && (
        <div className="mt-2">
          {/* Onglets Infos / Statistiques */}
          {hasStats && (
            <div className="flex gap-1 mb-3 border-b border-gray-100 dark:border-gray-700/60 pb-2">
              <button
                onClick={() => setActiveTab("infos")}
                className={`flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-full font-semibold transition-colors ${activeTab === "infos" ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300" : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"}`}
              >
                Infos
              </button>
              <button
                onClick={() => setActiveTab("stats")}
                className={`flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full font-semibold transition-colors ${activeTab === "stats" ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300" : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"}`}
              >
                <BarChart3 className="w-3 h-3" />
                Statistiques
              </button>
            </div>
          )}

          {/* Contenu de l'onglet actif */}
          {(!hasStats || activeTab === "infos") ? (
            <div className="space-y-1.5">
              {displayProps.map(([k, v]) => (
                <PropertyValue key={k} label={k} value={v} />
              ))}
              {displayProps.length === 0 && (
                <p className="text-[10px] text-gray-400 italic">Aucune information disponible</p>
              )}
            </div>
          ) : (
            <StatsPanel entityName={entry.name} entityType={entityType} />
          )}
        </div>
      )}

      {/* Indicateur "cliquer pour voir" si pas encore ouvert */}
      {!expanded && displayProps.length > 0 && (
        <p className="text-[10px] text-gray-400 mt-1 cursor-pointer hover:text-blue-500 transition-colors" onClick={() => setExpanded(true)}>
          Voir les détails…
        </p>
      )}
    </div>
  );
}

// Dynamic form that shows ALL properties
function EntryForm({ entry, type, onSubmit, onCancel, loading }: {
  entry: CRMEntry | null;
  type: string;
  onSubmit: (properties: Record<string, any>, icon?: string | null) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const props = entry?.properties || {};
  const [values, setValues] = useState<Record<string, string>>({});
  const [multiValues, setMultiValues] = useState<Record<string, string[]>>({});
  const [iconUrl, setIconUrl] = useState<string>(entry?.icon || "");
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [schema, setSchema] = useState<Record<string, { type: string; options?: string[] }>>({});
  const [newOption, setNewOption] = useState<Record<string, string>>({});

  // Load schema with options
  useEffect(() => {
    fetch(`/api/crm?type=${type}&schema=1`)
      .then((r) => r.json())
      .then((data) => { if (data && !data.error) setSchema(data); })
      .catch(() => {});
  }, [type]);

  useEffect(() => {
    const init: Record<string, string> = {};
    const initMulti: Record<string, string[]> = {};
    if (entry) {
      for (const [k, v] of Object.entries(props)) {
        if (SKIP_KEYS.has(k) || HIDDEN_KEYS.has(k) || isRelationIdArray(v)) continue;
        if (Array.isArray(v)) {
          initMulti[k] = v.map(String);
          init[k] = v.join(", ");
        } else if (v !== null && v !== undefined) {
          init[k] = String(v);
        } else {
          init[k] = "";
        }
      }
      const titleKey = Object.entries(props).find(([, v]) => v === entry.name)?.[0];
      if (titleKey && !init[titleKey]) init[titleKey] = entry.name;
      setIconUrl(entry.icon || "");
    }
    setValues(init);
    setMultiValues(initMulti);
  }, [entry]);

  const handleChange = (key: string, val: string) => {
    setValues((prev) => ({ ...prev, [key]: val }));
  };

  const handleIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingIcon(true);
    try {
      const formData = new FormData();
      formData.append("files", file);
      formData.append("category", "crm-logos");
      formData.append("projectId", "crm");
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (res.ok) {
        const data = await res.json();
        const url = data.files?.[0]?.url;
        if (url) setIconUrl(url);
      }
    } catch {} finally {
      setUploadingIcon(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(values)) {
      if (READONLY_KEYS.has(k)) continue;
      const schemaType = schema[k]?.type;
      if (schemaType === "multi_select") {
        result[k] = multiValues[k] || v.split(",").map((s: string) => s.trim()).filter(Boolean);
      } else {
        result[k] = v;
      }
    }
    // Include multi_select fields not in values
    for (const [k, v] of Object.entries(multiValues)) {
      if (!result[k]) result[k] = v;
    }
    const iconChanged = entry ? iconUrl !== (entry.icon || "") : !!iconUrl;
    onSubmit(result, iconChanged ? (iconUrl || null) : undefined);
  };

  const fields = entry
    ? Object.keys(props).filter((k) => !SKIP_KEYS.has(k) && !HIDDEN_KEYS.has(k) && !isRelationIdArray(props[k]))
    : ["Nom", "Email", "Téléphone"];

  return (
    <form onSubmit={handleSubmit} className="space-y-3 max-h-[70vh] overflow-y-auto">
      {/* Logo */}
      <div>
        <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Logo</label>
        <div className="flex items-center gap-3">
          {iconUrl && iconUrl.startsWith("http") ? (
            <img src={thumbnailUrl(iconUrl, 96)} alt="Logo" loading="lazy" decoding="async" className="w-12 h-12 rounded-lg object-contain border border-gray-200 dark:border-gray-700" />
          ) : iconUrl ? (
            <span className="text-3xl">{iconUrl}</span>
          ) : (
            <div className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              <User className="w-5 h-5 text-gray-400" />
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label className="cursor-pointer text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1">
              <Camera className="w-3 h-3" />
              {uploadingIcon ? "Upload..." : iconUrl ? "Changer" : "Ajouter"}
              <input type="file" accept="image/*" className="hidden" onChange={handleIconUpload} disabled={uploadingIcon} />
            </label>
            {iconUrl && (
              <button type="button" onClick={() => setIconUrl("")} className="text-xs text-red-500 hover:text-red-600 text-left">
                Supprimer
              </button>
            )}
          </div>
        </div>
      </div>

      {fields.map((key) => {
        const isReadOnly = READONLY_KEYS.has(key);
        const val = values[key] || "";
        const schemaEntry = schema[key];
        const fieldType = schemaEntry?.type;
        const options = schemaEntry?.options || [];

        return (
          <div key={key}>
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-0.5 block">{key}</label>
            {isReadOnly ? (
              <p className="text-sm text-gray-500 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">{val || "—"}</p>
            ) : fieldType === "select" && options.length > 0 ? (
              <select
                value={val}
                onChange={(e) => handleChange(key, e.target.value)}
                className="w-full h-9 px-3 text-sm rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-slate-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500/30 focus:outline-none"
              >
                <option value="">— Sélectionner —</option>
                {options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : fieldType === "multi_select" ? (
              <div>
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                  {(multiValues[key] || []).map((tag) => (
                    <span key={tag} className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                      {tag}
                      <button type="button" onClick={() => setMultiValues((prev) => ({ ...prev, [key]: (prev[key] || []).filter((t) => t !== tag) }))} className="hover:text-red-500">×</button>
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1 mb-1">
                  {options.filter((o) => !(multiValues[key] || []).includes(o)).map((o) => (
                    <button key={o} type="button" onClick={() => setMultiValues((prev) => ({ ...prev, [key]: [...(prev[key] || []), o] }))}
                      className="text-[10px] px-2 py-0.5 rounded-full border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-blue-400 hover:text-blue-600 transition-colors">
                      + {o}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1">
                  <input
                    type="text"
                    value={newOption[key] || ""}
                    onChange={(e) => setNewOption((prev) => ({ ...prev, [key]: e.target.value }))}
                    placeholder="Nouvelle option..."
                    className="flex-1 h-7 px-2 text-xs rounded border border-gray-200 dark:border-gray-700 dark:bg-slate-800 dark:text-gray-100"
                  />
                  <button type="button" onClick={() => {
                    const v = (newOption[key] || "").trim();
                    if (!v) return;
                    setMultiValues((prev) => ({ ...prev, [key]: [...(prev[key] || []), v] }));
                    setNewOption((prev) => ({ ...prev, [key]: "" }));
                  }} className="h-7 px-2 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ) : (
              <input
                type={key.toLowerCase().includes("email") || key.toLowerCase().includes("mail") ? "email" : key.toLowerCase().includes("date") ? "date" : "text"}
                value={val}
                onChange={(e) => handleChange(key, e.target.value)}
                placeholder={key}
                className="w-full h-9 px-3 text-sm rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-slate-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500/30 focus:outline-none"
              />
            )}
          </div>
        );
      })}
      <div className="flex gap-2 pt-2 sticky bottom-0 bg-white dark:bg-slate-800">
        <button type="submit" disabled={loading}
          className="flex-1 h-9 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-1.5">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Enregistrer
        </button>
        <button type="button" onClick={onCancel} className="h-9 px-4 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300">
          Annuler
        </button>
      </div>
    </form>
  );
}

function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-x-4 top-[10%] z-50 max-w-md mx-auto bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-5 max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </>
  );
}

export function CRMClients({ mode, isAdmin }: { mode: ClientMode; isAdmin?: boolean }) {
  const [entries, setEntries] = useState<CRMEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [editEntry, setEditEntry] = useState<CRMEntry | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteEntry, setDeleteEntry] = useState<CRMEntry | null>(null);
  const [mutating, setMutating] = useState(false);

  const type = MODE_TO_TYPE[mode];

  const fetchEntries = (refresh = false) => {
    if (refresh) {
      // Purge du localStorage pour forcer le rechargement des logos/données
      try { localStorage.removeItem(`tm-crm-${type}`); } catch {}
      // Aussi vider le cache global des projets pour les stats
      _projectsCache = null;
      _projectsCachePromise = null;
    }
    fetch(`/api/crm?type=${type}${refresh ? "&refresh=1" : ""}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setEntries(data);
          try { localStorage.setItem(`tm-crm-${type}`, JSON.stringify(data)); } catch {}
        } else if (data.error) {
          setError(data.error);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    setLoading(true);
    setError("");
    setEntries([]);
    try {
      const cached = localStorage.getItem(`tm-crm-${type}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setEntries(parsed);
          setLoading(false);
        }
      }
    } catch {}
    fetchEntries();
  }, [type]);

  const filtered = useMemo(() => {
    if (!search.trim()) return entries;
    const q = search.toLowerCase();
    return entries.filter((e) => {
      const allValues = Object.values(e.properties).flatMap((v) =>
        Array.isArray(v) ? v : typeof v === "string" ? [v] : []
      );
      return e.name.toLowerCase().includes(q) || allValues.some((v) => String(v).toLowerCase().includes(q));
    });
  }, [entries, search]);

  const handleCreate = async (properties: Record<string, any>, icon?: string | null) => {
    setMutating(true);
    try {
      const res = await fetch("/api/crm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, properties, ...(icon !== undefined ? { icon } : {}) }),
      });
      if (res.ok) {
        setShowCreate(false);
        fetchEntries();
      }
    } catch {} finally { setMutating(false); }
  };

  const handleEdit = async (properties: Record<string, any>, icon?: string | null) => {
    if (!editEntry) return;
    setMutating(true);
    try {
      const res = await fetch("/api/crm", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editEntry.id, type, properties, ...(icon !== undefined ? { icon } : {}) }),
      });
      if (res.ok) {
        setEditEntry(null);
        fetchEntries();
      }
    } catch {} finally { setMutating(false); }
  };

  const handleDelete = async () => {
    if (!deleteEntry) return;
    setMutating(true);
    try {
      const res = await fetch("/api/crm", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deleteEntry.id, type }),
      });
      if (res.ok) {
        setDeleteEntry(null);
        setEntries((prev) => prev.filter((e) => e.id !== deleteEntry.id));
      }
    } catch {} finally { setMutating(false); }
  };

  if (loading && entries.length === 0) {
    return (
      <div className="text-center py-16">
        <Loader2 className="w-8 h-8 mx-auto mb-3 text-blue-500 animate-spin" />
        <p className="text-sm text-gray-400">Chargement...</p>
      </div>
    );
  }

  if (error && entries.length === 0) {
    return (
      <div className="text-center py-16">
        <AlertCircle className="w-8 h-8 mx-auto mb-3 text-red-400" />
        <p className="text-sm text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1 max-w-lg">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/70 dark:bg-slate-800/70 border border-gray-200 dark:border-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
        </div>
        {/* Rafraîchir — purge localStorage + re-fetch Notion */}
        <button
          onClick={() => { setLoading(true); fetchEntries(true); }}
          title="Rafraîchir depuis Notion (logos, données)"
          className="shrink-0 h-10 w-10 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
        <button
          onClick={() => setShowCreate(true)}
          className="shrink-0 h-10 px-4 rounded-xl bg-blue-600 text-white text-sm font-medium flex items-center gap-1.5 hover:bg-blue-700 active:scale-95 transition-all"
        >
          <Plus className="w-4 h-4" />
          Nouveau
        </button>
      </div>

      <p className="text-xs text-gray-400 mb-3">{filtered.length} résultat{filtered.length !== 1 ? "s" : ""}</p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((e) => (
          <EntryCard key={e.id} entry={e} mode={mode} isAdmin={!!isAdmin} onEdit={setEditEntry} onDelete={setDeleteEntry} />
        ))}
        {filtered.length === 0 && (
          <p className="col-span-full text-center text-sm text-gray-400 py-8">Aucun résultat</p>
        )}
      </div>

      {/* Create Modal */}
      <Modal open={showCreate} onClose={() => !mutating && setShowCreate(false)} title="Nouveau">
        <EntryForm entry={null} type={type} onSubmit={handleCreate} onCancel={() => setShowCreate(false)} loading={mutating} />
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editEntry} onClose={() => !mutating && setEditEntry(null)} title="Modifier">
        {editEntry && (
          <EntryForm entry={editEntry} type={type} onSubmit={handleEdit} onCancel={() => setEditEntry(null)} loading={mutating} />
        )}
      </Modal>

      {/* Delete Confirmation */}
      <Modal open={!!deleteEntry} onClose={() => !mutating && setDeleteEntry(null)} title="Supprimer">
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Supprimer <strong>{deleteEntry?.name}</strong> ? Cette action est irréversible.
        </p>
        <div className="flex gap-2">
          <button onClick={handleDelete} disabled={mutating}
            className="flex-1 h-9 rounded-lg bg-red-600 text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-1.5">
            {mutating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            Supprimer
          </button>
          <button onClick={() => setDeleteEntry(null)} className="h-9 px-4 rounded-lg border border-gray-200 text-sm text-gray-600">
            Annuler
          </button>
        </div>
      </Modal>
    </div>
  );
}
