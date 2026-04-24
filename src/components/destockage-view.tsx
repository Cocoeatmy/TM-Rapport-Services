"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, Package, Plus, Search, Loader2, Check, Trash2, Undo2, Calendar, MapPin, Hash, FileText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/** Une entrée représente un lot de cabines physiquement présentes au
 *  dépôt / atelier, en attente d'être envoyées sur un chantier. */
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
}

type Filter = "all" | "stock" | "destocke";

export function DestockageView({ isAdmin }: { isAdmin: boolean }) {
  const [entries, setEntries] = useState<StockCabine[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("stock");
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    serie: "",
    fournisseur: "",
    quantity: 1,
    emplacement: "",
    dateArrivee: new Date().toISOString().slice(0, 10),
    commentaires: "",
  });

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
      return [e.serie, e.fournisseur, e.emplacement, e.commentaires, e.destockedProjectRef]
        .some((s) => (s || "").toLowerCase().includes(q));
    });
  }, [entries, filter, search]);

  const counts = useMemo(() => ({
    all: entries.length,
    stock: entries.filter((e) => e.status === "stock").length,
    destocke: entries.filter((e) => e.status === "destocke").length,
    totalCabines: entries.filter((e) => e.status === "stock").reduce((s, e) => s + (e.quantity || 0), 0),
  }), [entries]);

  const resetForm = () => setForm({
    serie: "",
    fournisseur: "",
    quantity: 1,
    emplacement: "",
    dateArrivee: new Date().toISOString().slice(0, 10),
    commentaires: "",
  });

  const handleSubmit = async () => {
    if (!form.serie.trim()) {
      toast.error("Série requise");
      return;
    }
    setSubmitting(true);
    try {
      const url = "/api/destockage";
      const method = editingId ? "PATCH" : "POST";
      const body = editingId ? { ...form, id: editingId } : form;
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
      `Déstocker « ${entry.serie}${entry.quantity > 1 ? ` × ${entry.quantity}` : ""} » — référence du projet (OFR, nom, etc.) ?`,
      entry.destockedProjectRef,
    );
    if (ref === null) return;
    try {
      const res = await fetch("/api/destockage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: entry.id, status: "destocke", destockedProjectRef: ref }),
      });
      if (res.ok) {
        toast.success("Cabine déstockée");
        refresh();
      } else {
        toast.error("Erreur lors du déstockage");
      }
    } catch {
      toast.error("Erreur réseau");
    }
  };

  const handleRestock = async (entry: StockCabine) => {
    if (!confirm(`Remettre « ${entry.serie} » en stock ?`)) return;
    try {
      const res = await fetch("/api/destockage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: entry.id, status: "stock" }),
      });
      if (res.ok) {
        toast.success("Remis en stock");
        refresh();
      }
    } catch {}
  };

  const handleDelete = async (entry: StockCabine) => {
    if (!confirm(`Supprimer définitivement l'entrée « ${entry.serie} » ?`)) return;
    try {
      const res = await fetch("/api/destockage", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: entry.id }),
      });
      if (res.ok) {
        toast.success("Entrée supprimée");
        refresh();
      } else {
        toast.error("Admin requis");
      }
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
    });
    setShowAdd(true);
  };

  const formatDate = (d: string) => {
    if (!d) return "---";
    const dt = new Date(d + "T00:00:00");
    return dt.toLocaleDateString("fr-CH", { day: "2-digit", month: "short", year: "numeric" });
  };

  return (
    <div className="space-y-4">
      {/* En-tête + bouton "Nouvelle entrée" */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Package className="w-5 h-5 text-blue-600 dark:text-cyan-400" />
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Déstockage</h1>
        </div>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          {counts.stock} entrée{counts.stock > 1 ? "s" : ""} en stock
          {counts.totalCabines > 0 && ` · ${counts.totalCabines} cabines`}
        </div>
        <div className="flex-1" />
        <Button
          onClick={() => { setEditingId(null); resetForm(); setShowAdd(true); }}
          className="gap-2 glass-btn"
        >
          <Plus className="w-4 h-4" />
          Nouvelle entrée
        </Button>
      </div>

      {/* Filtres + recherche */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex glass-tabs rounded-xl p-1">
          {([
            { id: "stock" as const, label: `En stock (${counts.stock})` },
            { id: "destocke" as const, label: `Déstockés (${counts.destocke})` },
            { id: "all" as const, label: `Tous (${counts.all})` },
          ]).map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg transition-all ${
                filter === f.id
                  ? "glass-tab-active text-[#1e3a5f] dark:text-white"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative max-w-sm flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Rechercher série, fournisseur..."
            className="pl-9 h-10 rounded-xl glass-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Formulaire ajout / édition */}
      {showAdd && (
        <div className="glass-card rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">
              {editingId ? "Modifier l'entrée" : "Nouvelle entrée stock"}
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-600 dark:text-gray-300">Série *</Label>
              <Input
                value={form.serie}
                onChange={(e) => setForm({ ...form, serie: e.target.value })}
                placeholder="Ex: Multi-S 4000"
                className="mt-1 h-10 glass-input"
              />
            </div>
            <div>
              <Label className="text-xs text-gray-600 dark:text-gray-300">Fournisseur</Label>
              <Input
                value={form.fournisseur}
                onChange={(e) => setForm({ ...form, fournisseur: e.target.value })}
                placeholder="Ex: Duka"
                className="mt-1 h-10 glass-input"
              />
            </div>
            <div>
              <Label className="text-xs text-gray-600 dark:text-gray-300">Quantité</Label>
              <Input
                type="number"
                min="1"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: Math.max(1, parseInt(e.target.value || "1", 10)) })}
                className="mt-1 h-10 glass-input"
              />
            </div>
            <div>
              <Label className="text-xs text-gray-600 dark:text-gray-300">Date d&apos;arrivée</Label>
              <Input
                type="date"
                value={form.dateArrivee}
                onChange={(e) => setForm({ ...form, dateArrivee: e.target.value })}
                className="mt-1 h-10 glass-input"
              />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs text-gray-600 dark:text-gray-300">Emplacement</Label>
              <Input
                value={form.emplacement}
                onChange={(e) => setForm({ ...form, emplacement: e.target.value })}
                placeholder="Ex: Dépôt TM Yverdon — Box 3"
                className="mt-1 h-10 glass-input"
              />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs text-gray-600 dark:text-gray-300">Commentaires</Label>
              <Input
                value={form.commentaires}
                onChange={(e) => setForm({ ...form, commentaires: e.target.value })}
                placeholder="Ex: OFR associée, couleur, particularités..."
                className="mt-1 h-10 glass-input"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <Button
              variant="outline"
              onClick={() => { setShowAdd(false); setEditingId(null); resetForm(); }}
              disabled={submitting}
            >
              Annuler
            </Button>
            <Button onClick={handleSubmit} disabled={submitting} className="gap-2 glass-btn">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {editingId ? "Enregistrer" : "Ajouter au stock"}
            </Button>
          </div>
        </div>
      )}

      {/* Liste */}
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
            <div
              key={e.id}
              className={`glass-card rounded-2xl p-4 ${e.status === "destocke" ? "opacity-75" : ""}`}
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                      {e.serie}
                    </h4>
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
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 mt-2 text-xs text-gray-600 dark:text-gray-400">
                    {e.fournisseur && (
                      <div className="flex items-center gap-1.5">
                        <Hash className="w-3 h-3 shrink-0" />
                        <span className="truncate">{e.fournisseur}</span>
                      </div>
                    )}
                    {e.emplacement && (
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3 h-3 shrink-0" />
                        <span className="truncate">{e.emplacement}</span>
                      </div>
                    )}
                    {e.dateArrivee && (
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3 h-3 shrink-0" />
                        <span>Arrivé {formatDate(e.dateArrivee)}</span>
                      </div>
                    )}
                    {e.status === "destocke" && e.destockedAt && (
                      <div className="flex items-center gap-1.5">
                        <Archive className="w-3 h-3 shrink-0" />
                        <span>Sorti {formatDate(e.destockedAt)}{e.destockedBy ? ` · ${e.destockedBy}` : ""}</span>
                      </div>
                    )}
                  </div>
                  {(e.commentaires || e.destockedProjectRef) && (
                    <div className="mt-2 text-xs text-gray-600 dark:text-gray-400 flex items-start gap-1.5">
                      <FileText className="w-3 h-3 shrink-0 mt-0.5" />
                      <span>
                        {e.destockedProjectRef && <strong className="text-gray-800 dark:text-gray-200">{e.destockedProjectRef}</strong>}
                        {e.destockedProjectRef && e.commentaires && " — "}
                        {e.commentaires}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {e.status === "stock" ? (
                    <>
                      <Button
                        onClick={() => handleDestock(e)}
                        size="sm"
                        className="gap-1.5 bg-gradient-to-r from-blue-500 to-cyan-400 text-white hover:from-blue-600 hover:to-cyan-500"
                      >
                        <Archive className="w-3.5 h-3.5" />
                        Déstocker
                      </Button>
                      <button
                        onClick={() => startEdit(e)}
                        title="Modifier"
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700"
                      >
                        <FileText className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleRestock(e)}
                      title="Remettre en stock"
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700"
                    >
                      <Undo2 className="w-4 h-4" />
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      onClick={() => handleDelete(e)}
                      title="Supprimer (admin)"
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30"
                    >
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
