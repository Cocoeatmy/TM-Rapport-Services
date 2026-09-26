"use client";

import { useEffect, useState, type ReactNode } from "react";
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
  Send,
  Database,
  Package,
  FileSpreadsheet,
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
  // Modale « Rapport mensuel » : choix du mois/année à recevoir par e-mail.
  const [monthlyModal, setMonthlyModal] = useState(false);
  const [reportMonth, setReportMonth] = useState<number>(() => new Date().getMonth() + 1);
  const [reportYear, setReportYear] = useState<number>(() => new Date().getFullYear());
  const [sendingReport, setSendingReport] = useState(false);
  const [sendingDaily, setSendingDaily] = useState(false);
  const sendMonthlyReport = async () => {
    setSendingReport(true);
    try {
      const res = await fetch("/api/rapport-mensuel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: reportMonth, year: reportYear }),
      });
      const data = await res.json();
      if (res.ok) { setMonthlyModal(false); alert("Rapport mensuel envoyé par e-mail !"); }
      else alert("Erreur : " + (data.error || "Erreur"));
    } catch {
      alert("Erreur réseau");
    } finally {
      setSendingReport(false);
    }
  };
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

  // Cartes de stats REPLIÉES par défaut : un Set des cartes OUVERTES (vide au
  // départ = tout fermé). L'utilisateur déplie/replie chaque carte via son
  // en-tête (chevron).
  const [openCards, setOpenCards] = useState<Set<string>>(() => new Set(["chantiers"]));
  const toggleCard = (id: string) => {
    setOpenCards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  /** En-tête de carte cliquable (déplie/replie) avec chevron. */
  const cardHeader = (id: string, icon: ReactNode, title: string, titleColor = "") => (
    <CardHeader className="pb-2 cursor-pointer select-none" onClick={() => toggleCard(id)}>
      <CardTitle className={`text-base flex items-center justify-between gap-2 ${titleColor}`}>
        <span className="flex items-center gap-2">{icon}{title}</span>
        {openCards.has(id)
          ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
          : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
      </CardTitle>
    </CardHeader>
  );

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
          onClick={() => {
            // Retour à la vraie page précédente (une page à la fois), repli sur
            // l'accueil si pas d'historique (ouverture directe).
            if (typeof window !== "undefined" && window.history.length > 1) router.back();
            else router.push("/");
          }}
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
          onClick={() => setMonthlyModal(true)}
          className="shrink-0 flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl glass-card hover:bg-white/80 transition-all active:scale-95"
        >
          <Mail className="w-4 h-4 text-blue-600" />
          Rapport mensuel
        </button>
        <button
          onClick={async () => {
            if (sendingDaily) return;
            setSendingDaily(true);
            try {
              const res = await fetch("/api/daily-report", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ test: true }),
              });
              const data = await res.json();
              if (res.ok) {
                alert(
                  data.montagesDuJour === 0
                    ? "Aucun montage aujourd'hui — e-mail de test envoyé à ton adresse."
                    : `Rapport du jour envoyé par e-mail à ton adresse (${data.envoyes} montage(s)${data.preview ? " — aperçu de tous les montages du jour" : ""}).`,
                );
              } else {
                alert("Erreur : " + (data.error || "envoi impossible"));
              }
            } catch {
              alert("Erreur réseau");
            } finally {
              setSendingDaily(false);
            }
          }}
          disabled={sendingDaily}
          className="shrink-0 flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl glass-card hover:bg-white/80 transition-all active:scale-95 disabled:opacity-50"
        >
          <Send className="w-4 h-4 text-sky-500" />
          {sendingDaily ? "Envoi…" : "Rapport du jour"}
        </button>
        {/* Tous les rapports réunis — les boutons ci-dessus restent en place. */}
        <button
          onClick={() => router.push("/admin/rapports")}
          className="shrink-0 flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl glass-card hover:bg-white/80 transition-all active:scale-95"
        >
          <FileSpreadsheet className="w-4 h-4 text-[#1e3a5f] dark:text-blue-300" />
          Tous les rapports
        </button>
        <button
          onClick={() => router.push("/admin/pieces-defauts")}
          className="shrink-0 flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl glass-card hover:bg-white/80 transition-all active:scale-95"
        >
          <Package className="w-4 h-4 text-orange-600" />
          Pièces &amp; Défauts
        </button>
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
            <p className="text-xs text-gray-500 dark:text-gray-300 mt-1">Projets</p>
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

      {/* Les analyses (montage et heures par monteur, cabines par équipe /
          série / fournisseur, taux de soucis, récurrence SAV, temps moyen,
          répartition géographique, prévisions, chantiers) vivent désormais
          dans la page Statistiques, où elles partagent le même filtre de
          période et la même source de vérité. Les garder ici en doublon
          faisait diverger les chiffres. */}

      {/* Modale : choix du mois/année pour le rapport mensuel par e-mail. */}
      {monthlyModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => { if (!sendingReport) setMonthlyModal(false); }}
        >
          <div
            className="w-full max-w-sm bg-white dark:bg-slate-800 rounded-2xl shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[#1e3a5f] text-white px-5 py-4 flex items-center gap-2">
              <Mail className="w-5 h-5" />
              <h3 className="text-base font-semibold">Rapport mensuel par e-mail</h3>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Choisissez le mois et l'année du rapport à recevoir par e-mail.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">Mois</label>
                  <select
                    value={reportMonth}
                    onChange={(e) => setReportMonth(Number(e.target.value))}
                    className="mt-1 w-full h-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-700 px-2 text-sm"
                  >
                    {["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"].map((m, i) => (
                      <option key={m} value={i + 1}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">Année</label>
                  <select
                    value={reportYear}
                    onChange={(e) => setReportYear(Number(e.target.value))}
                    className="mt-1 w-full h-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-700 px-2 text-sm"
                  >
                    {Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="px-5 pb-5 flex gap-2">
              <button
                onClick={() => setMonthlyModal(false)}
                disabled={sendingReport}
                className="flex-1 h-10 rounded-lg border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={sendMonthlyReport}
                disabled={sendingReport}
                className="flex-1 h-10 rounded-lg bg-[#1e3a5f] hover:bg-[#163055] text-white text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {sendingReport ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                {sendingReport ? "Envoi…" : "Recevoir par e-mail"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
