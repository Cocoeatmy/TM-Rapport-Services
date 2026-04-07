"use client";

import { useEffect, useState, useMemo } from "react";
import { Search, Mail, Phone, Building, User, Calendar, Loader2, AlertCircle, Tag } from "lucide-react";

interface CRMEntry {
  id: string;
  name: string;
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

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("fr-CH", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return ""; }
}

function EntryCard({ entry }: { entry: CRMEntry }) {
  const p = entry.properties;
  const poste = p["Poste"] || "";
  const email = p["Email"] || p["email"] || p["E-mail"] || "";
  const portable = p["Portable"] || p["portable"] || p["Mobile"] || "";
  const telephone = p["Téléphone"] || p["telephone"] || p["Phone"] || "";
  const etiquettes = Array.isArray(p["Étiquettes"]) ? p["Étiquettes"] : [];
  const dernierContact = p["Dernier contact"] || null;
  const posteColor = POSTE_COLORS[poste] || "bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400";

  // Find any string property that could be useful to display
  const allStrings = Object.entries(p)
    .filter(([k, v]) => typeof v === "string" && v && !["Poste", "Email", "email", "E-mail", "Portable", "portable", "Mobile", "Téléphone", "telephone", "Phone", "Dernier contact"].includes(k))
    .slice(0, 3);

  return (
    <div className="glass-card rounded-2xl p-4 hover:shadow-lg transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <User className="w-4 h-4 text-gray-400 shrink-0" />
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
        {dernierContact && (
          <div className="text-right shrink-0">
            <div className="flex items-center gap-1 text-[10px] text-gray-400">
              <Calendar className="w-3 h-3" />
              {formatDate(dernierContact)}
            </div>
          </div>
        )}
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

export function CRMClients({ mode }: { mode: ClientMode }) {
  const [entries, setEntries] = useState<CRMEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const type = MODE_TO_TYPE[mode];

  useEffect(() => {
    setLoading(true);
    setError("");
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
      <div className="relative mb-4 max-w-lg">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/70 dark:bg-slate-800/70 border border-gray-200 dark:border-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        />
      </div>

      <p className="text-xs text-gray-400 mb-3">
        {filtered.length} résultat{filtered.length !== 1 ? "s" : ""}
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((e) => (
          <EntryCard key={e.id} entry={e} />
        ))}
        {filtered.length === 0 && (
          <p className="col-span-full text-center text-sm text-gray-400 py-8">Aucun résultat</p>
        )}
      </div>
    </div>
  );
}
