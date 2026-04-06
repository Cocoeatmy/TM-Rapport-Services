"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import type { Project } from "@/lib/notion";
import { Badge } from "@/components/ui/badge";
import { getCollaboratorColor } from "@/lib/collaborators";
import { STATUS_CMD_COLORS, STATUS_MESURES_COLORS } from "@/lib/constants";

const COLUMNS_CMD = [
  "Cabines en CMD",
  "Cabines à recevoir",
  "Récéptionné - RDV à fixer",
  "RDV - fixé",
  "Montage partiel",
];

const COLUMNS_MESURES = [
  "Pas contacté",
  "Contact sans réponse",
  "RDV - Attendre news",
  "RDV - Fixé",
];

/** Extract the CSS color-dot class from a Tailwind status class string */
function getDotColor(statusClass: string): string {
  // Map bg-* to a dot color
  if (statusClass.includes("bg-gray")) return "#9ca3af";
  if (statusClass.includes("bg-yellow")) return "#ca8a04";
  if (statusClass.includes("bg-orange")) return "#ea580c";
  if (statusClass.includes("bg-blue")) return "#2563eb";
  if (statusClass.includes("bg-green")) return "#16a34a";
  if (statusClass.includes("bg-purple")) return "#9333ea";
  if (statusClass.includes("bg-amber")) return "#d97706";
  if (statusClass.includes("bg-red")) return "#dc2626";
  if (statusClass.includes("bg-cyan")) return "#0891b2";
  return "#6b7280";
}

interface KanbanBoardProps {
  projects: Project[];
  mode: string;
  onStatusChange: (projectId: string, newStatus: string) => void;
}

export function KanbanBoard({ projects, mode, onStatusChange }: KanbanBoardProps) {
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const columns = mode === "mesures" ? COLUMNS_MESURES : COLUMNS_CMD;
  const statusColors = mode === "mesures" ? STATUS_MESURES_COLORS : STATUS_CMD_COLORS;
  const getStatusVal = (p: Project) => mode === "mesures" ? p.etatMesures : p.etatCMD;

  const projectsByColumn = columns.reduce<Record<string, Project[]>>((acc, col) => {
    acc[col] = projects.filter((p) => getStatusVal(p) === col);
    return acc;
  }, {});

  const handleDragStart = useCallback((e: React.DragEvent, projectId: string) => {
    e.dataTransfer.setData("text/plain", projectId);
    e.dataTransfer.effectAllowed = "move";
    setDraggingId(projectId);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
    setDragOverColumn(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, column: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverColumn(column);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverColumn(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, newStatus: string) => {
    e.preventDefault();
    setDragOverColumn(null);
    setDraggingId(null);
    const projectId = e.dataTransfer.getData("text/plain");
    if (!projectId) return;
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;
    const currentStatus = getStatusVal(project);
    if (currentStatus === newStatus) return;
    onStatusChange(projectId, newStatus);
  }, [projects, mode, onStatusChange]);

  return (
    <div className="overflow-x-auto -mx-4 px-4 pb-4" style={{ WebkitOverflowScrolling: "touch" }}>
      <div className="flex gap-3" style={{ minWidth: `${columns.length * 280}px` }}>
        {columns.map((column) => {
          const colProjects = projectsByColumn[column] || [];
          const colorClass = statusColors[column] || "bg-gray-100 text-gray-700";
          const dotColor = getDotColor(colorClass);
          const isDropTarget = dragOverColumn === column;

          return (
            <div
              key={column}
              className={`flex-1 min-w-[260px] max-w-[320px] glass-card rounded-2xl flex flex-col transition-all ${
                isDropTarget ? "ring-2 ring-blue-500 bg-blue-50/50" : ""
              }`}
              onDragOver={(e) => handleDragOver(e, column)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, column)}
            >
              {/* Column header */}
              <div className="px-3 py-3 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: dotColor }}
                  />
                  <span className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate flex-1">
                    {column}
                  </span>
                  <span className="text-[10px] font-bold bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">
                    {colProjects.length}
                  </span>
                </div>
              </div>

              {/* Scrollable card list */}
              <div className="flex-1 overflow-y-auto p-2 space-y-1.5" style={{ maxHeight: "calc(100vh - 280px)" }}>
                {colProjects.length === 0 && (
                  <div className="text-center py-8 text-xs text-gray-400">
                    Aucun projet
                  </div>
                )}
                {colProjects.map((project) => {
                  const collabField = mode === "mesures" ? project.mesuresTraiteePar : project.collaborateurs;
                  const collabNames = (collabField || "").split(" & ").filter(Boolean);

                  return (
                    <div
                      key={project.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, project.id)}
                      onDragEnd={handleDragEnd}
                      className={`group rounded-xl bg-white/80 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700 p-2.5 cursor-grab active:cursor-grabbing transition-all hover:shadow-md ${
                        draggingId === project.id ? "opacity-40" : ""
                      }`}
                    >
                      <Link
                        href={`/projet/${project.id}?mode=${mode}`}
                        className="block"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {project.projet || "Sans nom"}
                        </p>
                        {project.ofrTM && (
                          <p className="text-[10px] text-gray-500 mt-0.5">OFR {project.ofrTM}</p>
                        )}
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          {project.nbCabines != null && project.nbCabines > 0 && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              {project.nbCabines} cab.
                            </Badge>
                          )}
                          {collabNames.map((name) => {
                            const c = getCollaboratorColor(name.trim());
                            return (
                              <span
                                key={name}
                                className="inline-flex items-center gap-0.5 text-[10px]"
                                style={{ color: c.text }}
                              >
                                <span
                                  className="w-1.5 h-1.5 rounded-full"
                                  style={{ backgroundColor: c.dot }}
                                />
                                {name.trim()}
                              </span>
                            );
                          })}
                        </div>
                      </Link>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
