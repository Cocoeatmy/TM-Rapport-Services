"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  ArrowLeft,
  Users,
  Box,
  Clock,
  BarChart3,
  Loader2,
  Shield,
  ChevronDown,
  ChevronUp,
  MapPin,
  ScrollText,
  ExternalLink,
  Mail,
  Database,
  Package,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getWidgetConfig, isWidgetVisible } from "@/lib/dashboard-config";

const ExportExcel = dynamic(() => import("@/components/export-excel").then(m => ({ default: m.ExportExcel })), {
  ssr: false,
  loading: () => <div className="animate-pulse bg-gray-200 rounded-xl h-9" />,
});

const InteractiveMap = dynamic(() => import("@/components/interactive-map").then(m => ({ default: m.InteractiveMap })), {
  ssr: false,
  loading: () => <div className="animate-pulse bg-gray-200 rounded-xl h-64" />,
});

const WidgetSettings = dynamic(() => import("@/components/widget-settings").then(m => ({ default: m.WidgetSettings })), {
  ssr: false,
  loading: () => <div className="animate-pulse bg-gray-200 rounded-xl h-9" />,
});
import type { WidgetConfig } from "@/lib/dashboard-config";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCollaboratorColor } from "@/lib/collaborators";
import type { Project } from "@/lib/notion";

// Liste de projets affichée sous une ligne dépliée. Définie au niveau MODULE
// (et non dans le corps du composant) : sinon c'était une nouvelle fonction à
// chaque rendu → React la remontait sans cesse (flicker + coût).
function ProjectList({ items }: { items: Project[] }) {
  return (
    <div className="mt-2 space-y-1.5 border-t border-gray-100 pt-2">
      {items.map((p) => (
        <a
          key={p.id}
          href={`/projet/${p.id}?mode=cmd`}
          className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-white/60 active:bg-white/80 transition-colors text-xs"
        >
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-900 dark:text-gray-100 line-clamp-2 mt-0.5">{p.projet || "Sans nom"}</p>
            <p className="text-gray-500 truncate">{p.adresseChantier || p.nomChantier || "---"}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="outline" className="text-[10px]">
              {p.nbCabines || 0} cab.
            </Badge>
            <ExternalLink className="w-3 h-3 text-gray-300" />
          </div>
        </a>
      ))}
    </div>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const [projectsEnCours, setProjectsEnCours] = useState<Project[]>([]);
  const [projectsTermines, setProjectsTermines] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminTab, setAdminTab] = useState<"en-cours" | "termines">("en-cours");
  const [widgets, setWidgets] = useState<WidgetConfig[]>([]);
  const [logs, setLogs] = useState<{ id: string; timestamp: number; user: string; projectId: string; projectName: string; action: string; details: string }[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [chantierView, setChantierView] = useState<"liste" | "carte">("liste");

  useEffect(() => {
    setWidgets(getWidgetConfig());
  }, []);

  const loadLogs = () => {
    fetch("/api/logs").then((r) => r.json()).then((data) => {
      if (Array.isArray(data)) setLogs(data);
    }).catch(() => {});
  };

  useEffect(() => {
    // Vérifier le rôle
    fetch("/api/auth")
      .then((r) => r.json())
      .then((data) => {
        if (data.user?.role !== "admin") {
          router.push("/");
          return;
        }
        setIsAdmin(true);
      });

    // Charger les projets en cours + terminés
    Promise.all([
      fetch("/api/projects").then((r) => r.json()),
      fetch("/api/projects/cmd-termine").then((r) => r.json()),
    ]).then(([enCours, termines]) => {
      if (Array.isArray(enCours)) setProjectsEnCours(enCours);
      if (Array.isArray(termines)) setProjectsTermines(termines);
    }).finally(() => setLoading(false));
  }, [router]);

  // Sections/lignes dépliées : un Set → chaque ligne s'ouvre/se ferme de façon
  // INDÉPENDANTE (avant : un seul `string | null` → ouvrir une ligne fermait
  // les autres, et selon l'ordre de rendu certaines paraissaient impossibles à
  // rouvrir/refermer).
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  // Filtre temps à 3 niveaux :
  //   - yearFilter : "all" ou "YYYY"
  //   - monthRangeStart / monthRangeEnd : "YYYY-MM" (null = pas de filtre mois)
  //   - si seul monthRangeStart est set → un mois précis
  //   - si les deux → une plage inclusive de X à Y
  const [yearFilter, setYearFilter] = useState<string>("all");
  const [monthRangeStart, setMonthRangeStart] = useState<string | null>(null);
  const [monthRangeEnd, setMonthRangeEnd] = useState<string | null>(null);

  // Mode comparaison (VS) — période B comparée à la période A ci-dessus.
  const [compareMode, setCompareMode] = useState(false);
  // Type de comparaison : "period" (période A vs B) ou "collab" (2 monteurs).
  const [compareType, setCompareType] = useState<"period" | "collab">("period");
  const [collabA, setCollabA] = useState("");
  const [collabB, setCollabB] = useState("");
  const [yearFilterB, setYearFilterB] = useState<string>("all");
  const [monthRangeStartB, setMonthRangeStartB] = useState<string | null>(null);
  const [monthRangeEndB, setMonthRangeEndB] = useState<string | null>(null);

  const toggleExpand = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (!isAdmin || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  const projects = adminTab === "en-cours" ? projectsEnCours : projectsTermines;

  // Années disponibles (ordre décroissant, année courante en premier).
  const availableYears = Array.from(
    new Set(
      projects
        .map((p) => p.dateMontage?.slice(0, 4))
        .filter(Boolean)
    )
  ).sort().reverse() as string[];

  // Liste des 12 mois d'une année (pour les pickers mois A et B).
  const monthsFor = (year: string) =>
    year !== "all"
      ? Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`)
      : [];
  const monthsForYear = monthsFor(yearFilter);
  const monthsForYearB = monthsFor(yearFilterB);

  // Filtre période réutilisable (année + mois seul ou plage de mois).
  const filterByPeriod = (list: Project[], year: string, mStart: string | null, mEnd: string | null) =>
    list.filter((p) => {
      const month = p.dateMontage?.slice(0, 7);
      if (year !== "all" && !p.dateMontage?.startsWith(year)) return false;
      if (mStart) {
        if (!month) return false;
        const end = mEnd || mStart;
        if (month < mStart || month > end) return false;
      }
      return true;
    });

  // Période A (pilote tout le tableau de bord) + période B (mode comparaison).
  const filteredProjects = filterByPeriod(projects, yearFilter, monthRangeStart, monthRangeEnd);
  const filteredProjectsB = compareMode && compareType === "period"
    ? filterByPeriod(projects, yearFilterB, monthRangeStartB, monthRangeEndB)
    : [];

  // Libellé court d'une période, pour les en-têtes de comparaison.
  const periodLabel = (year: string, mStart: string | null, mEnd: string | null): string => {
    if (mStart) {
      const end = mEnd || mStart;
      const fmt = (m: string) => {
        const [y, mo] = m.split("-");
        return `${["Janv.", "Fév.", "Mars", "Avril", "Mai", "Juin", "Juil.", "Août", "Sept.", "Oct.", "Nov.", "Déc."][parseInt(mo) - 1]} ${y}`;
      };
      return mStart === end ? fmt(mStart) : `${fmt(mStart)} → ${fmt(end)}`;
    }
    return year === "all" ? "Toutes années" : year;
  };
  const labelA = periodLabel(yearFilter, monthRangeStart, monthRangeEnd);
  const labelB = periodLabel(yearFilterB, monthRangeStartB, monthRangeEndB);

  const MONTH_SHORT = ["Janv.", "Fév.", "Mars", "Avril", "Mai", "Juin", "Juil.", "Août", "Sept.", "Oct.", "Nov.", "Déc."];

  const monthLabel = (m: string) => {
    const [y, mo] = m.split("-");
    return `${MONTH_SHORT[parseInt(mo) - 1]} ${y}`;
  };

  // Reset de la plage (utilisé quand on change d'année ou sur "tous les mois").
  const clearMonthRange = () => {
    setMonthRangeStart(null);
    setMonthRangeEnd(null);
  };

  // Clic sur un mois :
  //   - 1er clic : sélectionne ce mois (range = ce mois seul)
  //   - 2e clic sur un autre mois : crée la plage (ordre auto)
  //   - clic sur le mois déjà sélectionné (range "single") : désélectionne
  //   - clic avec plage déjà active : reset, recommence à ce mois
  const handleMonthClick = (month: string) => {
    const rangeActive = !!(monthRangeStart && monthRangeEnd);
    if (!monthRangeStart || rangeActive) {
      setMonthRangeStart(month);
      setMonthRangeEnd(null);
      return;
    }
    if (month === monthRangeStart) {
      clearMonthRange();
      return;
    }
    if (month < monthRangeStart) {
      setMonthRangeEnd(monthRangeStart);
      setMonthRangeStart(month);
    } else {
      setMonthRangeEnd(month);
    }
  };

  // Versions période B (mode comparaison) — même logique que A.
  const clearMonthRangeB = () => {
    setMonthRangeStartB(null);
    setMonthRangeEndB(null);
  };
  const handleMonthClickB = (month: string) => {
    const rangeActive = !!(monthRangeStartB && monthRangeEndB);
    if (!monthRangeStartB || rangeActive) {
      setMonthRangeStartB(month);
      setMonthRangeEndB(null);
      return;
    }
    if (month === monthRangeStartB) {
      clearMonthRangeB();
      return;
    }
    if (month < monthRangeStartB) {
      setMonthRangeEndB(monthRangeStartB);
      setMonthRangeStartB(month);
    } else {
      setMonthRangeEndB(month);
    }
  };

  // Stats par équipe (valeur exacte du champ Notion)
  const equipeMap: Record<string, { projets: number; cabines: number }> = {};
  filteredProjects.forEach((p) => {
    const equipe = p.collaborateurs || "Non assigné";
    if (!equipeMap[equipe]) equipeMap[equipe] = { projets: 0, cabines: 0 };
    equipeMap[equipe].projets += 1;
    equipeMap[equipe].cabines += p.nbCabines || 0;
  });
  const equipeStats = Object.entries(equipeMap)
    .map(([name, stats]) => ({ name, ...stats }))
    .sort((a, b) => b.cabines - a.cabines);

  // Stats par série de cabine
  const seriesMap: Record<string, number> = {};
  filteredProjects.forEach((p) => {
    p.seriesCabines.forEach((s) => {
      seriesMap[s] = (seriesMap[s] || 0) + (p.nbCabines || 1);
    });
  });
  const seriesStats = Object.entries(seriesMap)
    .sort(([, a], [, b]) => b - a);

  // Stats par statut
  const statusMap: Record<string, number> = {};
  filteredProjects.forEach((p) => {
    const s = p.etatCMD || "Non défini";
    statusMap[s] = (statusMap[s] || 0) + 1;
  });

  // Stats par fournisseur
  const fournisseurMap: Record<string, number> = {};
  filteredProjects.forEach((p) => {
    p.fournisseurs.forEach((f) => {
      fournisseurMap[f] = (fournisseurMap[f] || 0) + (p.nbCabines || 1);
    });
  });
  const fournisseurStats = Object.entries(fournisseurMap)
    .sort(([, a], [, b]) => b - a);

  // ── Stats FIABLES par monteur — basées sur l'attribution PAR CABINE
  //    ("Monteur responsable") + les heures arrivée/départ PAR CABINE, et NON
  //    sur le champ projet "Collaborateurs montages" (moins précis).
  //    Mis en place cette semaine via l'auto-attribution à l'upload photo. ──
  const parseCabMap = (raw: string): Map<number, string> => {
    const map = new Map<number, string>();
    if (!raw) return map;
    const re = /Cab(\d+)\s*:([^|]*)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(raw))) {
      const val = m[2].trim();
      if (val) map.set(parseInt(m[1], 10), val);
    }
    return map;
  };
  // HH:MM d'un slot en SAUTANT un éventuel préfixe date "YYYY-MM-DD:".
  // Aligné sur parseCabineTimes de la page projet. Bug corrigé : l'ancienne
  // version prenait le dernier \d{1,2}:\d{2}, ce qui sur "2026-06-03:08:30"
  // capturait "03:08" (jour:heure) au lieu de "08:30".
  const slotMinutes = (slot: string): number | null => {
    const m = (slot || "").match(/(?:\d{4}-\d{2}-\d{2}:)?(\d{1,2}):(\d{2})/);
    if (!m) return null;
    const h = parseInt(m[1], 10);
    const mn = parseInt(m[2], 10);
    if (h > 23 || mn > 59) return null;
    return h * 60 + mn;
  };
  // Durée (minutes) entre une arrivée et un départ, bornée à 12h (sanité).
  const durMinutes = (arr: string, dep: string): number => {
    if (!arr || !dep) return 0;
    const aMin = slotMinutes(arr);
    const dMin = slotMinutes(dep);
    if (aMin === null || dMin === null) return 0;
    let diff = dMin - aMin;
    if (diff <= 0) diff += 24 * 60; // passage minuit
    return diff <= 12 * 60 ? diff : 0;
  };

  // Agrège les stats monteur pour une liste de projets donnée (réutilisable A/B).
  const computeMonteurStats = (list: Project[]) => {
    const agg: Record<string, { cabines: number; minutes: number; cabinesAvecHeures: number; projets: Set<string> }> = {};
    const credit = (mt: string, cab: number, dur: number, projectId: string) => {
      if (!agg[mt]) agg[mt] = { cabines: 0, minutes: 0, cabinesAvecHeures: 0, projets: new Set() };
      agg[mt].cabines += cab;
      agg[mt].projets.add(projectId);
      if (dur > 0) {
        agg[mt].minutes += dur;
        agg[mt].cabinesAvecHeures += cab;
      }
    };
    list.forEach((p) => {
      const attrMap = parseCabMap(p.attributionCabines || "");
      if (attrMap.size > 0) {
        // ── Attribution PAR CABINE (multi-cabine, ou mono avec responsable) ──
        const arrMap = parseCabMap(p.heureArrivee || "");
        const depMap = parseCabMap(p.heureDepart || "");
        attrMap.forEach((monteurRaw, cabNum) => {
          const monteurs = monteurRaw.split(/\s*&\s*/).map((s) => s.trim()).filter(Boolean);
          if (monteurs.length === 0) return;
          const dur = durMinutes(arrMap.get(cabNum) || "", depMap.get(cabNum) || "");
          monteurs.forEach((mt) => credit(mt, 1, dur, p.id));
        });
        return;
      }
      // ── Mono-cabine sans responsable → fallback "Collaborateurs montages" ──
      //    Binôme (deux collaborateurs) → chacun crédité de la cabine + durée.
      const isMono = (p.nbCabines || 1) <= 1;
      if (!isMono) return; // multi-cabine sans attribution → exclu (peu fiable)
      const collabs = (p.collaborateurs || "").split(/\s*&\s*/).map((s) => s.trim()).filter(Boolean);
      if (collabs.length === 0) return;
      const dur = durMinutes(p.heureArrivee || "", p.heureDepart || "");
      collabs.forEach((mt) => credit(mt, 1, dur, p.id));
    });
    const montage = Object.entries(agg)
      .map(([name, v]) => ({ name, cabines: v.cabines, projets: v.projets.size, minutes: v.minutes, cabinesAvecHeures: v.cabinesAvecHeures }))
      .sort((a, b) => b.cabines - a.cabines);
    const heures = [...montage].filter((s) => s.minutes > 0).sort((a, b) => b.minutes - a.minutes);
    const totalCab = montage.reduce((s, m) => s + m.cabines, 0);
    return { montage, heures, totalCab };
  };

  const monteurA = computeMonteurStats(filteredProjects);
  const monteurB = compareMode && compareType === "period" ? computeMonteurStats(filteredProjectsB) : null;
  // Alias période A (rendu mono-période inchangé)
  const monteurMontageStats = monteurA.montage;
  const monteurHeuresStats = monteurA.heures;
  const totalCabinesAttribuees = monteurA.totalCab;
  const fmtMin = (m: number) => (m <= 0 ? "—" : `${Math.floor(m / 60)}h${(m % 60).toString().padStart(2, "0")}`);

  // Projets (période A) où un monteur donné est intervenu — pour le dépliage
  // de la carte "Montage par monteur". Même logique d'attribution que les stats.
  const normName = (s: string) =>
    (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  const projectsForMonteur = (name: string): Project[] => {
    const target = normName(name);
    const matches = (raw: string) =>
      raw.split(/\s*&\s*/).some((n) => normName(n) === target);
    return filteredProjects.filter((p) => {
      const attrMap = parseCabMap(p.attributionCabines || "");
      if (attrMap.size > 0) return Array.from(attrMap.values()).some((v) => matches(v));
      const isMono = (p.nbCabines || 1) <= 1;
      return isMono && matches(p.collaborateurs || "");
    });
  };

  // ── Fusion A/B pour l'affichage côte à côte par monteur (mode comparaison) ──
  //    metric: "cabines" (carte Montage) ou "minutes" (carte Heures).
  const buildComparison = (metric: "cabines" | "minutes") => {
    if (!monteurB) return [];
    const aMap = new Map(monteurA.montage.map((s) => [s.name, s]));
    const bMap = new Map(monteurB.montage.map((s) => [s.name, s]));
    const names = Array.from(new Set([...aMap.keys(), ...bMap.keys()]));
    return names
      .map((name) => {
        const a = aMap.get(name);
        const b = bMap.get(name);
        const valA = metric === "cabines" ? (a?.cabines || 0) : (a?.minutes || 0);
        const valB = metric === "cabines" ? (b?.cabines || 0) : (b?.minutes || 0);
        return { name, valA, valB, delta: valA - valB };
      })
      .filter((r) => r.valA > 0 || r.valB > 0)
      .sort((x, y) => y.valA - x.valA || y.valB - x.valB);
  };
  const montageComparison = compareMode && compareType === "period" ? buildComparison("cabines") : [];
  const heuresComparison = compareMode && compareType === "period" ? buildComparison("minutes") : [];

  // ── Comparaison entre 2 collaborateurs (même période A) ──────────────────
  const monteurNames = monteurMontageStats.map((s) => s.name);
  const statByName = (n: string) => monteurMontageStats.find((s) => s.name === n);
  const isCollabCompare = compareMode && compareType === "collab" && !!collabA && !!collabB;
  const collabStatA = isCollabCompare ? statByName(collabA) : undefined;
  const collabStatB = isCollabCompare ? statByName(collabB) : undefined;

  // Totaux (période A) + totaux période B pour la comparaison
  const totalCabines = filteredProjects.reduce((sum, p) => sum + (p.nbCabines || 0), 0);
  const totalProjets = filteredProjects.length;
  const totalCabinesB = filteredProjectsB.reduce((sum, p) => sum + (p.nbCabines || 0), 0);
  const totalProjetsB = filteredProjectsB.length;

  // Composant mini-liste de projets

  return (
    <div className="w-full px-4 sm:px-6 py-4 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <button
          onClick={() => router.push("/")}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 active:bg-gray-200 shrink-0"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
            Tableau de bord
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Administration TM Rapport Services</p>
        </div>
      </div>
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1 scrollbar-hide">
        <ExportExcel projects={projects} />
        <button
          onClick={async () => {
            const res = await fetch("/api/rapport-mensuel", { method: "POST" });
            const data = await res.json();
            if (res.ok) alert("Rapport mensuel envoyé par email !");
            else alert("Erreur: " + (data.error || "Erreur"));
          }}
          className="shrink-0 flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl glass-card hover:bg-white/80 transition-all active:scale-95"
        >
          <Mail className="w-4 h-4 text-blue-600" />
          Rapport mensuel
        </button>
        <button
          onClick={() => { setShowLogs(!showLogs); if (!showLogs) loadLogs(); }}
          className="shrink-0 flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl glass-card hover:bg-white/80 transition-all active:scale-95"
        >
          <ScrollText className="w-4 h-4 text-amber-600" />
          Logs
        </button>
        <button
          onClick={() => router.push("/admin/heures")}
          className="shrink-0 flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl glass-card hover:bg-white/80 transition-all active:scale-95"
        >
          <Clock className="w-4 h-4 text-teal-600" />
          Heures
        </button>
        <button
          onClick={() => router.push("/admin/pieces-defauts")}
          className="shrink-0 flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl glass-card hover:bg-white/80 transition-all active:scale-95"
        >
          <Package className="w-4 h-4 text-orange-600" />
          Pièces &amp; Défauts
        </button>
        <button
          onClick={() => router.push("/admin/stocks")}
          className="shrink-0 flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl glass-card hover:bg-white/80 transition-all active:scale-95"
        >
          <Package className="w-4 h-4 text-amber-600" />
          Stocks
        </button>
        <WidgetSettings config={widgets} onChange={setWidgets} />
      </div>

      {/* Onglets En cours / Terminés */}
      <div className="flex gap-1 mb-4 glass-tabs p-1.5 rounded-2xl max-w-xs">
        <button
          onClick={() => { setAdminTab("en-cours"); setYearFilter("all"); clearMonthRange(); setExpandedKeys(new Set()); }}
          className={`flex-1 text-sm font-medium py-2 rounded-lg transition-all duration-200 ${
            adminTab === "en-cours"
              ? "glass-tab-active text-[#1e3a5f]"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          En cours ({projectsEnCours.length})
        </button>
        <button
          onClick={() => { setAdminTab("termines"); setYearFilter("all"); clearMonthRange(); setExpandedKeys(new Set()); }}
          className={`flex-1 text-sm font-medium py-2 rounded-lg transition-all duration-200 ${
            adminTab === "termines"
              ? "glass-tab-active text-[#1e3a5f]"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Terminés ({projectsTermines.length})
        </button>
      </div>

      {/* Filtre temps — 2 niveaux (année + mois/plage) + comparaison VS */}
      <div className="space-y-2 mb-4">
        {/* Bascule comparaison (VS) */}
        <div className="flex items-center flex-wrap gap-2">
          <button
            onClick={() => setCompareMode((v) => !v)}
            className={`shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
              compareMode ? "glass-btn text-white" : "glass-card text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100"
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            Comparer (VS)
          </button>
          {compareMode && (
            <>
              {/* Sous-toggle : comparer des périodes ou des collaborateurs */}
              <div className="flex gap-1 glass-card rounded-full p-0.5">
                <button
                  onClick={() => setCompareType("period")}
                  className={`text-[11px] font-medium px-2.5 py-1 rounded-full transition-colors ${compareType === "period" ? "glass-btn text-white" : "text-gray-500 hover:text-gray-700"}`}
                >Périodes</button>
                <button
                  onClick={() => setCompareType("collab")}
                  className={`text-[11px] font-medium px-2.5 py-1 rounded-full transition-colors ${compareType === "collab" ? "glass-btn text-white" : "text-gray-500 hover:text-gray-700"}`}
                >Collaborateurs</button>
              </div>
              {compareType === "period" ? (
                <span className="text-[11px] text-gray-500 dark:text-gray-400">
                  <strong className="text-[#1e3a5f] dark:text-blue-300">{labelA}</strong>
                  <span className="mx-1 text-gray-400">vs</span>
                  <strong className="text-amber-600 dark:text-amber-400">{labelB}</strong>
                </span>
              ) : (collabA && collabB) ? (
                <span className="text-[11px] text-gray-500 dark:text-gray-400">
                  <strong className="text-[#1e3a5f] dark:text-blue-300">{collabA}</strong>
                  <span className="mx-1 text-gray-400">vs</span>
                  <strong className="text-amber-600 dark:text-amber-400">{collabB}</strong>
                </span>
              ) : null}
            </>
          )}
        </div>

        {/* Sélecteurs de collaborateurs (mode collab) */}
        {compareMode && compareType === "collab" && (
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <select
              value={collabA}
              onChange={(e) => setCollabA(e.target.value)}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-[#1e3a5f]/40 bg-white dark:bg-slate-800 text-[#1e3a5f] dark:text-blue-300 font-medium"
            >
              <option value="">Collaborateur A…</option>
              {monteurNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <span className="text-xs text-gray-400">vs</span>
            <select
              value={collabB}
              onChange={(e) => setCollabB(e.target.value)}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-amber-400/50 bg-white dark:bg-slate-800 text-amber-600 dark:text-amber-400 font-medium"
            >
              <option value="">Collaborateur B…</option>
              {monteurNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        )}

        {compareMode && compareType === "period" && (
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#1e3a5f] dark:text-blue-300 pt-0.5">Période A</p>
        )}
        {/* Ligne 1 : année */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide items-center">
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mr-1">Année</span>
          <button
            onClick={() => { setYearFilter("all"); clearMonthRange(); }}
            className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
              yearFilter === "all"
                ? "glass-btn text-white"
                : "glass-card text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100"
            }`}
          >
            Toutes
          </button>
          {availableYears.map((y) => (
            <button
              key={y}
              onClick={() => { setYearFilter(yearFilter === y ? "all" : y); clearMonthRange(); }}
              className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                yearFilter === y
                  ? "glass-btn text-white"
                  : "glass-card text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100"
              }`}
            >
              {y}
            </button>
          ))}
        </div>

        {/* Ligne 2 : mois (visible uniquement quand une année est sélectionnée) */}
        {yearFilter !== "all" && (
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide items-center">
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mr-1">Mois</span>
            <button
              onClick={clearMonthRange}
              className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                !monthRangeStart
                  ? "glass-btn text-white"
                  : "glass-card text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100"
              }`}
            >
              Toute l'année
            </button>
            {monthsForYear.map((m, idx) => {
              const isBoundary = m === monthRangeStart || m === monthRangeEnd;
              const inRange = monthRangeStart && monthRangeEnd && m >= monthRangeStart && m <= monthRangeEnd;
              return (
                <button
                  key={m}
                  onClick={() => handleMonthClick(m)}
                  className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                    isBoundary
                      ? "glass-btn text-white"
                      : inRange
                        ? "bg-blue-500/25 dark:bg-blue-400/20 text-blue-700 dark:text-blue-200 ring-1 ring-inset ring-blue-400/40"
                        : "glass-card text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100"
                  }`}
                >
                  {MONTH_SHORT[idx]}
                </button>
              );
            })}
          </div>
        )}

        {/* Indicateur de plage + bouton d'effacement */}
        {monthRangeStart && (
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 pl-1">
            <span>
              {monthRangeEnd && monthRangeEnd !== monthRangeStart
                ? <>Du <strong className="text-gray-700 dark:text-gray-100">{monthLabel(monthRangeStart)}</strong> au <strong className="text-gray-700 dark:text-gray-100">{monthLabel(monthRangeEnd)}</strong></>
                : <>Mois : <strong className="text-gray-700 dark:text-gray-100">{monthLabel(monthRangeStart)}</strong></>
              }
            </span>
            <button
              onClick={clearMonthRange}
              className="text-blue-600 dark:text-blue-300 hover:underline"
            >
              effacer
            </button>
            {!monthRangeEnd && (
              <span className="text-[10px] text-gray-400 dark:text-gray-500 italic">
                (touchez un 2ᵉ mois pour créer une plage)
              </span>
            )}
          </div>
        )}

        {/* ── Période B (mode comparaison de périodes) — accent ambre ── */}
        {compareMode && compareType === "period" && (
          <div className="mt-2 pt-3 border-t border-amber-300/40 space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">Période B</p>
            {/* Année B */}
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide items-center">
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mr-1">Année</span>
              <button
                onClick={() => { setYearFilterB("all"); clearMonthRangeB(); }}
                className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                  yearFilterB === "all" ? "bg-amber-500 text-white" : "glass-card text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100"
                }`}
              >
                Toutes
              </button>
              {availableYears.map((y) => (
                <button
                  key={y}
                  onClick={() => { setYearFilterB(yearFilterB === y ? "all" : y); clearMonthRangeB(); }}
                  className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                    yearFilterB === y ? "bg-amber-500 text-white" : "glass-card text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100"
                  }`}
                >
                  {y}
                </button>
              ))}
            </div>
            {/* Mois B */}
            {yearFilterB !== "all" && (
              <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide items-center">
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mr-1">Mois</span>
                <button
                  onClick={clearMonthRangeB}
                  className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                    !monthRangeStartB ? "bg-amber-500 text-white" : "glass-card text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100"
                  }`}
                >
                  Toute l'année
                </button>
                {monthsForYearB.map((m, idx) => {
                  const isBoundary = m === monthRangeStartB || m === monthRangeEndB;
                  const inRange = monthRangeStartB && monthRangeEndB && m >= monthRangeStartB && m <= monthRangeEndB;
                  return (
                    <button
                      key={m}
                      onClick={() => handleMonthClickB(m)}
                      className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                        isBoundary
                          ? "bg-amber-500 text-white"
                          : inRange
                            ? "bg-amber-500/25 text-amber-700 dark:text-amber-200 ring-1 ring-inset ring-amber-400/40"
                            : "glass-card text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100"
                      }`}
                    >
                      {MONTH_SHORT[idx]}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className={`grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6 ${!isWidgetVisible(widgets, "kpis") ? "hidden" : ""}`}>
        <Card className="glass-card">
          <CardContent className="pt-4 text-center">
            <p className="text-3xl font-bold text-[#1e3a5f] dark:text-cyan-300">{totalProjets}</p>
            <p className="text-xs text-gray-500 dark:text-gray-300 mt-1">Projets en cours</p>
            {compareMode && compareType === "period" && (
              <p className="text-[11px] mt-1 text-amber-600 dark:text-amber-400 font-medium">
                vs {totalProjetsB} <span className="text-gray-400 font-normal">({labelB})</span>
              </p>
            )}
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="pt-4 text-center">
            <p className="text-3xl font-bold text-[#1e3a5f] dark:text-blue-300">{totalCabines}</p>
            <p className="text-xs text-gray-500 dark:text-gray-300 mt-1">Cabines totales</p>
            {compareMode && compareType === "period" && (
              <p className="text-[11px] mt-1 text-amber-600 dark:text-amber-400 font-medium">
                vs {totalCabinesB} <span className="text-gray-400 font-normal">({labelB})</span>
              </p>
            )}
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="pt-4 text-center">
            <p className="text-3xl font-bold text-[#1e3a5f] dark:text-emerald-300">{equipeStats.length}</p>
            <p className="text-xs text-gray-500 dark:text-gray-300 mt-1">Équipes</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="pt-4 text-center">
            <p className="text-3xl font-bold text-[#1e3a5f] dark:text-amber-300">{seriesStats.length}</p>
            <p className="text-xs text-gray-500 dark:text-gray-300 mt-1">Séries de cabines</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Stats fiables par monteur (attribution + heures PAR CABINE) ── */}
      <div className="grid sm:grid-cols-2 gap-4 mb-4">
        {/* Montage par monteur */}
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-[#1e3a5f] dark:text-blue-300">
              <Box className="w-4 h-4" />
              Montage par monteur
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {compareMode && compareType === "period" ? (
              montageComparison.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-6">Aucune donnée sur les deux périodes.</p>
              ) : (
                <>
                  <div className="flex items-center justify-end gap-2 text-[10px] font-semibold pb-0.5">
                    <span className="text-[#1e3a5f] dark:text-blue-300">{labelA}</span>
                    <span className="text-gray-300">vs</span>
                    <span className="text-amber-600 dark:text-amber-400">{labelB}</span>
                  </div>
                  {(() => {
                    const max = Math.max(...montageComparison.flatMap((x) => [x.valA, x.valB]), 1);
                    return montageComparison.map((r) => {
                      const color = getCollaboratorColor(r.name).dot;
                      return (
                        <div key={r.name} className="space-y-1">
                          <div className="flex items-center justify-between text-sm gap-2">
                            <span className="flex items-center gap-1.5 min-w-0">
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                              <span className="truncate">{r.name}</span>
                            </span>
                            <span className="flex items-center gap-1.5 shrink-0 text-xs">
                              <span className="font-semibold text-[#1e3a5f] dark:text-blue-300">{r.valA}</span>
                              <span className="text-gray-300">/</span>
                              <span className="font-semibold text-amber-600 dark:text-amber-400">{r.valB}</span>
                              {r.delta !== 0 && (
                                <span className={`font-medium ${r.delta > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
                                  {r.delta > 0 ? "+" : ""}{r.delta}
                                </span>
                              )}
                            </span>
                          </div>
                          <div className="flex gap-1">
                            <div className="h-2 flex-1 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${(r.valA / max) * 100}%`, backgroundColor: color }} />
                            </div>
                            <div className="h-2 flex-1 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-amber-400" style={{ width: `${(r.valB / max) * 100}%` }} />
                            </div>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </>
              )
            ) : compareMode && compareType === "collab" ? (
              (!collabA || !collabB) ? (
                <p className="text-xs text-gray-400 text-center py-6">Choisissez 2 collaborateurs à comparer.</p>
              ) : (() => {
                const vA = collabStatA?.cabines || 0;
                const vB = collabStatB?.cabines || 0;
                const max = Math.max(vA, vB, 1);
                const delta = vA - vB;
                return (
                  <>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: getCollaboratorColor(collabA).dot }} />
                          <span className="truncate text-[#1e3a5f] dark:text-blue-300 font-medium">{collabA}</span>
                        </span>
                        <span className="font-semibold shrink-0 ml-2">{vA} <span className="font-normal text-gray-400 text-xs">cab. ({collabStatA?.projets || 0} proj.)</span></span>
                      </div>
                      <div className="h-2 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${(vA / max) * 100}%`, backgroundColor: getCollaboratorColor(collabA).dot }} />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-amber-400" />
                          <span className="truncate text-amber-600 dark:text-amber-400 font-medium">{collabB}</span>
                        </span>
                        <span className="font-semibold shrink-0 ml-2">{vB} <span className="font-normal text-gray-400 text-xs">cab. ({collabStatB?.projets || 0} proj.)</span></span>
                      </div>
                      <div className="h-2 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-amber-400" style={{ width: `${(vB / max) * 100}%` }} />
                      </div>
                    </div>
                    <p className="text-xs text-center pt-1">
                      Écart : <span className={`font-semibold ${delta === 0 ? "text-gray-500" : delta > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>{delta > 0 ? "+" : ""}{delta} cab.</span>
                      {delta !== 0 && <span className="text-gray-400"> — avantage {delta > 0 ? collabA : collabB}</span>}
                    </p>
                  </>
                );
              })()
            ) : monteurMontageStats.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6">
                Aucune attribution par cabine sur cette période.
              </p>
            ) : (
              <>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 leading-snug">
                  Responsable par cabine (multi) + collaborateurs (mono) · {totalCabinesAttribuees} cabine{totalCabinesAttribuees > 1 ? "s" : ""}
                </p>
                {monteurMontageStats.map((stat) => {
                  const max = Math.max(...monteurMontageStats.map((s) => s.cabines), 1);
                  const color = getCollaboratorColor(stat.name).dot;
                  const key = `montage-${stat.name}`;
                  const isOpen = expandedKeys.has(key);
                  return (
                    <div key={stat.name}>
                      <button
                        type="button"
                        onClick={() => toggleExpand(key)}
                        className="w-full text-left space-y-1 rounded-lg px-1 py-1 -mx-1 hover:bg-white/50 dark:hover:bg-white/5 transition-colors"
                      >
                        <div className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-1.5 min-w-0">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                            <span className="truncate">{stat.name}</span>
                          </span>
                          <span className="flex items-center gap-1.5 shrink-0 ml-2">
                            <span className="font-semibold">
                              {stat.cabines} <span className="font-normal text-gray-400 text-xs">cab. ({stat.projets} proj.)</span>
                            </span>
                            {isOpen ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                          </span>
                        </div>
                        <div className="h-2 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(stat.cabines / max) * 100}%`, backgroundColor: color }} />
                        </div>
                      </button>
                      {isOpen && <ProjectList items={projectsForMonteur(stat.name)} />}
                    </div>
                  );
                })}
              </>
            )}
          </CardContent>
        </Card>

        {/* Heures par monteur */}
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-[#1e3a5f] dark:text-blue-300">
              <Clock className="w-4 h-4 text-teal-500" />
              Heures par monteur
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {compareMode && compareType === "period" ? (
              heuresComparison.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-6">Aucune donnée sur les deux périodes.</p>
              ) : (
                <>
                  <div className="flex items-center justify-end gap-2 text-[10px] font-semibold pb-0.5">
                    <span className="text-[#1e3a5f] dark:text-blue-300">{labelA}</span>
                    <span className="text-gray-300">vs</span>
                    <span className="text-amber-600 dark:text-amber-400">{labelB}</span>
                  </div>
                  {(() => {
                    const max = Math.max(...heuresComparison.flatMap((x) => [x.valA, x.valB]), 1);
                    return heuresComparison.map((r) => {
                      const color = getCollaboratorColor(r.name).dot;
                      return (
                        <div key={r.name} className="space-y-1">
                          <div className="flex items-center justify-between text-sm gap-2">
                            <span className="flex items-center gap-1.5 min-w-0">
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                              <span className="truncate">{r.name}</span>
                            </span>
                            <span className="flex items-center gap-1.5 shrink-0 text-xs">
                              <span className="font-semibold text-[#1e3a5f] dark:text-blue-300">{fmtMin(r.valA)}</span>
                              <span className="text-gray-300">/</span>
                              <span className="font-semibold text-amber-600 dark:text-amber-400">{fmtMin(r.valB)}</span>
                              {r.delta !== 0 && (
                                <span className={`font-medium ${r.delta > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
                                  {r.delta > 0 ? "+" : "−"}{fmtMin(Math.abs(r.delta))}
                                </span>
                              )}
                            </span>
                          </div>
                          <div className="flex gap-1">
                            <div className="h-2 flex-1 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${(r.valA / max) * 100}%`, backgroundColor: color }} />
                            </div>
                            <div className="h-2 flex-1 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-amber-400" style={{ width: `${(r.valB / max) * 100}%` }} />
                            </div>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </>
              )
            ) : compareMode && compareType === "collab" ? (
              (!collabA || !collabB) ? (
                <p className="text-xs text-gray-400 text-center py-6">Choisissez 2 collaborateurs à comparer.</p>
              ) : (() => {
                const vA = collabStatA?.minutes || 0;
                const vB = collabStatB?.minutes || 0;
                const max = Math.max(vA, vB, 1);
                const delta = vA - vB;
                const moyA = (collabStatA?.cabinesAvecHeures || 0) > 0 ? Math.round(vA / (collabStatA!.cabinesAvecHeures)) : 0;
                const moyB = (collabStatB?.cabinesAvecHeures || 0) > 0 ? Math.round(vB / (collabStatB!.cabinesAvecHeures)) : 0;
                return (
                  <>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: getCollaboratorColor(collabA).dot }} />
                          <span className="truncate text-[#1e3a5f] dark:text-blue-300 font-medium">{collabA}</span>
                        </span>
                        <span className="font-semibold text-teal-700 dark:text-teal-300 shrink-0 ml-2">{fmtMin(vA)} <span className="font-normal text-gray-400 text-xs">(moy.&nbsp;{fmtMin(moyA)})</span></span>
                      </div>
                      <div className="h-2 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${(vA / max) * 100}%`, backgroundColor: getCollaboratorColor(collabA).dot }} />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-amber-400" />
                          <span className="truncate text-amber-600 dark:text-amber-400 font-medium">{collabB}</span>
                        </span>
                        <span className="font-semibold text-teal-700 dark:text-teal-300 shrink-0 ml-2">{fmtMin(vB)} <span className="font-normal text-gray-400 text-xs">(moy.&nbsp;{fmtMin(moyB)})</span></span>
                      </div>
                      <div className="h-2 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-amber-400" style={{ width: `${(vB / max) * 100}%` }} />
                      </div>
                    </div>
                    <p className="text-xs text-center pt-1">
                      Écart : <span className={`font-semibold ${delta === 0 ? "text-gray-500" : delta > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>{delta > 0 ? "+" : "−"}{fmtMin(Math.abs(delta))}</span>
                      {delta !== 0 && <span className="text-gray-400"> — {delta > 0 ? collabA : collabB} en a fait plus</span>}
                    </p>
                  </>
                );
              })()
            ) : monteurHeuresStats.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6">
                Aucune heure enregistrée par cabine sur cette période.
              </p>
            ) : (
              <>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 leading-snug">
                  Cumul arrivée → départ par cabine, attribué au monteur responsable
                </p>
                {monteurHeuresStats.map((stat) => {
                  const max = Math.max(...monteurHeuresStats.map((s) => s.minutes), 1);
                  const color = getCollaboratorColor(stat.name).dot;
                  const moy = stat.cabinesAvecHeures > 0 ? Math.round(stat.minutes / stat.cabinesAvecHeures) : 0;
                  return (
                    <button
                      key={stat.name}
                      type="button"
                      onClick={() => router.push(`/admin/heures/${encodeURIComponent(stat.name)}`)}
                      className="w-full text-left space-y-1 rounded-lg px-1 py-1 -mx-1 hover:bg-white/50 dark:hover:bg-white/5 transition-colors"
                      title={`Voir le détail des heures de ${stat.name}`}
                    >
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                          <span className="truncate underline-offset-2 hover:underline">{stat.name}</span>
                        </span>
                        <span className="font-semibold text-teal-700 dark:text-teal-300 shrink-0 ml-2">
                          {fmtMin(stat.minutes)} <span className="font-normal text-gray-400 text-xs">({stat.cabinesAvecHeures} cab. · moy.&nbsp;{fmtMin(moy)})</span>
                        </span>
                      </div>
                      <div className="h-2 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-teal-500 transition-all duration-500" style={{ width: `${(stat.minutes / max) * 100}%` }} />
                      </div>
                    </button>
                  );
                })}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {/* Cabines par équipe */}
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4" />
              Cabines par équipe
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {equipeStats.map((stat) => {
              const key = `equipe-${stat.name}`;
              const isOpen = expandedKeys.has(key);
              const maxCabines = Math.max(...equipeStats.map((s) => s.cabines), 1);
              const names = stat.name.split(" & ");
              const isBinome = names.length > 1;
              const isTeam = stat.name.toLowerCase().includes("team");
              // Cohérent avec le groupage (collaborateurs vide → "Non assigné").
              const matchedProjects = filteredProjects.filter((p) => (p.collaborateurs || "Non assigné") === stat.name);
              return (
                <div key={stat.name}>
                  <button type="button" onClick={() => toggleExpand(key)} className="w-full text-left space-y-1 hover:bg-white/40 rounded-lg px-1 py-1 -mx-1 transition-colors">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1.5 flex-wrap">
                        {isTeam ? (
                          <span className="inline-flex items-center gap-1">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: getCollaboratorColor("Team TM").dot }} />
                            <span className="font-medium">{stat.name}</span>
                          </span>
                        ) : (
                          names.map((n, i) => (
                            <span key={n} className="inline-flex items-center gap-1">
                              {i > 0 && <span className="text-gray-300 text-xs">&</span>}
                              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: getCollaboratorColor(n.trim()).dot }} />
                              <span>{n.trim()}</span>
                            </span>
                          ))
                        )}
                        {isBinome && <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full ml-1">Binôme</span>}
                        {isTeam && <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full ml-1">Équipe</span>}
                      </span>
                      <span className="flex items-center gap-1.5 shrink-0 ml-2">
                        <span className="font-semibold">{stat.cabines} <span className="font-normal text-gray-400 text-xs">({stat.projets} proj.)</span></span>
                        {isOpen ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                      </span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${(stat.cabines / maxCabines) * 100}%`,
                          backgroundColor: isTeam
                            ? getCollaboratorColor("Team TM").dot
                            : isBinome
                              ? `linear-gradient(90deg, ${getCollaboratorColor(names[0].trim()).dot}, ${getCollaboratorColor(names[1]?.trim() || "").dot})`
                              : getCollaboratorColor(names[0].trim()).dot,
                          background: isBinome && !isTeam
                            ? `linear-gradient(90deg, ${getCollaboratorColor(names[0].trim()).dot}, ${getCollaboratorColor(names[1]?.trim() || "").dot})`
                            : undefined,
                        }}
                      />
                    </div>
                  </button>
                  {isOpen && <ProjectList items={matchedProjects} />}
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Cabines par série */}
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Box className="w-4 h-4" />
              Cabines par série
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {seriesStats.slice(0, 10).map(([serie, count]) => {
              const key = `serie-${serie}`;
              const isOpen = expandedKeys.has(key);
              const maxCount = Math.max(...seriesStats.map(([, c]) => c), 1);
              const matchedProjects = filteredProjects.filter((p) => p.seriesCabines.includes(serie));
              return (
                <div key={serie}>
                  <button type="button" onClick={() => toggleExpand(key)} className="w-full text-left space-y-1 hover:bg-white/40 rounded-lg px-1 py-1 -mx-1 transition-colors">
                    <div className="flex items-center justify-between text-sm">
                      <span>{serie}</span>
                      <span className="flex items-center gap-1.5">
                        <span className="font-semibold">{count}</span>
                        {isOpen ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                      </span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-blue-500 transition-all duration-500"
                        style={{ width: `${(count / maxCount) * 100}%` }}
                      />
                    </div>
                  </button>
                  {isOpen && <ProjectList items={matchedProjects} />}
                </div>
              );
            })}
            {seriesStats.length > 10 && (
              <p className="text-xs text-gray-400 text-center">
                +{seriesStats.length - 10} autres séries
              </p>
            )}
          </CardContent>
        </Card>

        {/* Par fournisseur */}
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Cabines par fournisseur
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {fournisseurStats.slice(0, 10).map(([fournisseur, count]) => {
              const key = `fournisseur-${fournisseur}`;
              const isOpen = expandedKeys.has(key);
              const maxCount = Math.max(...fournisseurStats.map(([, c]) => c), 1);
              const matchedProjects = filteredProjects.filter((p) => p.fournisseurs.includes(fournisseur));
              return (
                <div key={fournisseur}>
                  <button type="button" onClick={() => toggleExpand(key)} className="w-full text-left space-y-1 hover:bg-white/40 rounded-lg px-1 py-1 -mx-1 transition-colors">
                    <div className="flex items-center justify-between text-sm">
                      <span>{fournisseur}</span>
                      <span className="flex items-center gap-1.5">
                        <span className="font-semibold">{count}</span>
                        {isOpen ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                      </span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                        style={{ width: `${(count / maxCount) * 100}%` }}
                      />
                    </div>
                  </button>
                  {isOpen && <ProjectList items={matchedProjects} />}
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Par statut */}
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Projets par statut
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {Object.entries(statusMap)
              .sort(([, a], [, b]) => b - a)
              .map(([status, count]) => {
                const key = `statut-${status}`;
                const isOpen = expandedKeys.has(key);
                const matchedProjects = filteredProjects.filter((p) => (p.etatCMD || "Non défini") === status);
                return (
                  <div key={status}>
                    <button
                      type="button"
                      onClick={() => toggleExpand(key)}
                      className="w-full flex items-center justify-between text-sm py-1.5 px-1 -mx-1 rounded-lg hover:bg-white/40 transition-colors border-b border-gray-50 last:border-0"
                    >
                      <span>{status}</span>
                      <span className="flex items-center gap-1.5">
                        <span className="font-semibold bg-gray-100 px-2 py-0.5 rounded-full text-xs">{count}</span>
                        {isOpen ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                      </span>
                    </button>
                    {isOpen && <ProjectList items={matchedProjects} />}
                  </div>
                );
              })}
          </CardContent>
        </Card>
      </div>

      {/* Section analytique avancée */}
      <div className="grid sm:grid-cols-2 gap-4 mt-4">
        {/* Taux de soucis montage */}
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-red-500" />
              Taux de soucis montage
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(() => {
              const totalWithData = filteredProjects.length;
              const withSoucis = filteredProjects.filter((p) => p.soucisMontage).length;
              const rate = totalWithData > 0 ? ((withSoucis / totalWithData) * 100).toFixed(1) : "0";

              // Par fournisseur
              const fournisseurSoucis: Record<string, { total: number; soucis: number }> = {};
              filteredProjects.forEach((p) => {
                p.fournisseurs.forEach((f) => {
                  if (!fournisseurSoucis[f]) fournisseurSoucis[f] = { total: 0, soucis: 0 };
                  fournisseurSoucis[f].total++;
                  if (p.soucisMontage) fournisseurSoucis[f].soucis++;
                });
              });

              return (
                <>
                  <div className="text-center py-2">
                    <p className="text-3xl font-bold text-red-600">{rate}%</p>
                    <p className="text-xs text-gray-500">{withSoucis} soucis sur {totalWithData} projets</p>
                  </div>
                  {Object.entries(fournisseurSoucis)
                    .filter(([, v]) => v.soucis > 0)
                    .sort(([, a], [, b]) => (b.soucis / b.total) - (a.soucis / a.total))
                    .map(([f, v]) => (
                      <div key={f} className="flex items-center justify-between text-xs py-1 border-b border-gray-50">
                        <span>{f}</span>
                        <span className="font-semibold text-red-600">{v.soucis}/{v.total} ({((v.soucis / v.total) * 100).toFixed(0)}%)</span>
                      </div>
                    ))}
                </>
              );
            })()}
          </CardContent>
        </Card>

        {/* Récurrence SAV */}
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4 text-orange-500" />
              Récurrence SAV
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(() => {
              const savProjects = filteredProjects.filter((p) => p.sav);
              const savByClient: Record<string, number> = {};
              savProjects.forEach((p) => {
                const client = p.nomChantier || p.projet;
                savByClient[client] = (savByClient[client] || 0) + 1;
              });
              const recurring = Object.entries(savByClient).filter(([, c]) => c > 1).sort(([, a], [, b]) => b - a);

              return (
                <>
                  <div className="text-center py-2">
                    <p className="text-3xl font-bold text-orange-600">{savProjects.length}</p>
                    <p className="text-xs text-gray-500">projets avec SAV</p>
                  </div>
                  {recurring.length > 0 ? (
                    <>
                      <p className="text-xs font-semibold text-orange-600">⚠ Clients récurrents :</p>
                      {recurring.map(([client, count]) => (
                        <div key={client} className="flex items-center justify-between text-xs py-1 border-b border-gray-50">
                          <span className="truncate">{client}</span>
                          <span className="font-semibold text-orange-600 shrink-0">{count} SAV</span>
                        </div>
                      ))}
                    </>
                  ) : (
                    <p className="text-xs text-gray-400 text-center">Aucune récurrence détectée</p>
                  )}
                </>
              );
            })()}
          </CardContent>
        </Card>

        {/* Temps moyen par cabine */}
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4 text-teal-500" />
              Temps moyen par cabine
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(() => {
              // Parse time from formats: "HH:MM" or "date collab HH:MM | ..."
              const parseTime = (raw: string): number | null => {
                if (!raw || !raw.trim()) return null;
                // Try simple HH:MM
                const simpleMatch = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
                if (simpleMatch) {
                  return parseInt(simpleMatch[1]) * 60 + parseInt(simpleMatch[2]);
                }
                // Try multi-day or complex format: look for first HH:MM pattern
                const timeMatches = raw.match(/(\d{1,2}):(\d{2})/g);
                if (timeMatches && timeMatches.length > 0) {
                  const first = timeMatches[0];
                  const parts = first.split(":");
                  return parseInt(parts[0]) * 60 + parseInt(parts[1]);
                }
                return null;
              };

              const projectsWithTime = filteredProjects.filter(
                (p) => p.heureArrivee && p.heureDepart && p.heureArrivee.trim() !== "" && p.heureDepart.trim() !== ""
              ).map((p) => {
                const arrive = parseTime(p.heureArrivee);
                const depart = parseTime(p.heureDepart);
                if (arrive === null || depart === null) return null;
                let minutes = depart - arrive;
                if (minutes <= 0) minutes += 24 * 60; // overnight
                const hours = minutes / 60;
                const cabines = p.nbCabines || 1;
                const hoursPerCabine = hours / cabines;
                return { project: p, hours, hoursPerCabine, cabines };
              }).filter(Boolean) as { project: Project; hours: number; hoursPerCabine: number; cabines: number }[];

              if (projectsWithTime.length === 0) {
                return <p className="text-xs text-gray-400 text-center py-4">Aucun projet avec heures de début et fin renseignées</p>;
              }

              const overallAvg = projectsWithTime.reduce((s, p) => s + p.hoursPerCabine, 0) / projectsWithTime.length;

              // By collaborator
              const collabMap: Record<string, { total: number; count: number }> = {};
              projectsWithTime.forEach((p) => {
                const collab = p.project.collaborateurs || "Non assigné";
                if (!collabMap[collab]) collabMap[collab] = { total: 0, count: 0 };
                collabMap[collab].total += p.hoursPerCabine;
                collabMap[collab].count += 1;
              });
              const collabStats = Object.entries(collabMap)
                .map(([name, v]) => ({ name, avg: v.total / v.count, count: v.count }))
                .sort((a, b) => a.avg - b.avg);

              // By fournisseur
              const fournMap: Record<string, { total: number; count: number }> = {};
              projectsWithTime.forEach((p) => {
                p.project.fournisseurs.forEach((f) => {
                  if (!fournMap[f]) fournMap[f] = { total: 0, count: 0 };
                  fournMap[f].total += p.hoursPerCabine;
                  fournMap[f].count += 1;
                });
              });
              const fournStats = Object.entries(fournMap)
                .map(([name, v]) => ({ name, avg: v.total / v.count, count: v.count }))
                .sort((a, b) => b.avg - a.avg);

              const maxCollabAvg = Math.max(...collabStats.map((s) => s.avg), 1);
              const maxFournAvg = Math.max(...fournStats.map((s) => s.avg), 1);

              const formatH = (h: number) => {
                const hrs = Math.floor(h);
                const mins = Math.round((h - hrs) * 60);
                return mins > 0 ? `${hrs}h${mins.toString().padStart(2, "0")}` : `${hrs}h`;
              };

              return (
                <>
                  <div className="text-center py-2">
                    <p className="text-3xl font-bold text-teal-600">{formatH(overallAvg)}</p>
                    <p className="text-xs text-gray-500">moyenne par cabine ({projectsWithTime.length} projets)</p>
                  </div>

                  {/* By collaborator */}
                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide pt-1">Par collaborateur (plus rapide en haut)</p>
                  {collabStats.slice(0, 8).map((stat) => {
                    const key = `temps-collab-${stat.name}`;
                    const isOpen = expandedKeys.has(key);
                    const matchedProjects = projectsWithTime.filter((p) => (p.project.collaborateurs || "Non assigné") === stat.name).map((p) => p.project);
                    return (
                      <div key={stat.name}>
                        <button type="button" onClick={() => toggleExpand(key)} className="w-full text-left space-y-1 hover:bg-white/40 rounded-lg px-1 py-1 -mx-1 transition-colors">
                          <div className="flex items-center justify-between text-xs">
                            <span className="flex items-center gap-1.5">
                              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: getCollaboratorColor(stat.name.split(" & ")[0].trim()).dot }} />
                              <span>{stat.name}</span>
                            </span>
                            <span className="flex items-center gap-1.5 shrink-0 ml-2">
                              <span className="font-semibold text-teal-700">{formatH(stat.avg)}</span>
                              <span className="text-gray-400 text-[10px]">({stat.count} proj.)</span>
                              {isOpen ? <ChevronUp className="w-3 h-3 text-gray-400" /> : <ChevronDown className="w-3 h-3 text-gray-400" />}
                            </span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-teal-500 transition-all duration-500"
                              style={{ width: `${(stat.avg / maxCollabAvg) * 100}%` }}
                            />
                          </div>
                        </button>
                        {isOpen && <ProjectList items={matchedProjects} />}
                      </div>
                    );
                  })}

                  {/* By fournisseur */}
                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide pt-2">Par fournisseur (plus long en haut)</p>
                  {fournStats.slice(0, 8).map((stat) => (
                    <div key={stat.name} className="space-y-1 px-1 py-1 -mx-1">
                      <div className="flex items-center justify-between text-xs">
                        <span>{stat.name}</span>
                        <span className="font-semibold text-teal-700">{formatH(stat.avg)} <span className="text-gray-400 text-[10px] font-normal">({stat.count} proj.)</span></span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-amber-500 transition-all duration-500"
                          style={{ width: `${(stat.avg / maxFournAvg) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </>
              );
            })()}
          </CardContent>
        </Card>

        {/* Répartition géographique */}
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="w-4 h-4 text-indigo-500" />
              Répartition géographique
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(() => {
              // Extract region from address patterns like "1000 Lausanne Vaud", "1208 Genève", etc.
              const extractRegion = (address: string): string => {
                if (!address || !address.trim()) return "Inconnu";
                const trimmed = address.trim();

                // Swiss cantons / major cities mapping
                const cantonKeywords: Record<string, string> = {
                  "Vaud": "Vaud",
                  "Genève": "Genève", "Geneve": "Genève", "Geneva": "Genève",
                  "Valais": "Valais", "Wallis": "Valais",
                  "Fribourg": "Fribourg", "Freiburg": "Fribourg",
                  "Neuchâtel": "Neuchâtel", "Neuchatel": "Neuchâtel",
                  "Jura": "Jura",
                  "Bern": "Berne", "Berne": "Berne",
                  "Zürich": "Zürich", "Zurich": "Zürich",
                  "Lucerne": "Lucerne", "Luzern": "Lucerne",
                  "Basel": "Bâle", "Bâle": "Bâle",
                  "Tessin": "Tessin", "Ticino": "Tessin",
                  "Soleure": "Soleure", "Solothurn": "Soleure",
                  "Aargau": "Argovie", "Argovie": "Argovie",
                  "St. Gallen": "St-Gall", "St-Gall": "St-Gall",
                  "Graubünden": "Grisons", "Grisons": "Grisons",
                  "Thurgau": "Thurgovie", "Thurgovie": "Thurgovie",
                  "Schwyz": "Schwyz",
                  "Zug": "Zoug", "Zoug": "Zoug",
                  "Nidwalden": "Nidwald", "Obwalden": "Obwald",
                  "Uri": "Uri",
                  "Glarus": "Glaris",
                  "Appenzell": "Appenzell",
                  "Schaffhausen": "Schaffhouse", "Schaffhouse": "Schaffhouse",
                };

                // Try matching canton name in the address
                for (const [keyword, canton] of Object.entries(cantonKeywords)) {
                  if (trimmed.toLowerCase().includes(keyword.toLowerCase())) {
                    return canton;
                  }
                }

                // Try to extract city from postal code pattern "NNNN City"
                const postalMatch = trimmed.match(/\b(\d{4})\s+([A-ZÀ-Ÿa-zà-ÿ\-]+)/);
                if (postalMatch) {
                  const code = parseInt(postalMatch[1]);
                  // Swiss postal code ranges for cantons
                  if (code >= 1000 && code <= 1099) return "Lausanne (VD)";
                  if (code >= 1100 && code <= 1199) return "Vaud";
                  if (code >= 1200 && code <= 1299) return "Genève";
                  if (code >= 1300 && code <= 1399) return "Vaud";
                  if (code >= 1400 && code <= 1499) return "Vaud";
                  if (code >= 1500 && code <= 1599) return "Vaud";
                  if (code >= 1600 && code <= 1699) return "Fribourg";
                  if (code >= 1700 && code <= 1799) return "Fribourg";
                  if (code >= 1800 && code <= 1899) return "Vaud";
                  if (code >= 1900 && code <= 1999) return "Valais";
                  if (code >= 2000 && code <= 2099) return "Neuchâtel";
                  if (code >= 2300 && code <= 2399) return "Jura";
                  if (code >= 2500 && code <= 2599) return "Berne";
                  if (code >= 2800 && code <= 2899) return "Jura";
                  if (code >= 3000 && code <= 3999) return "Berne";
                  if (code >= 4000 && code <= 4999) return "Bâle / Soleure";
                  if (code >= 5000 && code <= 5999) return "Argovie";
                  if (code >= 6000 && code <= 6099) return "Lucerne";
                  if (code >= 6300 && code <= 6399) return "Zoug";
                  if (code >= 6500 && code <= 6999) return "Tessin";
                  if (code >= 7000 && code <= 7999) return "Grisons";
                  if (code >= 8000 && code <= 8999) return "Zürich";
                  if (code >= 9000 && code <= 9999) return "St-Gall / Thurgovie";
                  // Fallback to city name from postal match
                  return postalMatch[2];
                }

                // Final fallback
                return trimmed.length > 25 ? trimmed.slice(0, 25) + "..." : trimmed;
              };

              const regionMap: Record<string, { projets: number; cabines: number; projects: Project[] }> = {};
              filteredProjects.forEach((p) => {
                const region = extractRegion(p.adresseChantier);
                if (!regionMap[region]) regionMap[region] = { projets: 0, cabines: 0, projects: [] };
                regionMap[region].projets += 1;
                regionMap[region].cabines += p.nbCabines || 0;
                regionMap[region].projects.push(p);
              });

              const regionStats = Object.entries(regionMap)
                .map(([name, stats]) => ({ name, ...stats }))
                .sort((a, b) => b.projets - a.projets);

              if (regionStats.length === 0) {
                return <p className="text-xs text-gray-400 text-center py-4">Aucun projet avec adresse</p>;
              }

              const maxProjets = Math.max(...regionStats.map((s) => s.projets), 1);
              const totalRegionProjets = regionStats.reduce((s, r) => s + r.projets, 0);

              return (
                <>
                  <div className="text-center py-2">
                    <p className="text-3xl font-bold text-indigo-600">{regionStats.length}</p>
                    <p className="text-xs text-gray-500">régions / cantons</p>
                  </div>
                  {regionStats.slice(0, 15).map((stat) => {
                    const key = `geo-${stat.name}`;
                    const isOpen = expandedKeys.has(key);
                    const pct = totalRegionProjets > 0 ? ((stat.projets / totalRegionProjets) * 100).toFixed(0) : "0";
                    return (
                      <div key={stat.name}>
                        <button type="button" onClick={() => toggleExpand(key)} className="w-full text-left space-y-1 hover:bg-white/40 rounded-lg px-1 py-1 -mx-1 transition-colors">
                          <div className="flex items-center justify-between text-xs">
                            <span className="flex items-center gap-1.5">
                              <MapPin className="w-3 h-3 text-indigo-400" />
                              <span>{stat.name}</span>
                              <span className="text-[10px] text-gray-400">{pct}%</span>
                            </span>
                            <span className="flex items-center gap-1.5 shrink-0 ml-2">
                              <span className="font-semibold">{stat.projets} <span className="font-normal text-gray-400 text-[10px]">proj.</span></span>
                              <span className="text-gray-400 text-[10px]">{stat.cabines} cab.</span>
                              {isOpen ? <ChevronUp className="w-3 h-3 text-gray-400" /> : <ChevronDown className="w-3 h-3 text-gray-400" />}
                            </span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-indigo-500 transition-all duration-500"
                              style={{ width: `${(stat.projets / maxProjets) * 100}%` }}
                            />
                          </div>
                        </button>
                        {isOpen && <ProjectList items={stat.projects} />}
                      </div>
                    );
                  })}
                  {regionStats.length > 15 && (
                    <p className="text-xs text-gray-400 text-center">
                      +{regionStats.length - 15} autres régions
                    </p>
                  )}
                </>
              );
            })()}
          </CardContent>
        </Card>

        {/* Prévisions de charge */}
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-purple-500" />
              Prévisions de charge
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              const today = new Date();
              // Capacité : 5 monteurs × 3.5 cab/jour (moyenne 3-4) × 5 jours
              const NB_COLLABORATEURS = 5;
              const CAB_PAR_JOUR = 3.5;
              const JOURS_PAR_SEMAINE = 5;
              const capaciteHebdo = NB_COLLABORATEURS * CAB_PAR_JOUR * JOURS_PAR_SEMAINE; // = 87.5

              const weeks: { label: string; cabines: number; projets: number; equipes: number; items: Project[] }[] = [];
              for (let w = 0; w < 6; w++) {
                const start = new Date(today);
                start.setDate(today.getDate() + w * 7 - ((today.getDay() + 6) % 7));
                const end = new Date(start);
                end.setDate(start.getDate() + 4); // Lun-Ven
                const startStr = start.toISOString().split("T")[0];
                const endStr = end.toISOString().split("T")[0];
                const weekProjects = projects.filter((p) => p.dateMontage && p.dateMontage.slice(0, 10) >= startStr && p.dateMontage.slice(0, 10) <= endStr);
                const weekCabines = weekProjects.reduce((s, p) => s + (p.nbCabines || 0), 0);
                // Compter les équipes distinctes mobilisées
                const equipes = new Set(weekProjects.map((p) => p.collaborateurs).filter(Boolean));
                weeks.push({
                  label: w === 0 ? "Cette sem." : w === 1 ? "Sem. proch." : `S+${w}`,
                  cabines: weekCabines,
                  projets: weekProjects.length,
                  equipes: equipes.size,
                  items: weekProjects,
                });
              }

              return (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-[10px] text-gray-400 px-1">
                    <span>Capacité équipe : ~{Math.round(capaciteHebdo)} cab./sem.</span>
                    <span>{NB_COLLABORATEURS} collab. × {CAB_PAR_JOUR} cab./jour × {JOURS_PAR_SEMAINE}j</span>
                  </div>
                  {weeks.map((w, i) => {
                    const charge = capaciteHebdo > 0 ? (w.cabines / capaciteHebdo) * 100 : 0;
                    const barColor = charge > 80 ? "#ef4444" : charge > 50 ? "#f59e0b" : "#8b5cf6";
                    const key = `prevision-${i}`;
                    const isOpen = expandedKeys.has(key);
                    const clickable = w.projets > 0;
                    return (
                      <div key={i}>
                        <button
                          type="button"
                          onClick={() => clickable && toggleExpand(key)}
                          disabled={!clickable}
                          className={`w-full text-left space-y-0.5 rounded-lg px-1 py-1 -mx-1 transition-colors ${clickable ? "hover:bg-white/50 dark:hover:bg-white/5 cursor-pointer" : "cursor-default"}`}
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className={i === 0 ? "font-bold text-purple-700" : "text-gray-600"}>{w.label}</span>
                            <span className="flex items-center gap-1.5">
                              <span className="font-semibold">
                                {w.cabines} cab.
                                <span className="font-normal text-gray-400"> ({w.projets} proj.)</span>
                                {charge > 0 && (
                                  <span className={`ml-1.5 text-[10px] font-bold ${charge > 80 ? "text-red-500" : charge > 50 ? "text-amber-500" : "text-purple-500"}`}>
                                    {Math.round(charge)}%
                                  </span>
                                )}
                              </span>
                              {clickable && (isOpen ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />)}
                            </span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${Math.min(charge, 100)}%`,
                                backgroundColor: barColor,
                              }}
                            />
                          </div>
                        </button>
                        {isOpen && <ProjectList items={w.items} />}
                      </div>
                    );
                  })}
                  <p className="text-[10px] text-gray-400 text-center mt-2">
                    🟢 0-50% dispo | 🟡 50-80% chargé | 🔴 80%+ surcharge
                  </p>
                </div>
              );
            })()}
          </CardContent>
        </Card>

        {/* Carte géographique */}
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-0.5">
                <CardTitle className="text-base flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-green-500" />
                  Chantiers en cours
                </CardTitle>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 ml-6">
                  <span className="font-semibold text-gray-600 dark:text-gray-300">{totalProjets}</span> projet{totalProjets > 1 ? "s" : ""}
                  <span className="mx-1.5 text-gray-300 dark:text-gray-600">·</span>
                  <span className="font-semibold text-gray-600 dark:text-gray-300">{totalCabines}</span> cabine{totalCabines > 1 ? "s" : ""}
                </p>
              </div>
              <div className="flex gap-1 bg-gray-100 p-0.5 rounded-lg">
                <button
                  onClick={() => setChantierView("liste")}
                  className={`text-[10px] font-medium px-2.5 py-1 rounded-md transition-all ${
                    chantierView === "liste"
                      ? "bg-white shadow-sm text-gray-900"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  Liste
                </button>
                <button
                  onClick={() => setChantierView("carte")}
                  className={`text-[10px] font-medium px-2.5 py-1 rounded-md transition-all ${
                    chantierView === "carte"
                      ? "bg-white shadow-sm text-gray-900"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  Carte
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {chantierView === "carte" ? (
              <InteractiveMap projects={filteredProjects} />
            ) : (
            (() => {
              const withAddress = filteredProjects.filter((p) => p.adresseChantier);

              const getStatusGroup = (p: Project) => {
                const s = p.etatCMD;
                if (s === "RDV - fixé") return "green";
                if (s === "Cabine à aller chercher" || s === "Récéptionné - RDV à fixer") return "yellow";
                if (s === "Soucis montage") return "red";
                if (s === "Cabines à recevoir" || s === "Cabines en CMD" || s === "Livraison partielle") return "blue";
                return "gray";
              };

              const dotColor: Record<string, string> = {
                green: "text-green-500",
                yellow: "text-amber-500",
                red: "text-red-500",
                blue: "text-blue-500",
                gray: "text-gray-400",
              };

              // URL alternative : ouvrir Google Maps avec tous les points comme recherche
              const buildAllMarkersUrl = () => {
                const parts: string[] = [];
                withAddress.forEach((p) => {
                  parts.push(encodeURIComponent(p.adresseChantier));
                });
                // Utiliser la recherche multi-points via waypoints
                if (parts.length <= 1) {
                  return `https://www.google.com/maps/search/?api=1&query=${parts[0] || ""}`;
                }
                return `https://www.google.com/maps/dir/?api=1&origin=${parts[0]}&destination=${parts[parts.length - 1]}&waypoints=${parts.slice(1, -1).join("|")}&travelmode=driving`;
              };

              return (
                <div className="space-y-1.5">
                  <div className="flex flex-wrap gap-2 text-[10px] text-gray-500 mb-2">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" /> RDV fixé</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> RDV à fixer</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Soucis</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> En attente</span>
                  </div>
                  {withAddress.slice(0, 20).map((p) => {
                    const group = getStatusGroup(p);
                    const names = (p.collaborateurs || "").split(" & ");
                    return (
                      <a
                        key={p.id}
                        href={`/projet/${p.id}?mode=cmd`}
                        className="flex items-center gap-2 text-xs py-1.5 px-2 rounded-lg hover:bg-white/60 transition-colors"
                      >
                        <MapPin className={`w-3 h-3 shrink-0 ${dotColor[group]}`} />
                        <span className="flex-1 truncate">{p.adresseChantier}</span>
                        <div className="flex -space-x-1 shrink-0">
                          {names.slice(0, 2).map((n) => (
                            <span
                              key={n}
                              className="w-4 h-4 rounded-full text-[7px] font-bold flex items-center justify-center border border-white"
                              style={{ backgroundColor: getCollaboratorColor(n.trim()).bg, color: getCollaboratorColor(n.trim()).text }}
                            >
                              {n.trim()[0]}
                            </span>
                          ))}
                        </div>
                      </a>
                    );
                  })}
                  <a
                    href={buildAllMarkersUrl()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-center text-xs text-blue-600 hover:text-blue-800 py-2 mt-1 bg-blue-50 rounded-lg"
                  >
                    Voir tous les chantiers sur Google Maps
                  </a>
                </div>
              );
            })()
            )}
          </CardContent>
        </Card>
      </div>

      {/* Logs d'activité */}
      {showLogs && (
        <Card className="glass-card mt-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ScrollText className="w-4 h-4 text-amber-500" />
              Journal des modifications
            </CardTitle>
          </CardHeader>
          <CardContent>
            {logs.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">Aucune modification enregistrée</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {logs.map((log) => (
                  <div key={log.id} className="flex items-start gap-3 px-2 py-2 rounded-lg border-b border-gray-50 last:border-0 text-sm">
                    <div className="shrink-0 text-[10px] text-gray-400 w-20 pt-0.5">
                      {new Date(log.timestamp).toLocaleDateString("fr-CH", { day: "2-digit", month: "short" })}
                      <br />
                      {new Date(log.timestamp).toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 dark:text-gray-100">{log.action}</p>
                      <p className="text-xs text-gray-500 truncate">{log.projectName}</p>
                      {log.details && <p className="text-xs text-gray-400 mt-0.5">{log.details}</p>}
                    </div>
                    <span className="text-[10px] text-gray-400 shrink-0 pt-0.5">{log.user}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
