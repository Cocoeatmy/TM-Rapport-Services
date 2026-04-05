"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Calendar, MapPin, Clock, ChevronRight, Box, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getCollaboratorColor } from "@/lib/collaborators";
import type { Project } from "@/lib/notion";

interface MonteurDashboardProps {
  userName: string;
  projects: Project[];
}

export function MonteurDashboard({ userName, projects }: MonteurDashboardProps) {
  const firstName = userName.split(" ")[0];
  const colors = getCollaboratorColor(firstName);

  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  // Filtrer les projets du monteur
  const myProjects = projects.filter((p) =>
    p.collaborateurs?.toLowerCase().includes(firstName.toLowerCase())
  );

  // Projets du jour
  const todayProjects = myProjects.filter((p) => p.dateMontage === todayStr);

  // Projets de la semaine (7 prochains jours)
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEndStr = weekEnd.toISOString().split("T")[0];
  const weekProjects = myProjects
    .filter((p) => p.dateMontage && p.dateMontage >= todayStr && p.dateMontage <= weekEndStr && p.dateMontage !== todayStr)
    .sort((a, b) => (a.dateMontage || "").localeCompare(b.dateMontage || ""));

  // Projets sans date (à planifier)
  const unplanned = myProjects.filter((p) => !p.dateMontage);

  const totalCabines = myProjects.reduce((sum, p) => sum + (p.nbCabines || 0), 0);

  const formatDay = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("fr-CH", { weekday: "short", day: "2-digit", month: "short" });
  };

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
            <p className="font-semibold text-gray-900">Bonjour {firstName} 👋</p>
            <p className="text-sm text-gray-500">
              {todayProjects.length > 0
                ? `${todayProjects.length} montage${todayProjects.length > 1 ? "s" : ""} aujourd'hui`
                : "Aucun montage aujourd'hui"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold" style={{ color: colors.text }}>{totalCabines}</p>
            <p className="text-[10px] text-gray-400">cabines en cours</p>
          </div>
        </div>
      </div>

      {/* Montages du jour */}
      {todayProjects.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
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
                    <div className="flex items-center gap-1.5 mt-1 text-xs text-gray-500">
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
                  <ChevronRight className="w-5 h-5 text-gray-300 shrink-0" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Prochains RDV */}
      {weekProjects.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
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
                <span className="text-xs font-mono text-gray-500 w-16 shrink-0">
                  {formatDay(p.dateMontage!)}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{p.projet}</p>
                </div>
                <Badge variant="outline" className="text-[10px] shrink-0">{p.nbCabines || 0} cab.</Badge>
                <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
