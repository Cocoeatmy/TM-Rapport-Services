"use client";

import { useEffect, useState, useMemo } from "react";
import { Search, Mail, Phone, Building, User, Calendar, Loader2, AlertCircle, Tag } from "lucide-react";
import { fetchWithRetry } from "@/lib/api-helpers";

interface CRMContact {
  id: string;
  name: string;
  poste: string;
  etiquettes: string[];
  entreprise: string[];
  grossistes: string[];
  fournisseurs: string[];
  email: string;
  portable: string;
  telephone: string;
  dernierContact: string | null;
}

type ClientMode = "clients-contacts" | "clients-entreprises" | "clients-fournisseurs" | "clients-grossistes";

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
    return new Date(dateStr).toLocaleDateString("fr-CH", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function ContactCard({ contact }: { contact: CRMContact }) {
  const posteColor = POSTE_COLORS[contact.poste] || "bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400";
  const phone = contact.portable || contact.telephone;

  return (
    <div className="glass-card rounded-2xl p-4 hover:shadow-lg transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <User className="w-4 h-4 text-gray-400 shrink-0" />
            <h3 className="font-semibold text-[#1e3a5f] dark:text-white truncate">{contact.name}</h3>
          </div>
          {contact.poste && (
            <span className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-full mb-2 ${posteColor}`}>
              {contact.poste}
            </span>
          )}
          {contact.etiquettes.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {contact.etiquettes.map((tag) => (
                <span key={tag} className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
                  <Tag className="w-2.5 h-2.5" />
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
        {contact.dernierContact && (
          <div className="text-right shrink-0">
            <div className="flex items-center gap-1 text-[10px] text-gray-400">
              <Calendar className="w-3 h-3" />
              {formatDate(contact.dernierContact)}
            </div>
          </div>
        )}
      </div>

      <div className="mt-2 space-y-1.5">
        {contact.email && (
          <a
            href={`mailto:${contact.email}`}
            className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400 hover:underline truncate"
          >
            <Mail className="w-3.5 h-3.5 shrink-0" />
            {contact.email}
          </a>
        )}
        {contact.portable && (
          <a
            href={`tel:${contact.portable}`}
            className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400 hover:underline"
          >
            <Phone className="w-3.5 h-3.5 shrink-0" />
            {contact.portable}
            <span className="text-[10px] text-gray-400">(portable)</span>
          </a>
        )}
        {contact.telephone && (
          <a
            href={`tel:${contact.telephone}`}
            className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400 hover:underline"
          >
            <Phone className="w-3.5 h-3.5 shrink-0" />
            {contact.telephone}
            <span className="text-[10px] text-gray-400">(fixe)</span>
          </a>
        )}
      </div>
    </div>
  );
}

export function CRMClients({ mode }: { mode: ClientMode }) {
  const [contacts, setContacts] = useState<CRMContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    // Try loading from localStorage cache first
    try {
      const cached = localStorage.getItem("tm-crm-cache");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setContacts(parsed);
          setLoading(false);
        }
      }
    } catch {}

    fetchWithRetry("/api/crm")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setContacts(data);
          try { localStorage.setItem("tm-crm-cache", JSON.stringify(data)); } catch {}
        } else if (data.error) {
          setError(data.error);
        }
      })
      .catch((e) => setError(e.message || "Erreur de chargement"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let list = contacts;

    // Filter by mode
    if (mode === "clients-grossistes") {
      list = list.filter((c) => c.etiquettes.includes("Grossistes") || c.grossistes.length > 0);
    } else if (mode === "clients-fournisseurs") {
      list = list.filter((c) => c.fournisseurs.length > 0);
    }
    // contacts and entreprises show all entries (entreprises groups them differently)

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.poste.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          c.portable.toLowerCase().includes(q) ||
          c.telephone.toLowerCase().includes(q) ||
          c.etiquettes.some((t) => t.toLowerCase().includes(q))
      );
    }

    return list;
  }, [contacts, mode, search]);

  // Group by etiquette for entreprises view
  const grouped = useMemo(() => {
    if (mode !== "clients-entreprises") return null;

    const groups: Record<string, CRMContact[]> = {};
    filtered.forEach((c) => {
      if (c.etiquettes.length === 0) {
        const key = "Sans catégorie";
        if (!groups[key]) groups[key] = [];
        groups[key].push(c);
      } else {
        c.etiquettes.forEach((tag) => {
          if (!groups[tag]) groups[tag] = [];
          groups[tag].push(c);
        });
      }
    });

    // Sort groups alphabetically
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered, mode]);

  if (loading && contacts.length === 0) {
    return (
      <div className="text-center py-16">
        <Loader2 className="w-8 h-8 mx-auto mb-3 text-blue-500 animate-spin" />
        <p className="text-sm text-gray-400">Chargement des contacts CRM...</p>
      </div>
    );
  }

  if (error && contacts.length === 0) {
    return (
      <div className="text-center py-16">
        <AlertCircle className="w-8 h-8 mx-auto mb-3 text-red-400" />
        <p className="text-sm text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <div>
      {/* Search bar */}
      <div className="relative mb-4 max-w-lg">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un contact..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/70 dark:bg-slate-800/70 border border-gray-200 dark:border-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <span className="text-xs">x</span>
          </button>
        )}
      </div>

      {/* Count */}
      <p className="text-xs text-gray-400 mb-3">
        {filtered.length} contact{filtered.length !== 1 ? "s" : ""}
        {search && ` pour "${search}"`}
      </p>

      {/* Entreprises view - grouped */}
      {mode === "clients-entreprises" && grouped ? (
        <div className="space-y-6">
          {grouped.map(([groupName, groupContacts]) => (
            <div key={groupName}>
              <div className="flex items-center gap-2 mb-3">
                <Building className="w-4 h-4 text-amber-500" />
                <h3 className="text-sm font-semibold text-[#1e3a5f] dark:text-white">{groupName}</h3>
                <span className="text-[10px] text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded-full">
                  {groupContacts.length}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {groupContacts.map((c) => (
                  <ContactCard key={c.id} contact={c} />
                ))}
              </div>
            </div>
          ))}
          {grouped.length === 0 && (
            <p className="text-center text-sm text-gray-400 py-8">Aucun contact trouvé</p>
          )}
        </div>
      ) : (
        /* Default grid view for contacts, fournisseurs, grossistes */
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <ContactCard key={c.id} contact={c} />
          ))}
          {filtered.length === 0 && (
            <p className="col-span-full text-center text-sm text-gray-400 py-8">Aucun contact trouvé</p>
          )}
        </div>
      )}
    </div>
  );
}
