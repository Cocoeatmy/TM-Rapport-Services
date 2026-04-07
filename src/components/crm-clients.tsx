"use client";

import { useEffect, useState, useMemo } from "react";
import { Search, Mail, Phone, Building, User, Calendar, Loader2, AlertCircle, Tag, Pencil, Trash2, Plus, Check, X, Globe, MapPin, Hash, Camera } from "lucide-react";

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
  "Directeur": "bg-purple-100 text-purple-700",
  "Back Office": "bg-blue-100 text-blue-700",
  "Key Account Manager": "bg-amber-100 text-amber-700",
  "Technicien Sanitaire": "bg-green-100 text-green-700",
  "Représentant sanitaire": "bg-teal-100 text-teal-700",
  "Fondateur": "bg-red-100 text-red-700",
  "Employé de bureau": "bg-gray-100 text-gray-700",
  "Responsable site": "bg-indigo-100 text-indigo-700",
  "Architecte": "bg-orange-100 text-orange-700",
};

// Keys to skip in display/edit (internal or read-only)
const SKIP_KEYS = new Set(["__entryName"]);
const READONLY_KEYS = new Set(["Nb. Projets", "Projets terminé", "Projets terminés"]);

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("fr-CH", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return ""; }
}

function getIcon(key: string) {
  const k = key.toLowerCase();
  if (k.includes("email") || k.includes("mail")) return <Mail className="w-3.5 h-3.5 text-blue-500 shrink-0" />;
  if (k.includes("téléphone") || k.includes("portable") || k.includes("phone") || k.includes("mobile")) return <Phone className="w-3.5 h-3.5 text-green-500 shrink-0" />;
  if (k.includes("site") || k.includes("web") || k.includes("url")) return <Globe className="w-3.5 h-3.5 text-indigo-500 shrink-0" />;
  if (k.includes("adresse") || k.includes("address")) return <MapPin className="w-3.5 h-3.5 text-red-500 shrink-0" />;
  if (k.includes("rabais") || k.includes("nb") || k.includes("projet")) return <Hash className="w-3.5 h-3.5 text-gray-400 shrink-0" />;
  if (k.includes("étiquette") || k.includes("tag")) return <Tag className="w-3.5 h-3.5 text-sky-500 shrink-0" />;
  if (k.includes("date") || k.includes("contact") || k.includes("dernier")) return <Calendar className="w-3.5 h-3.5 text-amber-500 shrink-0" />;
  return null;
}

function PropertyValue({ label, value }: { label: string; value: any }) {
  if (value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) return null;
  if (SKIP_KEYS.has(label)) return null;

  const k = label.toLowerCase();
  const icon = getIcon(label);

  // Email - clickable
  if ((k.includes("email") || k.includes("mail")) && typeof value === "string" && value.includes("@")) {
    return (
      <a href={`mailto:${value}`} className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400 hover:underline truncate">
        {icon} <span className="text-gray-400 shrink-0">{label}:</span> {value}
      </a>
    );
  }

  // Phone - clickable
  if ((k.includes("téléphone") || k.includes("portable") || k.includes("phone") || k.includes("mobile")) && typeof value === "string" && value) {
    return (
      <a href={`tel:${value}`} className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400 hover:underline">
        {icon} <span className="text-gray-400 shrink-0">{label}:</span> {value}
      </a>
    );
  }

  // URL - clickable
  if ((k.includes("site") || k.includes("web") || k.includes("url")) && typeof value === "string" && value) {
    const url = value.startsWith("http") ? value : `https://${value}`;
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-indigo-600 dark:text-indigo-400 hover:underline truncate">
        {icon} <span className="text-gray-400 shrink-0">{label}:</span> {value}
      </a>
    );
  }

  // Arrays (multi-select, relations)
  if (Array.isArray(value)) {
    return (
      <div className="flex items-start gap-2 text-xs">
        {icon} <span className="text-gray-400 shrink-0">{label}:</span>
        <div className="flex flex-wrap gap-1">
          {value.map((v, i) => (
            <span key={i} className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-1.5 py-0.5 rounded text-[10px]">{String(v)}</span>
          ))}
        </div>
      </div>
    );
  }

  // Boolean
  if (typeof value === "boolean") {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
        {icon} <span className="text-gray-400">{label}:</span> {value ? "Oui" : "Non"}
      </div>
    );
  }

  // Date
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
        {icon || <Calendar className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
        <span className="text-gray-400">{label}:</span> {formatDate(value)}
      </div>
    );
  }

  // Default string/number
  return (
    <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 truncate">
      {icon} <span className="text-gray-400 shrink-0">{label}:</span> <span className="truncate">{String(value)}</span>
    </div>
  );
}

function EntryCard({ entry, isAdmin, onEdit, onDelete }: { entry: CRMEntry; isAdmin: boolean; onEdit: (e: CRMEntry) => void; onDelete: (e: CRMEntry) => void }) {
  const p = entry.properties;
  const poste = p["Poste"] || "";
  const etiquettes = Array.isArray(p["Étiquettes"]) ? p["Étiquettes"] : [];
  const isEmoji = entry.icon && !entry.icon.startsWith("http");
  const isImage = entry.icon && entry.icon.startsWith("http");

  // Get the title key (first property that equals entry.name)
  const titleKey = Object.entries(p).find(([, v]) => v === entry.name)?.[0] || "";

  // Properties to show (excluding title, already shown)
  const displayProps = Object.entries(p)
    .filter(([k, v]) => k !== titleKey && !SKIP_KEYS.has(k) && v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0))
    .sort(([a], [b]) => {
      // Prioritize key fields
      const priority = (k: string) => {
        const l = k.toLowerCase();
        if (l.includes("adresse")) return 0;
        if (l.includes("email") || l.includes("mail")) return 1;
        if (l.includes("portable") || l.includes("mobile")) return 2;
        if (l.includes("téléphone") || l.includes("phone")) return 3;
        if (l.includes("site") || l.includes("web")) return 4;
        if (l.includes("étiquette")) return 5;
        return 10;
      };
      return priority(a) - priority(b);
    });

  return (
    <div className="glass-card rounded-2xl p-4 hover:shadow-lg transition-shadow group">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 mb-2 min-w-0">
          {isImage ? (
            <img src={entry.icon} alt="" className="w-8 h-8 rounded object-contain shrink-0" />
          ) : isEmoji ? (
            <span className="text-xl shrink-0">{entry.icon}</span>
          ) : (
            <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center shrink-0">
              <User className="w-4 h-4 text-gray-500" />
            </div>
          )}
          <div className="min-w-0">
            <h3 className="font-semibold text-[#1e3a5f] dark:text-white truncate text-sm">{entry.name}</h3>
            <div className="flex items-center gap-1 flex-wrap">
              {poste && <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${POSTE_COLORS[poste] || "bg-gray-100 text-gray-600"}`}>{poste}</span>}
              {etiquettes.map((t: string) => (
                <span key={t} className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700">{t}</span>
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-1 shrink-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
          <button onClick={() => onEdit(entry)} className="w-7 h-7 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center">
            <Pencil className="w-3 h-3 text-gray-400" />
          </button>
          {isAdmin && (
            <button onClick={() => onDelete(entry)} className="w-7 h-7 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center">
              <Trash2 className="w-3 h-3 text-red-400" />
            </button>
          )}
        </div>
      </div>

      <div className="space-y-1.5 mt-1">
        {displayProps.slice(0, 8).map(([k, v]) => (
          <PropertyValue key={k} label={k} value={v} />
        ))}
        {displayProps.length > 8 && (
          <p className="text-[10px] text-gray-400">+{displayProps.length - 8} champs</p>
        )}
      </div>
    </div>
  );
}

// Dynamic form that shows ALL properties
function EntryForm({ entry, onSubmit, onCancel, loading }: {
  entry: CRMEntry | null; // null = create new
  onSubmit: (properties: Record<string, any>) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const props = entry?.properties || {};
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    const init: Record<string, string> = {};
    if (entry) {
      // Pre-fill all string/number properties
      for (const [k, v] of Object.entries(props)) {
        if (SKIP_KEYS.has(k)) continue;
        if (Array.isArray(v)) init[k] = v.join(", ");
        else if (v !== null && v !== undefined) init[k] = String(v);
        else init[k] = "";
      }
      // Ensure name is in the title field
      const titleKey = Object.entries(props).find(([, v]) => v === entry.name)?.[0];
      if (titleKey && !init[titleKey]) init[titleKey] = entry.name;
    }
    setValues(init);
  }, [entry]);

  const handleChange = (key: string, val: string) => {
    setValues((prev) => ({ ...prev, [key]: val }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(values)) {
      if (READONLY_KEYS.has(k)) continue;
      result[k] = v;
    }
    onSubmit(result);
  };

  // For new entries, show minimal fields
  const fields = entry
    ? Object.keys(props).filter((k) => !SKIP_KEYS.has(k))
    : ["Nom", "Email", "Téléphone"];

  return (
    <form onSubmit={handleSubmit} className="space-y-3 max-h-[70vh] overflow-y-auto">
      {fields.map((key) => {
        const isReadOnly = READONLY_KEYS.has(key);
        const val = values[key] || "";
        return (
          <div key={key}>
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-0.5 block">{key}</label>
            {isReadOnly ? (
              <p className="text-sm text-gray-500 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">{val || "—"}</p>
            ) : (
              <input
                type={key.toLowerCase().includes("email") || key.toLowerCase().includes("mail") ? "email" : key.toLowerCase().includes("date") ? "date" : "text"}
                value={val}
                onChange={(e) => handleChange(key, e.target.value)}
                placeholder={key}
                className="w-full h-9 px-3 text-sm rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-slate-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500/30 focus:outline-none"
              />
            )}
          </div>
        );
      })}
      <div className="flex gap-2 pt-2 sticky bottom-0 bg-white dark:bg-slate-800">
        <button type="submit" disabled={loading}
          className="flex-1 h-9 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-1.5">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Enregistrer
        </button>
        <button type="button" onClick={onCancel} className="h-9 px-4 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300">
          Annuler
        </button>
      </div>
    </form>
  );
}

function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-x-4 top-[10%] z-50 max-w-md mx-auto bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-5 max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </>
  );
}

export function CRMClients({ mode, isAdmin }: { mode: ClientMode; isAdmin?: boolean }) {
  const [entries, setEntries] = useState<CRMEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [editEntry, setEditEntry] = useState<CRMEntry | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteEntry, setDeleteEntry] = useState<CRMEntry | null>(null);
  const [mutating, setMutating] = useState(false);

  const type = MODE_TO_TYPE[mode];

  const fetchEntries = () => {
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
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    setLoading(true);
    setError("");
    setEntries([]);
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
  }, [type]);

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
      if (res.ok) {
        setShowCreate(false);
        fetchEntries();
      }
    } catch {} finally { setMutating(false); }
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
      if (res.ok) {
        setEditEntry(null);
        fetchEntries();
      }
    } catch {} finally { setMutating(false); }
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
      if (res.ok) {
        setDeleteEntry(null);
        setEntries((prev) => prev.filter((e) => e.id !== deleteEntry.id));
      }
    } catch {} finally { setMutating(false); }
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
      <div className="flex items-center gap-2 mb-4">
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
          onClick={() => setShowCreate(true)}
          className="shrink-0 h-10 px-4 rounded-xl bg-blue-600 text-white text-sm font-medium flex items-center gap-1.5 hover:bg-blue-700 active:scale-95 transition-all"
        >
          <Plus className="w-4 h-4" />
          Nouveau
        </button>
      </div>

      <p className="text-xs text-gray-400 mb-3">{filtered.length} résultat{filtered.length !== 1 ? "s" : ""}</p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((e) => (
          <EntryCard key={e.id} entry={e} isAdmin={!!isAdmin} onEdit={setEditEntry} onDelete={setDeleteEntry} />
        ))}
        {filtered.length === 0 && (
          <p className="col-span-full text-center text-sm text-gray-400 py-8">Aucun résultat</p>
        )}
      </div>

      {/* Create Modal */}
      <Modal open={showCreate} onClose={() => !mutating && setShowCreate(false)} title="Nouveau">
        <EntryForm entry={null} onSubmit={handleCreate} onCancel={() => setShowCreate(false)} loading={mutating} />
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editEntry} onClose={() => !mutating && setEditEntry(null)} title="Modifier">
        {editEntry && (
          <EntryForm entry={editEntry} onSubmit={handleEdit} onCancel={() => setEditEntry(null)} loading={mutating} />
        )}
      </Modal>

      {/* Delete Confirmation */}
      <Modal open={!!deleteEntry} onClose={() => !mutating && setDeleteEntry(null)} title="Supprimer">
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Supprimer <strong>{deleteEntry?.name}</strong> ? Cette action est irréversible.
        </p>
        <div className="flex gap-2">
          <button onClick={handleDelete} disabled={mutating}
            className="flex-1 h-9 rounded-lg bg-red-600 text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-1.5">
            {mutating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            Supprimer
          </button>
          <button onClick={() => setDeleteEntry(null)} className="h-9 px-4 rounded-lg border border-gray-200 text-sm text-gray-600">
            Annuler
          </button>
        </div>
      </Modal>
    </div>
  );
}
