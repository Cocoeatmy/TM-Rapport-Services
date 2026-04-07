"use client";

import { useEffect, useState, useMemo, useRef } from "react";
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

// Keys to skip in display/edit (internal, read-only, or relation IDs)
const SKIP_KEYS = new Set(["__entryName"]);
const HIDDEN_KEYS = new Set(["Dossiers (CMD)", "Dossiers", "Contacts", "Opportunités", "Projets CRM", "Entreprise", "Grossistes", "Fournisseurs"]);
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

function isRelationIdArray(value: any): boolean {
  if (!Array.isArray(value)) return false;
  return value.length > 0 && typeof value[0] === "string" && /^[0-9a-f-]{30,}$/.test(value[0]);
}

function PropertyValue({ label, value }: { label: string; value: any }) {
  if (value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) return null;
  if (SKIP_KEYS.has(label) || HIDDEN_KEYS.has(label)) return null;
  if (isRelationIdArray(value)) return null;

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

  // Percentage (rabais, etc.)
  if (k.includes("rabais") || k.includes("taux") || k.includes("marge")) {
    const num = typeof value === "number" ? value : parseFloat(String(value));
    if (!isNaN(num)) {
      const pct = num < 1 ? Math.round(num * 100) : Math.round(num);
      return (
        <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
          {icon} <span className="text-gray-400">{label}:</span> <span className="font-medium">{pct} %</span>
        </div>
      );
    }
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

function LogoImage({ src, name }: { src: string; name: string }) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: "200px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (error) {
    return (
      <div className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-gray-700 flex items-center justify-center shrink-0 text-[10px] font-bold text-gray-500">
        {initials}
      </div>
    );
  }

  return (
    <div ref={ref} className="w-8 h-8 rounded-lg shrink-0 relative">
      {!loaded && (
        <div className="absolute inset-0 bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center text-[10px] font-bold text-gray-400 animate-pulse">
          {initials}
        </div>
      )}
      {visible && (
        <img
          src={src}
          alt=""
          className={`w-8 h-8 rounded-lg object-contain transition-opacity duration-200 ${loaded ? "opacity-100" : "opacity-0"}`}
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
        />
      )}
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
    .filter(([k, v]) => k !== titleKey && !SKIP_KEYS.has(k) && !HIDDEN_KEYS.has(k) && !isRelationIdArray(v) && v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0))
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

  const [expanded, setExpanded] = useState(false);

  return (
    <div className="glass-card rounded-2xl p-4 hover:shadow-lg transition-shadow">
      <div className="flex items-start justify-between gap-2" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-2 mb-2 min-w-0">
          {isImage ? (
            <LogoImage src={entry.icon} name={entry.name} />
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
        <div className="flex gap-1 shrink-0">
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
        {(expanded ? displayProps : displayProps.slice(0, 4)).map(([k, v]) => (
          <PropertyValue key={k} label={k} value={v} />
        ))}
        {!expanded && displayProps.length > 4 && (
          <p className="text-[10px] text-blue-500 cursor-pointer" onClick={() => setExpanded(true)}>Voir {displayProps.length - 4} champs de plus…</p>
        )}
      </div>
    </div>
  );
}

// Dynamic form that shows ALL properties
function EntryForm({ entry, type, onSubmit, onCancel, loading }: {
  entry: CRMEntry | null;
  type: string;
  onSubmit: (properties: Record<string, any>, icon?: string | null) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const props = entry?.properties || {};
  const [values, setValues] = useState<Record<string, string>>({});
  const [multiValues, setMultiValues] = useState<Record<string, string[]>>({});
  const [iconUrl, setIconUrl] = useState<string>(entry?.icon || "");
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [schema, setSchema] = useState<Record<string, { type: string; options?: string[] }>>({});
  const [newOption, setNewOption] = useState<Record<string, string>>({});

  // Load schema with options
  useEffect(() => {
    fetch(`/api/crm?type=${type}&schema=1`)
      .then((r) => r.json())
      .then((data) => { if (data && !data.error) setSchema(data); })
      .catch(() => {});
  }, [type]);

  useEffect(() => {
    const init: Record<string, string> = {};
    const initMulti: Record<string, string[]> = {};
    if (entry) {
      for (const [k, v] of Object.entries(props)) {
        if (SKIP_KEYS.has(k) || HIDDEN_KEYS.has(k) || isRelationIdArray(v)) continue;
        if (Array.isArray(v)) {
          initMulti[k] = v.map(String);
          init[k] = v.join(", ");
        } else if (v !== null && v !== undefined) {
          init[k] = String(v);
        } else {
          init[k] = "";
        }
      }
      const titleKey = Object.entries(props).find(([, v]) => v === entry.name)?.[0];
      if (titleKey && !init[titleKey]) init[titleKey] = entry.name;
      setIconUrl(entry.icon || "");
    }
    setValues(init);
    setMultiValues(initMulti);
  }, [entry]);

  const handleChange = (key: string, val: string) => {
    setValues((prev) => ({ ...prev, [key]: val }));
  };

  const handleIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingIcon(true);
    try {
      const formData = new FormData();
      formData.append("files", file);
      formData.append("category", "crm-logos");
      formData.append("projectId", "crm");
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (res.ok) {
        const data = await res.json();
        const url = data.files?.[0]?.url;
        if (url) setIconUrl(url);
      }
    } catch {} finally {
      setUploadingIcon(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(values)) {
      if (READONLY_KEYS.has(k)) continue;
      const schemaType = schema[k]?.type;
      if (schemaType === "multi_select") {
        result[k] = multiValues[k] || v.split(",").map((s: string) => s.trim()).filter(Boolean);
      } else {
        result[k] = v;
      }
    }
    // Include multi_select fields not in values
    for (const [k, v] of Object.entries(multiValues)) {
      if (!result[k]) result[k] = v;
    }
    const iconChanged = entry ? iconUrl !== (entry.icon || "") : !!iconUrl;
    onSubmit(result, iconChanged ? (iconUrl || null) : undefined);
  };

  const fields = entry
    ? Object.keys(props).filter((k) => !SKIP_KEYS.has(k) && !HIDDEN_KEYS.has(k) && !isRelationIdArray(props[k]))
    : ["Nom", "Email", "Téléphone"];

  return (
    <form onSubmit={handleSubmit} className="space-y-3 max-h-[70vh] overflow-y-auto">
      {/* Logo */}
      <div>
        <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Logo</label>
        <div className="flex items-center gap-3">
          {iconUrl && iconUrl.startsWith("http") ? (
            <img src={iconUrl} alt="Logo" className="w-12 h-12 rounded-lg object-contain border border-gray-200 dark:border-gray-700" />
          ) : iconUrl ? (
            <span className="text-3xl">{iconUrl}</span>
          ) : (
            <div className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              <User className="w-5 h-5 text-gray-400" />
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label className="cursor-pointer text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1">
              <Camera className="w-3 h-3" />
              {uploadingIcon ? "Upload..." : iconUrl ? "Changer" : "Ajouter"}
              <input type="file" accept="image/*" className="hidden" onChange={handleIconUpload} disabled={uploadingIcon} />
            </label>
            {iconUrl && (
              <button type="button" onClick={() => setIconUrl("")} className="text-xs text-red-500 hover:text-red-600 text-left">
                Supprimer
              </button>
            )}
          </div>
        </div>
      </div>

      {fields.map((key) => {
        const isReadOnly = READONLY_KEYS.has(key);
        const val = values[key] || "";
        const schemaEntry = schema[key];
        const fieldType = schemaEntry?.type;
        const options = schemaEntry?.options || [];

        return (
          <div key={key}>
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-0.5 block">{key}</label>
            {isReadOnly ? (
              <p className="text-sm text-gray-500 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">{val || "—"}</p>
            ) : fieldType === "select" && options.length > 0 ? (
              <select
                value={val}
                onChange={(e) => handleChange(key, e.target.value)}
                className="w-full h-9 px-3 text-sm rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-slate-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500/30 focus:outline-none"
              >
                <option value="">— Sélectionner —</option>
                {options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : fieldType === "multi_select" ? (
              <div>
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                  {(multiValues[key] || []).map((tag) => (
                    <span key={tag} className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                      {tag}
                      <button type="button" onClick={() => setMultiValues((prev) => ({ ...prev, [key]: (prev[key] || []).filter((t) => t !== tag) }))} className="hover:text-red-500">×</button>
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1 mb-1">
                  {options.filter((o) => !(multiValues[key] || []).includes(o)).map((o) => (
                    <button key={o} type="button" onClick={() => setMultiValues((prev) => ({ ...prev, [key]: [...(prev[key] || []), o] }))}
                      className="text-[10px] px-2 py-0.5 rounded-full border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-blue-400 hover:text-blue-600 transition-colors">
                      + {o}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1">
                  <input
                    type="text"
                    value={newOption[key] || ""}
                    onChange={(e) => setNewOption((prev) => ({ ...prev, [key]: e.target.value }))}
                    placeholder="Nouvelle option..."
                    className="flex-1 h-7 px-2 text-xs rounded border border-gray-200 dark:border-gray-700 dark:bg-slate-800 dark:text-gray-100"
                  />
                  <button type="button" onClick={() => {
                    const v = (newOption[key] || "").trim();
                    if (!v) return;
                    setMultiValues((prev) => ({ ...prev, [key]: [...(prev[key] || []), v] }));
                    setNewOption((prev) => ({ ...prev, [key]: "" }));
                  }} className="h-7 px-2 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              </div>
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

  const fetchEntries = (refresh = false) => {
    fetch(`/api/crm?type=${type}${refresh ? "&refresh=1" : ""}`)
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

  const handleCreate = async (properties: Record<string, any>, icon?: string | null) => {
    setMutating(true);
    try {
      const res = await fetch("/api/crm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, properties, ...(icon !== undefined ? { icon } : {}) }),
      });
      if (res.ok) {
        setShowCreate(false);
        fetchEntries();
      }
    } catch {} finally { setMutating(false); }
  };

  const handleEdit = async (properties: Record<string, any>, icon?: string | null) => {
    if (!editEntry) return;
    setMutating(true);
    try {
      const res = await fetch("/api/crm", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editEntry.id, type, properties, ...(icon !== undefined ? { icon } : {}) }),
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
        <EntryForm entry={null} type={type} onSubmit={handleCreate} onCancel={() => setShowCreate(false)} loading={mutating} />
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editEntry} onClose={() => !mutating && setEditEntry(null)} title="Modifier">
        {editEntry && (
          <EntryForm entry={editEntry} type={type} onSubmit={handleEdit} onCancel={() => setEditEntry(null)} loading={mutating} />
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
