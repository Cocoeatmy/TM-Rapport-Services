"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Search, X, ArrowRight } from "lucide-react";
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

// Index de recherche identique à celui de page.tsx
function buildIndex(projects: Project[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of projects) {
    if (map.has(p.id)) continue;
    map.set(p.id, [
      p.projet, p.ofrTM, p.ofrGrossiste, p.nomChantier, p.adresseChantier,
      p.cmdTM, p.cmdTMUsine, p.cmdGrossiste, p.cmdFournisseurs,
      p.servCmdFournisseurs, p.servMesuresFournisseurs, p.bonLivraison,
      p.collaborateurs, p.contacts, p.emplacementCabine,
      ...(p.fournisseurs || []), ...(p.fournisseursNames || []),
      ...(p.grossistesNames || []), ...(p.sanitaireNames || []),
      ...(p.seriesCabines || []),
    ].filter(Boolean).join(" ").toLowerCase());
  }
  return map;
}

// Source 1 : window.__TM_PROJECTS__ (mis à jour par page.tsx en temps réel)
// Source 2 : localStorage tm-projects-cache (fallback si page.tsx pas encore chargé)
function loadProjects(): Project[] {
  if (typeof window === "undefined") return [];

  // Priorité : état React de page.tsx exposé sur window
  const global = (window as any).__TM_PROJECTS__;
  if (Array.isArray(global) && global.length > 0) return global;

  // Fallback : cache localStorage
  try {
    const raw = localStorage.getItem("tm-projects-cache");
    if (!raw) return [];
    const parsed: Record<string, Project[]> = JSON.parse(raw);
    const seen = new Set<string>();
    const all: Project[] = [];
    for (const arr of Object.values(parsed)) {
      if (!Array.isArray(arr)) continue;
      for (const p of arr) {
        if (p?.id && !seen.has(p.id)) { seen.add(p.id); all.push(p); }
      }
    }
    return all;
  } catch {
    return [];
  }
}

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Recharge les projets à chaque ouverture
  useEffect(() => {
    if (!open) return;
    setProjects(loadProjects());
  }, [open]);

  // Recharge aussi dès que query change (au cas où les projets arrivent en retard)
  useEffect(() => {
    if (!open || query.length < 2) return;
    const fresh = loadProjects();
    if (fresh.length > projects.length) setProjects(fresh);
  }, [query, open, projects.length]);

  // Index pré-calculé (recalculé uniquement si la liste change)
  const searchIndex = useMemo(() => buildIndex(projects), [projects]);

  // Filtrage client-side — même logique que l'ancienne barre
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return projects
      .filter((p) => (searchIndex.get(p.id) ?? "").includes(q))
      ;
  }, [query, projects, searchIndex]);

  const closeSearch = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  // Cmd+K / Ctrl+K pour ouvrir, Escape pour fermer
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (e.key === "Escape") closeSearch();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [closeSearch]);

  const navigate = (p: Project) => {
    closeSearch();
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
        <>
          {/* Fond sombre — tap dessus = fermeture */}
          <div
            className="fixed inset-0 z-[9998] bg-black/50 backdrop-blur-sm cursor-pointer"
            onPointerDown={closeSearch}
          />
          {/* Contenu modal */}
          <div className="fixed inset-0 z-[9999] flex items-start justify-center pt-[8vh] px-4 pointer-events-none">
            <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-700 pointer-events-auto">

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
                {query && (
                  <button onClick={() => setQuery("")} className="text-gray-400 hover:text-gray-600">
                    <X className="w-4 h-4" />
                  </button>
                )}
                <button onClick={closeSearch} className="text-gray-400 hover:text-gray-600 ml-1">
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
                {query.length >= 2 && results.length === 0 && (
                  <p className="text-center text-sm text-gray-400 py-10">
                    Aucun résultat pour <strong>« {query} »</strong>
                    {projects.length === 0 && (
                      <span className="block text-xs mt-1 text-orange-400">
                        (données pas encore chargées — réessayez dans quelques secondes)
                      </span>
                    )}
                  </p>
                )}
                {results.length > 0 && (
                  <ul className="py-1">
                    {results.map((p) => (
                      <ResultRow key={p.id} project={p} onSelect={navigate} />
                    ))}
                  </ul>
                )}
              </div>

              {/* Footer */}
              <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-800 text-xs text-gray-400">
                {results.length > 0
                  ? `${results.length} projet${results.length > 1 ? "s" : ""} trouvé${results.length > 1 ? "s" : ""} sur ${projects.length}`
                  : `${projects.length} projet${projects.length > 1 ? "s" : ""} disponible${projects.length > 1 ? "s" : ""}`}
              </div>
            </div>
          </div>
        </>
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
