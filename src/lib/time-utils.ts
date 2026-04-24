/**
 * Pure utility functions for time parsing, duration estimation,
 * status sorting, and ISO week number calculation.
 *
 * Extracted from various components so they can be unit-tested.
 */

/**
 * Parse a time string "HH:MM" into total minutes since midnight.
 * Returns null if the input is empty or does not match.
 */
export function parseTime(raw: string): number | null {
  if (!raw || !raw.trim()) return null;
  const match = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return parseInt(match[1]) * 60 + parseInt(match[2]);
}

/**
 * Parse a time string that may be simple "HH:MM" or embedded in a
 * multi-day / collaborator string. Returns the first time found (in minutes).
 */
export function parseTimeRaw(raw: string): number | null {
  if (!raw || !raw.trim()) return null;
  const simpleMatch = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (simpleMatch) {
    return parseInt(simpleMatch[1]) * 60 + parseInt(simpleMatch[2]);
  }
  const timeMatches = raw.match(/(\d{1,2}):(\d{2})/g);
  if (timeMatches && timeMatches.length > 0) {
    const parts = timeMatches[0].split(":");
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
  }
  return null;
}

/**
 * Compute the difference in minutes between two "HH:MM" strings.
 * Returns 0 if either value is unparseable or the result is negative.
 */
export function computeTimeDifference(start: string, end: string): number {
  const s = parseTime(start);
  const e = parseTime(end);
  if (s === null || e === null) return 0;
  const diff = e - s;
  return diff > 0 ? diff : 0;
}

/**
 * Format a number of minutes as "Xh YYmin".
 */
export function formatMinutes(min: number): string {
  if (min <= 0) return "0h 00min";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m.toString().padStart(2, "0")}min`;
}

export interface MultiDayEntry {
  date: string;
  collaborateur: string;
  time: string;
}

/**
 * Parse a multi-day time string like
 *   "2026-04-07 Claudio 08:30 | 2026-04-08 Claudio 07:00"
 * into structured entries.
 */
export function parseMultiDayEntries(raw: string): MultiDayEntry[] {
  if (!raw || !raw.includes("|")) return [];
  return raw.split("|").map((part) => {
    const tokens = part.trim().split(/\s+/);
    if (tokens.length >= 3) {
      return {
        date: tokens[0],
        collaborateur: tokens.slice(1, -1).join(" "),
        time: tokens[tokens.length - 1],
      };
    }
    if (tokens.length === 2) {
      if (tokens[0].match(/^\d{4}-\d{2}-\d{2}$/)) {
        return { date: tokens[0], collaborateur: "", time: tokens[1] };
      }
      return { date: "", collaborateur: tokens[0], time: tokens[1] };
    }
    if (tokens.length === 1) {
      return { date: "", collaborateur: "", time: tokens[0] };
    }
    return { date: "", collaborateur: "", time: "" };
  });
}

export interface ProjectTimeData {
  heureArrivee: string;
  heureDepart: string;
  nbCabines: number;
  fournisseurs: string[];
}

/**
 * Estimate average duration per cabine from a set of completed projects,
 * optionally filtered by supplier.
 */
export function estimateDuration(
  fournisseur: string,
  nbCabines: number,
  projects: ProjectTimeData[],
): { hours: number; minutes: number; confidence: string } | null {
  const projectsWithTime = projects
    .filter(
      (p) =>
        p.heureArrivee &&
        p.heureDepart &&
        p.heureArrivee.trim() !== "" &&
        p.heureDepart.trim() !== "",
    )
    .map((p) => {
      const arrive = parseTimeRaw(p.heureArrivee);
      const depart = parseTimeRaw(p.heureDepart);
      if (arrive === null || depart === null) return null;
      let mins = depart - arrive;
      if (mins <= 0) mins += 24 * 60;
      const cabines = p.nbCabines || 1;
      const minsPerCabine = mins / cabines;
      return { project: p, minsPerCabine };
    })
    .filter(Boolean) as { project: ProjectTimeData; minsPerCabine: number }[];

  const supplierProjects = projectsWithTime.filter((p) =>
    p.project.fournisseurs.includes(fournisseur),
  );

  let avgMinsPerCabine: number;
  let confidence: string;

  if (supplierProjects.length >= 3) {
    avgMinsPerCabine =
      supplierProjects.reduce((s, p) => s + p.minsPerCabine, 0) /
      supplierProjects.length;
    confidence = `${supplierProjects.length} projets ${fournisseur}`;
  } else if (projectsWithTime.length >= 3) {
    avgMinsPerCabine =
      projectsWithTime.reduce((s, p) => s + p.minsPerCabine, 0) /
      projectsWithTime.length;
    confidence = "moyenne generale";
  } else {
    return null;
  }

  const totalMins = Math.round(avgMinsPerCabine * nbCabines);
  return {
    hours: Math.floor(totalMins / 60),
    minutes: totalMins % 60,
    confidence,
  };
}

/**
 * Sort comparator for Mesures status using STATUS_MESURES_SORT_ORDER.
 * Projects with lower order number come first; unknown statuses sort last.
 */
export function compareMesuresStatus(
  statusA: string,
  statusB: string,
  sortOrder: Record<string, number>,
): number {
  const orderA = sortOrder[statusA] ?? 999;
  const orderB = sortOrder[statusB] ?? 999;
  return orderA - orderB;
}

/**
 * ISO 8601 week number for a given date.
 * Uses the algorithm where week 1 contains the first Thursday of the year.
 */
export function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/**
 * Format a JavaScript Date into "YYYY-MM-DD" in local timezone.
 * Needed because toISOString() uses UTC and can shift the day at midnight.
 */
export function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Liste des jours ouvrables (lundi à vendredi) entre deux dates inclusives.
 * `startStr` et `endStr` acceptent "YYYY-MM-DD" ou "YYYY-MM-DDTHH:MM..."
 * (la partie horaire est ignorée).
 * Retourne une liste de chaînes "YYYY-MM-DD".
 */
export function getWorkingDays(startStr: string, endStr: string): string[] {
  if (!startStr || !endStr) return [];
  const days: string[] = [];
  const start = new Date(startStr.split("T")[0] + "T12:00:00");
  const end = new Date(endStr.split("T")[0] + "T12:00:00");
  const current = new Date(start);
  while (current <= end) {
    const dow = current.getDay();
    if (dow !== 0 && dow !== 6) {
      days.push(formatLocalDate(current));
    }
    current.setDate(current.getDate() + 1);
  }
  return days;
}

/**
 * Teste si un jour donné (YYYY-MM-DD) appartient à la plage [start, end]
 * d'un projet. Si le projet n'a pas de date de fin, on fait un match exact
 * sur la date de début. Si une plage est présente, on utilise les jours
 * ouvrables (week-ends exclus) — c'est la logique appliquée sur le
 * planning et le dashboard monteur. Typiquement :
 *   dateInRange("2026-04-29", "2026-04-28", "2026-04-30") → true
 *   dateInRange("2026-04-29", "2026-04-28", null)        → false
 */
export function dateInRange(
  dateStr: string,
  startRaw: string | null | undefined,
  endRaw?: string | null | undefined,
): boolean {
  if (!startRaw) return false;
  const start = startRaw.split("T")[0];
  if (!endRaw) return start === dateStr;
  const end = endRaw.split("T")[0];
  if (start === end) return start === dateStr;
  return getWorkingDays(start, end).includes(dateStr);
}
