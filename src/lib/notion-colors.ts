"use client";

/**
 * Couleurs des options select/multi-select/status reprises EXACTEMENT de Notion,
 * et synchronisées automatiquement : l'app récupère le schéma Notion
 * (/api/notion-colors) — si tu changes une couleur dans Notion, l'app s'adapte
 * au prochain rafraîchissement du cache, sans rien préciser.
 *
 * Usage badge :   statusClasses("État - CMD", value, FALLBACK)
 * Usage réactif : appeler useNotionColors() dans le composant (déclenche le
 *                 chargement + re-render quand les couleurs arrivent).
 */

import { useEffect, useState } from "react";
import { STATUS_CMD_COLORS, STATUS_MESURES_COLORS } from "@/lib/constants";

// ── Couleurs Notion → classes Tailwind (clair + sombre) ──────────────────────
// Les 10 couleurs nommées de Notion. Approche fidèle à la palette Notion.
export const NOTION_COLOR_CLASSES: Record<string, string> = {
  default: "bg-gray-100 text-gray-700 dark:bg-gray-700/50 dark:text-gray-200",
  gray:    "bg-gray-100 text-gray-600 dark:bg-gray-700/50 dark:text-gray-300",
  brown:   "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  orange:  "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  yellow:  "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  green:   "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  blue:    "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  purple:  "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  pink:    "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300",
  red:     "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

// Pastille (point) coloré assorti, pour les menus.
export const NOTION_DOT_CLASS: Record<string, string> = {
  default: "bg-gray-400", gray: "bg-gray-400", brown: "bg-amber-500",
  orange: "bg-orange-500", yellow: "bg-yellow-500", green: "bg-green-500",
  blue: "bg-blue-500", purple: "bg-purple-500", pink: "bg-pink-500", red: "bg-red-500",
};

// ── Cache client + chargement unique ─────────────────────────────────────────
type ColorMap = Record<string, Record<string, string>>; // propriété → option → couleur Notion
let colorMap: ColorMap | null = null;
let loadPromise: Promise<ColorMap> | null = null;
const subscribers = new Set<() => void>();

// Mappe les couleurs Notion sur les maps de statut statiques EXISTANTES (mutation
// en place). Ainsi, tous les badges qui font déjà `STATUS_CMD_COLORS[x]` adoptent
// la couleur Notion sans qu'on touche à chaque endroit — il suffit que le
// composant se re-render (cf. useNotionColors() posé en haut des pages).
const STATIC_MAPS: Array<[Record<string, string>, string]> = [
  [STATUS_CMD_COLORS, "État - CMD"],
  [STATUS_MESURES_COLORS, "État - Mesures"],
];
function applyToStaticMaps() {
  if (!colorMap) return;
  for (const [map, prop] of STATIC_MAPS) {
    const opts = colorMap[prop];
    if (!opts) continue;
    for (const key of Object.keys(map)) {
      const c = opts[key];
      if (c && NOTION_COLOR_CLASSES[c]) map[key] = NOTION_COLOR_CLASSES[c];
    }
  }
}

export function loadNotionColors(): Promise<ColorMap> {
  if (colorMap) return Promise.resolve(colorMap);
  if (!loadPromise) {
    loadPromise = fetch("/api/notion-colors")
      .then((r) => (r.ok ? r.json() : {}))
      .then((d: ColorMap) => {
        colorMap = d && typeof d === "object" ? d : {};
        applyToStaticMaps();
        subscribers.forEach((f) => f());
        return colorMap;
      })
      .catch(() => {
        colorMap = {};
        return colorMap;
      });
  }
  return loadPromise;
}

/** Couleur Notion (nom) d'une option, ou null si inconnue/non chargée. */
export function notionColorName(property: string, value: string): string | null {
  if (!colorMap || !value) return null;
  return colorMap[property]?.[value] || null;
}

/** Classes de pastille pour une option, avec repli sur un style fourni. */
export function statusClasses(property: string, value: string, fallback?: string): string {
  const color = notionColorName(property, value);
  if (color && NOTION_COLOR_CLASSES[color]) return NOTION_COLOR_CLASSES[color];
  return fallback || NOTION_COLOR_CLASSES.default;
}

/** Classe du point coloré pour une option (menus). */
export function statusDotClass(property: string, value: string): string {
  const color = notionColorName(property, value) || "default";
  return NOTION_DOT_CLASS[color] || NOTION_DOT_CLASS.default;
}

/**
 * Hook : déclenche le chargement des couleurs Notion et re-render quand elles
 * sont disponibles (ou changent). À appeler dans tout composant qui affiche des
 * statuts colorés.
 */
export function useNotionColors(): { ready: boolean } {
  const [, force] = useState(0);
  useEffect(() => {
    const cb = () => force((n) => n + 1);
    subscribers.add(cb);
    loadNotionColors();
    return () => { subscribers.delete(cb); };
  }, []);
  return { ready: colorMap !== null };
}
