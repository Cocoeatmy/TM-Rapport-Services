"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { useNotionColors, statusClasses, statusDotClass } from "@/lib/notion-colors";

interface ColoredSelectProps {
  /** Nom EXACT de la propriété Notion (ex. "État - CMD") pour retrouver les couleurs. */
  property: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  /** Classes de repli par valeur (avant chargement des couleurs Notion). */
  fallback?: (v: string) => string | undefined;
  className?: string;
  placeholder?: string;
}

/**
 * Menu déroulant personnalisé où chaque option est une pastille colorée reprenant
 * la couleur Notion (auto-synchronisée). Remplace les <select> natifs pour les statuts.
 */
export function ColoredSelect({ property, value, options, onChange, fallback, className, placeholder }: ColoredSelectProps) {
  useNotionColors();
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 0 });

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (r) setPos({ top: r.bottom + 4, left: r.left, width: r.width });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const h = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!btnRef.current?.contains(t) && !popRef.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("pointerdown", h);
    return () => document.removeEventListener("pointerdown", h);
  }, [open]);

  const chip = (v: string) => statusClasses(property, v, fallback?.(v));

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center justify-between gap-2 border border-gray-200 dark:border-slate-600 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 ${className || ""}`}
      >
        {value ? (
          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${chip(value)}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${statusDotClass(property, value)}`} />
            {value}
          </span>
        ) : (
          <span className="text-gray-400 text-sm px-1">{placeholder || "—"}</span>
        )}
        <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={popRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, width: Math.max(pos.width, 200) }}
          className="z-[120] max-h-72 overflow-y-auto bg-white dark:bg-slate-800 rounded-xl p-1.5 shadow-xl border border-gray-200 dark:border-gray-700"
        >
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => { onChange(opt); setOpen(false); }}
              className={`w-full text-left px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 flex items-center ${opt === value ? "ring-1 ring-blue-300 dark:ring-blue-500" : ""}`}
            >
              <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${chip(opt)}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${statusDotClass(property, opt)}`} />
                {opt}
              </span>
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}
