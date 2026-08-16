"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Search, X, ArrowRight, SlidersHorizontal, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { useRouter } from "next/navigation";
import type { Project } from "@/lib/notion";
import { STATUS_CMD_COLORS, STATUS_MESURES_COLORS } from "@/lib/constants";

// Source 1 : window.__TM_PROJECTS__ (mis à jour par page.tsx en temps réel)
// Source 2 : localStorage tm-projects-cache (fallback si page.tsx pas encore chargé)
function loadProjects(): Project[] {
  if (typeof window === "undefined") return [];
  const global = (window as any).__TM_PROJECTS__;
  if (Array.isArray(global) && global.length > 0) return global;
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

// Index de recherche texte (tous les champs pertinents)
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

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  // Repli serveur : quand on est dans une page projet, l'index local est partiel
  // (la homepage qui alimente window.__TM_PROJECTS__ n'est pas montée). On
  // interroge alors l'API de recherche Notion pour TOUJOURS trouver un projet.
  const [serverResults, setServerResults] = useState<Project[]>([]);
  const [serverLoading, setServerLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filtres avancés
  const [showFilters, setShowFilters] = useState(false);
  const [yearFilter, setYearFilter] = useState<string>("all");
  const [statusCMD, setStatusCMD] = useState<string[]>([]);
  const [statusMesures, setStatusMesures] = useState<string[]>([]);
  const [avecSAV, setAvecSAV] = useState(false);
  const [avecSoucis, setAvecSoucis] = useState(false);

  // Recharge les projets à chaque ouverture
  useEffect(() => {
    if (!open) return;
    setProjects(loadProjects());
  }, [open]);

  // Recharge si les projets arrivent en retard
  useEffect(() => {
    if (!open) return;
    const fresh = loadProjects();
    if (fresh.length > projects.length) setProjects(fresh);
  }, [query, open, projects.length]);

  // Repli serveur (debounce 300 ms) : interroge Notion pour les projets
  // absents de l'index local. Garantit qu'un projet existant est toujours
  // trouvé, même depuis une page /projet/[id].
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) { setServerResults([]); setServerLoading(false); return; }
    let cancelled = false;
    setServerLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/projects/search?q=${encodeURIComponent(q)}`);
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        if (!cancelled) setServerResults(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setServerResults([]);
      } finally {
        if (!cancelled) setServerLoading(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, open]);

  const searchIndex = useMemo(() => buildIndex(projects), [projects]);

  // Années disponibles depuis les données
  const availableYears = useMemo(() =>
    Array.from(new Set(
      projects.map((p) => p.dateMontage?.slice(0, 4)).filter(Boolean) as string[]
    )).sort().reverse(),
  [projects]);

  const activeFilterCount =
    (yearFilter !== "all" ? 1 : 0) +
    statusCMD.length +
    statusMesures.length +
    (avecSAV ? 1 : 0) +
    (avecSoucis ? 1 : 0);

  const resetFilters = () => {
    setYearFilter("all");
    setStatusCMD([]);
    setStatusMesures([]);
    setAvecSAV(false);
    setAvecSoucis(false);
  };

  const toggleCMD = (s: string) => setStatusCMD((cur) => cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]);
  const toggleMesures = (s: string) => setStatusMesures((cur) => cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]);

  // Filtres avancés (année / état / toggles) — appliqués aux résultats locaux
  // ET serveur.
  const passesAdvanced = useCallback((p: Project) => {
    if (yearFilter !== "all" && !p.dateMontage?.startsWith(yearFilter)) return false;
    if (statusCMD.length > 0 && !statusCMD.includes(p.etatCMD)) return false;
    if (statusMesures.length > 0 && !statusMesures.includes(p.etatMesures)) return false;
    if (avecSAV && !p.sav) return false;
    if (avecSoucis && !p.soucisMontage) return false;
    return true;
  }, [yearFilter, statusCMD, statusMesures, avecSAV, avecSoucis]);

  // Filtrage combiné : texte + filtres avancés, fusion local + serveur.
  // Sans query : affiche tous les projets locaux si au moins un filtre actif.
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hasQuery = q.length >= 2;
    const hasFilters = activeFilterCount > 0;
    if (!hasQuery && !hasFilters) return [];

    const seen = new Set<string>();
    const out: Project[] = [];
    // 1) Résultats locaux (instantanés)
    for (const p of projects) {
      if (hasQuery && !(searchIndex.get(p.id) ?? "").includes(q)) continue;
      if (!passesAdvanced(p)) continue;
      if (seen.has(p.id)) continue;
      seen.add(p.id); out.push(p);
    }
    // 2) Résultats serveur (déjà filtrés par texte côté Notion) — complètent
    //    ceux absents du cache local. On respecte les filtres avancés.
    if (hasQuery) {
      for (const p of serverResults) {
        if (!p?.id || seen.has(p.id)) continue;
        if (!passesAdvanced(p)) continue;
        seen.add(p.id); out.push(p);
      }
    }
    return out;
  }, [query, projects, searchIndex, serverResults, passesAdvanced, activeFilterCount]);

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
    // Affichage INSTANTANÉ : on dépose le projet trouvé dans une clé dédiée que
    // la page projet lit en priorité (évite le spinner + fetch Notion ~5 s quand
    // le projet n'est pas dans tm-projects-cache).
    try { localStorage.setItem(`tm-project-${p.id}`, JSON.stringify(p)); } catch {}
    router.push(`/projet/${p.id}`);
  };

  const openSearch = () => {
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const hasQuery = query.trim().length >= 2;
  const hasFilters = activeFilterCount > 0;

  return (
    <>
      {/* Bouton dans le header */}
      <button
        onClick={openSearch}
        aria-label="Recherche globale (⌘K)"
        title="Rechercher (⌘K)"
        className="w-9 h-9 shrink-0 rounded-full bg-white/15 hover:bg-white/25 border border-white/20 flex items-center justify-center text-white/80 hover:text-white transition-colors"
      >
        <Search className="w-4 h-4" />
      </button>

      {open && (
        <>
          {/* Fond sombre */}
          <div
            className="fixed inset-0 z-[9998] bg-black/50 backdrop-blur-sm cursor-pointer"
            onPointerDown={closeSearch}
          />
          {/* Modal */}
          <div className="fixed inset-0 z-[9999] flex items-start justify-center pt-[5vh] px-4 pointer-events-none">
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

              {/* Barre de filtres rapides */}
              <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 dark:border-gray-800">
                <button
                  onClick={() => setShowFilters((v) => !v)}
                  className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                    activeFilterCount > 0
                      ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-400"
                      : "border-gray-200 dark:border-slate-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800"
                  }`}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  Filtres
                  {activeFilterCount > 0 && (
                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-500 text-white text-[10px] font-bold">
                      {activeFilterCount}
                    </span>
                  )}
                  {showFilters ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
                {activeFilterCount > 0 && (
                  <button
                    onClick={resetFilters}
                    className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 px-2 py-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    Réinitialiser
                  </button>
                )}
                {results.length > 0 && (
                  <span className="ml-auto text-xs text-gray-400">
                    {results.length} projet{results.length > 1 ? "s" : ""}
                  </span>
                )}
              </div>

              {/* Panneau filtres avancés */}
              {showFilters && (
                <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 space-y-3 bg-gray-50/70 dark:bg-slate-800/50">

                  {/* Année */}
                  <div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 block mb-1.5">Année</span>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => setYearFilter("all")}
                        className={`text-xs font-medium px-3 py-1 rounded-full transition-colors ${
                          yearFilter === "all"
                            ? "bg-violet-500 text-white"
                            : "bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50"
                        }`}
                      >
                        Toutes
                      </button>
                      {availableYears.map((y) => (
                        <button
                          key={y}
                          onClick={() => setYearFilter(yearFilter === y ? "all" : y)}
                          className={`text-xs font-medium px-3 py-1 rounded-full transition-colors ${
                            yearFilter === y
                              ? "bg-violet-500 text-white"
                              : "bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50"
                          }`}
                        >
                          {y}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* État CMD */}
                  <div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 block mb-1.5">État CMD</span>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.keys(STATUS_CMD_COLORS).map((s) => {
                        const active = statusCMD.includes(s);
                        return (
                          <button
                            key={s}
                            onClick={() => toggleCMD(s)}
                            className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                              active
                                ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-400"
                                : "border-gray-200 dark:border-slate-600 text-gray-600 dark:text-gray-300 bg-white dark:bg-slate-700 hover:bg-gray-50 dark:hover:bg-slate-600"
                            }`}
                          >
                            {s}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* État Mesures */}
                  <div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 block mb-1.5">État Mesures</span>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.keys(STATUS_MESURES_COLORS).map((s) => {
                        const active = statusMesures.includes(s);
                        return (
                          <button
                            key={s}
                            onClick={() => toggleMesures(s)}
                            className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                              active
                                ? "border-cyan-500 bg-cyan-50 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300 dark:border-cyan-400"
                                : "border-gray-200 dark:border-slate-600 text-gray-600 dark:text-gray-300 bg-white dark:bg-slate-700 hover:bg-gray-50 dark:hover:bg-slate-600"
                            }`}
                          >
                            {s}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Toggles SAV / Soucis */}
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setAvecSAV((v) => !v)}
                      className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border-2 transition-colors ${
                        avecSAV
                          ? "border-red-500 bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                          : "border-gray-200 dark:border-slate-600 text-gray-600 dark:text-gray-300 bg-white dark:bg-slate-700"
                      }`}
                    >
                      <AlertCircle className="w-3.5 h-3.5" />
                      Avec SAV
                    </button>
                    <button
                      onClick={() => setAvecSoucis((v) => !v)}
                      className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border-2 transition-colors ${
                        avecSoucis
                          ? "border-orange-500 bg-orange-50 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300"
                          : "border-gray-200 dark:border-slate-600 text-gray-600 dark:text-gray-300 bg-white dark:bg-slate-700"
                      }`}
                    >
                      <AlertCircle className="w-3.5 h-3.5" />
                      Soucis montage
                    </button>
                  </div>
                </div>
              )}

              {/* Liste des résultats */}
              <div className="max-h-[55vh] overflow-y-auto">
                {!hasQuery && !hasFilters && (
                  <p className="text-center text-sm text-gray-400 py-10">
                    Tapez au moins 2 caractères ou activez un filtre
                  </p>
                )}
                {(hasQuery || hasFilters) && results.length === 0 && serverLoading && (
                  <p className="text-center text-sm text-gray-400 py-10">
                    Recherche en cours…
                  </p>
                )}
                {(hasQuery || hasFilters) && results.length === 0 && !serverLoading && (
                  <p className="text-center text-sm text-gray-400 py-10">
                    Aucun résultat
                    {hasQuery && <> pour <strong>« {query} »</strong></>}
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
                {projects.length} projet{projects.length > 1 ? "s" : ""} en cache
                {results.length > 0 && ` · ${results.length} résultat${results.length > 1 ? "s" : ""}`}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function ResultRow({ project: p, onSelect }: { project: Project; onSelect: (p: Project) => void }) {
  const cmdColor = STATUS_CMD_COLORS[p.etatCMD] || "bg-gray-100 text-gray-500 dark:bg-slate-700 dark:text-gray-300";
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
          {p.collaborateurs && (
            <div className="text-xs text-gray-400 mt-0.5">{p.collaborateurs}</div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {p.etatCMD && (
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cmdColor}`}>
              {p.etatCMD}
            </span>
          )}
          <ArrowRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-blue-500 transition-colors" />
        </div>
      </button>
    </li>
  );
}
