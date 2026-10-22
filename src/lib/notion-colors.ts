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
/* Les couleurs d'origine de l'app, avant toute couleur Notion. */
const ORIGINES = STATIC_MAPS.map(([m]) => ({ ...m }));

/* Couleurs de secours, quand deux états tombent sur la même. Les classes
   sont écrites en entier : Tailwind ne génère que ce qu'il lit. */
const PALETTE_SECOURS = [
  "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300",
  "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300",
  "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  "bg-lime-100 text-lime-800 dark:bg-lime-900/40 dark:text-lime-300",
  "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-300",
  "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
  "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300",
  "bg-stone-200 text-stone-700 dark:bg-stone-700/40 dark:text-stone-300",
];

/**
 * Un état = une couleur (22.10.2026). Dans Notion, « Pas contacté » et
 * « Contact sans réponse » portaient le même gris : impossible de les
 * distinguer dans les listes. Sans rien changer dans Notion, le second état
 * qui tombe sur une couleur déjà prise reprend sa couleur d'origine de l'app
 * si elle est libre, sinon la première couleur de secours libre. On compare
 * le FOND (première classe) : c'est lui qui se voit.
 */
function distinguer(map: Record<string, string>, origine: Record<string, string>) {
  const fond = (c: string) => (c || "").split(" ")[0];
  const pris = new Set<string>();
  /* Les états finaux gardent leurs couleurs convenues (vert, rouge) et ne
     comptent pas : ils ne figurent pas dans les listes « à fixer ». */
  for (const key of Object.keys(map).filter((k) => k !== "Terminé" && k !== "Annulé")) {
    if (!pris.has(fond(map[key]))) { pris.add(fond(map[key])); continue; }
    const libre = [origine[key], ...PALETTE_SECOURS].find((c) => c && !pris.has(fond(c)));
    if (libre) map[key] = libre;
    pris.add(fond(map[key]));
  }
}
/* Seulement les états de MESURES : la table des états de commande est
   partagée par toute l'app et ses couleurs sont connues de tous. */
const A_DISTINGUER = new Set<Record<string, string>>([STATUS_MESURES_COLORS]);
STATIC_MAPS.forEach(([m], i) => { if (A_DISTINGUER.has(m)) distinguer(m, ORIGINES[i]); });

function applyToStaticMaps() {
  if (!colorMap) return;
  STATIC_MAPS.forEach(([map, prop], i) => {
    const opts = colorMap?.[prop];
    if (opts) {
      for (const key of Object.keys(map)) {
        const c = opts[key];
        if (c && NOTION_COLOR_CLASSES[c]) map[key] = NOTION_COLOR_CLASSES[c];
      }
    }
    if (A_DISTINGUER.has(map)) distinguer(map, ORIGINES[i]);
  });
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
