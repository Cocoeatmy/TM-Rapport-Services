"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Minus, ExternalLink, GripVertical, RefreshCw } from "lucide-react";

const MODES: { label: string; value: string }[] = [
  { label: "Dashboard", value: "dashboard" },
  { label: "Mesures", value: "mesures" },
  { label: "Montages", value: "cmd" },
  { label: "Services", value: "services" },
  { label: "SAV", value: "sav" },
  { label: "CRM Contacts", value: "clients-contacts" },
  { label: "CRM Entreprises", value: "clients-entreprises" },
  { label: "Grossistes", value: "grossistes" },
  { label: "Fournisseurs", value: "fournisseurs" },
  { label: "Sanitaires", value: "sanitaires" },
  { label: "Rapport", value: "rapport" },
  { label: "Déstockage", value: "destockage" },
  { label: "Stats", value: "stats" },
];

interface Props {
  initialMode?: string;
  initialPos?: { x: number; y: number };
  zIndex?: number;
  onClose: () => void;
  onFocus: () => void;
}

export function FloatingWindow({
  initialMode = "dashboard",
  initialPos,
  zIndex = 9999,
  onClose,
  onFocus,
}: Props) {
  const [mode, setMode] = useState(initialMode);
  const [minimized, setMinimized] = useState(false);
  const [pos, setPos] = useState(initialPos ?? { x: 20, y: 80 });
  const [size, setSize] = useState({ w: 500, h: 620 });
  const [reloadKey, setReloadKey] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  /* ── Drag souris ── */
  const dragging = useRef(false);
  const dragStart = useRef({ mx: 0, my: 0, px: 0, py: 0 });

  const onHeaderMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button,select,a")) return;
    e.preventDefault();
    onFocus();
    dragging.current = true;
    dragStart.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y };
  }, [pos, onFocus]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      setPos({
        x: Math.max(0, dragStart.current.px + e.clientX - dragStart.current.mx),
        y: Math.max(0, dragStart.current.py + e.clientY - dragStart.current.my),
      });
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  /* ── Drag touch ── */
  const onHeaderTouchStart = useCallback((e: React.TouchEvent) => {
    if ((e.target as HTMLElement).closest("button,select,a")) return;
    onFocus();
    const t = e.touches[0];
    dragging.current = true;
    dragStart.current = { mx: t.clientX, my: t.clientY, px: pos.x, py: pos.y };
  }, [pos, onFocus]);

  useEffect(() => {
    const onMove = (e: TouchEvent) => {
      if (!dragging.current) return;
      const t = e.touches[0];
      setPos({
        x: Math.max(0, dragStart.current.px + t.clientX - dragStart.current.mx),
        y: Math.max(0, dragStart.current.py + t.clientY - dragStart.current.my),
      });
    };
    const onEnd = () => { dragging.current = false; };
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    return () => {
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
    };
  }, []);

  /* ── Resize ── */
  const resizing = useRef(false);
  const resizeStart = useRef({ mx: 0, my: 0, w: 0, h: 0 });

  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onFocus();
    resizing.current = true;
    resizeStart.current = { mx: e.clientX, my: e.clientY, w: size.w, h: size.h };
  }, [size, onFocus]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizing.current) return;
      setSize({
        w: Math.max(320, resizeStart.current.w + e.clientX - resizeStart.current.mx),
        h: Math.max(240, resizeStart.current.h + e.clientY - resizeStart.current.my),
      });
    };
    const onUp = () => { resizing.current = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const window_ = (
    <div
      onMouseDown={onFocus}
      className="fixed flex flex-col rounded-2xl overflow-hidden shadow-2xl border border-gray-200/80 dark:border-gray-700/80 bg-white dark:bg-slate-900"
      style={{
        left: pos.x,
        top: pos.y,
        width: size.w,
        height: minimized ? "auto" : size.h,
        minWidth: 320,
        minHeight: minimized ? "auto" : 240,
        zIndex,
      }}
    >
      {/* ── Barre de titre ── */}
      <div
        className="flex items-center gap-2 px-3 py-2 bg-gray-100/90 dark:bg-slate-800/90 border-b border-gray-200 dark:border-gray-700 select-none cursor-grab active:cursor-grabbing shrink-0"
        onMouseDown={onHeaderMouseDown}
        onTouchStart={onHeaderTouchStart}
      >
        {/* Traffic lights macOS */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={onClose}
            title="Fermer"
            className="w-3.5 h-3.5 rounded-full bg-red-400 hover:bg-red-500 flex items-center justify-center group transition-colors"
          >
            <X className="w-2 h-2 text-red-900 opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
          <button
            onClick={() => setMinimized((v) => !v)}
            title={minimized ? "Agrandir" : "Réduire"}
            className="w-3.5 h-3.5 rounded-full bg-yellow-400 hover:bg-yellow-500 flex items-center justify-center group transition-colors"
          >
            <Minus className="w-2 h-2 text-yellow-900 opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
          <a
            href={`/?mode=${mode}`}
            target="_blank"
            rel="noopener noreferrer"
            title="Ouvrir dans un onglet"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className="w-3.5 h-3.5 rounded-full bg-green-400 hover:bg-green-500 flex items-center justify-center group transition-colors"
          >
            <ExternalLink className="w-2 h-2 text-green-900 opacity-0 group-hover:opacity-100 transition-opacity" />
          </a>
        </div>

        <GripVertical className="w-3.5 h-3.5 text-gray-400 shrink-0" />

        {/* Sélecteur de vue */}
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 min-w-0 text-xs font-semibold bg-transparent border border-gray-300 dark:border-gray-600 rounded-md px-2 py-0.5 outline-none cursor-pointer text-gray-700 dark:text-gray-200 focus:border-blue-400"
        >
          {MODES.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>

        {/* Refresh */}
        <button
          onClick={() => setReloadKey((k) => k + 1)}
          onMouseDown={(e) => e.stopPropagation()}
          title="Recharger"
          className="shrink-0 w-6 h-6 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center transition-colors"
        >
          <RefreshCw className="w-3 h-3 text-gray-500" />
        </button>
      </div>

      {/* ── Contenu iframe ── */}
      {!minimized && (
        <div className="flex-1 min-h-0 relative">
          <iframe
            key={`${mode}-${reloadKey}`}
            src={`/?mode=${mode}&_fw=1`}
            className="w-full h-full border-none"
            title="Vue secondaire"
            loading="lazy"
          />
        </div>
      )}

      {/* ── Poignée resize bas-droit ── */}
      {!minimized && (
        <div
          onMouseDown={onResizeMouseDown}
          className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize z-10 flex items-end justify-end p-1"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" className="text-gray-400 dark:text-gray-600">
            <line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="9" y1="5" x2="5" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      )}
    </div>
  );

  // Portal vers document.body — contourne tout overflow/transform parent
  if (!mounted) return null;
  return createPortal(window_, document.body);
}
