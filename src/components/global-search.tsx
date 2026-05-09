"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Search, X, Loader2, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import type { Project } from "@/lib/notion";

// Badge de statut
const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  "Terminé":     { label: "Terminé",     color: "bg-gray-100 text-gray-500" },
  "En cours":    { label: "En cours",    color: "bg-blue-100 text-blue-700" },
  "À planifier": { label: "À planifier", color: "bg-orange-100 text-orange-700" },
  "En attente":  { label: "En attente",  color: "bg-yellow-100 text-yellow-700" },
};
function statusBadge(p: Project) {
  const s = p.etatCMD || "";
  return STATUS_BADGE[s] ?? { label: s || "Actif", color: "bg-green-100 text-green-700" };
}

function buildIndex(projects: Project[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of projects) {
    if (map.has(p.id)) continue;
    map.set(p.id, [
      p.projet, p.ofrTM, p.ofrGrossiste, p.nomChantier, p.adresseChantier,
      p.cmdTM, p.cmdTMUsine, p.cmdGrossiste, p.cmdFournisseurs,
      p.bonLivraison, p.collaborateurs, p.contacts,
      ...(p.fournisseursNames || []), ...(p.grossistesNames || []),
    ].filter(Boolean).join(" ").toLowerCase());
  }
  return map;
}

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [localProjects, setLocalProjects] = useState<Project[]>([]);
  const [apiResults, setApiResults] = useState<Project[]>([]);
  const [apiLoading, setApiLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Charger les projets du cache localStorage au montage (et quand on ouvre)
  useEffect(() => {
    if (!open) return;
    try {
      const raw = localStorage.getItem("tm-projects-cache");
      if (!raw) return;
      const parsed: Record<string, Project[]> = JSON.parse(raw);
      const seen = new Set<string>();
      const all: Project[] = [];
      for (const arr of Object.values(parsed)) {
        if (!Array.isArray(arr)) continue;
        for (const p of arr) {
          if (p?.id && !seen.has(p.id)) {
            seen.add(p.id);
            all.push(p);
          }
        }
      }
      setLocalProjects(all);
    } catch {}
  }, [open]);

  const localIndex = useMemo(() => buildIndex(localProjects), [localProjects]);

  // Résultats locaux — instantanés (zéro latence)
  const localResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return localProjects.filter((p) => (localIndex.get(p.id) ?? "").includes(q)).slice(0, 8);
  }, [query, localProjects, localIndex]);

  // Appel API si résultats locaux insuffisants (debounce 400ms)
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setApiResults([]); setApiLoading(false); return; }
    if (localResults.length >= 5) { setApiResults([]); setApiLoading(false); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setApiLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/projects/search?q=${encodeURIComponent(q)}`);
        if (!res.ok) throw new Error();
        const data: Project[] = await res.json();
        const localIds = new Set(localResults.map((p) => p.id));
        setApiResults(data.filter((p) => !localIds.has(p.id)).slice(0, 8));
      } catch { setApiResults([]); }
      finally { setApiLoading(false); }
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, localResults]);

  // Cmd+K / Ctrl+K pour ouvrir, Escape pour fermer
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const allResults = [...localResults, ...apiResults];

  const navigate = (p: Project) => {
    setOpen(false);
    setQuery("");
    router.push(`/projet/${p.id}`);
  };

  const openSearch = () => {
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  return (
    <>
      {/* Bouton dans le header */}
      <button
        onClick={openSearch}
        aria-label="Recherche globale (⌘K)"
        className="flex items-center gap-2 h-9 px-3 rounded-xl bg-white/15 hover:bg-white/25 border border-white/20 text-white/80 hover:text-white text-sm transition-all"
      >
        <Search className="w-4 h-4" />
        <span className="hidden sm:inline text-sm">Rechercher</span>
        <kbd className="hidden md:inline-flex items-center text-[10px] font-mono bg-white/10 px-1.5 py-0.5 rounded">⌘K</kbd>
      </button>

      {/* Overlay modal */}
      {open && (
        <div
          className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm flex items-start justify-center pt-[8vh] px-4"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-700">
            {/* Barre de saisie */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-800">
              <Search className="w-5 h-5 text-gray-400 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="OFR, nom chantier, CMD, collaborateur…"
                className="flex-1 bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 text-base outline-none"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />
              {apiLoading && <Loader2 className="w-4 h-4 text-blue-500 animate-spin shrink-0" />}
              {query && (
                <button onClick={() => setQuery("")} className="text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 ml-1">
                <kbd className="text-[11px] font-mono bg-gray-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-700">Esc</kbd>
              </button>
            </div>

            {/* Liste des résultats */}
            <div className="max-h-[60vh] overflow-y-auto">
              {query.length < 2 && (
                <p className="text-center text-sm text-gray-400 py-10">
                  Tapez au moins 2 caractères
                </p>
              )}
              {query.length >= 2 && !allResults.length && !apiLoading && (
                <p className="text-center text-sm text-gray-400 py-10">
                  Aucun résultat pour <strong>« {query} »</strong>
                </p>
              )}
              {query.length >= 2 && !allResults.length && apiLoading && (
                <p className="text-center text-sm text-gray-400 py-10 flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Recherche dans Notion…
                </p>
              )}
              {allResults.length > 0 && (
                <ul className="py-1">
                  {localResults.length > 0 && (
                    <li className="px-4 pt-2 pb-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                        Résultats instantanés ({localResults.length})
                      </span>
                    </li>
                  )}
                  {localResults.map((p) => (
                    <ResultRow key={p.id} project={p} onSelect={navigate} />
                  ))}
                  {apiResults.length > 0 && (
                    <li className="px-4 pt-3 pb-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                        Trouvés dans Notion ({apiResults.length})
                      </span>
                    </li>
                  )}
                  {apiResults.map((p) => (
                    <ResultRow key={p.id} project={p} onSelect={navigate} />
                  ))}
                </ul>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-800 text-xs text-gray-400">
              {allResults.length > 0
                ? `${allResults.length} projet${allResults.length > 1 ? "s" : ""} trouvé${allResults.length > 1 ? "s" : ""}`
                : "Recherche dans tous vos projets, y compris les archives"}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ResultRow({ project: p, onSelect }: { project: Project; onSelect: (p: Project) => void }) {
  const badge = statusBadge(p);
  return (
    <li>
      <button
        onClick={() => onSelect(p)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors text-left group"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">
              {p.projet || "—"}
            </span>
            {p.ofrTM && (
              <span className="text-xs text-gray-400 font-mono shrink-0">{p.ofrTM}</span>
            )}
          </div>
          <div className="text-xs text-gray-500 truncate mt-0.5">
            {[p.nomChantier, p.adresseChantier].filter(Boolean).join(" · ")}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${badge.color}`}>
            {badge.label}
          </span>
          <ArrowRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-blue-500 transition-colors" />
        </div>
      </button>
    </li>
  );
}
