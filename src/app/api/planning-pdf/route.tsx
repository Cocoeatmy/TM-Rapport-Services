import { NextRequest } from "next/server";
import { getProjects } from "@/lib/notion";
import type { Project } from "@/lib/notion";
import { LOGO_BASE64 } from "@/lib/logo";
import { dateInRange, formatLocalDate } from "@/lib/time-utils";
import ReactPDF, {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";
import React from "react";

export const dynamic = "force-dynamic";

const DAYS_FR = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const MONTH_NAMES = [
  "Janvier", "Fevrier", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Aout", "Septembre", "Octobre", "Novembre", "Decembre",
];

const COLLAB_COLORS: Record<string, string> = {
  Claudio: "#3b82f6",
  "Jean-Marc": "#22c55e",
  Jacobo: "#f59e0b",
  Micael: "#8b5cf6",
  Miguel: "#f43f5e",
  "Loic": "#14b8a6",
};

function getCollabColor(name: string): string {
  const trimmed = name.trim();
  if (COLLAB_COLORS[trimmed]) return COLLAB_COLORS[trimmed];
  // Handle accent variations
  for (const [key, val] of Object.entries(COLLAB_COLORS)) {
    if (trimmed.toLowerCase().replace(/[^a-z]/g, "") === key.toLowerCase().replace(/[^a-z]/g, "")) return val;
  }
  let hash = 0;
  for (let i = 0; i < trimmed.length; i++) hash = trimmed.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 60%, 45%)`;
}

function getInitials(name: string): string {
  return name
    .trim()
    .split(/[\s-]+/)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("")
    .slice(0, 2);
}

function getStatusColor(status: string): string {
  const s = status.toLowerCase();
  if (s.includes("rdv") && s.includes("fix")) return "#16a34a"; // green
  if (s.includes("fixer") || s.includes("recevoir") || s.includes("chercher") || s.includes("attendre")) return "#ea580c"; // orange
  return "#6b7280"; // gray
}

const styles = StyleSheet.create({
  page: {
    padding: 20,
    fontFamily: "Helvetica",
    fontSize: 7,
    color: "#1a1a1a",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 2,
    borderBottomColor: "#1e3a5f",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  title: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: "#1e3a5f",
  },
  subtitle: {
    fontSize: 8,
    color: "#666",
    marginTop: 2,
  },
  logo: {
    width: 40,
    height: 40,
  },
  grid: {
    flexDirection: "column",
    borderWidth: 1,
    borderColor: "#d1d5db",
  },
  weekRow: {
    flexDirection: "row",
    minHeight: 72,
  },
  dayHeader: {
    flexDirection: "row",
  },
  dayHeaderCell: {
    flex: 1,
    backgroundColor: "#1e3a5f",
    color: "white",
    textAlign: "center",
    padding: 4,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    borderRightWidth: 1,
    borderRightColor: "#2d5a8e",
  },
  dayCell: {
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: "#d1d5db",
    borderBottomWidth: 1,
    borderBottomColor: "#d1d5db",
    padding: 3,
    minHeight: 72,
  },
  dayCellWeekend: {
    backgroundColor: "#f9fafb",
  },
  dayCellToday: {
    backgroundColor: "#eff6ff",
  },
  dayNumber: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#374151",
    marginBottom: 2,
  },
  dayNumberToday: {
    color: "#1e3a5f",
  },
  projectEntry: {
    marginBottom: 2,
    padding: 2,
    borderRadius: 2,
    borderLeftWidth: 2,
  },
  projectName: {
    fontSize: 6,
    fontFamily: "Helvetica-Bold",
    marginBottom: 1,
  },
  projectMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    fontSize: 5.5,
  },
  collabBadge: {
    color: "white",
    fontSize: 5,
    fontFamily: "Helvetica-Bold",
    paddingHorizontal: 3,
    paddingVertical: 1,
    borderRadius: 2,
  },
  cabineBadge: {
    fontSize: 5,
    color: "#6b7280",
    paddingHorizontal: 2,
    paddingVertical: 1,
    borderWidth: 0.5,
    borderColor: "#d1d5db",
    borderRadius: 2,
  },
  emptyCellText: {
    fontSize: 6,
    color: "#d1d5db",
  },
});

interface DayData {
  day: number;
  projects: Project[];
}

function PlanningPDF({
  year,
  month,
  monthName,
  weeks,
  startDow,
  daysInMonth,
}: {
  year: number;
  month: number;
  monthName: string;
  weeks: DayData[][];
  startDow: number;
  daysInMonth: number;
}) {
  const today = new Date();
  const todayDay =
    today.getFullYear() === year && today.getMonth() === month
      ? today.getDate()
      : -1;

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Image src={LOGO_BASE64} style={styles.logo} />
            <View>
              <Text style={styles.title}>
                Planning {monthName} {year}
              </Text>
              <Text style={styles.subtitle}>TM Rapport Services</Text>
            </View>
          </View>
          <View>
            <Text style={{ fontSize: 7, color: "#666" }}>
              Genere le{" "}
              {new Date().toLocaleDateString("fr-CH", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}
            </Text>
          </View>
        </View>

        {/* Calendar grid */}
        <View style={styles.grid}>
          {/* Day headers */}
          <View style={styles.dayHeader}>
            {DAYS_FR.map((d, i) => (
              <Text
                key={d}
                style={[
                  styles.dayHeaderCell,
                  i === 6 ? { borderRightWidth: 0 } : {},
                ]}
              >
                {d}
              </Text>
            ))}
          </View>

          {/* Weeks */}
          {weeks.map((week, wi) => (
            <View key={wi} style={styles.weekRow}>
              {week.map((cell, ci) => {
                const isWeekend = ci >= 5;
                const isToday = cell.day === todayDay && cell.day > 0;
                return (
                  <View
                    key={ci}
                    style={[
                      styles.dayCell,
                      isWeekend ? styles.dayCellWeekend : {},
                      isToday ? styles.dayCellToday : {},
                      ci === 6 ? { borderRightWidth: 0 } : {},
                      wi === weeks.length - 1
                        ? { borderBottomWidth: 0 }
                        : {},
                    ]}
                  >
                    {cell.day > 0 ? (
                      <>
                        <Text
                          style={[
                            styles.dayNumber,
                            isToday ? styles.dayNumberToday : {},
                          ]}
                        >
                          {cell.day}
                        </Text>
                        {cell.projects.slice(0, 4).map((p, pi) => {
                          const statusColor = getStatusColor(p.etatCMD);
                          const collabs = (p.collaborateurs || "")
                            .split(" & ")
                            .map((n) => n.trim())
                            .filter(Boolean);
                          const projectName =
                            p.projet.length > 20
                              ? p.projet.slice(0, 18) + ".."
                              : p.projet;
                          return (
                            <View
                              key={pi}
                              style={[
                                styles.projectEntry,
                                {
                                  borderLeftColor: statusColor,
                                  backgroundColor:
                                    statusColor === "#16a34a"
                                      ? "#f0fdf4"
                                      : statusColor === "#ea580c"
                                        ? "#fff7ed"
                                        : "#f3f4f6",
                                },
                              ]}
                            >
                              <Text style={styles.projectName}>
                                {projectName}
                              </Text>
                              <View style={styles.projectMeta}>
                                {collabs.map((c, idx) => (
                                  <Text
                                    key={idx}
                                    style={[
                                      styles.collabBadge,
                                      {
                                        backgroundColor: getCollabColor(c),
                                      },
                                    ]}
                                  >
                                    {getInitials(c)}
                                  </Text>
                                ))}
                                {p.nbCabines ? (
                                  <Text style={styles.cabineBadge}>
                                    {p.nbCabines} cab.
                                  </Text>
                                ) : null}
                              </View>
                            </View>
                          );
                        })}
                        {cell.projects.length > 4 && (
                          <Text
                            style={{
                              fontSize: 5.5,
                              color: "#6b7280",
                              marginTop: 1,
                            }}
                          >
                            +{cell.projects.length - 4} autres
                          </Text>
                        )}
                      </>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ))}
        </View>

        {/* Legend */}
        <View
          style={{
            flexDirection: "row",
            gap: 16,
            marginTop: 8,
            alignItems: "center",
          }}
        >
          <View
            style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
          >
            <View
              style={{
                width: 10,
                height: 10,
                backgroundColor: "#f0fdf4",
                borderLeftWidth: 2,
                borderLeftColor: "#16a34a",
              }}
            />
            <Text style={{ fontSize: 6 }}>RDV fixe</Text>
          </View>
          <View
            style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
          >
            <View
              style={{
                width: 10,
                height: 10,
                backgroundColor: "#fff7ed",
                borderLeftWidth: 2,
                borderLeftColor: "#ea580c",
              }}
            />
            <Text style={{ fontSize: 6 }}>A fixer / en attente</Text>
          </View>
          <View
            style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
          >
            <View
              style={{
                width: 10,
                height: 10,
                backgroundColor: "#f3f4f6",
                borderLeftWidth: 2,
                borderLeftColor: "#6b7280",
              }}
            />
            <Text style={{ fontSize: 6 }}>Autre</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const monthParam = searchParams.get("month");

    let year: number;
    let month: number; // 0-indexed

    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      const [y, m] = monthParam.split("-").map(Number);
      year = y;
      month = m - 1;
    } else {
      const now = new Date();
      year = now.getFullYear();
      month = now.getMonth();
    }

    const monthName = MONTH_NAMES[month];

    // Fetch all projects
    const projects = await getProjects();

    // Build weeks grid
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDow = (firstDay.getDay() + 6) % 7; // Monday = 0
    const daysInMonth = lastDay.getDate();

    // Filter projects whose [dateMontage, dateMontageEnd] range (or
    // dateMesures alone) overlaps with this month. A multi-day project
    // spanning two months will appear on both, on the correct days.
    const monthProjects = projects.filter((p) => {
      const startDate = p.dateMontage || p.dateMesures;
      if (!startDate) return false;
      const endDate = p.dateMontageEnd || startDate;
      const monthStart = formatLocalDate(firstDay);
      const monthEnd = formatLocalDate(lastDay);
      return (startDate.split("T")[0] <= monthEnd) && (endDate.split("T")[0] >= monthStart);
    });

    // Build projectsByDay — a multi-day project is duplicated on each
    // working day of its range.
    const projectsByDay: Record<number, Project[]> = {};
    monthProjects.forEach((p) => {
      const startDate = p.dateMontage || p.dateMesures;
      const endDate = p.dateMontageEnd || null;
      if (!startDate) return;
      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = formatLocalDate(new Date(year, month, day));
        if (dateInRange(dateStr, startDate, endDate)) {
          if (!projectsByDay[day]) projectsByDay[day] = [];
          projectsByDay[day].push(p);
        }
      }
    });

    const weeks: DayData[][] = [];
    let currentWeek: DayData[] = [];

    // Fill empty cells before first day
    for (let i = 0; i < startDow; i++) {
      currentWeek.push({ day: 0, projects: [] });
    }

    for (let day = 1; day <= daysInMonth; day++) {
      currentWeek.push({ day, projects: projectsByDay[day] || [] });
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }

    // Fill remaining cells in last week
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) {
        currentWeek.push({ day: 0, projects: [] });
      }
      weeks.push(currentWeek);
    }

    const pdfStream = await ReactPDF.renderToStream(
      <PlanningPDF
        year={year}
        month={month}
        monthName={monthName}
        weeks={weeks}
        startDow={startDow}
        daysInMonth={daysInMonth}
      />
    );

    const chunks: Buffer[] = [];
    // @ts-ignore - ReadableStream from react-pdf
    for await (const chunk of pdfStream) {
      chunks.push(Buffer.from(chunk));
    }
    const pdfBuffer = Buffer.concat(chunks);

    const filename = `planning-${year}-${String(month + 1).padStart(2, "0")}.pdf`;

    return new Response(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    console.error("Error generating planning PDF:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erreur generation PDF" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
