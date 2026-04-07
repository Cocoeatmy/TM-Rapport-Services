"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { Search, Mail, Phone, Building, User, Calendar, Loader2, AlertCircle, Tag, Plus, Pencil, Trash2, X, Check } from "lucide-react";
import { Input } from "@/components/ui/input";

interface CRMEntry {
  id: string;
  name: string;
  icon: string;
  properties: Record<string, any>;
}

type ClientMode = "clients-contacts" | "clients-entreprises" | "clients-fournisseurs" | "clients-grossistes";

const MODE_TO_TYPE: Record<ClientMode, string> = {
  "clients-contacts": "contacts",
  "clients-entreprises": "entreprises",
  "clients-fournisseurs": "fournisseurs",
  "clients-grossistes": "grossistes",
};

const POSTE_COLORS: Record<string, string> = {
  "Directeur": "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  "Back Office": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  "Key Account Manager": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  "Technicien Sanitaire": "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  "Représentant sanitaire": "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
  "Fondateur": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  "Employé de bureau": "bg-gray-100 text-gray-700 dark:bg-gray-800/50 dark:text-gray-300",
  "Responsable site": "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  "Architecte": "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
};

const POSTE_OPTIONS = Object.keys(POSTE_COLORS);

// Fields config per type
const FIELDS_CONFIG: Record<string, { key: string; label: string; type: "text" | "select" | "email" | "phone" }[]> = {
  contacts: [
    { key: "Prénom et nom", label: "Prénom et nom", type: "text" },
    { key: "Poste", label: "Poste", type: "select" },
    { key: "Email", label: "Email", type: "email" },
    { key: "Portable", label: "Portable", type: "phone" },
    { key: "Téléphone", label: "Téléphone", type: "phone" },
  ],
  entreprises: [
    { key: "Nom", label: "Nom", type: "text" },
    { key: "Email", label: "Email", type: "email" },
    { key: "Téléphone", label: "Téléphone", type: "phone" },
  ],
  fournisseurs: [
    { key: "Nom", label: "Nom", type: "text" },
    { key: "Email", label: "Email", type: "email" },
    { key: "Téléphone", label: "Téléphone", type: "phone" },
  ],
  grossistes: [
    { key: "Nom", label: "Nom", type: "text" },
    { key: "Email", label: "Email", type: "email" },
    { key: "Téléphone", label: "Téléphone", type: "phone" },
  ],
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("fr-CH", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return ""; }
}

// Modal component
function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-md glass-card rounded-2xl p-6 shadow-2xl border border-white/20 dark:border-gray-700/50"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-[#1e3a5f] dark:text-white">{title}</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Form component for create/edit
function EntryForm({
  type,
  initialValues,
  onSubmit,
  onCancel,
  loading,
}: {
  type: string;
  initialValues?: Record<string, any>;
  onSubmit: (values: Record<string, any>) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const fields = FIELDS_CONFIG[type] || FIELDS_CONFIG.entreprises;
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of fields) {
      init[f.key] = initialValues?.[f.key] || "";
    }
    return init;
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Filter out empty values
    const filtered: Record<string, string> = {};
    for (const [k, v] of Object.entries(values)) {
      if (v.trim()) filtered[k] = v.trim();
    }
    onSubmit(filtered);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {fields.map((field) => (
        <div key={field.key}>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            {field.label}
          </label>
          {field.type === "select" ? (
            <select
              value={values[field.key] || ""}
              onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
              className="w-full h-8 rounded-lg border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-slate-800/70 px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            >
              <option value="">-- Sélectionner --</option>
              {POSTE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          ) : (
            <Input
              type={field.type === "email" ? "email" : field.type === "phone" ? "tel" : "text"}
              value={values[field.key] || ""}
              onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
              placeholder={field.label}
            />
          )}
        </div>
      ))}
      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {loading ? "Enregistrement..." : "Enregistrer"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}

// Confirm dialog
function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  loading,
  name,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
  name: string;
}) {
  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} title="Confirmer la suppression">
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Voulez-vous vraiment supprimer <strong>{name}</strong> ? Cette action est irréversible.
      </p>
      <div className="flex gap-2">
        <button
          onClick={onConfirm}
          disabled={loading}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          {loading ? "Suppression..." : "Supprimer"}
        </button>
        <button
          onClick={onClose}
          disabled={loading}
          className="px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          Annuler
        </button>
      </div>
    </Modal>
  );
}

function EntryCard({
  entry,
  type,
  isAdmin,
  onEdit,
  onDelete,
}: {
  entry: CRMEntry;
  type: string;
  isAdmin: boolean;
  onEdit: (entry: CRMEntry) => void;
  onDelete: (entry: CRMEntry) => void;
}) {
  const p = entry.properties;
  const poste = p["Poste"] || "";
  const email = p["Email"] || p["email"] || p["E-mail"] || "";
  const portable = p["Portable"] || p["portable"] || p["Mobile"] || "";
  const telephone = p["Téléphone"] || p["telephone"] || p["Phone"] || "";
  const etiquettes = Array.isArray(p["Étiquettes"]) ? p["Étiquettes"] : [];
  const dernierContact = p["Dernier contact"] || null;
  const posteColor = POSTE_COLORS[poste] || "bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400";

  const isEmoji = entry.icon && !entry.icon.startsWith("http");
  const isImage = entry.icon && entry.icon.startsWith("http");

  // Find any string property that could be useful to display
  const allStrings = Object.entries(p)
    .filter(([k, v]) => typeof v === "string" && v && !["Poste", "Email", "email", "E-mail", "Portable", "portable", "Mobile", "Téléphone", "telephone", "Phone", "Dernier contact"].includes(k))
    .slice(0, 3);

  return (
    <div className="glass-card rounded-2xl p-4 hover:shadow-lg transition-shadow group">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {isImage ? (
              <img src={entry.icon} alt="" className="w-6 h-6 rounded object-contain shrink-0" />
            ) : isEmoji ? (
              <span className="text-base shrink-0">{entry.icon}</span>
            ) : (
              <User className="w-4 h-4 text-gray-400 shrink-0" />
            )}
            <h3 className="font-semibold text-[#1e3a5f] dark:text-white truncate">{entry.name}</h3>
          </div>
          {poste && (
            <span className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-full mb-2 ${posteColor}`}>
              {poste}
            </span>
          )}
          {etiquettes.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {etiquettes.map((tag: string) => (
                <span key={tag} className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
                  <Tag className="w-2.5 h-2.5" />
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {dernierContact && (
            <div className="flex items-center gap-1 text-[10px] text-gray-400">
              <Calendar className="w-3 h-3" />
              {formatDate(dernierContact)}
            </div>
          )}
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => onEdit(entry)}
              className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              title="Modifier"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            {isAdmin && (
              <button
                onClick={() => onDelete(entry)}
                className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                title="Supprimer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mt-2 space-y-1.5">
        {email && (
          <a href={`mailto:${email}`} className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400 hover:underline truncate">
            <Mail className="w-3.5 h-3.5 shrink-0" />
            {email}
          </a>
        )}
        {portable && (
          <a href={`tel:${portable}`} className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400 hover:underline">
            <Phone className="w-3.5 h-3.5 shrink-0" />
            {portable}
          </a>
        )}
        {telephone && telephone !== portable && (
          <a href={`tel:${telephone}`} className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400 hover:underline">
            <Phone className="w-3.5 h-3.5 shrink-0" />
            {telephone}
            <span className="text-[10px] text-gray-400">(fixe)</span>
          </a>
        )}
        {allStrings.map(([k, v]) => (
          <p key={k} className="text-xs text-gray-500 dark:text-gray-400 truncate">
            <span className="text-gray-400">{k}:</span> {v}
          </p>
        ))}
      </div>
    </div>
  );
}

export function CRMClients({ mode, isAdmin = false }: { mode: ClientMode; isAdmin?: boolean }) {
  const [entries, setEntries] = useState<CRMEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editEntry, setEditEntry] = useState<CRMEntry | null>(null);
  const [deleteEntry, setDeleteEntry] = useState<CRMEntry | null>(null);
  const [mutating, setMutating] = useState(false);

  const type = MODE_TO_TYPE[mode];

  const fetchEntries = useCallback(() => {
    setLoading(true);
    setError("");

    fetch(`/api/crm?type=${type}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setEntries(data);
          try { localStorage.setItem(`tm-crm-${type}`, JSON.stringify(data)); } catch {}
        } else if (data.error) {
          setError(data.error);
        }
      })
      .catch((e) => setError(e.message || "Erreur de chargement"))
      .finally(() => setLoading(false));
  }, [type]);

  useEffect(() => {
    setEntries([]);
    // Try localStorage cache
    try {
      const cached = localStorage.getItem(`tm-crm-${type}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setEntries(parsed);
          setLoading(false);
        }
      }
    } catch {}

    fetchEntries();
  }, [type, fetchEntries]);

  const filtered = useMemo(() => {
    if (!search.trim()) return entries;
    const q = search.toLowerCase();
    return entries.filter((e) => {
      const allValues = Object.values(e.properties).flatMap((v) =>
        Array.isArray(v) ? v : typeof v === "string" ? [v] : []
      );
      return e.name.toLowerCase().includes(q) || allValues.some((v) => String(v).toLowerCase().includes(q));
    });
  }, [entries, search]);

  const handleCreate = async (properties: Record<string, any>) => {
    setMutating(true);
    try {
      const res = await fetch("/api/crm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, properties }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      setShowCreateModal(false);
      fetchEntries();
    } catch (err: any) {
      alert(err.message || "Erreur lors de la création");
    } finally {
      setMutating(false);
    }
  };

  const handleEdit = async (properties: Record<string, any>) => {
    if (!editEntry) return;
    setMutating(true);
    try {
      const res = await fetch("/api/crm", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editEntry.id, type, properties }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      setEditEntry(null);
      fetchEntries();
    } catch (err: any) {
      alert(err.message || "Erreur lors de la mise à jour");
    } finally {
      setMutating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteEntry) return;
    setMutating(true);
    try {
      const res = await fetch("/api/crm", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deleteEntry.id, type }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      setDeleteEntry(null);
      fetchEntries();
    } catch (err: any) {
      alert(err.message || "Erreur lors de la suppression");
    } finally {
      setMutating(false);
    }
  };

  if (loading && entries.length === 0) {
    return (
      <div className="text-center py-16">
        <Loader2 className="w-8 h-8 mx-auto mb-3 text-blue-500 animate-spin" />
        <p className="text-sm text-gray-400">Chargement...</p>
      </div>
    );
  }

  if (error && entries.length === 0) {
    return (
      <div className="text-center py-16">
        <AlertCircle className="w-8 h-8 mx-auto mb-3 text-red-400" />
        <p className="text-sm text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-lg">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/70 dark:bg-slate-800/70 border border-gray-200 dark:border-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 active:scale-95 transition-all shrink-0"
        >
          <Plus className="w-4 h-4" />
          Nouveau
        </button>
      </div>

      <p className="text-xs text-gray-400 mb-3">
        {filtered.length} résultat{filtered.length !== 1 ? "s" : ""}
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((e) => (
          <EntryCard
            key={e.id}
            entry={e}
            type={type}
            isAdmin={isAdmin}
            onEdit={setEditEntry}
            onDelete={setDeleteEntry}
          />
        ))}
        {filtered.length === 0 && (
          <p className="col-span-full text-center text-sm text-gray-400 py-8">Aucun résultat</p>
        )}
      </div>

      {/* Create Modal */}
      <Modal open={showCreateModal} onClose={() => !mutating && setShowCreateModal(false)} title="Nouveau contact">
        <EntryForm
          type={type}
          onSubmit={handleCreate}
          onCancel={() => setShowCreateModal(false)}
          loading={mutating}
        />
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editEntry} onClose={() => !mutating && setEditEntry(null)} title="Modifier">
        {editEntry && (
          <EntryForm
            type={type}
            initialValues={editEntry.properties}
            onSubmit={handleEdit}
            onCancel={() => setEditEntry(null)}
            loading={mutating}
          />
        )}
      </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteEntry}
        onClose={() => !mutating && setDeleteEntry(null)}
        onConfirm={handleDelete}
        loading={mutating}
        name={deleteEntry?.name || ""}
      />
    </div>
  );
}
