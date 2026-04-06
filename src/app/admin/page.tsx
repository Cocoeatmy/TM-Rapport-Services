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

  // State pour les sections dépliées
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>("all");

  const toggleExpand = (key: string) => {
    setExpanded(expanded === key ? null : key);
  };

  if (!isAdmin || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  const projects = adminTab === "en-cours" ? projectsEnCours : projectsTermines;

  // Extraire les mois disponibles depuis les dates de montage
  const availableMonths = Array.from(
    new Set(
      projects
        .map((p) => p.dateMontage?.slice(0, 7))
        .filter(Boolean)
    )
  ).sort().reverse() as string[];

  // Filtrer les projets par mois
  const filteredProjects = selectedMonth === "all"
    ? projects
    : projects.filter((p) => p.dateMontage?.startsWith(selectedMonth));

  const monthLabel = (m: string) => {
    const [y, mo] = m.split("-");
    const months = ["Janv.", "Fév.", "Mars", "Avril", "Mai", "Juin", "Juil.", "Août", "Sept.", "Oct.", "Nov.", "Déc."];
    return `${months[parseInt(mo) - 1]} ${y}`;
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

  // Totaux
  const totalCabines = filteredProjects.reduce((sum, p) => sum + (p.nbCabines || 0), 0);
  const totalProjets = filteredProjects.length;

  // Composant mini-liste de projets
  const ProjectList = ({ items }: { items: Project[] }) => (
    <div className="mt-2 space-y-1.5 border-t border-gray-100 pt-2">
      {items.map((p) => (
        <a
          key={p.id}
          href={`/projet/${p.id}?mode=cmd`}
          className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-white/60 active:bg-white/80 transition-colors text-xs"
        >
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900 truncate">{p.projet || "Sans nom"}</p>
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

  return (
    <div className="max-w-4xl mx-auto w-full px-4 py-4 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <button
          onClick={() => router.push("/")}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 active:bg-gray-200 shrink-0"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-600 shrink-0" />
            Tableau de bord
          </h1>
          <p className="text-sm text-gray-500">Administration TM Rapport Services</p>
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
          onClick={async () => {
            const res = await fetch("/api/backup", { method: "POST" });
            const data = await res.json();
            if (res.ok) alert(`Backup créé : ${data.backup} (${data.files} fichiers)`);
            else alert("Erreur: " + (data.error || "Erreur"));
          }}
          className="shrink-0 flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl glass-card hover:bg-white/80 transition-all active:scale-95"
        >
          <Database className="w-4 h-4 text-purple-600" />
          Backup
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
        <div className="shrink-0">
          <WidgetSettings config={widgets} onChange={setWidgets} />
        </div>
      </div>

      {/* Onglets En cours / Terminés */}
      <div className="flex gap-1 mb-4 glass-tabs p-1.5 rounded-2xl max-w-xs">
        <button
          onClick={() => { setAdminTab("en-cours"); setSelectedMonth("all"); setExpanded(null); }}
          className={`flex-1 text-sm font-medium py-2 rounded-lg transition-all duration-200 ${
            adminTab === "en-cours"
              ? "glass-tab-active text-[#1e3a5f]"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          En cours ({projectsEnCours.length})
        </button>
        <button
          onClick={() => { setAdminTab("termines"); setSelectedMonth("all"); setExpanded(null); }}
          className={`flex-1 text-sm font-medium py-2 rounded-lg transition-all duration-200 ${
            adminTab === "termines"
              ? "glass-tab-active text-[#1e3a5f]"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Terminés ({projectsTermines.length})
        </button>
      </div>

      {/* Filtre par mois */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1 scrollbar-hide">
        <button
          onClick={() => setSelectedMonth("all")}
          className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
            selectedMonth === "all"
              ? "glass-btn text-white"
              : "glass-card text-gray-600 hover:text-gray-800"
          }`}
        >
          Tous les mois
        </button>
        {availableMonths.map((m) => (
          <button
            key={m}
            onClick={() => setSelectedMonth(selectedMonth === m ? "all" : m)}
            className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
              selectedMonth === m
                ? "glass-btn text-white"
                : "glass-card text-gray-600 hover:text-gray-800"
            }`}
          >
            {monthLabel(m)}
          </button>
        ))}
      </div>

      {/* KPIs */}
      <div className={`grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6 ${!isWidgetVisible(widgets, "kpis") ? "hidden" : ""}`}>
        <Card className="glass-card">
          <CardContent className="pt-4 text-center">
            <p className="text-3xl font-bold text-[#1e3a5f]">{totalProjets}</p>
            <p className="text-xs text-gray-500 mt-1">Projets en cours</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="pt-4 text-center">
            <p className="text-3xl font-bold text-[#1e3a5f]">{totalCabines}</p>
            <p className="text-xs text-gray-500 mt-1">Cabines totales</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="pt-4 text-center">
            <p className="text-3xl font-bold text-[#1e3a5f]">{equipeStats.length}</p>
            <p className="text-xs text-gray-500 mt-1">Équipes</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="pt-4 text-center">
            <p className="text-3xl font-bold text-[#1e3a5f]">{seriesStats.length}</p>
            <p className="text-xs text-gray-500 mt-1">Séries de cabines</p>
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
              const isOpen = expanded === key;
              const maxCabines = Math.max(...equipeStats.map((s) => s.cabines), 1);
              const names = stat.name.split(" & ");
              const isBinome = names.length > 1;
              const isTeam = stat.name.toLowerCase().includes("team");
              const matchedProjects = filteredProjects.filter((p) => p.collaborateurs === stat.name);
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
              const isOpen = expanded === key;
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
              const isOpen = expanded === key;
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
                const isOpen = expanded === key;
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
                    const isOpen = expanded === key;
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
                    const isOpen = expanded === key;
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

              const weeks: { label: string; cabines: number; projets: number; equipes: number }[] = [];
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
                    return (
                      <div key={i} className="space-y-0.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className={i === 0 ? "font-bold text-purple-700" : "text-gray-600"}>{w.label}</span>
                          <span className="font-semibold">
                            {w.cabines} cab.
                            <span className="font-normal text-gray-400"> ({w.projets} proj.)</span>
                            {charge > 0 && (
                              <span className={`ml-1.5 text-[10px] font-bold ${charge > 80 ? "text-red-500" : charge > 50 ? "text-amber-500" : "text-purple-500"}`}>
                                {Math.round(charge)}%
                              </span>
                            )}
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
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="w-4 h-4 text-green-500" />
                Chantiers en cours
              </CardTitle>
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
