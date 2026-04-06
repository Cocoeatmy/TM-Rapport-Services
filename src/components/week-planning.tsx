"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getCollaboratorColor } from "@/lib/collaborators";
import type { Project } from "@/lib/notion";

interface WeekPlanningProps {
  projects: Project[];
  mode: string;
  onDrop?: (projectId: string, newDate: string) => void;
}

export function WeekPlanning({ projects, mode, onDrop }: WeekPlanningProps) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);

  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - ((today.getDay() + 6) % 7) + weekOffset * 7);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    return d;
  });

  const dayNames = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
  const monthNames = ["janv.", "fév.", "mars", "avril", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

  const todayStr = today.toISOString().split("T")[0];

  const getProjectsForDay = (date: Date) => {
    const dateStr = date.toISOString().split("T")[0];
    return projects.filter((p) => {
      const pDate = mode.startsWith("mesures") ? p.dateMesures : p.dateMontage;
      return pDate === dateStr;
    });
  };

  const getWeekNumber = (date: Date) => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  };

  const weekLabel = () => {
    const start = days[0];
    const end = days[6];
    const wn = getWeekNumber(start);
    if (start.getMonth() === end.getMonth()) {
      return `${start.getDate()} - ${end.getDate()} ${monthNames[start.getMonth()]} ${start.getFullYear()} (S${wn})`;
    }
    return `${start.getDate()} ${monthNames[start.getMonth()]} - ${end.getDate()} ${monthNames[end.getMonth()]} ${end.getFullYear()} (S${wn})`;
  };

  return (
    <div className="glass-card rounded-2xl p-4">
      {/* Navigation semaine */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setWeekOffset((w) => w - 1)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="text-center">
          <span className="text-sm font-semibold">{weekLabel()}</span>
          {weekOffset !== 0 && (
            <button onClick={() => setWeekOffset(0)} className="block mx-auto text-[10px] text-blue-500 hover:text-blue-700">
              Aujourd'hui
            </button>
          )}
        </div>
        <button onClick={() => setWeekOffset((w) => w + 1)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Jours */}
      <div className="space-y-2">
        {days.slice(0, 5).map((day, i) => {
          const dateStr = day.toISOString().split("T")[0];
          const isToday = dateStr === todayStr;
          const dayProjects = getProjectsForDay(day);

          return (
            <div
              key={i}
              data-date={dateStr}
              onDragOver={(e) => { e.preventDefault(); setDragOverDate(dateStr); }}
              onDragLeave={() => setDragOverDate(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverDate(null);
                const projectId = e.dataTransfer.getData("text/plain");
                if (projectId && onDrop) onDrop(projectId, dateStr);
              }}
              className={`rounded-xl p-2 transition-colors ${
                dragOverDate === dateStr ? "ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/30" :
                isToday ? "bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-200" : ""
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs font-semibold w-16 ${isToday ? "text-blue-700 dark:text-blue-400" : "text-gray-500"}`}>
                  {dayNames[i]}
                </span>
                <span className={`text-xs ${isToday ? "text-blue-600 dark:text-blue-400 font-bold" : "text-gray-400"}`}>
                  {day.getDate()} {monthNames[day.getMonth()]}
                </span>
                {dayProjects.length > 0 && (
                  <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full ml-auto">
                    {dayProjects.length} RDV
                  </span>
                )}
              </div>
              {dayProjects.length === 0 ? (
                <p className="text-[10px] text-gray-300 pl-16 dark:text-gray-600">&mdash;</p>
              ) : (
                <div className="space-y-1 pl-16">
                  {dayProjects.map((p) => {
                    const names = (p.collaborateurs || "").split(" & ");
                    return (
                      <Link
                        key={p.id}
                        href={`/projet/${p.id}?mode=${mode}`}
                        draggable
                        data-project-id={p.id}
                        onDragStart={(e) => { e.dataTransfer.setData("text/plain", p.id); e.currentTarget.style.opacity = "0.5"; }}
                        onDragEnd={(e) => { e.currentTarget.style.opacity = "1"; }}
                        className="flex items-center gap-2 text-xs hover:bg-white/60 dark:hover:bg-gray-700/40 rounded-lg px-2 py-1 transition-colors cursor-grab active:cursor-grabbing"
                      >
                        <div className="flex -space-x-1">
                          {names.slice(0, 2).map((n) => (
                            <span
                              key={n}
                              className="w-4 h-4 rounded-full border border-white text-[7px] font-bold flex items-center justify-center"
                              style={{ backgroundColor: getCollaboratorColor(n.trim()).bg, color: getCollaboratorColor(n.trim()).text }}
                            >
                              {n.trim()[0]}
                            </span>
                          ))}
                        </div>
                        <span className="flex-1 truncate">{p.nomChantier || p.projet}</span>
                        <span className="text-gray-400 shrink-0">{p.nbCabines} cab.</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
