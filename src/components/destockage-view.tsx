"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive, Package, Plus, Search, Loader2, Check, Trash2, Undo2,
  Calendar, MapPin, Hash, FileText, Camera, X, Banknote, Ruler, Pencil,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

// ── Types ─────────────────────────────────────────────────────────────────────

interface StockCabine {
  id: string;
  serie: string;
  fournisseur: string;
  quantity: number;
  emplacement: string;
  dateArrivee: string;
  commentaires: string;
  status: "stock" | "destocke";
  destockedAt: string;
  destockedBy: string;
  destockedProjectRef: string;
  createdAt: number;
  createdBy: string;
  photoCabine?: string;
  mesuresCabinePdf?: string;
  mesuresCabinePdfName?: string;
  configuration?: string[];
  version?: string[];
  typeVerre?: string[];
  traitementVerre?: string[];
  couleur?: string[];
  prixAchat?: number;
  prixVente?: number;
  mesuresApprox?: string;
  numeroArticle?: string;
  typeMontage?: string[];
}

type Filter = "all" | "stock" | "destocke";

// ── Options ───────────────────────────────────────────────────────────────────

const CONFIG_OPTIONS     = ["Niche", "Angle", "Quart de cercle", "Pentagonale", "Baignoire", 'Configuration "U"'];
const VERSION_OPTIONS    = ["Avec profiles", "Sans profiles", "Profils UP"];
const VERRE_OPTIONS      = ["Transparent", "Satiné", "Discret", "Discret 2/3", "Miroir", "Fumé"];
const TRAITEMENT_OPTIONS = ["Sans traitement", "Traitement de surface du verre", "Traitement intern du verre"];
const COULEUR_OPTIONS    = ["Argent mat", "Argent brillant", "Noir mat", "Inox", "Blanc", "Couleurs brushed"];
const MONTAGE_OPTIONS    = ["Montage sur receveur de douche", "Montage sur carrelage"];

// ── MultiSelect ───────────────────────────────────────────────────────────────

function MultiSelect({
  label, options, value, onChange, color = "blue",
}: {
  label: string;
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
  color?: "blue" | "violet" | "cyan" | "green" | "amber";
}) {
  const colorMap = {
    blue:   { on: "bg-blue-500 text-white border-blue-500",     off: "border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-blue-300" },
    violet: { on: "bg-violet-500 text-white border-violet-500", off: "border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-violet-300" },
    cyan:   { on: "bg-cyan-500 text-white border-cyan-500",     off: "border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-cyan-300" },
    green:  { on: "bg-green-600 text-white border-green-600",   off: "border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-green-400" },
    amber:  { on: "bg-amber-500 text-white border-amber-500",   off: "border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-amber-300" },
  };
  const cls = colorMap[color];
  const toggle = (opt: string) =>
    onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt]);

  return (
    <div>
      <Label className="text-xs text-gray-600 dark:text-gray-300">{label}</Label>
      <div className="flex flex-wrap gap-1.5 mt-1.5">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => toggle(opt)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-all ${value.includes(opt) ? cls.on : cls.off}`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── FileUploadField ───────────────────────────────────────────────────────────

function FileUploadField({
  label, type, value, valueName, onUpload, onRemove,
}: {
  label: string;
  type: "photo" | "pdf";
  value: string;
  valueName?: string;
  onUpload: (url: string, name?: string) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("type", type);
      const res = await fetch("/api/destockage-upload", { method: "POST", body: fd });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || "Erreur upload");
        return;
      }
      const data = await res.json();
      onUpload(data.url as string, data.name as string);
      toast.success(type === "photo" ? "Photo uploadée" : "PDF uploadé");
    } catch {
      toast.error("Erreur réseau");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div>
      <Label className="text-xs text-gray-600 dark:text-gray-300">{label}</Label>
      <div className="mt-1.5">
        {value ? (
          <div className="flex items-center gap-2">
            {type === "photo" ? (
              <a href={value} target="_blank" rel="noopener noreferrer" title="Voir en grand">
                <img src={value} alt="Photo" className="w-16 h-16 object-cover rounded-lg border border-gray-200 dark:border-gray-600 hover:opacity-90 transition-opacity" />
              </a>
            ) : (
              <a href={value} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline max-w-[200px] truncate">
                <FileText className="w-4 h-4 shrink-0" />
                {valueName || "Mesures.pdf"}
              </a>
            )}
            <button type="button" onClick={onRemove}
              className="w-6 h-6 flex items-center justify-center rounded-full text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 transition-colors" title="Supprimer">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 text-xs text-gray-500 dark:text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-all disabled:opacity-50">
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : type === "photo" ? <Camera className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
            {uploading ? "Envoi en cours…" : label}
          </button>
        )}
        <input ref={inputRef} type="file" accept={type === "photo" ? "image/*" : "application/pdf"} className="hidden" onChange={handleChange} />
      </div>
    </div>
  );
}

// ── Form state ────────────────────────────────────────────────────────────────

type FormState = {
  serie: string;
  fournisseur: string;
  quantity: number;
  emplacement: string;
  dateArrivee: string;
  commentaires: string;
  photoCabine: string;
  mesuresCabinePdf: string;
  mesuresCabinePdfName: string;
  configuration: string[];
  version: string[];
  typeVerre: string[];
  traitementVerre: string[];
  couleur: string[];
  prixAchat: string;
  prixVente: string;
  mesuresApprox: string;
  numeroArticle: string;
  typeMontage: string[];
};

const EMPTY_FORM: FormState = {
  serie: "", fournisseur: "", quantity: 1, emplacement: "",
  dateArrivee: new Date().toISOString().slice(0, 10),
  commentaires: "", photoCabine: "", mesuresCabinePdf: "",
  mesuresCabinePdfName: "", configuration: [], version: [],
  typeVerre: [], traitementVerre: [], couleur: [],
  prixAchat: "", prixVente: "", mesuresApprox: "", numeroArticle: "",
  typeMontage: [],
};

// ── Main component ─────────────────────────────────────────────────────────────

export function DestockageView({ isAdmin }: { isAdmin: boolean }) {
  const [entries, setEntries]       = useState<StockCabine[]>([]);
  const [loading, setLoading]       = useState(true);
  const [filter, setFilter]         = useState<Filter>("stock");
  const [search, setSearch]         = useState("");
  const [showAdd, setShowAdd]       = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [form, setForm]             = useState<FormState>(EMPTY_FORM);
  // Photo hover zoom — position fixe pour échapper aux stacking contexts (backdrop-filter)
  const [hoveredPhoto, setHoveredPhoto] = useState<{ src: string; x: number; y: number } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/destockage", { cache: "no-store" });
      const data = await res.json();
      if (Array.isArray(data)) setEntries(data);
    } catch {
      toast.error("Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return entries.filter((e) => {
      if (filter !== "all" && e.status !== filter) return false;
      if (!q) return true;
      return [
        e.serie, e.fournisseur, e.emplacement, e.commentaires,
        e.destockedProjectRef, e.mesuresApprox,
        ...(e.configuration || []), ...(e.version || []),
        ...(e.typeVerre || []), ...(e.traitementVerre || []), ...(e.couleur || []),
      ].some((s) => (s || "").toLowerCase().includes(q));
    });
  }, [entries, filter, search]);

  const counts = useMemo(() => {
    const inStock = entries.filter((e) => e.status === "stock");
    return {
      all: entries.length,
      stock: inStock.length,
      destocke: entries.filter((e) => e.status === "destocke").length,
      totalCabines: inStock.reduce((s, e) => s + (e.quantity || 0), 0),
      valeurBrut: inStock.reduce((s, e) => s + (e.prixVente ?? 0) * (e.quantity || 1), 0),
      valeurNet:  inStock.reduce((s, e) => s + (e.prixAchat ?? 0) * (e.quantity || 1), 0),
    };
  }, [entries]);

  const resetForm = () => setForm({ ...EMPTY_FORM, dateArrivee: new Date().toISOString().slice(0, 10) });

  const handleSubmit = async () => {
    if (!form.serie.trim()) { toast.error("Série requise"); return; }
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        prixAchat: form.prixAchat !== "" ? parseFloat(form.prixAchat) : undefined,
        prixVente: form.prixVente !== "" ? parseFloat(form.prixVente) : undefined,
        ...(editingId ? { id: editingId } : {}),
      };
      const res = await fetch("/api/destockage", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Erreur");
        return;
      }
      toast.success(editingId ? "Entrée modifiée" : "Cabine ajoutée au stock");
      setShowAdd(false);
      setEditingId(null);
      resetForm();
      refresh();
    } finally {
      setSubmitting(false);
    }
  };

  const handleDestock = async (entry: StockCabine) => {
    const ref = prompt(
      `Déstocker « ${entry.serie}${entry.quantity > 1 ? ` × ${entry.quantity}` : ""} » — référence projet ?`,
      entry.destockedProjectRef,
    );
    if (ref === null) return;
    try {
      const res = await fetch("/api/destockage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: entry.id, status: "destocke", destockedProjectRef: ref }),
      });
      if (res.ok) { toast.success("Cabine déstockée"); refresh(); }
      else toast.error("Erreur lors du déstockage");
    } catch { toast.error("Erreur réseau"); }
  };

  const handleRestock = async (entry: StockCabine) => {
    if (!confirm(`Remettre « ${entry.serie} » en stock ?`)) return;
    try {
      const res = await fetch("/api/destockage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: entry.id, status: "stock" }),
      });
      if (res.ok) { toast.success("Remis en stock"); refresh(); }
    } catch {}
  };

  const handleDelete = async (entry: StockCabine) => {
    if (!confirm(`Supprimer définitivement « ${entry.serie} » ?`)) return;
    try {
      const res = await fetch("/api/destockage", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: entry.id }),
      });
      if (res.ok) { toast.success("Entrée supprimée"); refresh(); }
      else toast.error("Admin requis");
    } catch {}
  };

  const startEdit = (entry: StockCabine) => {
    setEditingId(entry.id);
    setForm({
      serie: entry.serie,
      fournisseur: entry.fournisseur,
      quantity: entry.quantity,
      emplacement: entry.emplacement,
      dateArrivee: entry.dateArrivee,
      commentaires: entry.commentaires,
      photoCabine: entry.photoCabine || "",
      mesuresCabinePdf: entry.mesuresCabinePdf || "",
      mesuresCabinePdfName: entry.mesuresCabinePdfName || "",
      configuration: entry.configuration || [],
      version: entry.version || [],
      typeVerre: entry.typeVerre || [],
      traitementVerre: entry.traitementVerre || [],
      couleur: entry.couleur || [],
      prixAchat: entry.prixAchat != null ? String(entry.prixAchat) : "",
      prixVente: entry.prixVente != null ? String(entry.prixVente) : "",
      mesuresApprox: entry.mesuresApprox || "",
      numeroArticle: entry.numeroArticle || "",
      typeMontage: entry.typeMontage || [],
    });
    setShowAdd(true);
    setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 50);
  };

  const formatDate = (d: string) => {
    if (!d) return "---";
    return new Date(d + "T00:00:00").toLocaleDateString("fr-CH", { day: "2-digit", month: "short", year: "numeric" });
  };

  const formatPrix = (n?: number) =>
    n != null ? `CHF ${n.toLocaleString("fr-CH", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}` : null;

  return (
    <div className="space-y-4">
      {/* Aperçu photo agrandi — position fixed pour échapper aux stacking contexts */}
      {hoveredPhoto && (
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{ left: hoveredPhoto.x, top: hoveredPhoto.y }}
        >
          <img
            src={hoveredPhoto.src}
            alt="Aperçu cabine"
            className="w-56 h-56 object-cover rounded-2xl shadow-2xl border-2 border-white dark:border-gray-700"
          />
        </div>
      )}

      {/* En-tête */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Package className="w-5 h-5 text-blue-600 dark:text-cyan-400" />
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Déstockage</h1>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
          <span>{counts.stock} entrée{counts.stock > 1 ? "s" : ""} en stock{counts.totalCabines > 0 && ` · ${counts.totalCabines} cabines`}</span>
          {(counts.valeurBrut > 0 || counts.valeurNet > 0) && (
            <span className="flex items-center gap-3 text-xs font-medium">
              <span className="flex items-center gap-1">
                <span className="text-gray-400">BRUT</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                  CHF {counts.valeurBrut.toLocaleString("fr-CH", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </span>
              </span>
              <span className="text-gray-300 dark:text-gray-600">|</span>
              <span className="flex items-center gap-1">
                <span className="text-gray-400">NET</span>
                <span className="text-blue-600 dark:text-blue-400 font-semibold">
                  CHF {counts.valeurNet.toLocaleString("fr-CH", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </span>
              </span>
            </span>
          )}
        </div>
        <div className="flex-1" />
        <Button onClick={() => { setEditingId(null); resetForm(); setShowAdd(true); }} className="gap-2 glass-btn">
          <Plus className="w-4 h-4" />
          Nouvelle entrée
        </Button>
      </div>

      {/* Filtres + recherche */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex glass-tabs rounded-xl p-1">
          {([
            { id: "stock" as const,    label: `En stock (${counts.stock})` },
            { id: "destocke" as const, label: `Déstockés (${counts.destocke})` },
            { id: "all" as const,      label: `Tous (${counts.all})` },
          ]).map((f) => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg transition-all ${
                filter === f.id
                  ? "glass-tab-active text-[#1e3a5f] dark:text-white"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              }`}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative max-w-sm flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input placeholder="Rechercher série, fournisseur…" className="pl-9 h-10 rounded-xl glass-input"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {/* ── Formulaire ── */}
      {showAdd && (
        <div className="glass-card rounded-2xl p-5 space-y-4">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">
            {editingId ? "Modifier l'entrée" : "Nouvelle entrée stock"}
          </h3>

          {/* Identité */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-600 dark:text-gray-300">Série *</Label>
              <Input value={form.serie} onChange={(e) => setForm({ ...form, serie: e.target.value })}
                placeholder="Ex: Multi-S 4000" className="mt-1 h-10 glass-input" />
            </div>
            <div>
              <Label className="text-xs text-gray-600 dark:text-gray-300">Fournisseur</Label>
              <Input value={form.fournisseur} onChange={(e) => setForm({ ...form, fournisseur: e.target.value })}
                placeholder="Ex: Duka" className="mt-1 h-10 glass-input" />
            </div>
            <div>
              <Label className="text-xs text-gray-600 dark:text-gray-300">Numéro d&apos;article</Label>
              <Input value={form.numeroArticle} onChange={(e) => setForm({ ...form, numeroArticle: e.target.value })}
                placeholder="Ex: 12345-A" className="mt-1 h-10 glass-input" />
            </div>
            <div>
              <Label className="text-xs text-gray-600 dark:text-gray-300">Quantité</Label>
              <Input type="number" min="1" value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: Math.max(1, parseInt(e.target.value || "1", 10)) })}
                className="mt-1 h-10 glass-input" />
            </div>
            <div>
              <Label className="text-xs text-gray-600 dark:text-gray-300">Date d&apos;arrivée</Label>
              <Input type="date" value={form.dateArrivee}
                onChange={(e) => setForm({ ...form, dateArrivee: e.target.value })}
                className="mt-1 h-10 glass-input" />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs text-gray-600 dark:text-gray-300">Emplacement</Label>
              <Input value={form.emplacement} onChange={(e) => setForm({ ...form, emplacement: e.target.value })}
                placeholder="Ex: Dépôt TM Yverdon — Box 3" className="mt-1 h-10 glass-input" />
            </div>
          </div>

          <div className="h-px bg-gray-100 dark:bg-gray-700" />

          {/* Caractéristiques */}
          <div className="space-y-3">
            <MultiSelect label="Configuration" options={CONFIG_OPTIONS}
              value={form.configuration} onChange={(v) => setForm({ ...form, configuration: v })} color="violet" />
            <MultiSelect label="Type de montage" options={MONTAGE_OPTIONS}
              value={form.typeMontage} onChange={(v) => setForm({ ...form, typeMontage: v })} color="blue" />
            <MultiSelect label="Version" options={VERSION_OPTIONS}
              value={form.version} onChange={(v) => setForm({ ...form, version: v })} color="blue" />
            <MultiSelect label="Type de verre" options={VERRE_OPTIONS}
              value={form.typeVerre} onChange={(v) => setForm({ ...form, typeVerre: v })} color="cyan" />
            <MultiSelect label="Traitement de verre" options={TRAITEMENT_OPTIONS}
              value={form.traitementVerre} onChange={(v) => setForm({ ...form, traitementVerre: v })} color="green" />
            <MultiSelect label="Couleur / Finition" options={COULEUR_OPTIONS}
              value={form.couleur} onChange={(v) => setForm({ ...form, couleur: v })} color="amber" />
          </div>

          <div className="h-px bg-gray-100 dark:bg-gray-700" />

          {/* Prix + mesures */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-600 dark:text-gray-300">Prix d&apos;achat (CHF)</Label>
              <Input type="number" min="0" step="0.01" placeholder="Ex: 450.00"
                value={form.prixAchat} onChange={(e) => setForm({ ...form, prixAchat: e.target.value })}
                className="mt-1 h-10 glass-input" />
            </div>
            <div>
              <Label className="text-xs text-gray-600 dark:text-gray-300">Prix de vente (CHF)</Label>
              <Input type="number" min="0" step="0.01" placeholder="Ex: 750.00"
                value={form.prixVente} onChange={(e) => setForm({ ...form, prixVente: e.target.value })}
                className="mt-1 h-10 glass-input" />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs text-gray-600 dark:text-gray-300">Mesures approximatives</Label>
              <Input value={form.mesuresApprox} onChange={(e) => setForm({ ...form, mesuresApprox: e.target.value })}
                placeholder="Ex: 90×90 cm, H=200 cm" className="mt-1 h-10 glass-input" />
            </div>
          </div>

          <div className="h-px bg-gray-100 dark:bg-gray-700" />

          {/* Fichiers */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FileUploadField label="Photo cabine" type="photo" value={form.photoCabine}
              onUpload={(url) => setForm({ ...form, photoCabine: url })}
              onRemove={() => setForm({ ...form, photoCabine: "" })} />
            <FileUploadField label="Fiche de mesures (PDF)" type="pdf"
              value={form.mesuresCabinePdf} valueName={form.mesuresCabinePdfName}
              onUpload={(url, name) => setForm({ ...form, mesuresCabinePdf: url, mesuresCabinePdfName: name || "" })}
              onRemove={() => setForm({ ...form, mesuresCabinePdf: "", mesuresCabinePdfName: "" })} />
          </div>

          <div className="h-px bg-gray-100 dark:bg-gray-700" />

          {/* Commentaires */}
          <div>
            <Label className="text-xs text-gray-600 dark:text-gray-300">Commentaires</Label>
            <Input value={form.commentaires} onChange={(e) => setForm({ ...form, commentaires: e.target.value })}
              placeholder="Ex: OFR associée, particularités…" className="mt-1 h-10 glass-input" />
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <Button variant="outline" onClick={() => { setShowAdd(false); setEditingId(null); resetForm(); }} disabled={submitting}>
              Annuler
            </Button>
            <Button onClick={handleSubmit} disabled={submitting} className="gap-2 glass-btn">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {editingId ? "Enregistrer" : "Ajouter au stock"}
            </Button>
          </div>
        </div>
      )}

      {/* ── Liste ── */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500">
          <Archive className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <p>Aucune cabine dans cette vue</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((e) => (
            <div key={e.id} className={`glass-card rounded-2xl p-4 ${e.status === "destocke" ? "opacity-75" : ""}`}>
              <div className="flex items-start gap-3">

                {/* Photo miniature — zoom fixe au survol, cliquable pour ouvrir */}
                {e.photoCabine && (
                  <div
                    className="shrink-0"
                    onMouseEnter={(ev) => {
                      const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
                      const pw = 224, ph = 224, mg = 12;
                      let x = rect.right + mg;
                      let y = rect.top;
                      if (x + pw > window.innerWidth)  x = rect.left - pw - mg;
                      if (y + ph > window.innerHeight) y = window.innerHeight - ph - mg;
                      setHoveredPhoto({ src: e.photoCabine!, x, y });
                    }}
                    onMouseLeave={() => setHoveredPhoto(null)}
                  >
                    <a href={e.photoCabine} target="_blank" rel="noopener noreferrer" title="Ouvrir la photo">
                      <img
                        src={e.photoCabine}
                        alt={e.serie}
                        className="w-14 h-14 object-cover rounded-xl border border-gray-200 dark:border-gray-600 cursor-zoom-in hover:opacity-90 transition-opacity"
                      />
                    </a>
                  </div>
                )}

                {/* Contenu */}
                <div className="flex-1 min-w-0">
                  {/* Titre + statut */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-semibold text-gray-900 dark:text-gray-100">{e.serie}</h4>
                    {e.quantity > 1 && (
                      <span className="text-xs font-medium px-1.5 py-0.5 rounded-md bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                        × {e.quantity}
                      </span>
                    )}
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      e.status === "stock"
                        ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                        : "bg-gray-100 text-gray-500 dark:bg-slate-700 dark:text-gray-300"
                    }`}>
                      {e.status === "stock" ? "En stock" : "Déstocké"}
                    </span>
                  </div>

                  {/* Meta — flex-wrap, pas de truncate */}
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-xs text-gray-600 dark:text-gray-400">
                    {e.fournisseur && (
                      <div className="flex items-center gap-1"><Hash className="w-3 h-3 shrink-0" /><span>{e.fournisseur}</span></div>
                    )}
                    {e.numeroArticle && (
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-[10px] bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 px-1.5 py-0.5 rounded">
                          {e.numeroArticle}
                        </span>
                      </div>
                    )}
                    {e.emplacement && (
                      <div className="flex items-center gap-1"><MapPin className="w-3 h-3 shrink-0" /><span>{e.emplacement}</span></div>
                    )}
                    {e.dateArrivee && (
                      <div className="flex items-center gap-1"><Calendar className="w-3 h-3 shrink-0" /><span>Arrivé {formatDate(e.dateArrivee)}</span></div>
                    )}
                    {e.status === "destocke" && e.destockedAt && (
                      <div className="flex items-center gap-1"><Archive className="w-3 h-3 shrink-0" /><span>Sorti {formatDate(e.destockedAt)}{e.destockedBy ? ` · ${e.destockedBy}` : ""}</span></div>
                    )}
                    {(e.prixAchat != null || e.prixVente != null) && (
                      <div className="flex items-center gap-1">
                        <Banknote className="w-3 h-3 shrink-0" />
                        <span>
                          {[
                            e.prixAchat != null && `Achat ${formatPrix(e.prixAchat)}`,
                            e.prixVente != null && `Vente ${formatPrix(e.prixVente)}`,
                          ].filter(Boolean).join(" · ")}
                        </span>
                      </div>
                    )}
                    {e.mesuresApprox && (
                      <div className="flex items-center gap-1"><Ruler className="w-3 h-3 shrink-0" /><span>{e.mesuresApprox}</span></div>
                    )}
                  </div>

                  {/* Badges — défilement horizontal sur mobile (une seule ligne swipeable) */}
                  {(() => {
                    const tags = [
                      ...(e.configuration || []).map((t) => ({ t, cls: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300" })),
                      ...(e.typeMontage || []).map((t) => ({ t, cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" })),
                      ...(e.version || []).map((t) => ({ t, cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" })),
                      ...(e.typeVerre || []).map((t) => ({ t, cls: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300" })),
                      ...(e.traitementVerre || []).map((t) => ({ t, cls: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" })),
                      ...(e.couleur || []).map((t) => ({ t, cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" })),
                    ];
                    if (!tags.length) return null;
                    return (
                      <div className="mt-2 overflow-x-auto" style={{ WebkitOverflowScrolling: "touch" }}>
                        <div className="flex gap-1 flex-nowrap pb-0.5">
                          {tags.map(({ t, cls }, i) => (
                            <span key={i} className={`text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap shrink-0 ${cls}`}>{t}</span>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Commentaires / ref / PDF */}
                  {(e.commentaires || e.destockedProjectRef || e.mesuresCabinePdf) && (
                    <div className="mt-2 flex items-start gap-3 flex-wrap">
                      {(e.commentaires || e.destockedProjectRef) && (
                        <div className="text-xs text-gray-600 dark:text-gray-400 flex items-start gap-1.5">
                          <FileText className="w-3 h-3 shrink-0 mt-0.5" />
                          <span className="line-clamp-2">
                            {e.destockedProjectRef && <strong className="text-gray-800 dark:text-gray-200">{e.destockedProjectRef}</strong>}
                            {e.destockedProjectRef && e.commentaires && " — "}
                            {e.commentaires}
                          </span>
                        </div>
                      )}
                      {e.mesuresCabinePdf && (
                        <a href={e.mesuresCabinePdf} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-[10px] font-medium text-blue-600 dark:text-blue-400 hover:underline">
                          <FileText className="w-3 h-3" />
                          {e.mesuresCabinePdfName || "Mesures PDF"}
                        </a>
                      )}
                    </div>
                  )}
                </div>

                {/* Actions — bouton modifier toujours visible */}
                <div className="flex items-center gap-1 shrink-0">
                  {e.status === "stock" && (
                    <Button onClick={() => handleDestock(e)} size="sm"
                      className="gap-1.5 bg-gradient-to-r from-blue-500 to-cyan-400 text-white hover:from-blue-600 hover:to-cyan-500">
                      <Archive className="w-3.5 h-3.5" />
                      Déstocker
                    </Button>
                  )}
                  {e.status === "destocke" && (
                    <button onClick={() => handleRestock(e)} title="Remettre en stock"
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700">
                      <Undo2 className="w-4 h-4" />
                    </button>
                  )}
                  {/* Modifier — toujours disponible */}
                  <button onClick={() => startEdit(e)} title="Modifier"
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                    <Pencil className="w-4 h-4" />
                  </button>
                  {isAdmin && (
                    <button onClick={() => handleDelete(e)} title="Supprimer (admin)"
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
