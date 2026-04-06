"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Calendar, MapPin, Clock, ChevronRight, Box, Truck, Users, BarChart3 } from "lucide-react";
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

// --- Project card used in both views ---

function ProjectRow({ project, colors }: { project: Project; colors: { bg: string; text: string; dot: string } }) {
  return (
    <Link
      key={project.id}
      href={`/projet/${project.id}?mode=cmd`}
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

      {/* Per-collaborator sections */}
      {collabData.map((collab) => {
        if (collab.myProjects.length === 0) return null;
        return (
          <div key={collab.name} className="glass-card rounded-2xl p-4 space-y-3">
            {/* Collaborator header */}
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                style={{ backgroundColor: collab.colors.bg, color: collab.colors.text }}
              >
                {collab.name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 dark:text-gray-100">{collab.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {collab.todayProjects.length > 0
                    ? `${collab.todayProjects.length} montage${collab.todayProjects.length > 1 ? "s" : ""} aujourd'hui`
                    : "Aucun montage aujourd'hui"}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-lg font-bold" style={{ color: collab.colors.text }}>
                  {collab.totalCabines}
                </p>
                <p className="text-[10px] text-gray-400 dark:text-gray-500">cabines</p>
              </div>
            </div>

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
                        href={`/projet/${p.id}?mode=cmd`}
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
                href={`/projet/${p.id}?mode=cmd`}
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
                href={`/projet/${p.id}?mode=cmd`}
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
