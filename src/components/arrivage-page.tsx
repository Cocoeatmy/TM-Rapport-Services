"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Truck, ChevronDown, ChevronUp, Loader2, Package, Camera, X, AlertCircle, Search } from "lucide-react";
import { STATUS_CMD_COLORS } from "@/lib/constants";

interface FileItem {
  name: string;
  url: string;
}

interface Project {
  id: string;
  projet: string;
  ofrTM: string;
  etatCMD: string;
  fournisseurs: string[];
  seriesCabines: string[];
  emplacementCabine: string;
  servCmdFournisseurs: string;
  cmdGrossiste: string;
  cmdTMUsine: string;
  arrivageGrossiste: string | null;
  arrivageTM: string | null;
  bonLivraison: string;
  photosCartons: FileItem[];
  nbCartons: number | null;
  nbCabines: number | null;
  commentairesMontages: string;
}

// Statuts exclus de la recherche Arrivage — projets déjà planifiés/terminés
// qui n'ont plus besoin de suivi d'arrivage.
const EXCLUDED_STATUTS = new Set([
  "Récéptionné - RDV à fixer",
  "RDV - fixé",
  "RDV - Attendre news",
  "Montage partiel",
  "Annulé",
  "Terminé",
]);

const ALL_STATUTS = [
  "En attente de mesures",
  "Cabines mesurées",
  "OFR envoyées sans mesures",
  "Cabines en CMD",
  "Cabines à recevoir",
  "Livraison partielle",
  "Cabine à aller chercher",
  "Récéptionné - RDV à fixer",
  "RDV - fixé",
  "RDV - Attendre news",
  "Montage partiel",
  "Soucis montage",
  "Annulé",
  "Terminé",
];

function toInputDate(iso: string | null): string {
  if (!iso) return "";
  // ISO date: "2024-03-15" or "2024-03-15T..." → take first 10 chars
  return iso.slice(0, 10);
}

function formatDateDisplay(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function ArrivagePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Per-project form state
  const [forms, setForms] = useState<Record<string, Partial<Project & { photosCartonsUrls: string[] }>>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saveSuccess, setSaveSuccess] = useState<Record<string, boolean>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [emplacementOptions, setEmplacementOptions] = useState<string[]>([]);

  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Load projects — utilise all-active pour avoir TOUS les projets disponibles
  // (pas uniquement les CMD), sinon la recherche manque les mesures, SAV, etc.
  useEffect(() => {
    setLoading(true);
    fetch("/api/projects/all-active")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: Project[]) => {
        setProjects(data);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  // Load emplacement options
  useEffect(() => {
    fetch("/api/projects/field-options?fields=Emplacement+de+cabine")
      .then((r) => r.json())
      .then((data) => {
        const opts = data?.["Emplacement de cabine"] || [];
        setEmplacementOptions(Array.isArray(opts) ? opts : []);
      })
      .catch(() => {});
  }, []);

  const normalize = (s: string) =>
    (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

  // Aucun projet affiché sans recherche active.
  // Avec recherche : cherche dans tous les projets SAUF ceux dont le statut
  // indique que l'arrivage est déjà passé ou le projet annulé/terminé.
  const searchableProjects = projects.filter((p) => !EXCLUDED_STATUTS.has(p.etatCMD));

  const filteredProjects = search.trim()
    ? (() => {
        const q = normalize(search.trim());
        return searchableProjects.filter((p) =>
          normalize(p.projet).includes(q) ||
          normalize(p.ofrTM).includes(q) ||
          normalize(p.etatCMD).includes(q) ||
          (p.fournisseurs || []).some((f) => normalize(f).includes(q)) ||
          (p.seriesCabines || []).some((s) => normalize(s).includes(q)) ||
          normalize(p.emplacementCabine).includes(q) ||
          normalize(p.servCmdFournisseurs).includes(q) ||
          normalize(p.cmdGrossiste).includes(q) ||
          normalize(p.cmdTMUsine).includes(q) ||
          normalize(p.arrivageTM || "").includes(q) ||
          normalize(p.arrivageGrossiste || "").includes(q) ||
          normalize(p.bonLivraison).includes(q) ||
          String(p.nbCartons ?? "").includes(q)
        );
      })()
    : [];

  const getForm = useCallback(
    (p: Project) => {
      if (forms[p.id]) return forms[p.id];
      return {
        etatCMD: p.etatCMD,
        emplacementCabine: p.emplacementCabine,
        arrivageTM: toInputDate(p.arrivageTM),
        arrivageGrossiste: toInputDate(p.arrivageGrossiste),
        servCmdFournisseurs: p.servCmdFournisseurs,
        cmdGrossiste: p.cmdGrossiste,
        cmdTMUsine: p.cmdTMUsine,
        bonLivraison: p.bonLivraison,
        nbCartons: p.nbCartons,
        commentairesMontages: p.commentairesMontages || "",
        photosCartonsUrls: p.photosCartons.map((f) => f.url),
      };
    },
    [forms]
  );

  const setFormField = (id: string, field: string, value: unknown) => {
    setForms((prev) => ({
      ...prev,
      [id]: {
        ...getForm(projects.find((p) => p.id === id)!),
        ...prev[id],
        [field]: value,
      },
    }));
  };

  const handleExpand = (p: Project) => {
    if (expandedId === p.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(p.id);
    // Initialize form if not already
    if (!forms[p.id]) {
      setForms((prev) => ({
        ...prev,
        [p.id]: {
          etatCMD: p.etatCMD,
          emplacementCabine: p.emplacementCabine,
          arrivageTM: toInputDate(p.arrivageTM),
          arrivageGrossiste: toInputDate(p.arrivageGrossiste),
          servCmdFournisseurs: p.servCmdFournisseurs,
          cmdGrossiste: p.cmdGrossiste,
          cmdTMUsine: p.cmdTMUsine,
          bonLivraison: p.bonLivraison,
          nbCartons: p.nbCartons,
          commentairesMontages: p.commentairesMontages || "",
          photosCartonsUrls: p.photosCartons.map((f) => f.url),
        },
      }));
    }
  };

  const handleSave = async (p: Project) => {
    const f = forms[p.id];
    if (!f) return;
    setSaving((prev) => ({ ...prev, [p.id]: true }));
    try {
      const body: Record<string, unknown> = {};
      if (f.etatCMD !== undefined) body.etatCMD = f.etatCMD;
      if (f.emplacementCabine !== undefined) body.emplacementCabine = f.emplacementCabine;
      if (f.arrivageTM !== undefined) body.arrivageTM = (f.arrivageTM as string) || null;
      if (f.arrivageGrossiste !== undefined) body.arrivageGrossiste = (f.arrivageGrossiste as string) || null;
      if (f.servCmdFournisseurs !== undefined) body.servCmdFournisseurs = f.servCmdFournisseurs;
      if (f.cmdGrossiste !== undefined) body.cmdGrossiste = f.cmdGrossiste;
      if (f.cmdTMUsine !== undefined) body.cmdTMUsine = f.cmdTMUsine;
      if (f.bonLivraison !== undefined) body.bonLivraison = f.bonLivraison;
      if (f.nbCartons !== undefined) body.nbCartons = f.nbCartons;
      if ((f as any).commentairesMontages !== undefined) body.commentairesMontages = (f as any).commentairesMontages;
      if ((f as any).photosCartonsUrls !== undefined) {
        body.photosCartons = ((f as any).photosCartonsUrls as string[]).map((url, i) => ({
          name: `carton-${i + 1}`,
          url,
        }));
      }

      const res = await fetch(`/api/projects/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      // Update local project list
      setProjects((prev) =>
        prev.map((proj) =>
          proj.id === p.id
            ? {
                ...proj,
                etatCMD: (f.etatCMD as string) ?? proj.etatCMD,
                emplacementCabine: (f.emplacementCabine as string) ?? proj.emplacementCabine,
                arrivageTM: (f.arrivageTM as string) || null,
                arrivageGrossiste: (f.arrivageGrossiste as string) || null,
                servCmdFournisseurs: (f.servCmdFournisseurs as string) ?? proj.servCmdFournisseurs,
                cmdGrossiste: (f.cmdGrossiste as string) ?? proj.cmdGrossiste,
                cmdTMUsine: (f.cmdTMUsine as string) ?? proj.cmdTMUsine,
                bonLivraison: (f.bonLivraison as string) ?? proj.bonLivraison,
                nbCartons: f.nbCartons !== undefined ? (f.nbCartons as number | null) : proj.nbCartons,
                commentairesMontages: (f as any).commentairesMontages !== undefined ? (f as any).commentairesMontages as string : proj.commentairesMontages,
                photosCartons: ((f as any).photosCartonsUrls as string[] | undefined)?.map((url, i) => ({
                  name: `carton-${i + 1}`,
                  url,
                })) ?? proj.photosCartons,
              }
            : proj
        )
      );

      setSaveSuccess((prev) => ({ ...prev, [p.id]: true }));
      setTimeout(() => setSaveSuccess((prev) => ({ ...prev, [p.id]: false })), 2500);
    } catch (e: unknown) {
      alert(`Erreur lors de l'enregistrement : ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving((prev) => ({ ...prev, [p.id]: false }));
    }
  };

  const handleUpload = async (p: Project, files: FileList) => {
    if (!files.length) return;
    setUploading((prev) => ({ ...prev, [p.id]: true }));
    try {
      const formData = new FormData();
      Array.from(files).forEach((file) => formData.append("files", file));
      formData.append("projectId", p.id);
      formData.append("category", "cartons");
      formData.append("notionField", "État des cartons réceptionnés");

      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const newUrls: string[] = (data.uploaded || data.files || []).map((f: { url: string }) => f.url);

      const currentUrls: string[] = (forms[p.id] as any)?.photosCartonsUrls ?? p.photosCartons.map((f) => f.url);
      const merged = [...currentUrls, ...newUrls];

      setForms((prev) => ({
        ...prev,
        [p.id]: {
          ...getForm(p),
          ...prev[p.id],
          photosCartonsUrls: merged,
        },
      }));

      // Also update the local project list photos immediately
      setProjects((prev) =>
        prev.map((proj) =>
          proj.id === p.id
            ? { ...proj, photosCartons: merged.map((url, i) => ({ name: `carton-${i + 1}`, url })) }
            : proj
        )
      );
    } catch (e: unknown) {
      alert(`Erreur upload : ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setUploading((prev) => ({ ...prev, [p.id]: false }));
    }
  };

  const removePhoto = (projectId: string, url: string) => {
    const p = projects.find((proj) => proj.id === projectId);
    if (!p) return;
    const currentUrls: string[] = (forms[projectId] as any)?.photosCartonsUrls ?? p.photosCartons.map((f) => f.url);
    const updated = currentUrls.filter((u) => u !== url);
    setForms((prev) => ({
      ...prev,
      [projectId]: {
        ...getForm(p),
        ...prev[projectId],
        photosCartonsUrls: updated,
      },
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 py-10 text-red-600 dark:text-red-400">
        <AlertCircle className="w-5 h-5" />
        <span>Erreur : {error}</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Truck className="w-5 h-5 text-sky-500 shrink-0" />
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">Arrivage cabines</h2>
        <span className="text-xs text-gray-400 dark:text-gray-500">
          {filteredProjects.length} projet{filteredProjects.length !== 1 ? "s" : ""}
        </span>
        {/* Barre de recherche */}
        <div className="relative flex-1 min-w-[200px] max-w-lg">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher projet, N° OFR, fournisseur, état, emplacement…"
            className="w-full pl-9 pr-8 py-2 text-sm rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-sky-400/60"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {/* Toggle tout afficher */}
        <button
          onClick={() => setShowAll((v) => !v)}
          className={`text-xs px-3 py-1.5 rounded-lg border transition-colors shrink-0 ${
            showAll
              ? "border-sky-400 text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-900/20"
              : "border-gray-200 dark:border-slate-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-700"
          }`}
        >
          {showAll ? "Tous les projets" : "Tout afficher"}
        </button>
      </div>

      {!search.trim() ? (
        <div className="py-20 text-center space-y-3">
          <Search className="w-10 h-10 text-gray-200 dark:text-slate-600 mx-auto" />
          <p className="text-sm text-gray-400 dark:text-gray-500">
            Recherchez un projet pour enregistrer un arrivage
          </p>
          <p className="text-xs text-gray-300 dark:text-gray-600">
            N° OFR, nom du projet, fournisseur, N° CMD…
          </p>
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="py-16 text-center text-gray-400 dark:text-gray-500 text-sm">
          Aucun projet trouvé pour «&nbsp;{search}&nbsp;»
        </div>
      ) : null}

      {/* Project cards */}
      {filteredProjects.map((p) => {
        const isExpanded = expandedId === p.id;
        const statusColor = STATUS_CMD_COLORS[p.etatCMD] || "bg-gray-100 text-gray-700";
        const f = forms[p.id];

        return (
          <div
            key={p.id}
            className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden"
          >
            {/* Card header — clicable */}
            <button
              onClick={() => handleExpand(p)}
              className="w-full text-left px-5 py-4 flex items-start gap-3 hover:bg-gray-50 dark:hover:bg-slate-750 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm leading-tight">
                    {p.projet || "Sans nom"}
                  </span>
                  {p.ofrTM && (
                    <span className="text-[10px] font-mono bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded">
                      OFR {p.ofrTM}
                    </span>
                  )}
                </div>

                {/* Fournisseurs + séries + nb cabines */}
                {(p.fournisseurs.length > 0 || p.seriesCabines.length > 0 || p.nbCabines) && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {p.fournisseurs.map((f) => (
                      <span key={f} className="text-[10px] px-1.5 py-0.5 rounded-md bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium">
                        {f}
                      </span>
                    ))}
                    {p.seriesCabines.map((s) => (
                      <span key={s} className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                        {s}
                      </span>
                    ))}
                    {p.nbCabines != null && p.nbCabines > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-medium">
                        {p.nbCabines} cabine{p.nbCabines > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                )}

                {/* Dates arrivage */}
                <div className="flex flex-wrap gap-3 mt-1.5">
                  {p.arrivageTM && (
                    <span className="text-[11px] text-gray-500 dark:text-gray-400">
                      Arrivage TM&nbsp;: <span className="font-medium text-gray-700 dark:text-gray-200">{formatDateDisplay(p.arrivageTM)}</span>
                    </span>
                  )}
                  {p.arrivageGrossiste && (
                    <span className="text-[11px] text-gray-500 dark:text-gray-400">
                      Grossiste&nbsp;: <span className="font-medium text-gray-700 dark:text-gray-200">{formatDateDisplay(p.arrivageGrossiste)}</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Status badge + chevron */}
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${statusColor}`}>
                  {p.etatCMD || "—"}
                </span>
                {isExpanded ? (
                  <ChevronUp className="w-4 h-4 text-gray-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                )}
              </div>
            </button>

            {/* Accordion — formulaire */}
            {isExpanded && (
              <div className="border-t border-gray-100 dark:border-slate-700 px-5 py-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* État CMD */}
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      État CMD
                    </label>
                    <select
                      value={(f?.etatCMD as string) ?? p.etatCMD}
                      onChange={(e) => setFormField(p.id, "etatCMD", e.target.value)}
                      className="w-full text-sm border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {ALL_STATUTS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Emplacement cabine */}
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Emplacement cabine
                    </label>
                    <input
                      type="text"
                      list={`emplacement-opts-${p.id}`}
                      value={(f?.emplacementCabine as string) ?? p.emplacementCabine}
                      onChange={(e) => setFormField(p.id, "emplacementCabine", e.target.value)}
                      placeholder="Ex: Atelier TM, Chantier..."
                      className="w-full text-sm border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {emplacementOptions.length > 0 && (
                      <datalist id={`emplacement-opts-${p.id}`}>
                        {emplacementOptions.map((opt) => (
                          <option key={opt} value={opt} />
                        ))}
                      </datalist>
                    )}
                  </div>

                  {/* Arrivage TM */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Date arrivage TM
                    </label>
                    <input
                      type="date"
                      value={(f?.arrivageTM as string) ?? toInputDate(p.arrivageTM)}
                      onChange={(e) => setFormField(p.id, "arrivageTM", e.target.value)}
                      className="w-full text-sm border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Arrivage Grossiste */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Date arrivage Grossiste
                    </label>
                    <input
                      type="date"
                      value={(f?.arrivageGrossiste as string) ?? toInputDate(p.arrivageGrossiste)}
                      onChange={(e) => setFormField(p.id, "arrivageGrossiste", e.target.value)}
                      className="w-full text-sm border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* N° CMD Fournisseurs — affiché uniquement si renseigné */}
                  {p.servCmdFournisseurs && (
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        N° CMD Fournisseurs
                      </label>
                      <input
                        type="text"
                        value={(f?.servCmdFournisseurs as string) ?? p.servCmdFournisseurs}
                        onChange={(e) => setFormField(p.id, "servCmdFournisseurs", e.target.value)}
                        className="w-full text-sm border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  )}

                  {/* N° CMD Grossiste — affiché uniquement si renseigné */}
                  {p.cmdGrossiste && (
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        N° CMD Grossiste
                      </label>
                      <input
                        type="text"
                        value={(f?.cmdGrossiste as string) ?? p.cmdGrossiste}
                        onChange={(e) => setFormField(p.id, "cmdGrossiste", e.target.value)}
                        className="w-full text-sm border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  )}

                  {/* N° CMD TM – Usine — affiché uniquement si renseigné */}
                  {p.cmdTMUsine && (
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        N° CMD TM – Usine
                      </label>
                      <input
                        type="text"
                        value={(f?.cmdTMUsine as string) ?? p.cmdTMUsine}
                        onChange={(e) => setFormField(p.id, "cmdTMUsine", e.target.value)}
                        className="w-full text-sm border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  )}

                  {/* Bon de livraison */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Bon de livraison
                    </label>
                    <input
                      type="text"
                      value={(f?.bonLivraison as string) ?? p.bonLivraison}
                      onChange={(e) => setFormField(p.id, "bonLivraison", e.target.value)}
                      className="w-full text-sm border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Nb. de cartons */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Nb. de cartons
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={f?.nbCartons != null ? String(f.nbCartons) : p.nbCartons != null ? String(p.nbCartons) : ""}
                      onChange={(e) =>
                        setFormField(p.id, "nbCartons", e.target.value === "" ? null : Number(e.target.value))
                      }
                      className="w-full text-sm border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Photos cartons */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                      <Camera className="w-3.5 h-3.5" />
                      État des cartons réceptionnés
                    </label>
                    <div className="flex items-center gap-2">
                      {uploading[p.id] && (
                        <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                      )}
                      <button
                        type="button"
                        onClick={() => fileInputRefs.current[p.id]?.click()}
                        disabled={uploading[p.id]}
                        className="text-xs px-3 py-1 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors disabled:opacity-50"
                      >
                        Ajouter photos
                      </button>
                      <input
                        ref={(el) => { fileInputRefs.current[p.id] = el; }}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files) handleUpload(p, e.target.files);
                          e.target.value = "";
                        }}
                      />
                    </div>
                  </div>

                  {/* Photos grid */}
                  {(() => {
                    const urls: string[] =
                      (forms[p.id] as any)?.photosCartonsUrls ??
                      p.photosCartons.map((ph) => ph.url);
                    return urls.length > 0 ? (
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                        {urls.map((url) => (
                          <div key={url} className="relative group aspect-square">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={url}
                              alt="Carton"
                              className="w-full h-full object-cover rounded-lg"
                            />
                            <button
                              type="button"
                              onClick={() => removePhoto(p.id, url)}
                              className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Supprimer"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex items-center justify-center py-6 border-2 border-dashed border-gray-200 dark:border-slate-600 rounded-xl text-gray-400 dark:text-gray-500 text-xs gap-2">
                        <Package className="w-4 h-4" />
                        Aucune photo de carton
                      </div>
                    );
                  })()}
                </div>

                {/* Commentaires de montage */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Commentaires montage
                  </label>
                  <textarea
                    rows={4}
                    value={(forms[p.id] as any)?.commentairesMontages ?? (p.commentairesMontages || "")}
                    onChange={(e) => setFormField(p.id, "commentairesMontages", e.target.value)}
                    placeholder="Ex : Livraison partielle — cabines S.01, S.02 et S.03 reçues. S.04 manquante, à relivrer..."
                    className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400/60 resize-none"
                  />
                </div>

                {/* Save button */}
                <div className="flex items-center justify-end gap-3 pt-2">
                  {saveSuccess[p.id] && (
                    <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                      Enregistré !
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleSave(p)}
                    disabled={saving[p.id]}
                    className="flex items-center gap-2 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors disabled:opacity-60"
                  >
                    {saving[p.id] && <Loader2 className="w-4 h-4 animate-spin" />}
                    Enregistrer
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
