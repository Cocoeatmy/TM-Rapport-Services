"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { prefetchProject } from "@/lib/api-helpers";
import { Calendar, MapPin, Clock, ChevronRight, ChevronDown, ChevronUp, Box, Truck, Users, BarChart3, Navigation, Route, Ruler, Wrench, Settings, AlertTriangle, AlertCircle, FolderOpen, Receipt, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getCollaboratorColor, getCollaboratorInitials } from "@/lib/collaborators";
import { COLLABORATEURS_LIST, TEAM_EXCLUDED_COLLABORATORS } from "@/lib/constants";
import type { Project } from "@/lib/notion";
import { PersonalStats } from "@/components/personal-stats";

const CLIENT_LOGOS: { prefix: string; logo: string }[] = [
  { prefix: "getaz", logo: "/logos/fournisseurs/BMS-Logo.png" },
  { prefix: "gétaz", logo: "/logos/fournisseurs/BMS-Logo.png" },
  { prefix: "duka", logo: "/logos/fournisseurs/duka.ch-logo.png" },
  { prefix: "duscholux", logo: "/logos/fournisseurs/Duscholux-logo.png" },
  { prefix: "ronal", logo: "/logos/fournisseurs/ronal-logo-v2.png" },
  { prefix: "nelo", logo: "/logos/fournisseurs/Nelo-logo.jpg" },
  { prefix: "novellini", logo: "/logos/fournisseurs/Novellini-logo.png" },
  { prefix: "samo", logo: "/logos/fournisseurs/Samo-logo.jpg" },
  { prefix: "dubat", logo: "/logos/fournisseurs/Dubat-Logo.png" },
  { prefix: "tema", logo: "/logos/fournisseurs/Tema-Logo.png" },
  { prefix: "matway", logo: "/logos/fournisseurs/Matway-Logo.png" },
  { prefix: "bringhen", logo: "/logos/fournisseurs/Bringhen-logo.jpg" },
];

function getClientLogo(projectName: string): string | null {
  const lower = projectName.toLowerCase();
  const match = CLIENT_LOGOS.find((c) => lower.startsWith(c.prefix));
  return match ? match.logo : null;
}

// Get all working days (Mon-Fri) between start and end dates
function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getWorkingDays(startStr: string, endStr: string): string[] {
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

// Get the effective date for a project (montage or mesures)
function getEffectiveDate(p: Project): string {
  return (p.dateMontage || p.dateMesures || "").split("T")[0];
}

// Check if a project spans a given date (considering multi-day projects, excluding weekends)
function projectSpansDate(p: Project, dateStr: string): boolean {
  const startRaw = getEffectiveDate(p);
  const endRaw = (p.dateMontageEnd || "").split("T")[0];
  if (!startRaw) return false;
  if (!endRaw) return startRaw === dateStr;
  return getWorkingDays(startRaw, endRaw).includes(dateStr);
}

// Check if a project is active during a date range (for week views)
function projectActiveDuringRange(p: Project, rangeStart: string, rangeEnd: string): boolean {
  const startRaw = getEffectiveDate(p);
  const endRaw = (p.dateMontageEnd || startRaw).split("T")[0];
  if (!startRaw) return false;
  return startRaw <= rangeEnd && endRaw >= rangeStart;
}

interface MonteurDashboardProps {
  userName: string;
  projects: Project[];
  isAdmin?: boolean;
  onNavigate?: (mode: string) => void;
}

// --- Helper functions ---

function parseTimeToMinutes(raw: string): number {
  const match = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return -1;
  return parseInt(match[1]) * 60 + parseInt(match[2]);
}

/** Extrait HH:MM depuis n'importe quel format :
 *  "08:30" → "08:30"
 *  "Cab1:08:30" → "08:30"
 *  "2026-04-27 Jean-Marc 08:30" → "08:30" (via dernier token)
 */
/** Parse un champ ofrTM qui peut contenir plusieurs numéros TM (séparés par \n, virgule ou ;).
 *  Retourne les numéros triés par ordre croissant (le plus petit d'abord = en haut). */
function parseTMNumbers(raw: string): string[] {
  if (!raw) return [];
  const parts = raw.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
  // Trie numériquement sur les chiffres du numéro (ex. TM-2600135 → 2600135)
  return parts.sort((a, b) => {
    const numA = parseInt(a.replace(/\D/g, ""), 10) || 0;
    const numB = parseInt(b.replace(/\D/g, ""), 10) || 0;
    return numA - numB;
  });
}

/** Retourne l'info arrivage (TM en priorité, sinon Grossiste) + la couleur d'urgence.
 *  Vert = 0-6 j · Orange = 7-9 j · Rouge ≥ 10 j depuis la date d'arrivage. */
function getArrivageInfo(p: { arrivageTM?: string | null; arrivageGrossiste?: string | null }): {
  date: string | null;
  label: string;
  colorClass: string;
  bgClass: string;
  days: number | null;
} | null {
  const raw = p.arrivageTM || p.arrivageGrossiste || null;
  if (!raw) return null;
  const label = p.arrivageTM ? "TM" : "Gross.";
  const date = raw.split("T")[0];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const arrival = new Date(date + "T00:00:00");
  const days = Math.floor((today.getTime() - arrival.getTime()) / 86400000);
  let colorClass: string;
  let bgClass: string;
  if (days < 0) {
    // Pas encore arrivé
    colorClass = "text-gray-500 dark:text-gray-400";
    bgClass = "bg-gray-100 dark:bg-gray-800";
  } else if (days <= 6) {
    colorClass = "text-green-700 dark:text-green-400";
    bgClass = "bg-green-100 dark:bg-green-900/30";
  } else if (days <= 9) {
    colorClass = "text-orange-700 dark:text-orange-400";
    bgClass = "bg-orange-100 dark:bg-orange-900/30";
  } else {
    colorClass = "text-red-700 dark:text-red-400";
    bgClass = "bg-red-100 dark:bg-red-900/30";
  }
  return { date, label, colorClass, bgClass, days };
}

function extractHHMM(s: string): string {
  const m = s.trim().match(/(\d{1,2}:\d{2})$/);
  return m ? m[1] : "";
}

/** Retourne true si le projet est un travail solo (pas de & ni "team"). */
function isSoloProject(p: Project, collabName: string): boolean {
  const c = (p.collaborateurs || "").trim();
  if (c.includes("&") || c.toLowerCase().includes("team")) return false;
  return c.toLowerCase().includes(collabName.toLowerCase());
}

/**
 * Retourne true si un fragment (après split "|") est au format nommé multi-jour :
 * "YYYY-MM-DD Prénom HH:MM" — 1er token = date ISO, dernier = HH:MM
 * Ces entrées représentent du travail INDIVIDUEL même sur un projet multi-personne.
 */
function isNamedEntry(part: string): boolean {
  const tokens = part.trim().split(/\s+/);
  return tokens.length >= 3 && /^\d{4}-\d{2}-\d{2}$/.test(tokens[0] || "");
}

/**
 * Calcule les minutes INDIVIDUELLES d'un collaborateur sur une plage de dates.
 *
 * Règles métier :
 *  - Projet solo → toutes les entrées comptent en individuel
 *  - Projet binôme/équipe + entrées nommées ("YYYY-MM-DD Prénom HH:MM") →
 *    chaque entrée compte pour la personne nommée (cabines séparées)
 *  - Projet binôme/équipe + entrée simple ou "Cab1:HH:MM" →
 *    entrée partagée = va dans Binômes, PAS en individuel
 *
 * Formats gérés :
 *  1. Simple      "08:30"
 *  2. Cabine      "Cab1:08:30 | Cab2:13:55"
 *  3. Multi-nommé "2026-04-27 Jean-Marc 08:30 | 2026-04-27 Miguel 09:00"
 */
function getIndividualHoursForCollab(
  projects: Project[],
  collabName: string,
  fromStr: string,
  toStr: string,
): number {
  let totalMinutes = 0;
  const lc = collabName.toLowerCase();

  for (const p of projects) {
    const collab = (p.collaborateurs || "").trim();
    if (!collab.toLowerCase().includes(lc)) continue;

    const isMulti = collab.includes("&") || collab.toLowerCase().includes("team");
    const ha = p.heureArrivee || "";
    const hd = p.heureDepart || "";
    if (!ha && !hd) continue;

    if (ha.includes("|") || hd.includes("|")) {
      const arrParts = ha.split("|").map((s) => s.trim()).filter(Boolean);
      const depParts = hd.split("|").map((s) => s.trim()).filter(Boolean);
      const maxLen = Math.max(arrParts.length, depParts.length);

      for (let i = 0; i < maxLen; i++) {
        const aPart = arrParts[i] || "";
        const dPart = depParts[i] || "";

        // Format Cabine "Cab1:08:30" → entrée partagée si multi-personne
        if (/^Cab\d+:/i.test(aPart) || /^Cab\d+:/i.test(dPart)) {
          if (isMulti) continue; // partagé → Binômes
          const dateStr = p.dateMontage?.split("T")[0] || "";
          if (fromStr && dateStr < fromStr) continue;
          if (toStr && dateStr > toStr) continue;
          const arrMin = parseTimeToMinutes(extractHHMM(aPart));
          const depMin = parseTimeToMinutes(extractHHMM(dPart));
          if (arrMin >= 0 && depMin >= 0 && depMin > arrMin) totalMinutes += depMin - arrMin;
          continue;
        }

        // Format nommé "YYYY-MM-DD Prénom HH:MM" → individuel
        if (isNamedEntry(aPart) || isNamedEntry(dPart)) {
          const aTokens = aPart.split(/\s+/);
          const dTokens = dPart.split(/\s+/);
          const aDate = isNamedEntry(aPart) ? aTokens[0] : "";
          const dDate = isNamedEntry(dPart) ? dTokens[0] : "";
          const entryDate = aDate || dDate || p.dateMontage?.split("T")[0] || "";
          const entryCollab = aTokens.slice(1, -1).join(" ") || dTokens.slice(1, -1).join(" ") || "";
          // Si l'entrée a un nom explicite, vérifier que c'est bien ce collaborateur
          if (entryCollab && !entryCollab.toLowerCase().includes(lc)) continue;
          if (fromStr && entryDate < fromStr) continue;
          if (toStr && entryDate > toStr) continue;
          const arrMin = parseTimeToMinutes(aTokens[aTokens.length - 1] || "");
          const depMin = parseTimeToMinutes(dTokens[dTokens.length - 1] || "");
          if (arrMin >= 0 && depMin >= 0 && depMin > arrMin) totalMinutes += depMin - arrMin;
          continue;
        }

        // Entrée simple sans nom au sein d'un multi-jour → partagé si multi-personne
        if (isMulti) continue; // partagé → Binômes
        const aTokens = aPart.split(/\s+/);
        const dTokens = dPart.split(/\s+/);
        const entryDate = p.dateMontage?.split("T")[0] || "";
        if (fromStr && entryDate < fromStr) continue;
        if (toStr && entryDate > toStr) continue;
        const arrMin = parseTimeToMinutes(aTokens[aTokens.length - 1] || "");
        const depMin = parseTimeToMinutes(dTokens[dTokens.length - 1] || "");
        if (arrMin >= 0 && depMin >= 0 && depMin > arrMin) totalMinutes += depMin - arrMin;
      }
    } else {
      // Format simple (une seule entrée)
      if (isMulti) continue; // binôme sur cabine commune → Binômes
      const dateStr = p.dateMontage?.split("T")[0] || "";
      if (fromStr && dateStr < fromStr) continue;
      if (toStr && dateStr > toStr) continue;
      const arrMin = parseTimeToMinutes(extractHHMM(ha) || ha);
      const depMin = parseTimeToMinutes(extractHHMM(hd) || hd);
      if (arrMin >= 0 && depMin >= 0 && depMin > arrMin) totalMinutes += depMin - arrMin;
    }
  }
  return totalMinutes;
}

/** Garde la même signature pour la compatibilité avec les anciens appels. */
function getHoursForCollabInRange(
  projects: Project[],
  collabName: string,
  fromStr: string,
  toStr: string,
  soloOnly = false,
): number {
  if (soloOnly) return getIndividualHoursForCollab(projects, collabName, fromStr, toStr);
  // mode "all" : heures individuelles + binômes (utilisé pour les stats globales)
  return getIndividualHoursForCollab(projects, collabName, fromStr, toStr);
}

// Garde la compatibilité avec les anciens appels (semaine courante).
function getWeeklyHoursForCollab(projects: Project[], collabName: string): number {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return getHoursForCollabInRange(
    projects, collabName,
    monday.toISOString().split("T")[0],
    sunday.toISOString().split("T")[0],
  );
}

function getDateRangeForFilter(
  filter: "semaine" | "mois" | "annee" | "custom",
  customFrom?: string,
  customTo?: string,
  customMonth?: string, // "YYYY-MM"
  customYear?: string,  // "YYYY"
): { fromStr: string; toStr: string; label: string } {
  const today = new Date();
  if (filter === "semaine") {
    const dayOfWeek = today.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(today);
    monday.setDate(today.getDate() + mondayOffset);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return {
      fromStr: monday.toISOString().split("T")[0],
      toStr: sunday.toISOString().split("T")[0],
      label: "Cette semaine",
    };
  }
  if (filter === "mois") {
    const [y, m] = customMonth ? customMonth.split("-").map(Number) : [today.getFullYear(), today.getMonth() + 1];
    const firstDay = new Date(y, m - 1, 1);
    const lastDay = new Date(y, m, 0);
    const monthName = firstDay.toLocaleDateString("fr-CH", { month: "long", year: "numeric" });
    return {
      fromStr: firstDay.toISOString().split("T")[0],
      toStr: lastDay.toISOString().split("T")[0],
      label: monthName.charAt(0).toUpperCase() + monthName.slice(1),
    };
  }
  if (filter === "annee") {
    const y = customYear ? parseInt(customYear) : today.getFullYear();
    return {
      fromStr: `${y}-01-01`,
      toStr: `${y}-12-31`,
      label: `Année ${y}`,
    };
  }
  // custom
  return {
    fromStr: customFrom || "",
    toStr: customTo || "",
    label: customFrom && customTo ? `${customFrom} → ${customTo}` : "Plage personnalisée",
  };
}

function fmtMin(min: number): string {
  if (min <= 0) return "0h 00min";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m.toString().padStart(2, "0")}min`;
}

function getTodayStr() {
  return new Date().toISOString().split("T")[0];
}

/** Retourne la couleur du point de statut rapport ou null si rien à afficher.
 *  - green  : rapport clôturé
 *  - orange : rapport commencé mais pas clôturé (jour J uniquement)
 *  - red    : rapport absent (jour J ou jours passés)
 *  - null   : projet futur → rien */
function getReportDot(project: Project, projectDateStr: string): "green" | "orange" | "red" | null {
  const todayStr = getTodayStr();
  if (!projectDateStr || projectDateStr > todayStr) return null;
  const cloture =
    (project.rapportDeMontage || "").toLowerCase().includes("clôt") ||
    (project.rapportDeMontage || "").toLowerCase().includes("clot");
  if (cloture) return "green";
  if (projectDateStr === todayStr) {
    const started = !!(project.rapportMonteur || project.heureArrivee);
    return started ? "orange" : "red";
  }
  return "red";
}

function getWeekEndStr() {
  const today = new Date();
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 14);
  return weekEnd.toISOString().split("T")[0];
}

function getThisWeekEndStr() {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
  const sunday = new Date(today);
  sunday.setDate(today.getDate() + daysUntilSunday);
  return sunday.toISOString().split("T")[0];
}

function formatDay(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("fr-CH", { weekday: "short", day: "2-digit", month: "short" });
}

/**
 * Affichage de la date d'un projet en tenant compte des projets multi-jours.
 * - Projet mono-jour : "Mar. 26 avr."
 * - Projet multi-jours (ex. 28-30 avril) : "Mar. 28 → Jeu. 30 avr."
 * Le badge "3j" affiché à côté complète l'info, mais le texte lui-même doit
 * déjà montrer la plage — sinon on pense que c'est un rendez-vous d'un jour.
 */
function formatProjectDate(project: Project): string {
  const startRaw = project.dateMontage || project.dateMesures || "";
  if (!startRaw) return "---";
  const endRaw = project.dateMontageEnd || "";
  const startDay = startRaw.split("T")[0];
  const endDay = endRaw.split("T")[0];
  if (!endDay || endDay === startDay) return formatDay(startRaw);
  return `${formatDay(startRaw)} → ${formatDay(endRaw)}`;
}

/** Supprime les diacritiques : "Loïc" → "loic", insensible à la casse. */
function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function matchesCollaborator(fieldValue: string, name: string): boolean {
  if (!fieldValue) return false;
  // Les projets attribués à une "Team …" (ex: "Team TM") sont considérés
  // comme assignés à TOUS les monteurs individuels : ils doivent
  // apparaître dans chaque dashboard personnel, pas seulement dans la
  // section "Binômes & Teams".
  // Exception : les collaborateurs de TEAM_EXCLUDED_COLLABORATORS (ex: admin)
  // ne reçoivent pas les montages Team.
  if (fieldValue.toLowerCase().includes("team")) {
    const firstName = norm(name.split(" ")[0]);
    const excluded = TEAM_EXCLUDED_COLLABORATORS.some((e) => norm(e) === firstName);
    return !excluded;
  }
  const n = norm(name);
  return fieldValue.split("&").some((part) => {
    const trimmed = norm(part.trim());
    // Exact match on the part or the part contains the name as a distinct word
    return trimmed === n || trimmed.split(/\s+/).some((word) => word === n);
  });
}

function getProjectsForCollaborator(projects: Project[], name: string) {
  return projects.filter((p) => {
    const source = getProjectSource(p);
    // For mesures projects, only match mesuresTraiteePar
    if (source === "mesures") {
      return matchesCollaborator(p.mesuresTraiteePar || "", name);
    }
    // For montage/services/sav, only match collaborateurs
    return matchesCollaborator(p.collaborateurs || "", name);
  });
}

function getProjectSource(p: any): string {
  return (p as any)._source || "montage";
}

function countCabinesBySource(projects: Project[], collabName?: string) {
  const counts: Record<string, number> = {};
  for (const p of projects) {
    const source = getProjectSource(p);
    const cab = p.nbCabines || 0;
    // If in binôme/team, divide cabines by number of collaborateurs
    const collabNames = (p.collaborateurs || "").split(" & ").map((n) => n.trim()).filter(Boolean);
    const divisor = (collabName && source === "montage" && collabNames.length > 1) ? collabNames.length : 1;
    counts[source] = (counts[source] || 0) + Math.round(cab / divisor);
  }
  return counts;
}

function formatCabinesSummary(counts: Record<string, number>): string {
  const labels: Record<string, string> = { montage: "montage", mesures: "mesures", services: "services", sav: "SAV" };
  return Object.entries(counts)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${v} ${labels[k] || k}`)
    .join(" · ");
}

// --- Route planning button ---

function DailyRouteButton({ projects }: { projects: Project[] }) {
  const [showPicker, setShowPicker] = useState(false);

  const addresses = projects
    .map((p) => p.adresseChantier)
    .filter(Boolean);

  if (addresses.length === 0) return null;

  const buildGoogleMapsUrl = () => {
    // First address is destination, rest are waypoints
    const encoded = addresses.map((a) => encodeURIComponent(a));
    if (encoded.length === 1) {
      return `https://www.google.com/maps/dir/?api=1&destination=${encoded[0]}`;
    }
    const destination = encoded[encoded.length - 1];
    const waypoints = encoded.slice(0, -1).join("|");
    return `https://www.google.com/maps/dir/?api=1&destination=${destination}&waypoints=${waypoints}`;
  };

  const buildGoogleMapsDeepLink = () => {
    const encoded = addresses.map((a) => encodeURIComponent(a));
    if (encoded.length === 1) {
      return `comgooglemaps://?daddr=${encoded[0]}`;
    }
    // Google Maps app supports waypoints via the URL scheme
    return `comgooglemaps://?daddr=${encoded.join("+to:")}`;
  };

  const buildWazeUrl = () => {
    // Waze only supports single destination, use first address
    const addr = encodeURIComponent(addresses[0]);
    return `waze://?q=${addr}&navigate=yes`;
  };

  const buildWazeFallback = () => {
    const addr = encodeURIComponent(addresses[0]);
    return `https://waze.com/ul?q=${addr}&navigate=yes`;
  };

  const openApp = (app: "google" | "waze") => {
    setShowPicker(false);
    if (app === "google") {
      window.location.href = buildGoogleMapsDeepLink();
      setTimeout(() => {
        window.open(buildGoogleMapsUrl(), "_blank");
      }, 500);
    } else {
      window.location.href = buildWazeUrl();
      setTimeout(() => {
        window.open(buildWazeFallback(), "_blank");
      }, 500);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setShowPicker(!showPicker)}
        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 active:scale-[0.98] transition-all"
      >
        <Route className="w-4 h-4" />
        Itinéraire du jour ({addresses.length} arrêt{addresses.length > 1 ? "s" : ""})
      </button>
      {showPicker && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowPicker(false)} />
          <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 p-1">
            <button
              onClick={() => openApp("google")}
              className="w-full text-left text-sm px-3 py-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 text-gray-700 dark:text-gray-300"
            >
              <MapPin className="w-4 h-4 text-red-500" />
              Google Maps
            </button>
            <button
              onClick={() => openApp("waze")}
              className="w-full text-left text-sm px-3 py-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 text-gray-700 dark:text-gray-300"
            >
              <Navigation className="w-4 h-4 text-cyan-500" />
              Waze
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// --- Project card used in both views ---

function ProjectRow({ project, colors }: { project: Project; colors: { bg: string; text: string; dot: string } }) {
  const source = getProjectSource(project);
  const isMesure = source === "mesures";
  const collabField = isMesure ? (project.mesuresTraiteePar || "") : (project.collaborateurs || "");
  const collabNames = collabField.split(" & ").map((n) => n.trim()).filter(Boolean);
  const isTeam = collabNames.length >= 5 || collabField.toLowerCase().includes("team");
  const teamLabel = isTeam ? "Team" : collabNames.length === 2 ? "Binôme" : collabNames.length === 3 ? "Trio" : collabNames.length === 4 ? "Quatuor" : "";
  const logo = getClientLogo(project.projet);
  const projectDateStr = (project.dateMontage || project.dateMesures || "").split("T")[0];
  const reportDot = getReportDot(project, projectDateStr);

  return (
    <Link
      key={project.id}
      href={`/projet/${project.id}?mode=dashboard`}
      onMouseEnter={() => prefetchProject(project.id)}
      onTouchStart={() => prefetchProject(project.id)}
      className="flex items-center gap-2 glass-card rounded-xl px-3 py-2 hover:bg-white/80 dark:hover:bg-white/10 transition-all"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          {reportDot && (
            <span className={`w-2 h-2 rounded-full shrink-0 ${reportDot === "green" ? "bg-green-500" : reportDot === "orange" ? "bg-orange-400" : "bg-red-500"}`} />
          )}
          {project.ofrTM && (
            <span className="text-[10px] font-mono text-gray-400 dark:text-gray-500">{project.ofrTM}</span>
          )}
          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${isMesure ? "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300" : "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300"}`}>
            {isMesure ? "Mesures" : "Montages"}
          </span>
          {teamLabel && (
            <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${isTeam ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
              {teamLabel}
            </span>
          )}
        </div>
        <p className="text-xs font-medium text-gray-900 dark:text-gray-100 line-clamp-2 mt-0.5">{project.projet}</p>
        {project.adresseChantier && (
          <div className="flex items-center gap-1 mt-0.5 text-[10px] text-gray-500 dark:text-gray-400">
            <MapPin className="w-3 h-3 shrink-0" />
            <span className="line-clamp-1">{project.adresseChantier}</span>
          </div>
        )}
        <div className="flex items-center gap-1 mt-1">
          {collabNames.length >= 1 && (
            <div className="flex -space-x-1">
              {collabNames.map((n) => (
                <span key={n} className="w-5 h-5 rounded-full text-[7px] font-bold flex items-center justify-center border border-white dark:border-gray-800"
                  style={{ backgroundColor: getCollaboratorColor(n).bg, color: getCollaboratorColor(n).text }}>
                  {getCollaboratorInitials(n)}
                </span>
              ))}
            </div>
          )}
          {logo && <img src={logo} alt="" className="h-4 w-auto object-contain shrink-0 rounded mix-blend-multiply dark:mix-blend-normal dark:invert" />}
        </div>
      </div>
      <Badge variant="outline" className="text-[10px] shrink-0">{project.nbCabines || 0} cab.</Badge>
      <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 shrink-0" />
    </Link>
  );
}

function WeekProjectRow({ project }: { project: Project }) {
  const date = project.dateMontage || project.dateMesures || "";
  const source = getProjectSource(project);
  const isMesure = source === "mesures";
  const collabField = isMesure ? (project.mesuresTraiteePar || "") : (project.collaborateurs || "");
  const collabNames = collabField.split(" & ").map((n) => n.trim()).filter(Boolean);
  const isTeam = collabNames.length >= 5 || collabField.toLowerCase().includes("team");
  const teamLabel = isTeam ? "Team" : collabNames.length === 2 ? "Binôme" : collabNames.length === 3 ? "Trio" : collabNames.length === 4 ? "Quatuor" : "";
  const logo = getClientLogo(project.projet);
  // Largeur plus grande quand on affiche une plage de dates, pour ne pas
  // tronquer le "Mar. 28 → Jeu. 30 avr.".
  const isMultiDay = !!project.dateMontageEnd && project.dateMontageEnd.split("T")[0] !== (project.dateMontage || "").split("T")[0];
  const projectDateStr = (project.dateMontage || project.dateMesures || "").split("T")[0];
  const reportDot = getReportDot(project, projectDateStr);

  return (
    <Link
      href={`/projet/${project.id}?mode=dashboard`}
      onMouseEnter={() => prefetchProject(project.id)}
      onTouchStart={() => prefetchProject(project.id)}
      className="flex items-center gap-2 glass-card rounded-xl px-3 py-2 hover:bg-white/80 dark:hover:bg-white/10 transition-all"
    >
      {/* Plage de dates : empilées verticalement quand le projet est
          sur plusieurs jours, pour éviter d'occuper trop de largeur. */}
      <div className="text-[10px] font-mono text-gray-500 dark:text-gray-400 shrink-0 w-16 leading-tight">
        {(() => {
          const startRaw = project.dateMontage || project.dateMesures || "";
          const endRaw = project.dateMontageEnd || "";
          const startDay = startRaw.split("T")[0];
          const endDay = endRaw.split("T")[0];
          if (!startRaw) return <div>---</div>;
          if (!endDay || endDay === startDay) return <div>{formatDay(startRaw)}</div>;
          return (
            <div className="flex flex-col">
              <span>{formatDay(startRaw)}</span>
              <span className="text-gray-400 dark:text-gray-500">↓</span>
              <span>{formatDay(endRaw)}</span>
            </div>
          );
        })()}
        {date.includes("T") && (
          <div className="text-[9px] text-blue-500 font-semibold mt-0.5">
            {new Date(date).toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" })}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          {reportDot && (
            <span className={`w-2 h-2 rounded-full shrink-0 ${reportDot === "green" ? "bg-green-500" : reportDot === "orange" ? "bg-orange-400" : "bg-red-500"}`} />
          )}
          {project.ofrTM && (
            <span className="text-[10px] font-mono text-gray-400 dark:text-gray-500">{project.ofrTM}</span>
          )}
          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${isMesure ? "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300" : "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300"}`}>
            {isMesure ? "Mesures" : "Montages"}
          </span>
          {teamLabel && (
            <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${isTeam ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
              {teamLabel}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-900 dark:text-gray-100 line-clamp-2 mt-0.5">{project.projet}</p>
        <div className="flex items-center gap-1 mt-0.5">
          {collabNames.length >= 1 && (
            <div className="flex -space-x-1">
              {collabNames.map((n) => (
                <span key={n} className="w-5 h-5 rounded-full text-[7px] font-bold flex items-center justify-center border border-white dark:border-gray-800"
                  style={{ backgroundColor: getCollaboratorColor(n).bg, color: getCollaboratorColor(n).text }}>
                  {getCollaboratorInitials(n)}
                </span>
              ))}
            </div>
          )}
          {logo && <img src={logo} alt="" className="h-4 w-auto object-contain shrink-0 rounded mix-blend-multiply dark:mix-blend-normal dark:invert" />}
        </div>
      </div>
      <Badge variant="outline" className="text-[10px] shrink-0">{project.nbCabines || 0} cab.</Badge>
      <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 shrink-0" />
    </Link>
  );
}

// --- Admin view ---

function AdminDashboard({ projects, userName, onNavigate }: { projects: Project[]; userName: string; onNavigate?: (mode: string) => void }) {
  const firstName = userName.split(" ")[0];
  const [expandedCollabs, setExpandedCollabs] = useState<Record<string, boolean>>({});
  const toggleCollab = (name: string) => setExpandedCollabs((prev) => ({ ...prev, [name]: !prev[name] }));
  const [showWeekProjects, setShowWeekProjects] = useState(false);
  const [showSummaryPanel, setShowSummaryPanel] = useState<"today" | "week" | "active" | "rdv-a-fixer" | "rdv-fixe" | "mesures-today" | "sav-today" | "emplacement-cabines" | "rapports-attente" | "sav-non-traites" | "soucis-en-cours" | "dossiers-en-cours" | "a-facturer" | null>(null);
  const [userActivities, setUserActivities] = useState<Record<string, string>>({});

  // Heures de travail — filtre et projets terminés
  const [selectedMonteurStats, setSelectedMonteurStats] = useState<string>("");
  const [workFilter, setWorkFilter] = useState<"semaine" | "mois" | "annee" | "custom">("semaine");
  const [workMonth, setWorkMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [workYear, setWorkYear] = useState<string>(() => String(new Date().getFullYear()));
  const [workFrom, setWorkFrom] = useState("");
  const [workTo, setWorkTo] = useState("");
  const [terminatedProjects, setTerminatedProjects] = useState<Project[]>([]);
  const [terminatedLoading, setTerminatedLoading] = useState(false);

  // Tous les projets actifs (non-Terminé, non-Annulé) pour les stats globales
  // (ex. "Projets en cours" = 209 projets, pas seulement les 80 de l'onglet CMD).
  const [allActiveProjects, setAllActiveProjects] = useState<Project[]>([]);
  useEffect(() => {
    fetch("/api/projects/all-active")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setAllActiveProjects(data); })
      .catch(() => {});
  }, []);

  // Charge les projets terminés dès que le filtre sort de "semaine en cours"
  // (semaine courante = seulement des projets actifs suffisent).
  useEffect(() => {
    if (terminatedProjects.length > 0 || terminatedLoading) return;
    setTerminatedLoading(true);
    Promise.all([
      fetch("/api/projects/cmd-termine").then(r => r.json()).catch(() => []),
      fetch("/api/projects/mesures-termine").then(r => r.json()).catch(() => []),
      fetch("/api/projects/services-termine").then(r => r.json()).catch(() => []),
      fetch("/api/projects/sav-termine").then(r => r.json()).catch(() => []),
    ]).then(([cmd, mes, svc, sav]) => {
      const all = [
        ...(Array.isArray(cmd) ? cmd : []),
        ...(Array.isArray(mes) ? mes : []),
        ...(Array.isArray(svc) ? svc : []),
        ...(Array.isArray(sav) ? sav : []),
      ];
      // Déduplique par id
      const seen = new Set<string>();
      setTerminatedProjects(all.filter(p => p?.id && !seen.has(p.id) && seen.add(p.id)));
    }).finally(() => setTerminatedLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetch("/api/user-activity")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          const map: Record<string, string> = {};
          data.forEach((a: any) => { map[a.name] = a.lastSeen; });
          setUserActivities(map);
        }
      })
      .catch(() => {});
  }, []);
  const todayStr = getTodayStr();
  const weekEndStr = getWeekEndStr();
  const thisWeekEndStr = getThisWeekEndStr();

  // Build per-collaborator data
  const collabData = COLLABORATEURS_LIST.map((name) => {
    const colors = getCollaboratorColor(name);
    const myProjects = getProjectsForCollaborator(projects, name);
    const getD = (p: Project) => p.dateMontage || p.dateMesures || "";
    const todayProjects = myProjects.filter((p) => projectSpansDate(p, todayStr));
    const thisWeekProjects = myProjects
      .filter((p) => {
        if (todayProjects.includes(p)) return false;
        return projectActiveDuringRange(p, todayStr, thisWeekEndStr);
      })
      .sort((a, b) => getD(a).localeCompare(getD(b)));
    const nextWeekProjects = myProjects
      .filter((p) => {
        if (todayProjects.includes(p) || thisWeekProjects.includes(p)) return false;
        return projectActiveDuringRange(p, thisWeekEndStr, weekEndStr);
      })
      .sort((a, b) => getD(a).localeCompare(getD(b)));
    const allUpcoming = [...todayProjects, ...thisWeekProjects, ...nextWeekProjects];
    const cabinesBySource = countCabinesBySource(allUpcoming, name);
    const totalCabines = Object.values(cabinesBySource).reduce((s, v) => s + v, 0);
    const cabinesSummary = formatCabinesSummary(cabinesBySource);
    return { name, colors, myProjects, todayProjects, thisWeekProjects, nextWeekProjects, totalCabines, cabinesSummary };
  });

  // Build per-binôme/team data.
  // On inclut ici :
  //   - les binômes/trios/quatuors écrits avec "&" (ex: "Claudio & Loïc")
  //   - les équipes nommées via un label contenant "team"
  //     (ex: "Team TM") même s'il n'y a pas de "&" — sinon ces
  //     projets ne remontaient jamais dans la section BINÔMES & TEAMS.
  const binomeMap: Record<string, Project[]> = {};
  projects.forEach((p) => {
    const collab = p.collaborateurs || "";
    const isAmpCollab = collab.includes("&");
    const isTeamLabel = collab.toLowerCase().includes("team");
    if (!isAmpCollab && !isTeamLabel) return;
    // Check if project is active within next 2 weeks
    if (!projectActiveDuringRange(p, todayStr, weekEndStr)) return;
    if (!binomeMap[collab]) binomeMap[collab] = [];
    binomeMap[collab].push(p);
  });
  const binomeData = Object.entries(binomeMap)
    .map(([teamName, teamProjects]) => {
      const names = teamName.split(" & ").map((n) => n.trim());
      const isBinome = names.length === 2;
      const isTeam = names.length >= 5 || teamName.toLowerCase().includes("team");
      const getD = (p: Project) => p.dateMontage || p.dateMesures || "";
      const todayP = teamProjects.filter((p) => projectSpansDate(p, todayStr));
      const thisWeekP = teamProjects.filter((p) => { if (todayP.includes(p)) return false; return projectActiveDuringRange(p, todayStr, thisWeekEndStr); })
        .sort((a, b) => getD(a).localeCompare(getD(b)));
      const nextWeekP = teamProjects.filter((p) => { if (todayP.includes(p) || thisWeekP.includes(p)) return false; return projectActiveDuringRange(p, thisWeekEndStr, weekEndStr); })
        .sort((a, b) => getD(a).localeCompare(getD(b)));
      const totalCabines = teamProjects.reduce((sum, p) => sum + (p.nbCabines || 0), 0);
      return { teamName, names, isBinome, isTeam, todayProjects: todayP, thisWeekProjects: thisWeekP, nextWeekProjects: nextWeekP, totalCabines };
    })
    .filter((b) => b.todayProjects.length > 0 || b.thisWeekProjects.length > 0 || b.nextWeekProjects.length > 0);

  // Summary stats — depuis que les projets Team apparaissent aussi dans
  // la section de chaque monteur individuel (pour qu'ils les voient tous),
  // on doit dédupliquer par project.id pour ne pas compter N fois les
  // cabines d'une Team dans les totaux globaux.
  const seenWeekIds = new Set<string>();
  const uniqueWeekProjects: Project[] = [];
  collabData.forEach((c) => {
    [...c.todayProjects, ...c.thisWeekProjects, ...c.nextWeekProjects].forEach((p) => {
      if (!seenWeekIds.has(p.id)) { seenWeekIds.add(p.id); uniqueWeekProjects.push(p); }
    });
  });
  const totalProjectsToday = new Set(
    collabData.flatMap((c) => c.todayProjects.map((p) => p.id))
  ).size;
  const totalCabinesWeek = uniqueWeekProjects.reduce((s, p) => s + (p.nbCabines || 0), 0);
  // Agrégation par source de projet (montage/mesures/services/sav)
  // depuis la liste dédupliquée — évite de compter une Team N fois.
  const allWeekCabinesBySource: Record<string, number> = {};
  uniqueWeekProjects.forEach((p) => {
    const src = getProjectSource(p);
    allWeekCabinesBySource[src] = (allWeekCabinesBySource[src] || 0) + (p.nbCabines || 0);
  });
  const weekSummary = formatCabinesSummary(allWeekCabinesBySource);
  const busyToday = collabData.filter((c) => c.todayProjects.length > 0).length;

  // Mesures aujourd'hui
  const mesuresTodayProjects = projects.filter((p) => (p as any)._source === "mesures" && (p.dateMesures || "").split("T")[0] === todayStr);
  const mesuresTodayCount = mesuresTodayProjects.length;
  const mesuresTodayCabines = mesuresTodayProjects.reduce((s, p) => s + (p.nbCabines || 0), 0);

  // Services du jour
  const servicesTodayProjects = projects.filter((p) => (p as any)._source === "services" && (p.dateMontage || "").split("T")[0] === todayStr);
  const servicesTodayCount = servicesTodayProjects.length;
  const servicesTodayCabines = servicesTodayProjects.reduce((s, p) => s + (p.nbCabines || 0), 0);

  // SAV aujourd'hui : etatSAV = "RDV fixé" ET dateRDVSAV = aujourd'hui
  const savTodayProjects = projects.filter(
    (p) => (p as any)._source === "sav" && p.etatSAV === "RDV fixé" && (p.dateRDVSAV || "").split("T")[0] === todayStr
  );
  const savTodayCount = savTodayProjects.length;

  // Emplacement cabines : projets avec le champ "Emplacement de cabine" renseigné
  const emplacementCabinesProjects = projects.filter((p) =>
    p.etatCMD === "Cabine à aller chercher" || p.etatCMD === "Récéptionné - RDV à fixer"
  );
  const emplacementCabinesCount = emplacementCabinesProjects.length;
  const emplacementDepotTMCabines = emplacementCabinesProjects
    .filter((p) => p.emplacementCabine === "Dépôt TM")
    .reduce((s, p) => s + (p.nbCabines || 0), 0);
  const emplacementAutresCabines = emplacementCabinesProjects
    .filter((p) => p.emplacementCabine !== "Dépôt TM")
    .reduce((s, p) => s + (p.nbCabines || 0), 0);

  // Rapports en attente : projets montage dont la date est passée ou aujourd'hui
  // et dont le rapport n'est pas clôturé
  const rapportsAttenteProjects = projects.filter((p) => {
    const src = (p as any)._source;
    if (src === "mesures" || src === "sav") return false;
    const dateStr = (p.dateMontage || "").split("T")[0];
    if (!dateStr || dateStr > todayStr) return false;
    const cloture = (p.rapportDeMontage || "").toLowerCase().includes("clôt") ||
                    (p.rapportDeMontage || "").toLowerCase().includes("clot");
    return !cloture;
  }).sort((a, b) => ((a.dateMontage || "").split("T")[0]).localeCompare((b.dateMontage || "").split("T")[0]));
  const rapportsAttenteCount = rapportsAttenteProjects.length;

  // SAV non traités : tous les SAV actifs (pas terminés/annulés)
  const savNonTraitesProjects = projects.filter((p) =>
    (p as any)._source === "sav" &&
    p.etatSAV !== "Terminé" &&
    p.etatSAV !== "Annulé"
  ).sort((a, b) => (a.projet || "").localeCompare(b.projet || ""));
  const savNonTraitesCount = savNonTraitesProjects.length;

  // Soucis en cours : projets dont l'État - CMD est "Soucis montage"
  const soucisEnCoursProjects = projects.filter((p) => p.etatCMD === "Soucis montage")
    .sort((a, b) => ((a.dateMontage || "").split("T")[0]).localeCompare((b.dateMontage || "").split("T")[0]));
  const soucisEnCoursCount = soucisEnCoursProjects.length;

  // À facturer : projets dont la propriété "Facturations" = "A facturer"
  // Les projets facturables ont souvent etatCMD = "Terminé" → absents de
  // `projects` (actifs uniquement) → on cherche aussi dans terminatedProjects.
  const aFacturerProjects = [...projects, ...terminatedProjects]
    .filter((p, i, arr) => arr.findIndex((x) => x.id === p.id) === i) // déduplique
    .filter((p) => p.facturations === "A facturer")
    .sort((a, b) => ((a.dateOffre || "") > (b.dateOffre || "") ? -1 : 1));
  const aFacturerCount = aFacturerProjects.length;

  // Dossiers en cours : TOUS les projets dont État-CMD n'est pas Annulé ou Terminé.
  // On utilise allActiveProjects (endpoint /api/projects/all-active) qui retourne
  // tous les statuts hors Terminé/Annulé — contrairement à `projects` qui ne
  // couvre que les statuts CMD spécifiques (≈80 projets sur 209).
  const dossiersEnCoursProjects = allActiveProjects
    .filter((p) => p.etatCMD !== "Annulé" && p.etatCMD !== "Terminé")
    .sort((a, b) => {
      const da = a.dateOffre || "";
      const db = b.dateOffre || "";
      if (!da && !db) return 0;
      if (!da) return 1;  // sans date → en bas
      if (!db) return -1;
      return db.localeCompare(da); // décroissant : plus récent en premier
    });
  const dossiersEnCoursCount = dossiersEnCoursProjects.length;
  const dossiersEnCoursCabines = dossiersEnCoursProjects.reduce((sum, p) => sum + (p.nbCabines || 0), 0);

  return (
    <div className="mb-6 space-y-4">
      {/* En-tête de bienvenue */}
      <div className="glass-card rounded-2xl p-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-lg font-bold text-blue-600 dark:text-blue-400">
            {getCollaboratorInitials(firstName)}
          </div>
          <div className="flex-1">
            <p className="font-semibold text-gray-900 dark:text-gray-100">Bonjour {firstName} 👋</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {totalProjectsToday > 0
                ? `${totalProjectsToday} montage${totalProjectsToday > 1 ? "s" : ""} prévu${totalProjectsToday > 1 ? "s" : ""} aujourd'hui · ${busyToday} monteur${busyToday > 1 ? "s" : ""} actif${busyToday > 1 ? "s" : ""}`
                : "Aucun montage prévu aujourd'hui"}
            </p>
          </div>
          <button onClick={() => setShowWeekProjects(!showWeekProjects)} className="text-right hover:opacity-70 transition-opacity">
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{totalCabinesWeek}</p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500">cab. cette sem. ▾</p>
            {weekSummary && <p className="text-[9px] text-gray-400 mt-0.5">{weekSummary}</p>}
          </button>
        </div>
        {showWeekProjects && (() => {
          const allWeekProjects = collabData
            .flatMap((c) => [...c.todayProjects, ...c.thisWeekProjects, ...c.nextWeekProjects])
            .filter((p, i, arr) => arr.findIndex((x) => x.id === p.id) === i)
            .sort((a, b) => (a.dateMontage || "").localeCompare(b.dateMontage || ""));
          return (
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 space-y-1.5">
              {(() => {
                let lastDay = "";
                return allWeekProjects.flatMap((p) => {
                  const dayKey = (p.dateMontage || p.dateMesures || "").split("T")[0];
                  const items: React.ReactNode[] = [];
                  if (dayKey !== lastDay) {
                    items.push(
                      <div key={`sep-${dayKey}-${p.id}`} className="flex items-center gap-2 pt-1 first:pt-0">
                        <div className="flex-1 h-px bg-gray-200/80 dark:bg-gray-700/60" />
                        <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium shrink-0 px-1">
                          {dayKey ? new Date(dayKey + "T12:00:00").toLocaleDateString("fr-CH", { weekday: "short", day: "numeric", month: "short" }) : ""}
                        </span>
                        <div className="flex-1 h-px bg-gray-200/80 dark:bg-gray-700/60" />
                      </div>
                    );
                    lastDay = dayKey;
                  }
                  const source = getProjectSource(p);
                  const isMesure = source === "mesures";
                  const collabField = isMesure ? (p.mesuresTraiteePar || p.collaborateurs || "") : (p.collaborateurs || "");
                  const names = collabField.split(" & ").map((n) => n.trim()).filter(Boolean);
                  const logo = getClientLogo(p.projet);
                  items.push(
                    <Link key={p.id} href={`/projet/${p.id}?mode=dashboard`}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/60 dark:hover:bg-white/5 transition-colors text-xs">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 flex-wrap">
                          {p.ofrTM && <span className="text-[9px] font-mono text-gray-400">{p.ofrTM}</span>}
                          <span className={`text-[8px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${isMesure ? "bg-cyan-100 text-cyan-700" : "bg-orange-100 text-orange-700"}`}>{isMesure ? "Mesures" : "Montages"}</span>
                        </div>
                        <p className="text-xs text-gray-900 dark:text-gray-100 line-clamp-2">{p.projet}</p>
                      </div>
                      {logo && <img src={logo} alt="" className="h-4 w-auto object-contain shrink-0 rounded mix-blend-multiply dark:mix-blend-normal dark:invert" />}
                      <div className="flex -space-x-1 shrink-0">
                        {names.slice(0, 3).map((n) => (
                          <span key={n} className="w-5 h-5 rounded-full text-[7px] font-bold flex items-center justify-center border border-white dark:border-gray-800"
                            style={{ backgroundColor: getCollaboratorColor(n).bg, color: getCollaboratorColor(n).text }}>
                            {getCollaboratorInitials(n)}
                          </span>
                        ))}
                      </div>
                      <Badge variant="outline" className="text-[10px] shrink-0">{p.nbCabines || 0} cab.</Badge>
                    </Link>
                  );
                  return items;
                });
              })()}
            </div>
          );
        })()}
      </div>

      {/* Summary cards — hauteur uniformisée via un placeholder invisible
          pour les cartes sans sous-texte "X cab." */}
      {(() => {
        // Classe appliquée aux boutons NON actifs quand un panel est ouvert
        const dim = showSummaryPanel !== null ? "opacity-40 scale-[0.97]" : "";
        // Classe du bouton actif : surbrillance forte
        const activeBtn = (panel: string, ring: string) =>
          showSummaryPanel === panel
            ? `ring-2 ring-offset-2 ${ring} shadow-xl scale-[1.04] z-10`
            : dim;
        return (
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-1.5 sm:gap-3">
        <button onClick={() => setShowSummaryPanel(showSummaryPanel === "mesures-today" ? null : "mesures-today")} className={`relative glass-card rounded-2xl p-2 sm:p-4 flex flex-col items-center hover:shadow-lg active:scale-95 transition-all ${activeBtn("mesures-today", "ring-cyan-400")}`}>
          <span className="absolute top-0 left-0 w-8 h-8 rounded-tl-2xl rounded-br-xl bg-cyan-100/80 dark:bg-cyan-900/30 flex items-center justify-center"><Ruler className="w-4 h-4 text-cyan-500 dark:text-cyan-400" /></span>
          <p className="text-lg sm:text-2xl font-bold text-cyan-600 dark:text-cyan-400">{mesuresTodayCount}</p>
          <p className="text-[8px] sm:text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 leading-tight text-center">Mesures aujourd'hui</p>
          <p className="text-[7px] sm:text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{mesuresTodayCabines} cab.</p>
        </button>
        <button onClick={() => setShowSummaryPanel(showSummaryPanel === "today" ? null : "today")} className={`relative glass-card rounded-2xl p-2 sm:p-4 flex flex-col items-center hover:shadow-lg active:scale-95 transition-all ${activeBtn("today", "ring-blue-400")}`}>
          <span className="absolute top-0 left-0 w-8 h-8 rounded-tl-2xl rounded-br-xl bg-blue-100/80 dark:bg-blue-900/30 flex items-center justify-center"><Wrench className="w-4 h-4 text-blue-500 dark:text-blue-400" /></span>
          <p className="text-lg sm:text-2xl font-bold text-blue-600 dark:text-blue-400">{totalProjectsToday}</p>
          <p className="text-[8px] sm:text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 leading-tight text-center">Montages aujourd'hui</p>
          <p className="text-[7px] sm:text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 invisible" aria-hidden="true">0 cab.</p>
        </button>
        <div className={`relative glass-card rounded-2xl p-2 sm:p-4 flex flex-col items-center transition-all ${showSummaryPanel !== null ? "opacity-40 scale-[0.97]" : ""}`}>
          <span className="absolute top-0 left-0 w-8 h-8 rounded-tl-2xl rounded-br-xl bg-violet-100/80 dark:bg-violet-900/30 flex items-center justify-center"><Settings className="w-4 h-4 text-violet-500 dark:text-violet-400" /></span>
          <p className="text-lg sm:text-2xl font-bold text-violet-600 dark:text-violet-400">{servicesTodayCount}</p>
          <p className="text-[8px] sm:text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 leading-tight text-center">Services aujourd'hui</p>
          <p className="text-[7px] sm:text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{servicesTodayCabines} cab.</p>
        </div>
        <button onClick={() => setShowSummaryPanel(showSummaryPanel === "sav-today" ? null : "sav-today")} className={`relative glass-card rounded-2xl p-2 sm:p-4 flex flex-col items-center hover:shadow-lg active:scale-95 transition-all ${activeBtn("sav-today", "ring-red-400")}`}>
          <span className="absolute top-0 left-0 w-8 h-8 rounded-tl-2xl rounded-br-xl bg-red-100/80 dark:bg-red-900/30 flex items-center justify-center"><AlertTriangle className="w-4 h-4 text-red-500 dark:text-red-400" /></span>
          <p className="text-lg sm:text-2xl font-bold text-red-600 dark:text-red-400">{savTodayCount}</p>
          <p className="text-[8px] sm:text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 leading-tight text-center">SAV aujourd'hui</p>
          <p className="text-[7px] sm:text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 invisible" aria-hidden="true">0 cab.</p>
        </button>
        <button onClick={() => setShowSummaryPanel(showSummaryPanel === "week" ? null : "week")} className={`relative glass-card rounded-2xl p-2 sm:p-4 flex flex-col items-center hover:shadow-lg active:scale-95 transition-all ${activeBtn("week", "ring-emerald-400")}`}>
          <span className="absolute top-0 left-0 w-8 h-8 rounded-tl-2xl rounded-br-xl bg-emerald-100/80 dark:bg-emerald-900/30 flex items-center justify-center"><Box className="w-4 h-4 text-emerald-500 dark:text-emerald-400" /></span>
          <p className="text-lg sm:text-2xl font-bold text-emerald-600 dark:text-emerald-400">{totalCabinesWeek}</p>
          <p className="text-[8px] sm:text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 leading-tight text-center">Cabines cette semaine</p>
          <p className="text-[7px] sm:text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 invisible" aria-hidden="true">0 cab.</p>
        </button>
        <button onClick={() => setShowSummaryPanel(showSummaryPanel === "active" ? null : "active")} className={`relative glass-card rounded-2xl p-2 sm:p-4 flex flex-col items-center hover:shadow-lg active:scale-95 transition-all ${activeBtn("active", "ring-amber-400")}`}>
          <span className="absolute top-0 left-0 w-8 h-8 rounded-tl-2xl rounded-br-xl bg-amber-100/80 dark:bg-amber-900/30 flex items-center justify-center"><Users className="w-4 h-4 text-amber-500 dark:text-amber-400" /></span>
          <p className="text-lg sm:text-2xl font-bold text-amber-600 dark:text-amber-400">{busyToday}</p>
          <p className="text-[8px] sm:text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 leading-tight text-center">Monteurs actifs</p>
          <p className="text-[7px] sm:text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 invisible" aria-hidden="true">0 cab.</p>
        </button>
        <button onClick={() => setShowSummaryPanel(showSummaryPanel === "emplacement-cabines" ? null : "emplacement-cabines")} className={`relative glass-card rounded-2xl p-2 sm:p-4 flex flex-col items-center hover:shadow-lg active:scale-95 transition-all ${activeBtn("emplacement-cabines", "ring-sky-400")}`}>
          <span className="absolute top-0 left-0 w-8 h-8 rounded-tl-2xl rounded-br-xl bg-sky-100/80 dark:bg-sky-900/30 flex items-center justify-center"><MapPin className="w-4 h-4 text-sky-500 dark:text-sky-400" /></span>
          <p className="text-lg sm:text-2xl font-bold text-sky-600 dark:text-sky-400">{emplacementCabinesCount}</p>
          <p className="text-[8px] sm:text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 leading-tight text-center">Emplacement cabines</p>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap justify-center">
            <p className="text-[7px] sm:text-[9px] text-sky-500 dark:text-sky-400 leading-tight">À chercher : <span className="font-semibold">{emplacementAutresCabines}</span></p>
            <span className="text-gray-300 dark:text-gray-600 text-[7px]">·</span>
            <p className="text-[7px] sm:text-[9px] text-amber-500 dark:text-amber-400 leading-tight">Dépôt TM : <span className="font-semibold">{emplacementDepotTMCabines}</span></p>
          </div>
        </button>
        <button onClick={() => setShowSummaryPanel(showSummaryPanel === "rapports-attente" ? null : "rapports-attente")} className={`relative glass-card rounded-2xl p-2 sm:p-4 flex flex-col items-center hover:shadow-lg active:scale-95 transition-all ${activeBtn("rapports-attente", "ring-orange-400")}`}>
          <span className="absolute top-0 left-0 w-8 h-8 rounded-tl-2xl rounded-br-xl bg-orange-100/80 dark:bg-orange-900/30 flex items-center justify-center"><Clock className="w-4 h-4 text-orange-500 dark:text-orange-400" /></span>
          <p className="text-lg sm:text-2xl font-bold text-orange-600 dark:text-orange-400">{rapportsAttenteCount}</p>
          <p className="text-[8px] sm:text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 leading-tight text-center">Rapports en attente</p>
          <p className="text-[7px] sm:text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 invisible" aria-hidden="true">0 cab.</p>
        </button>
        <button onClick={() => setShowSummaryPanel(showSummaryPanel === "sav-non-traites" ? null : "sav-non-traites")} className={`relative glass-card rounded-2xl p-2 sm:p-4 flex flex-col items-center hover:shadow-lg active:scale-95 transition-all ${activeBtn("sav-non-traites", "ring-rose-400")}`}>
          <span className="absolute top-0 left-0 w-8 h-8 rounded-tl-2xl rounded-br-xl bg-rose-100/80 dark:bg-rose-900/30 flex items-center justify-center"><ShieldAlert className="w-4 h-4 text-rose-500 dark:text-rose-400" /></span>
          <p className="text-lg sm:text-2xl font-bold text-rose-600 dark:text-rose-400">{savNonTraitesCount}</p>
          <p className="text-[8px] sm:text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 leading-tight text-center">SAV non traités</p>
          <p className="text-[7px] sm:text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 invisible" aria-hidden="true">0 cab.</p>
        </button>
        <button onClick={() => setShowSummaryPanel(showSummaryPanel === "soucis-en-cours" ? null : "soucis-en-cours")} className={`relative glass-card rounded-2xl p-2 sm:p-4 flex flex-col items-center hover:shadow-lg active:scale-95 transition-all ${activeBtn("soucis-en-cours", "ring-red-400")}`}>
          <span className="absolute top-0 left-0 w-8 h-8 rounded-tl-2xl rounded-br-xl bg-red-100/80 dark:bg-red-900/30 flex items-center justify-center"><AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" /></span>
          <p className="text-lg sm:text-2xl font-bold text-red-700 dark:text-red-400">{soucisEnCoursCount}</p>
          <p className="text-[8px] sm:text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 leading-tight text-center">Soucis en cours</p>
          <p className="text-[7px] sm:text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 invisible" aria-hidden="true">0 cab.</p>
        </button>
        <button onClick={() => setShowSummaryPanel(showSummaryPanel === "dossiers-en-cours" ? null : "dossiers-en-cours")} className={`relative glass-card rounded-2xl p-2 sm:p-4 flex flex-col items-center hover:shadow-lg active:scale-95 transition-all ${activeBtn("dossiers-en-cours", "ring-indigo-400")}`}>
          <span className="absolute top-0 left-0 w-8 h-8 rounded-tl-2xl rounded-br-xl bg-indigo-100/80 dark:bg-indigo-900/30 flex items-center justify-center"><FolderOpen className="w-4 h-4 text-indigo-500 dark:text-indigo-400" /></span>
          <p className="text-lg sm:text-2xl font-bold text-indigo-600 dark:text-indigo-400">{dossiersEnCoursCount || "…"}</p>
          <p className="text-[8px] sm:text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 leading-tight text-center">Projets en cours</p>
          <p className="text-[7px] sm:text-[10px] text-indigo-400 dark:text-indigo-500 mt-0.5">{dossiersEnCoursCabines ? `${dossiersEnCoursCabines} cab.` : ""}</p>
        </button>
        <button onClick={() => setShowSummaryPanel(showSummaryPanel === "a-facturer" ? null : "a-facturer")} className={`relative glass-card rounded-2xl p-2 sm:p-4 flex flex-col items-center hover:shadow-lg active:scale-95 transition-all ${activeBtn("a-facturer", "ring-yellow-400")}`}>
          <span className="absolute top-0 left-0 w-8 h-8 rounded-tl-2xl rounded-br-xl bg-yellow-100/80 dark:bg-yellow-900/30 flex items-center justify-center"><Receipt className="w-4 h-4 text-yellow-600 dark:text-yellow-400" /></span>
          <p className="text-lg sm:text-2xl font-bold text-yellow-600 dark:text-yellow-400">{aFacturerCount}</p>
          <p className="text-[8px] sm:text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 leading-tight text-center">À facturer</p>
          <p className="text-[7px] sm:text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 invisible" aria-hidden="true">0 cab.</p>
        </button>
      </div>
        );
      })()}

      {/* Raccourci Archives — navigation vers les projets clôturés */}
      <button
        onClick={() => onNavigate?.("archives")}
        className="glass-card rounded-2xl p-3 flex items-center justify-between gap-3 hover:shadow-lg active:scale-[0.99] transition-all group w-full text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-amber-600 dark:text-amber-400">
              <rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">Archives</p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500">
              Projets clôturés
              {terminatedLoading ? (
                <span className="ml-1 animate-pulse">…</span>
              ) : terminatedProjects.length > 0 ? (
                <span className="ml-1 font-semibold text-amber-600 dark:text-amber-400">{terminatedProjects.length}</span>
              ) : null}
            </p>
          </div>
        </div>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-amber-400 transition-colors shrink-0">
          <path d="m9 18 6-6-6-6"/>
        </svg>
      </button>

      <div className="grid grid-cols-2 gap-3">
        {(() => {
          const rdvAFixerStatuses = ["Livraison partielle", "Cabine à aller chercher", "Récéptionné - RDV à fixer", "Montage partiel"];
          const mesuresAFixerStatuses = ["Pas contacté", "Contact sans réponse"];
          const savAFixerStatuses = ["A contacter", "Contact sans réponse", "Attente news", "En cours de traitement"];
          const rdvAFixerProjects = projects.filter((p) =>
            rdvAFixerStatuses.includes(p.etatCMD) ||
            (p.etatCMD === "En attente de mesures" && mesuresAFixerStatuses.includes(p.etatMesures)) ||
            ((p as any)._source === "sav" && savAFixerStatuses.includes(p.etatSAV))
          );
          const montagesRdvCab = rdvAFixerProjects.filter((p) => { const src = (p as any)._source; return src === "cmd" || src === "montage" || !src; }).reduce((s, p) => s + (p.nbCabines || 0), 0);
          const mesuresRdvCab = rdvAFixerProjects.filter((p) => (p as any)._source === "mesures").reduce((s, p) => s + (p.nbCabines || 0), 0);
          const servicesRdvCab = rdvAFixerProjects.filter((p) => (p as any)._source === "services").reduce((s, p) => s + (p.nbCabines || 0), 0);
          const savRdvCab = rdvAFixerProjects.filter((p) => (p as any)._source === "sav").reduce((s, p) => s + (p.nbCabines || 0), 0);
          return (
            <button onClick={() => setShowSummaryPanel(showSummaryPanel === "rdv-a-fixer" ? null : "rdv-a-fixer")} className="glass-card rounded-2xl p-4 text-center hover:shadow-lg active:scale-95 transition-all">
              <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{rdvAFixerProjects.length}</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">RDV à fixer</p>
              <div className="text-center mt-1.5 space-y-0.5">
                {montagesRdvCab > 0 && <p className="text-[9px] text-gray-400 dark:text-gray-500">Montages: {montagesRdvCab} cab.</p>}
                {mesuresRdvCab > 0 && <p className="text-[9px] text-gray-400 dark:text-gray-500">Mesures: {mesuresRdvCab} cab.</p>}
                {servicesRdvCab > 0 && <p className="text-[9px] text-gray-400 dark:text-gray-500">Services: {servicesRdvCab} cab.</p>}
                {savRdvCab > 0 && <p className="text-[9px] text-gray-400 dark:text-gray-500">SAV: {savRdvCab} cab.</p>}
              </div>
            </button>
          );
        })()}
        {(() => {
          const rdvFixeProjects = projects.filter((p) => p.etatCMD === "RDV - fixé" || p.etatMesures === "RDV - Fixé");
          const montagesFixeCab = rdvFixeProjects.filter((p) => { const src = (p as any)._source; return src === "cmd" || src === "montage" || !src; }).reduce((s, p) => s + (p.nbCabines || 0), 0);
          const mesuresFixeCab = rdvFixeProjects.filter((p) => (p as any)._source === "mesures").reduce((s, p) => s + (p.nbCabines || 0), 0);
          const servicesFixeCab = rdvFixeProjects.filter((p) => (p as any)._source === "services" || (p as any)._source === "sav").reduce((s, p) => s + (p.nbCabines || 0), 0);
          return (
            <button onClick={() => setShowSummaryPanel(showSummaryPanel === "rdv-fixe" ? null : "rdv-fixe")} className="glass-card rounded-2xl p-4 text-center hover:shadow-lg active:scale-95 transition-all">
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">{rdvFixeProjects.length}</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">RDV fixé</p>
              <div className="text-center mt-1.5 space-y-0.5">
                {montagesFixeCab > 0 && <p className="text-[9px] text-gray-400 dark:text-gray-500">Montages: {montagesFixeCab} cab.</p>}
                {mesuresFixeCab > 0 && <p className="text-[9px] text-gray-400 dark:text-gray-500">Mesures: {mesuresFixeCab} cab.</p>}
                {servicesFixeCab > 0 && <p className="text-[9px] text-gray-400 dark:text-gray-500">Services: {servicesFixeCab} cab.</p>}
              </div>
            </button>
          );
        })()}
      </div>

      {/* Summary panel */}
      {showSummaryPanel && (() => {
        let panelProjects: Project[] = [];
        let panelTitle = "";

        if (showSummaryPanel === "today") {
          panelTitle = "Montages aujourd'hui";
          panelProjects = collabData
            .flatMap((c) => c.todayProjects)
            .filter((p, i, arr) => arr.findIndex((x) => x.id === p.id) === i);
        } else if (showSummaryPanel === "week") {
          panelTitle = "Cabines cette semaine";
          panelProjects = collabData
            .flatMap((c) => [...c.todayProjects, ...c.thisWeekProjects, ...c.nextWeekProjects])
            .filter((p, i, arr) => arr.findIndex((x) => x.id === p.id) === i)
            .sort((a, b) => ((a.dateMontage || a.dateMesures || "").split("T")[0]).localeCompare((b.dateMontage || b.dateMesures || "").split("T")[0]));
        } else if (showSummaryPanel === "active") {
          return (
            <div className="space-y-3">
              {/* Per-collaborator planning */}
              {collabData.map((collab) => {
                if (collab.myProjects.length === 0) return null;
                const isExpanded = expandedCollabs[collab.name] ?? false;
                return (
                  <div key={collab.name} className="glass-card rounded-2xl overflow-hidden">
                    <button onClick={() => toggleCollab(collab.name)} className="w-full flex items-center gap-3 p-4 hover:bg-white/40 dark:hover:bg-white/5 transition-colors">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0" style={{ backgroundColor: collab.colors.bg, color: collab.colors.text }}>
                        {getCollaboratorInitials(collab.name)}
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <p className="font-semibold text-gray-900 dark:text-gray-100">{collab.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {collab.todayProjects.length > 0 ? `${collab.todayProjects.length} montage${collab.todayProjects.length > 1 ? "s" : ""} aujourd'hui` : "Aucun montage aujourd'hui"}
                          {collab.cabinesSummary ? ` · ${collab.cabinesSummary}` : ""}
                        </p>
                      </div>
                      {(() => {
                        const collabLower = collab.name.toLowerCase();
                        const lastSeen = Object.entries(userActivities).find(([name]) => {
                          const nameLower = name.toLowerCase();
                          const nameFirst = nameLower.split(" ")[0];
                          return nameLower.includes(collabLower) || collabLower.includes(nameFirst) || nameFirst === collabLower;
                        })?.[1];
                        if (!lastSeen) return <span className="text-[9px] text-gray-300 dark:text-gray-600 shrink-0 text-right">Jamais<br/>connecté</span>;
                        const d = new Date(lastSeen);
                        const diff = Date.now() - d.getTime();
                        const isRecent = diff < 3600000;
                        const isToday = d.toDateString() === new Date().toDateString();
                        const palette = isRecent ? "bg-emerald-100/70 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" : isToday ? "bg-blue-100/70 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" : "bg-gray-100 text-gray-500 dark:bg-slate-700/40 dark:text-slate-400";
                        return <div className={`text-[9px] shrink-0 text-right px-1.5 py-1 rounded-lg mr-2 ${palette}`}><p className="font-medium">{d.toLocaleDateString("fr-CH", { day: "2-digit", month: "short" })}</p><p>{d.toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" })}</p></div>;
                      })()}
                      {collab.todayProjects.length > 0 && <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse shrink-0" />}
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
                    </button>
                    {isExpanded && (
                      <div className="px-4 pb-4 space-y-3">
                        {collab.todayProjects.length > 0 && (
                          <div>
                            <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1"><Calendar className="w-3 h-3" />Aujourd'hui ({collab.todayProjects.length})</p>
                            <div className="space-y-1.5">{collab.todayProjects.map((p) => <ProjectRow key={p.id} project={p} colors={collab.colors} />)}</div>
                            <div className="mt-2"><DailyRouteButton projects={collab.todayProjects} /></div>
                          </div>
                        )}
                        {collab.thisWeekProjects.length > 0 && (
                          <div>
                            <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1"><Clock className="w-3 h-3" />Cette semaine ({collab.thisWeekProjects.length})</p>
                            <div className="space-y-1.5">{collab.thisWeekProjects.map((p) => <WeekProjectRow key={p.id} project={p} />)}</div>
                          </div>
                        )}
                        {collab.nextWeekProjects.length > 0 && (
                          <div>
                            <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1"><Calendar className="w-3 h-3" />Semaine prochaine ({collab.nextWeekProjects.length})</p>
                            <div className="space-y-1.5">{collab.nextWeekProjects.map((p) => <WeekProjectRow key={p.id} project={p} />)}</div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {/* Binômes & Teams */}
              {binomeData.length > 0 && (
                <>
                  <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mt-2"><Users className="w-3.5 h-3.5" />Binômes & Teams</p>
                  {binomeData.map((team) => {
                    const isExpanded = expandedCollabs[`team-${team.teamName}`] ?? false;
                    return (
                      <div key={team.teamName} className="glass-card rounded-2xl overflow-hidden">
                        <button onClick={() => toggleCollab(`team-${team.teamName}`)} className="w-full flex items-center gap-3 p-4 hover:bg-white/40 dark:hover:bg-white/5 transition-colors">
                          <div className="flex -space-x-2 shrink-0">
                            {team.names.map((n) => (
                              <div key={n} className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold border-2 border-white dark:border-gray-800" style={{ backgroundColor: getCollaboratorColor(n).bg, color: getCollaboratorColor(n).text }}>{getCollaboratorInitials(n)}</div>
                            ))}
                          </div>
                          <div className="flex-1 min-w-0 text-left">
                            <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{team.names.join(" & ")}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{team.todayProjects.length > 0 ? `${team.todayProjects.length} montage${team.todayProjects.length > 1 ? "s" : ""} aujourd'hui` : "Pas de montage aujourd'hui"}{" · "}{team.totalCabines} cab.</p>
                          </div>
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${team.isTeam ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>{team.isTeam ? "Team" : team.names.length === 2 ? "Binôme" : team.names.length === 3 ? "Trio" : "Équipe"}</span>
                          {team.todayProjects.length > 0 && <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse shrink-0" />}
                          {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
                        </button>
                        {isExpanded && (
                          <div className="px-4 pb-4 space-y-3">
                            {team.todayProjects.length > 0 && <div><p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1"><Calendar className="w-3 h-3" />Aujourd'hui ({team.todayProjects.length})</p><div className="space-y-1.5">{team.todayProjects.map((p) => <ProjectRow key={p.id} project={p} colors={getCollaboratorColor(team.names[0])} />)}</div></div>}
                            {team.thisWeekProjects.length > 0 && <div><p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1"><Clock className="w-3 h-3" />Cette semaine ({team.thisWeekProjects.length})</p><div className="space-y-1.5">{team.thisWeekProjects.map((p) => <WeekProjectRow key={p.id} project={p} />)}</div></div>}
                            {team.nextWeekProjects.length > 0 && <div><p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1"><Calendar className="w-3 h-3" />Semaine prochaine ({team.nextWeekProjects.length})</p><div className="space-y-1.5">{team.nextWeekProjects.map((p) => <WeekProjectRow key={p.id} project={p} />)}</div></div>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              )}

              {/* Heures de travail */}
              {(() => {
                const allProjects = [...projects, ...terminatedProjects];
                const { fromStr, toStr, label } = getDateRangeForFilter(workFilter, workFrom, workTo, workMonth, workYear);
                const soloData = COLLABORATEURS_LIST.map((name) => ({
                  name, colors: getCollaboratorColor(name),
                  minutes: getIndividualHoursForCollab(allProjects, name, fromStr, toStr),
                })).filter((c) => c.minutes > 0);
                const groupMap = new Map<string, number>();
                for (const p of allProjects) {
                  const collab = (p.collaborateurs || "").trim();
                  if (!collab || (!collab.includes("&") && !collab.toLowerCase().includes("team"))) continue;
                  const ha = p.heureArrivee || ""; const hd = p.heureDepart || "";
                  if (!ha && !hd) continue;
                  let mins = 0;
                  if (ha.includes("|") || hd.includes("|")) {
                    const arrParts = ha.split("|").map((s: string) => s.trim()).filter(Boolean);
                    const depParts = hd.split("|").map((s: string) => s.trim()).filter(Boolean);
                    for (let i = 0; i < Math.max(arrParts.length, depParts.length); i++) {
                      const aPart = arrParts[i] || ""; const dPart = depParts[i] || "";
                      if (isNamedEntry(aPart) || isNamedEntry(dPart)) continue;
                      const aTime = extractHHMM(aPart) || aPart.split(/\s+/).at(-1) || "";
                      const dTime = extractHHMM(dPart) || dPart.split(/\s+/).at(-1) || "";
                      const entryDate = p.dateMontage?.split("T")[0] || "";
                      if (fromStr && entryDate < fromStr) continue;
                      if (toStr && entryDate > toStr) continue;
                      const a = parseTimeToMinutes(aTime); const d = parseTimeToMinutes(dTime);
                      if (a >= 0 && d >= 0 && d > a) mins += d - a;
                    }
                  } else {
                    const dateStr = p.dateMontage?.split("T")[0] || "";
                    if (fromStr && dateStr < fromStr) continue;
                    if (toStr && dateStr > toStr) continue;
                    const a = parseTimeToMinutes(extractHHMM(ha) || ha);
                    const d = parseTimeToMinutes(extractHHMM(hd) || hd);
                    if (a >= 0 && d >= 0 && d > a) mins += d - a;
                  }
                  if (mins > 0) groupMap.set(collab, (groupMap.get(collab) || 0) + mins);
                }
                const groupData = Array.from(groupMap.entries()).sort((a, b) => b[1] - a[1]);
                const hasData = soloData.length > 0 || groupData.length > 0;
                const currentYear = new Date().getFullYear();
                const years = Array.from({ length: 4 }, (_, i) => currentYear - i);
                return (
                  <div className="glass-card rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1"><Clock className="w-3 h-3" />Heures de travail</p>
                      {terminatedLoading && <span className="text-[10px] text-gray-400 animate-pulse">Chargement...</span>}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(["semaine", "mois", "annee", "custom"] as const).map((f) => (
                        <button key={f} onClick={() => setWorkFilter(f)} className={`text-[10px] font-medium px-2.5 py-1 rounded-full border transition-colors ${workFilter === f ? "bg-blue-600 text-white border-blue-600" : "border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-blue-300"}`}>
                          {f === "semaine" ? "Semaine" : f === "mois" ? "Mois" : f === "annee" ? "Année" : "Plage"}
                        </button>
                      ))}
                    </div>
                    {workFilter === "mois" && <input type="month" value={workMonth} onChange={(e) => setWorkMonth(e.target.value)} className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 px-2.5 py-1.5" />}
                    {workFilter === "annee" && <div className="flex flex-wrap gap-1.5">{years.map((y) => <button key={y} onClick={() => setWorkYear(String(y))} className={`text-xs px-3 py-1 rounded-full border transition-colors ${workYear === String(y) ? "bg-blue-600 text-white border-blue-600" : "border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-blue-300"}`}>{y}</button>)}</div>}
                    {workFilter === "custom" && <div className="grid grid-cols-2 gap-2"><div><p className="text-[10px] text-gray-400 mb-0.5">Du</p><input type="date" value={workFrom} onChange={(e) => setWorkFrom(e.target.value)} className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 px-2 py-1.5" /></div><div><p className="text-[10px] text-gray-400 mb-0.5">Au</p><input type="date" value={workTo} onChange={(e) => setWorkTo(e.target.value)} className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 px-2 py-1.5" /></div></div>}
                    <p className="text-[10px] text-gray-400 -mb-1">{label}</p>
                    {!hasData ? <p className="text-xs text-gray-400 text-center py-2">Aucune heure enregistrée sur cette période</p> : (
                      <>
                        {soloData.length > 0 && (<><p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Individuel</p>{soloData.map((c) => <div key={c.name} className="flex items-center justify-between"><div className="flex items-center gap-2"><div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0" style={{ backgroundColor: c.colors.bg, color: c.colors.text }}>{getCollaboratorInitials(c.name)}</div><span className="text-sm text-gray-700 dark:text-gray-300">{c.name}</span></div><span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{fmtMin(c.minutes)}</span></div>)}</>)}
                        {groupData.length > 0 && (<><p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mt-1">Binômes & Équipes</p>{groupData.map(([name, mins]) => { const names = name.split("&").map((n: string) => n.trim()); return <div key={name} className="flex items-center justify-between"><div className="flex items-center gap-2"><div className="flex -space-x-1.5">{names.slice(0, 4).map((n: string) => { const c = getCollaboratorColor(n); return <div key={n} className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 border border-white dark:border-slate-800" style={{ backgroundColor: c.dot, color: "#fff" }}>{getCollaboratorInitials(n)}</div>; })}</div><span className="text-sm text-gray-700 dark:text-gray-300">{name}</span></div><span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{fmtMin(mins)}</span></div>; })}</>)}
                      </>
                    )}
                  </div>
                );
              })()}

              {/* Stats monteur */}
              <div className="glass-card rounded-2xl p-4 space-y-3">
                <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1">
                  <BarChart3 className="w-3 h-3" />Stats monteur
                </p>
                <select
                  value={selectedMonteurStats}
                  onChange={(e) => setSelectedMonteurStats(e.target.value)}
                  className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 px-3 py-1.5"
                >
                  <option value="">-- Choisir un monteur --</option>
                  {COLLABORATEURS_LIST.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
                {selectedMonteurStats && (
                  <PersonalStats
                    userName={selectedMonteurStats}
                    projects={[...projects.filter((p: any) => p._source === "montage" || !p._source), ...terminatedProjects]}
                  />
                )}
              </div>
            </div>
          );
        } else if (showSummaryPanel === "mesures-today") {
          panelTitle = "Mesures aujourd'hui";
          panelProjects = mesuresTodayProjects
            .sort((a, b) => ((a.dateMesures || "").split("T")[0]).localeCompare((b.dateMesures || "").split("T")[0]));
        } else if (showSummaryPanel === "sav-today") {
          panelTitle = "SAV aujourd'hui";
          panelProjects = savTodayProjects
            .sort((a, b) => (a.projet || "").localeCompare(b.projet || ""));
        } else if (showSummaryPanel === "emplacement-cabines") {
          panelTitle = "Emplacement cabines";
          panelProjects = emplacementCabinesProjects.sort((a, b) => {
            const ea = a.emplacementCabine || "";
            const eb = b.emplacementCabine || "";
            // "Dépôt TM" toujours en dernier
            if (ea === "Dépôt TM" && eb !== "Dépôt TM") return 1;
            if (ea !== "Dépôt TM" && eb === "Dépôt TM") return -1;
            return ea.localeCompare(eb);
          });
        } else if (showSummaryPanel === "rapports-attente") {
          panelTitle = "Rapports en attente";
          panelProjects = rapportsAttenteProjects;
        } else if (showSummaryPanel === "sav-non-traites") {
          panelTitle = "SAV non traités";
          panelProjects = savNonTraitesProjects;
        } else if (showSummaryPanel === "soucis-en-cours") {
          panelTitle = "Soucis en cours";
          panelProjects = soucisEnCoursProjects;
        } else if (showSummaryPanel === "dossiers-en-cours") {
          panelTitle = "Projets en cours";
          panelProjects = dossiersEnCoursProjects;
        } else if (showSummaryPanel === "a-facturer") {
          panelTitle = "À facturer";
          panelProjects = aFacturerProjects;
        } else if (showSummaryPanel === "rdv-a-fixer") {
          // Split into 3 categories
          const montageStatuses = ["Livraison partielle", "Cabine à aller chercher", "Récéptionné - RDV à fixer", "Montage partiel"];
          const mesuresStatuses = ["Pas contacté", "Contact sans réponse"];

          const montageProjects = projects.filter((p) => montageStatuses.includes(p.etatCMD))
            .sort((a, b) => ((a.dateMesures || a.dateMontage || "z").split("T")[0]).localeCompare((b.dateMesures || b.dateMontage || "z").split("T")[0]));

          const mesuresProjects = projects.filter((p) => p.etatCMD === "En attente de mesures" && mesuresStatuses.includes(p.etatMesures))
            .sort((a, b) => ((a.dateMesuresRecue || a.dateMesures || "z").split("T")[0]).localeCompare((b.dateMesuresRecue || b.dateMesures || "z").split("T")[0]));

          // "Services à planifier" = uniquement les projets dont au moins un typeService
          // est "Services" ou commence par "Service" (ex. "Services + Démontage").
          const servicesProjects = projects.filter((p) =>
            montageStatuses.includes(p.etatCMD) &&
            p.typeServices &&
            p.typeServices.some((t) => t.toLowerCase().startsWith("service"))
          ).sort((a, b) => ((a.dateDemandeProjet || a.dateMontage || "z").split("T")[0]).localeCompare((b.dateDemandeProjet || b.dateMontage || "z").split("T")[0]));

          // Remove services from montage list to avoid duplicates
          const pureMontageProjets = montageProjects.filter((p) => !servicesProjects.some((s) => s.id === p.id));

          // SAV à contacter
          const savAFixerStatuses2 = ["A contacter", "Contact sans réponse", "Attente news", "En cours de traitement"];
          const savAFixerProjects = projects.filter(
            (p) => (p as any)._source === "sav" && savAFixerStatuses2.includes(p.etatSAV)
          ).sort((a, b) => (a.projet || "").localeCompare(b.projet || ""));

          const totalCount = pureMontageProjets.length + mesuresProjects.length + servicesProjects.length + savAFixerProjects.length;

          const renderCategory = (title: string, color: string, bgColor: string, categoryProjects: Project[], dateLabel?: string, useDateField?: "dateMesuresRecue" | "dateDemandeProjet") => {
            if (categoryProjects.length === 0) return null;
            return (
              <div key={title} className="mb-4">
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg mb-1.5 ${bgColor}`}>
                  <span className={`text-[12px] font-bold ${color}`}>{title}</span>
                  <span className="ml-auto text-[10px] font-semibold bg-white/60 dark:bg-white/10 px-2 py-0.5 rounded-full">
                    {categoryProjects.length} projet{categoryProjects.length > 1 ? "s" : ""}
                  </span>
                </div>
                {dateLabel && (
                  <div className="hidden sm:flex items-center gap-2 px-2 py-0.5 mb-1 text-[9px] font-semibold text-gray-400 uppercase tracking-wider">
                    <span className="w-16 shrink-0">{dateLabel}</span>
                  </div>
                )}
                {categoryProjects.map((p, idx) => {
                  const isMesure = p.etatMesures && mesuresStatuses.includes(p.etatMesures);
                  const collabField = isMesure ? (p.mesuresTraiteePar || p.collaborateurs || "") : (p.collaborateurs || "");
                  const names = collabField.split(" & ").map((n) => n.trim()).filter(Boolean);
                  const date = useDateField === "dateMesuresRecue"
                    ? (p.dateMesuresRecue || p.dateMesures || "").split("T")[0]
                    : useDateField === "dateDemandeProjet"
                    ? (p.dateDemandeProjet || p.dateMontage || "").split("T")[0]
                    : (p.dateMesures || p.dateMontage || "").split("T")[0];
                  const rowBg = idx % 2 === 0 ? "bg-blue-50/60 dark:bg-blue-950/20" : "bg-blue-100/60 dark:bg-blue-900/20";
                  const arrivage = getArrivageInfo(p);
                  return (
                    <Link key={p.id} href={`/projet/${p.id}?mode=dashboard`}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-blue-200/60 dark:hover:bg-blue-800/30 transition-colors text-xs ${rowBg}`}>
                      <span className="hidden sm:inline-block text-gray-400 font-mono w-16 shrink-0">
                        {date ? new Date(date + "T12:00:00").toLocaleDateString("fr-CH", { day: "2-digit", month: "short" }) : "---"}
                      </span>
                      <span className="w-20 shrink-0 flex flex-col justify-center gap-px">
                        {parseTMNumbers(p.ofrTM || "").length > 0
                          ? parseTMNumbers(p.ofrTM || "").map((tm, i) => (
                              <span key={i} className="font-mono text-xs leading-tight text-gray-600 dark:text-gray-300 truncate">{tm}</span>
                            ))
                          : <span className="font-mono text-xs text-gray-400">---</span>
                        }
                      </span>
                      <span className="w-20 shrink-0 font-mono text-gray-500 dark:text-gray-400 truncate hidden sm:block">{p.servMesuresFournisseurs || "---"}</span>
                      <span className="w-20 shrink-0 font-mono text-gray-500 dark:text-gray-400 truncate hidden sm:block">{p.servCmdFournisseurs || "---"}</span>
                      <span className="flex-1 min-w-0 text-xs text-gray-900 dark:text-gray-100 leading-tight line-clamp-2 sm:line-clamp-1">{p.projet}</span>

                      {/* COL arrivage — masquée sur iOS portrait, visible sm+ */}
                      <span className="hidden sm:flex w-28 shrink-0 justify-end">
                        {arrivage ? (
                          <span
                            title={`Arrivage ${arrivage.label} : ${new Date(arrivage.date! + "T12:00:00").toLocaleDateString("fr-CH", { day: "2-digit", month: "short" })}${arrivage.days !== null && arrivage.days >= 0 ? ` (J+${arrivage.days})` : ""}`}
                            className={`inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap ${arrivage.bgClass} ${arrivage.colorClass}`}
                          >
                            <span>{arrivage.label}</span>
                            <span>{new Date(arrivage.date! + "T12:00:00").toLocaleDateString("fr-CH", { day: "2-digit", month: "short" })}</span>
                            {arrivage.days !== null && arrivage.days >= 0 && <span className="opacity-75">J+{arrivage.days}</span>}
                          </span>
                        ) : null}
                      </span>

                      {/* COL type service — w-20, 1 badge max */}
                      <span className="w-20 shrink-0 flex justify-end">
                        {(() => {
                          const tsColors: Record<string, string> = {
                            "Montages": "bg-orange-100 text-orange-700", "Montage": "bg-orange-100 text-orange-700",
                            "Mesures": "bg-cyan-100 text-cyan-700", "Services": "bg-emerald-100 text-emerald-700",
                            "SAV": "bg-red-100 text-red-700", "Livraison": "bg-amber-100 text-amber-700",
                            "Dépannage": "bg-pink-100 text-pink-700", "Démontage": "bg-rose-100 text-rose-700",
                            "Remplacement": "bg-indigo-100 text-indigo-700",
                          };
                          const parts = (p.typeServices || []).flatMap((ts) =>
                            ts.includes("+") ? ts.split("+").map((s) => s.trim()) : [ts]
                          ).filter(Boolean);
                          if (parts.length === 0) return null;
                          return (
                            <span className={`text-[8px] font-semibold px-1.5 py-0.5 rounded-full truncate max-w-full ${tsColors[parts[0]] || "bg-gray-100 text-gray-600"}`}>
                              {parts[0]}
                            </span>
                          );
                        })()}
                      </span>

                      {/* COL logo — w-8, toujours présente */}
                      <span className="w-8 shrink-0 flex justify-center">
                        {(() => { const logo = getClientLogo(p.projet); return logo ? (
                          <img src={logo} alt="" className="w-7 h-5 object-contain rounded mix-blend-multiply dark:mix-blend-normal dark:invert" />
                        ) : null; })()}
                      </span>

                      {/* COL cabines — masquée sur iOS portrait, visible sm+ */}
                      <Badge variant="outline" className="hidden sm:flex text-[10px] shrink-0 w-12 justify-center">{p.nbCabines || 0} cab.</Badge>
                    </Link>
                  );
                })}
              </div>
            );
          };

          return (
            <div className="glass-card rounded-2xl p-4">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">RDV à fixer ({totalCount})</p>
              {renderCategory("Mesures à relever", "text-cyan-700 dark:text-cyan-300", "bg-cyan-50 dark:bg-cyan-900/20", mesuresProjects, "Reçue le", "dateMesuresRecue")}
              {renderCategory("Montages à planifier", "text-orange-700 dark:text-orange-300", "bg-orange-50 dark:bg-orange-900/20", pureMontageProjets)}
              {renderCategory("Services à planifier", "text-emerald-700 dark:text-emerald-300", "bg-emerald-50 dark:bg-emerald-900/20", servicesProjects, "Reçue le", "dateDemandeProjet")}
              {renderCategory("SAV à contacter", "text-red-700 dark:text-red-300", "bg-red-50 dark:bg-red-900/20", savAFixerProjects)}
              {totalCount === 0 && <p className="text-sm text-gray-400 py-2">Aucun projet</p>}
            </div>
          );
        } else if (showSummaryPanel === "rdv-fixe") {
          panelTitle = "RDV fixé";
          panelProjects = projects
            .filter((p) => p.etatCMD === "RDV - fixé" || p.etatMesures === "RDV - Fixé")
            .sort((a, b) => ((a.dateMontage || a.dateMesures || "z").split("T")[0]).localeCompare((b.dateMontage || b.dateMesures || "z").split("T")[0]));
        }

        const isRdvAFixer = false; // rdv-a-fixer has its own return above
        const isDossiersEnCours = showSummaryPanel === "dossiers-en-cours";
        const isAFacturer = showSummaryPanel === "a-facturer";
        const isEmplacementCabines = showSummaryPanel === "emplacement-cabines";
        const dateLabel = "Date";

        return (
          <div className="glass-card rounded-2xl p-4 space-y-1.5">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{panelTitle} ({panelProjects.length})</p>
            {panelProjects.length > 0 && (
              <div className="flex items-center gap-2 px-2 py-1 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700 mb-1">
                {isRdvAFixer && <span className="w-16 shrink-0">{dateLabel}</span>}
                <span className="w-20 shrink-0">N° OFR TM</span>
                {isEmplacementCabines && <span className="w-28 shrink-0">Emplacement</span>}
                {isDossiersEnCours && <span className="w-24 shrink-0 hidden sm:block">Date offre</span>}
                {!isEmplacementCabines && <span className="w-20 shrink-0 hidden sm:block">N° Mes. Fourn.</span>}
                {!isEmplacementCabines && <span className="w-20 shrink-0 hidden sm:block">N° CMD Fourn.</span>}
                <span className="flex-1">Projet</span>
                <span className="w-14 text-right">Cabines</span>
              </div>
            )}
            {panelProjects.length === 0 && <p className="text-sm text-gray-400 py-2">Aucun projet</p>}

            {/* Projets en cours / À facturer : liste triée par Date Offre décroissante avec séparateurs par mois */}
            {(isDossiersEnCours || isAFacturer) && (() => {
              let lastMonthKey = "";
              let colorIdx = 0;
              return panelProjects.flatMap((p) => {
                const monthKey = p.dateOffre ? p.dateOffre.slice(0, 7) : ""; // "YYYY-MM"
                const items: React.ReactNode[] = [];
                if (monthKey !== lastMonthKey) {
                  const monthLabel = monthKey
                    ? new Date(monthKey + "-15T12:00:00").toLocaleDateString("fr-CH", { month: "long", year: "numeric" })
                    : "Sans date d'offre";
                  items.push(
                    <div key={`month-${monthKey || "none"}`} className="flex items-center gap-2 pt-2 pb-0.5">
                      <div className="flex-1 h-px bg-indigo-200/70 dark:bg-indigo-700/40" />
                      <span className="text-[10px] font-semibold text-indigo-500 dark:text-indigo-400 shrink-0 px-1.5 capitalize">{monthLabel}</span>
                      <div className="flex-1 h-px bg-indigo-200/70 dark:bg-indigo-700/40" />
                    </div>
                  );
                  lastMonthKey = monthKey;
                  colorIdx = 0;
                }
                const collabField = p.collaborateurs || "";
                const names = collabField.split(" & ").map((n) => n.trim()).filter(Boolean);
                const rowBg = colorIdx % 2 === 0 ? "bg-indigo-50/50 dark:bg-indigo-950/20" : "bg-indigo-100/40 dark:bg-indigo-900/15";
                colorIdx++;
                const dateOffreStr = p.dateOffre ? new Date(p.dateOffre + "T12:00:00").toLocaleDateString("fr-CH", { day: "2-digit", month: "short", year: "2-digit" }) : "---";
                items.push(
                  <Link key={p.id} href={`/projet/${p.id}?mode=dashboard`}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-indigo-200/60 dark:hover:bg-indigo-800/30 transition-colors text-xs ${rowBg}`}>
                    <span className="w-20 shrink-0 flex flex-col justify-center gap-px">
                      {parseTMNumbers(p.ofrTM || "").length > 0
                        ? parseTMNumbers(p.ofrTM || "").map((tm, i) => (
                            <span key={i} className="font-mono text-xs leading-tight text-gray-600 dark:text-gray-300 truncate">{tm}</span>
                          ))
                        : <span className="font-mono text-xs text-gray-400">---</span>
                      }
                    </span>
                    <span className="w-24 shrink-0 font-mono text-indigo-600 dark:text-indigo-400 hidden sm:block">{dateOffreStr}</span>
                    <span className="w-20 shrink-0 font-mono text-gray-500 dark:text-gray-400 truncate hidden sm:block">{p.servMesuresFournisseurs || "---"}</span>
                    <span className="w-20 shrink-0 font-mono text-gray-500 dark:text-gray-400 truncate hidden sm:block">{p.servCmdFournisseurs || "---"}</span>
                    <span className="flex-1 min-w-0 text-xs text-gray-900 dark:text-gray-100 line-clamp-2 sm:line-clamp-1">{p.projet}</span>
                    {(() => { const logo = getClientLogo(p.projet); return logo ? (
                      <img src={logo} alt="" className="w-7 h-5 object-contain shrink-0 rounded mix-blend-multiply dark:mix-blend-normal dark:invert" />
                    ) : null; })()}
                    <div className="flex -space-x-1 shrink-0">
                      {names.slice(0, 3).map((n) => (
                        <span key={n} className="w-5 h-5 rounded-full text-[7px] font-bold flex items-center justify-center border border-white dark:border-gray-800"
                          style={{ backgroundColor: getCollaboratorColor(n).bg, color: getCollaboratorColor(n).text }}>
                          {getCollaboratorInitials(n)}
                        </span>
                      ))}
                    </div>
                    <Badge variant="outline" className="text-[10px] shrink-0">{p.nbCabines || 0} cab.</Badge>
                  </Link>
                );
                return items;
              });
            })()}

            {/* RDV à fixer : liste simple avec colonne date */}
            {isRdvAFixer && panelProjects.map((p, idx) => {
              const isMesure = p.etatMesures === "RDV - Fixé";
              const collabField = isMesure ? (p.mesuresTraiteePar || p.collaborateurs || "") : (p.collaborateurs || "");
              const names = collabField.split(" & ").map((n) => n.trim()).filter(Boolean);
              const date = (p.dateMesures || "").split("T")[0];
              const rowBg = idx % 2 === 0
                ? "bg-blue-50/60 dark:bg-blue-950/20"
                : "bg-blue-100/60 dark:bg-blue-900/20";
              return (
                <Link key={p.id} href={`/projet/${p.id}?mode=dashboard`}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-blue-200/60 dark:hover:bg-blue-800/30 transition-colors text-xs ${rowBg}`}>
                  <span className="text-gray-400 font-mono w-16 shrink-0">
                    {date ? new Date(date + "T12:00:00").toLocaleDateString("fr-CH", { day: "2-digit", month: "short" }) : "---"}
                  </span>
                  <span className="w-20 shrink-0 font-mono text-gray-600 dark:text-gray-300 truncate">{p.ofrTM || "---"}</span>
                  <span className="w-20 shrink-0 font-mono text-gray-500 dark:text-gray-400 truncate hidden sm:block">{p.servMesuresFournisseurs || "---"}</span>
                  <span className="w-20 shrink-0 font-mono text-gray-500 dark:text-gray-400 truncate hidden sm:block">{p.servCmdFournisseurs || "---"}</span>
                  <span className="flex-1 min-w-0 text-xs text-gray-900 dark:text-gray-100 line-clamp-2">{p.projet}</span>
                  {p.typeServices && p.typeServices.length > 0 && p.typeServices.flatMap((ts) => {
                    // Split "Démontage + Montage" into separate badges
                    const parts = ts.includes("+") ? ts.split("+").map((s) => s.trim()) : [ts];
                    return parts.map((part) => {
                      const tsColors: Record<string, string> = {
                        "Montages": "bg-orange-100 text-orange-700",
                        "Montage": "bg-orange-100 text-orange-700",
                        "Mesures": "bg-cyan-100 text-cyan-700",
                        "Services": "bg-emerald-100 text-emerald-700",
                        "SAV": "bg-red-100 text-red-700",
                        "Livraison": "bg-amber-100 text-amber-700",
                        "Dépannage": "bg-pink-100 text-pink-700",
                        "Démontage": "bg-rose-100 text-rose-700",
                        "Remplacement": "bg-indigo-100 text-indigo-700",
                      };
                      return <span key={part} className={`shrink-0 text-[8px] font-semibold px-1.5 py-0.5 rounded-full ${tsColors[part] || "bg-gray-100 text-gray-600"}`}>{part}</span>;
                    });
                  })}
                  {(() => { const logo = getClientLogo(p.projet); return logo ? (
                    <img src={logo} alt="" className="w-7 h-5 object-contain shrink-0 rounded mix-blend-multiply dark:mix-blend-normal dark:invert" />
                  ) : null; })()}
                  {p.dateMontageEnd && (() => { const days = getWorkingDays(p.dateMontage || "", p.dateMontageEnd); return days.length > 1 ? (
                    <span className="shrink-0 text-[8px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">{days.length}j</span>
                  ) : null; })()}
                  <Badge variant="outline" className="text-[10px] shrink-0">{p.nbCabines || 0} cab.</Badge>
                </Link>
              );
            })}

            {/* Emplacement cabines : groupé par emplacement, Dépôt TM en dernier */}
            {isEmplacementCabines && (() => {
              // Palette de couleurs par emplacement
              const EMPL_COLORS: Record<string, { badge: string; header: string }> = {
                "Dépôt TM":                { badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",    header: "bg-amber-600 dark:bg-amber-700" },
                "Sur chantier":            { badge: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",    header: "bg-green-700 dark:bg-green-800" },
                "Getaz Yverdon":           { badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",        header: "bg-blue-700 dark:bg-blue-800" },
                "Getaz Bussigny":          { badge: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",header: "bg-indigo-700 dark:bg-indigo-800" },
                "Getaz Payerne":           { badge: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",            header: "bg-sky-700 dark:bg-sky-800" },
                "Dubat Villars-ste-Croix": { badge: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",header: "bg-purple-700 dark:bg-purple-800" },
                "Dubat Yverdon":           { badge: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",header: "bg-violet-700 dark:bg-violet-800" },
                "Chez sanitaire":          { badge: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",        header: "bg-teal-700 dark:bg-teal-800" },
                "Matway":                  { badge: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",header: "bg-orange-600 dark:bg-orange-700" },
                "Saneo Orbe":              { badge: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300",        header: "bg-cyan-700 dark:bg-cyan-800" },
                "Saneo Lonay":             { badge: "bg-lime-100 text-lime-700 dark:bg-lime-900/40 dark:text-lime-300",        header: "bg-lime-700 dark:bg-lime-800" },
                "Saneo - Givisiez":        { badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300", header: "bg-emerald-700 dark:bg-emerald-800" },
                "Sanitas Villars-sur-Glâne":{ badge: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",      header: "bg-rose-700 dark:bg-rose-800" },
                "Tema La Chaux-de-Fonds":  { badge: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-300", header: "bg-fuchsia-700 dark:bg-fuchsia-800" },
                "Sylroc Diffusion SA":     { badge: "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300",        header: "bg-pink-700 dark:bg-pink-800" },
              };
              const getEmplColor = (e: string) => EMPL_COLORS[e] ?? { badge: "bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-300", header: "bg-[#1e3a5f]" };

              const emplacementMap: Record<string, Project[]> = {};
              panelProjects.forEach((p) => {
                const key = p.emplacementCabine || "Sans emplacement";
                if (!emplacementMap[key]) emplacementMap[key] = [];
                emplacementMap[key].push(p);
              });
              const sortedKeys = Object.keys(emplacementMap).sort((a, b) => {
                if (a === "Dépôt TM") return 1;
                if (b === "Dépôt TM") return -1;
                return a.localeCompare(b);
              });
              return sortedKeys.map((empl) => {
                const groupProjects = emplacementMap[empl];
                const { header } = getEmplColor(empl);
                return (
                  <div key={empl} className="mb-1">
                    <div className={`flex items-center gap-2 px-3 py-2 mt-3 mb-1 rounded-lg shadow-sm ${header}`}>
                      <span className="text-[12px] font-bold text-white truncate">{empl}</span>
                      <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full font-semibold bg-white/20 text-white shrink-0">
                        {groupProjects.length} projet{groupProjects.length > 1 ? "s" : ""} · {groupProjects.reduce((s, p) => s + (p.nbCabines || 0), 0)} cab.
                      </span>
                    </div>
                    {groupProjects.map((p, idx) => {
                      const rowBg = idx % 2 === 0
                        ? "bg-white/60 dark:bg-slate-800/40"
                        : "bg-blue-50/40 dark:bg-blue-950/15";
                      const emplacements = p.emplacementCabine ? p.emplacementCabine.split(", ") : [];
                      return (
                        <Link key={p.id} href={`/projet/${p.id}?mode=dashboard`}
                          className={`flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-blue-200/60 dark:hover:bg-blue-800/30 transition-colors text-xs ${rowBg}`}>
                          <span className="w-20 shrink-0 flex flex-col justify-center gap-px">
                            {parseTMNumbers(p.ofrTM || "").length > 0
                              ? parseTMNumbers(p.ofrTM || "").map((tm, i) => (
                                  <span key={i} className="font-mono text-xs leading-tight text-gray-600 dark:text-gray-300 truncate">{tm}</span>
                                ))
                              : <span className="font-mono text-xs text-gray-400">---</span>
                            }
                          </span>
                          <span className="w-28 shrink-0 flex flex-col gap-0.5">
                            {emplacements.length > 0
                              ? emplacements.map((e) => (
                                  <span key={e} className={`text-[9px] font-semibold px-1.5 py-0.5 rounded truncate ${getEmplColor(e).badge}`}>{e}</span>
                                ))
                              : <span className="text-[10px] text-gray-400">—</span>
                            }
                          </span>
                          <span className="flex-1 min-w-0 text-xs text-gray-900 dark:text-gray-100 line-clamp-2">{p.projet}</span>
                          {(() => { const logo = getClientLogo(p.projet); return logo ? (
                            <img src={logo} alt="" className="w-7 h-5 object-contain shrink-0 rounded mix-blend-multiply dark:mix-blend-normal dark:invert" />
                          ) : null; })()}
                          <Badge variant="outline" className="text-[10px] shrink-0">{p.nbCabines || 0} cab.</Badge>
                        </Link>
                      );
                    })}
                  </div>
                );
              });
            })()}

            {/* Autres panels : groupé par jour avec séparateurs */}
            {!isRdvAFixer && !isDossiersEnCours && !isAFacturer && !isEmplacementCabines && (() => {
              const todayStr = new Date().toISOString().split("T")[0];
              const now = new Date();
              const weekEnd = new Date(now);
              weekEnd.setDate(weekEnd.getDate() + (7 - weekEnd.getDay()));
              const weekEndStr = weekEnd.toISOString().split("T")[0];

              // Build a map of dateKey → projects, expanding multi-day projects
              const dayMap: Record<string, Project[]> = {};
              panelProjects.forEach((p) => {
                const startDate = (p.dateMontage || p.dateMesures || "").split("T")[0];
                if (!startDate) {
                  if (!dayMap["no-date"]) dayMap["no-date"] = [];
                  dayMap["no-date"].push(p);
                  return;
                }
                const endDate = (p.dateMontageEnd || "").split("T")[0];
                if (endDate && endDate > startDate) {
                  // Multi-day: add to each working day
                  const days = getWorkingDays(startDate, endDate);
                  days.forEach((d) => {
                    if (!dayMap[d]) dayMap[d] = [];
                    dayMap[d].push(p);
                  });
                } else {
                  // Single day
                  if (!dayMap[startDate]) dayMap[startDate] = [];
                  dayMap[startDate].push(p);
                }
              });

              // Sort days and build grouped array
              const sortedDays = Object.keys(dayMap).sort((a, b) => a === "no-date" ? 1 : b === "no-date" ? -1 : a.localeCompare(b));
              const grouped = sortedDays.map((dateKey) => {
                const d = dateKey !== "no-date" ? new Date(dateKey + "T12:00:00") : null;
                const label = d ? d.toLocaleDateString("fr-CH", { weekday: "long", day: "numeric", month: "long" }) : "Date non définie";
                return {
                  dateKey,
                  dateLabel: label.charAt(0).toUpperCase() + label.slice(1),
                  isToday: dateKey === todayStr,
                  isThisWeek: dateKey >= todayStr && dateKey <= weekEndStr,
                  projects: dayMap[dateKey],
                };
              });

              return grouped.map((group) => (
                <div key={group.dateKey} className="mb-1">
                  <div className={`flex items-center gap-2 px-3 py-2 mt-3 mb-1 rounded-lg shadow-sm ${
                    group.isToday
                      ? "bg-green-600 dark:bg-green-700"
                      : group.isThisWeek
                        ? "bg-[#1e3a5f] dark:bg-[#1e3a5f]"
                        : "bg-slate-500 dark:bg-slate-600"
                  }`}>
                    <span className="text-[12px] font-bold text-white">
                      {group.isToday ? "📍 Aujourd'hui" : group.dateLabel}
                    </span>
                    <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full font-semibold bg-white/20 text-white">
                      {group.projects.length} projet{group.projects.length > 1 ? "s" : ""} · {group.projects.reduce((s, p) => s + (p.nbCabines || 0), 0)} cab.
                    </span>
                  </div>
                  {group.projects.map((p, idx) => {
                    const isMesure = p.etatMesures === "RDV - Fixé";
                    const collabField = isMesure ? (p.mesuresTraiteePar || p.collaborateurs || "") : (p.collaborateurs || "");
                    const names = collabField.split(" & ").map((n) => n.trim()).filter(Boolean);
                    const rowBg = idx % 2 === 0
                      ? "bg-white/60 dark:bg-slate-800/40"
                      : "bg-blue-50/40 dark:bg-blue-950/15";
                    return (
                      <Link key={p.id} href={`/projet/${p.id}?mode=dashboard`}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-blue-200/60 dark:hover:bg-blue-800/30 transition-colors text-xs ${rowBg}`}>
                        <span className="w-20 shrink-0 flex flex-col justify-center gap-px">
                        {parseTMNumbers(p.ofrTM || "").length > 0
                          ? parseTMNumbers(p.ofrTM || "").map((tm, i) => (
                              <span key={i} className="font-mono text-xs leading-tight text-gray-600 dark:text-gray-300 truncate">{tm}</span>
                            ))
                          : <span className="font-mono text-xs text-gray-400">---</span>
                        }
                      </span>
                        <span className="w-20 shrink-0 font-mono text-gray-500 dark:text-gray-400 truncate hidden sm:block">{p.servMesuresFournisseurs || "---"}</span>
                        <span className="w-20 shrink-0 font-mono text-gray-500 dark:text-gray-400 truncate hidden sm:block">{p.servCmdFournisseurs || "---"}</span>
                        <span className="flex-1 min-w-0 text-xs text-gray-900 dark:text-gray-100 line-clamp-2">{p.projet}</span>
                        {(showSummaryPanel === "rdv-fixe") && (
                          isMesure ? (
                            <span className="shrink-0 text-[8px] font-semibold px-1.5 py-0.5 rounded-full bg-cyan-100 text-cyan-700">Mesures</span>
                          ) : (
                            (p.typeServices && p.typeServices.length > 0) ? p.typeServices.flatMap((ts) => {
                              const parts = ts.includes("+") ? ts.split("+").map((s) => s.trim()) : [ts];
                              return parts.map((part) => {
                                const tsColors: Record<string, string> = {
                                  "Montages": "bg-orange-100 text-orange-700",
                                  "Montage": "bg-orange-100 text-orange-700",
                                  "Services": "bg-emerald-100 text-emerald-700",
                                  "SAV": "bg-red-100 text-red-700",
                                  "Livraison": "bg-amber-100 text-amber-700",
                                  "Dépannage": "bg-pink-100 text-pink-700",
                                  "Démontage": "bg-rose-100 text-rose-700",
                                  "Remplacement": "bg-indigo-100 text-indigo-700",
                                };
                                return <span key={part} className={`shrink-0 text-[8px] font-semibold px-1.5 py-0.5 rounded-full ${tsColors[part] || "bg-gray-100 text-gray-600"}`}>{part}</span>;
                              });
                            }) : (
                              <span className="shrink-0 text-[8px] font-semibold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700">Montages</span>
                            )
                          )
                        )}
                        {(() => { const logo = getClientLogo(p.projet); return logo ? (
                          <img src={logo} alt="" className="w-7 h-5 object-contain shrink-0 rounded mix-blend-multiply dark:mix-blend-normal dark:invert" />
                        ) : null; })()}
                        {p.dateMontageEnd && (() => { const days = getWorkingDays(p.dateMontage || "", p.dateMontageEnd); return days.length > 1 ? (
                          <span className="shrink-0 text-[8px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">{days.length}j</span>
                        ) : null; })()}
                        <Badge variant="outline" className="text-[10px] shrink-0">{p.nbCabines || 0} cab.</Badge>
                      </Link>
                    );
                  })}
                </div>
              ));
            })()}
          </div>
        );
      })()}

      {/* (Heures de travail et Stats monteur déplacés dans le panel Monteurs actifs) */}
      {false && (() => {
        const allProjects = [...projects, ...terminatedProjects];
        const { fromStr, toStr, label } = getDateRangeForFilter(workFilter, workFrom, workTo, workMonth, workYear);

        // --- Individuel : heures perso (solo + cabines nommées sur projets multi) ---
        const soloData = COLLABORATEURS_LIST.map((name) => ({
          name,
          colors: getCollaboratorColor(name),
          minutes: getIndividualHoursForCollab(allProjects, name, fromStr, toStr),
        })).filter((c) => c.minutes > 0);

        // --- Binômes / Équipes : uniquement les entrées partagées (non nommées) ---
        // Entrées nommées ("YYYY-MM-DD Prénom HH:MM") → déjà comptées en Individuel
        const groupMap = new Map<string, number>();
        for (const p of allProjects) {
          const collab = (p.collaborateurs || "").trim();
          if (!collab || (!collab.includes("&") && !collab.toLowerCase().includes("team"))) continue;
          const ha = p.heureArrivee || "";
          const hd = p.heureDepart || "";
          if (!ha && !hd) continue;
          let mins = 0;
          if (ha.includes("|") || hd.includes("|")) {
            const arrParts = ha.split("|").map(s => s.trim()).filter(Boolean);
            const depParts = hd.split("|").map(s => s.trim()).filter(Boolean);
            for (let i = 0; i < Math.max(arrParts.length, depParts.length); i++) {
              const aPart = arrParts[i] || "";
              const dPart = depParts[i] || "";
              // Entrée nommée → va en Individuel, pas ici
              if (isNamedEntry(aPart) || isNamedEntry(dPart)) continue;
              const aTime = extractHHMM(aPart) || aPart.split(/\s+/).at(-1) || "";
              const dTime = extractHHMM(dPart) || dPart.split(/\s+/).at(-1) || "";
              const entryDate = p.dateMontage?.split("T")[0] || "";
              if (fromStr && entryDate < fromStr) continue;
              if (toStr && entryDate > toStr) continue;
              const a = parseTimeToMinutes(aTime);
              const d = parseTimeToMinutes(dTime);
              if (a >= 0 && d >= 0 && d > a) mins += d - a;
            }
          } else {
            // Entrée simple (une seule heure pour tout le binôme) → Binômes
            const dateStr = p.dateMontage?.split("T")[0] || "";
            if (fromStr && dateStr < fromStr) continue;
            if (toStr && dateStr > toStr) continue;
            const a = parseTimeToMinutes(extractHHMM(ha) || ha);
            const d = parseTimeToMinutes(extractHHMM(hd) || hd);
            if (a >= 0 && d >= 0 && d > a) mins += d - a;
          }
          if (mins > 0) groupMap.set(collab, (groupMap.get(collab) || 0) + mins);
        }
        const groupData = Array.from(groupMap.entries()).sort((a, b) => b[1] - a[1]);

        const hasData = soloData.length > 0 || groupData.length > 0;

        const currentYear = new Date().getFullYear();
        const years = Array.from({ length: 4 }, (_, i) => currentYear - i);
        return (
          <div className="glass-card rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Heures de travail
              </p>
              {terminatedLoading && <span className="text-[10px] text-gray-400 animate-pulse">Chargement...</span>}
            </div>

            {/* Filtres */}
            <div className="flex flex-wrap gap-1.5">
              {(["semaine", "mois", "annee", "custom"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setWorkFilter(f)}
                  className={`text-[10px] font-medium px-2.5 py-1 rounded-full border transition-colors ${
                    workFilter === f
                      ? "bg-blue-600 text-white border-blue-600"
                      : "border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-blue-300"
                  }`}
                >
                  {f === "semaine" ? "Semaine" : f === "mois" ? "Mois" : f === "annee" ? "Année" : "Plage"}
                </button>
              ))}
            </div>

            {/* Contrôles selon le filtre */}
            {workFilter === "mois" && (
              <input
                type="month"
                value={workMonth}
                onChange={(e) => setWorkMonth(e.target.value)}
                className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 px-2.5 py-1.5"
              />
            )}
            {workFilter === "annee" && (
              <div className="flex flex-wrap gap-1.5">
                {years.map((y) => (
                  <button
                    key={y}
                    onClick={() => setWorkYear(String(y))}
                    className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                      workYear === String(y)
                        ? "bg-blue-600 text-white border-blue-600"
                        : "border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-blue-300"
                    }`}
                  >
                    {y}
                  </button>
                ))}
              </div>
            )}
            {workFilter === "custom" && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] text-gray-400 mb-0.5">Du</p>
                  <input
                    type="date"
                    value={workFrom}
                    onChange={(e) => setWorkFrom(e.target.value)}
                    className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 px-2 py-1.5"
                  />
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 mb-0.5">Au</p>
                  <input
                    type="date"
                    value={workTo}
                    onChange={(e) => setWorkTo(e.target.value)}
                    className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 px-2 py-1.5"
                  />
                </div>
              </div>
            )}

            {/* Résultats */}
            <p className="text-[10px] text-gray-400 -mb-1">{label}</p>

            {!hasData ? (
              <p className="text-xs text-gray-400 text-center py-2">Aucune heure enregistrée sur cette période</p>
            ) : (
              <>
                {/* --- Section Individuel --- */}
                {soloData.length > 0 && (
                  <>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Individuel</p>
                    {soloData.map((c) => (
                      <div key={c.name} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                            style={{ backgroundColor: c.colors.bg, color: c.colors.text }}
                          >
                            {getCollaboratorInitials(c.name)}
                          </div>
                          <span className="text-sm text-gray-700 dark:text-gray-300">{c.name}</span>
                        </div>
                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{fmtMin(c.minutes)}</span>
                      </div>
                    ))}
                  </>
                )}

                {/* --- Section Binômes & Équipes (travail en groupe uniquement) --- */}
                {groupData.length > 0 && (
                  <>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mt-1">Binômes & Équipes</p>
                    {groupData.map(([name, mins]) => {
                      const names = name.split("&").map(n => n.trim());
                      return (
                        <div key={name} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="flex -space-x-1.5">
                              {names.slice(0, 4).map((n) => {
                                const c = getCollaboratorColor(n);
                                return (
                                  <div key={n} className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 border border-white dark:border-slate-800"
                                    style={{ backgroundColor: c.dot, color: "#fff" }}>
                                    {getCollaboratorInitials(n)}
                                  </div>
                                );
                              })}
                            </div>
                            <span className="text-sm text-gray-700 dark:text-gray-300">{name}</span>
                          </div>
                          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{fmtMin(mins)}</span>
                        </div>
                      );
                    })}
                  </>
                )}
              </>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// --- Main component ---

export function MonteurDashboard({ userName, projects, isAdmin, onNavigate }: MonteurDashboardProps) {
  // Admin view: show all collaborators
  if (isAdmin) {
    return <AdminDashboard projects={projects} userName={userName} onNavigate={onNavigate} />;
  }

  // Regular monteur view (unchanged logic)
  const firstName = userName.split(" ")[0];
  const colors = getCollaboratorColor(firstName);

  const todayStr = getTodayStr();
  const weekEndStr = getWeekEndStr();
  const thisWeekEndStr = getThisWeekEndStr();

  // Filtrer les projets du monteur par rôle correct selon la source
  const myProjects = projects.filter((p) => {
    const source = getProjectSource(p);
    if (source === "mesures") {
      return matchesCollaborator(p.mesuresTraiteePar || "", firstName);
    }
    return matchesCollaborator(p.collaborateurs || "", firstName);
  });

  // Date effective d'un projet (mesures ou montage)
  const getDate = (p: Project) => p.dateMontage || p.dateMesures || "";

  // Projets du jour (inclut les projets multi-jours qui couvrent aujourd'hui)
  const todayProjects = myProjects.filter((p) => projectSpansDate(p, todayStr));

  // Projets cette semaine (excl. aujourd'hui)
  const thisWeekProjects = myProjects
    .filter((p) => {
      if (todayProjects.includes(p)) return false; // déjà dans "aujourd'hui"
      return projectActiveDuringRange(p, todayStr, thisWeekEndStr);
    })
    .sort((a, b) => getDate(a).localeCompare(getDate(b)));

  // Projets semaine prochaine
  const nextWeekProjects = myProjects
    .filter((p) => {
      if (todayProjects.includes(p) || thisWeekProjects.includes(p)) return false;
      return projectActiveDuringRange(p, thisWeekEndStr, weekEndStr);
    })
    .sort((a, b) => getDate(a).localeCompare(getDate(b)));

  const allUpcoming = [...todayProjects, ...thisWeekProjects, ...nextWeekProjects];
  const myCabinesBySource = countCabinesBySource(allUpcoming, firstName);
  const totalCabines = Object.values(myCabinesBySource).reduce((s, v) => s + v, 0);
  const mySummary = formatCabinesSummary(myCabinesBySource);

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
            {getCollaboratorInitials(firstName)}
          </div>
          <div className="flex-1">
            <p className="font-semibold text-gray-900 dark:text-gray-100">Bonjour {firstName} 👋</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {todayProjects.length > 0
                ? `${todayProjects.length} intervention${todayProjects.length > 1 ? "s" : ""} aujourd'hui`
                : "Aucune intervention aujourd'hui"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold" style={{ color: colors.text }}>{totalCabines}</p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500">cab. à venir</p>
            {mySummary && <p className="text-[9px] text-gray-400 mt-0.5">{mySummary}</p>}
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
              <ProjectRow key={p.id} project={p} colors={colors} />
            ))}
          </div>
          <div className="mt-3">
            <DailyRouteButton projects={todayProjects} />
          </div>
        </div>
      )}

      {/* Cette semaine */}
      {thisWeekProjects.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            Cette semaine
          </p>
          <div className="space-y-1.5">
            {(() => {
              let lastDay = "";
              return thisWeekProjects.flatMap((p) => {
                const dayKey = (p.dateMontage || p.dateMesures || "").split("T")[0];
                const items: React.ReactNode[] = [];
                if (dayKey !== lastDay && lastDay !== "") {
                  items.push(
                    <div key={`sep-${dayKey}`} className="flex items-center gap-2 pt-1">
                      <div className="flex-1 h-px bg-gray-200/80 dark:bg-gray-700/60" />
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium shrink-0 px-1">
                        {dayKey ? new Date(dayKey + "T12:00:00").toLocaleDateString("fr-CH", { weekday: "short", day: "numeric", month: "short" }) : ""}
                      </span>
                      <div className="flex-1 h-px bg-gray-200/80 dark:bg-gray-700/60" />
                    </div>
                  );
                }
                lastDay = dayKey;
                items.push(<WeekProjectRow key={p.id} project={p} />);
                return items;
              });
            })()}
          </div>
        </div>
      )}

      {/* Semaine prochaine */}
      {nextWeekProjects.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" />
            Semaine prochaine
          </p>
          <div className="space-y-1.5">
            {(() => {
              let lastDay = "";
              return nextWeekProjects.flatMap((p) => {
                const dayKey = (p.dateMontage || p.dateMesures || "").split("T")[0];
                const items: React.ReactNode[] = [];
                if (dayKey !== lastDay && lastDay !== "") {
                  items.push(
                    <div key={`sep-${dayKey}`} className="flex items-center gap-2 pt-1">
                      <div className="flex-1 h-px bg-gray-200/80 dark:bg-gray-700/60" />
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium shrink-0 px-1">
                        {dayKey ? new Date(dayKey + "T12:00:00").toLocaleDateString("fr-CH", { weekday: "short", day: "numeric", month: "short" }) : ""}
                      </span>
                      <div className="flex-1 h-px bg-gray-200/80 dark:bg-gray-700/60" />
                    </div>
                  );
                }
                lastDay = dayKey;
                items.push(<WeekProjectRow key={p.id} project={p} />);
                return items;
              });
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
