"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Shield,
  Loader2,
  Package,
  AlertTriangle,
  Search,
  Plus,
  Minus,
  Trash2,
  X,
} from "lucide-react";

interface StockItem {
  id: string;
  name: string;
  category: "consommable" | "piece" | "outil";
  quantity: number;
  minQuantity: number;
  unit: "pièces" | "tubes" | "boîtes" | "rouleaux";
  lastUpdated: number;
  updatedBy: string;
}

const CATEGORIES = [
  { value: "consommable", label: "Consommable" },
  { value: "piece", label: "Pièce" },
  { value: "outil", label: "Outil" },
] as const;

const UNITS = ["pièces", "tubes", "boîtes", "rouleaux"] as const;

const categoryColor: Record<string, string> = {
  consommable: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  piece: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  outil: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
};

export default function StocksPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [stocks, setStocks] = useState<StockItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newItem, setNewItem] = useState({
    name: "",
    category: "consommable" as StockItem["category"],
    quantity: 0,
    minQuantity: 0,
    unit: "pièces" as StockItem["unit"],
  });
  const [submitting, setSubmitting] = useState(false);

  // Auth check
  useEffect(() => {
    fetch("/api/auth")
      .then((r) => r.json())
      .then((data) => {
        if (data.user?.role !== "admin") {
          router.push("/");
          return;
        }
        setIsAdmin(true);
      });
  }, [router]);

  // Fetch stocks
  const fetchStocks = useCallback(() => {
    fetch("/api/stocks")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setStocks(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchStocks();
  }, [fetchStocks]);

  // Adjust quantity
  const adjustQuantity = async (id: string, adjustment: number) => {
    setStocks((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, quantity: Math.max(0, s.quantity + adjustment) } : s
      )
    );
    try {
      await fetch("/api/stocks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, adjustment }),
      });
    } catch {
      fetchStocks();
    }
  };

  // Add new item
  const addItem = async () => {
    if (!newItem.name.trim()) return;
    setSubmitting(true);
    try {
      await fetch("/api/stocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newItem),
      });
      setNewItem({ name: "", category: "consommable", quantity: 0, minQuantity: 0, unit: "pièces" });
      setShowAddForm(false);
      fetchStocks();
    } catch {
      // ignore
    } finally {
      setSubmitting(false);
    }
  };

  // Delete item
  const deleteItem = async (id: string) => {
    if (!confirm("Supprimer cet article du stock ?")) return;
    setStocks((prev) => prev.filter((s) => s.id !== id));
    try {
      await fetch("/api/stocks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
    } catch {
      fetchStocks();
    }
  };

  // Filter stocks
  const filteredStocks = stocks.filter((s) => {
    if (categoryFilter !== "all" && s.category !== categoryFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return s.name.toLowerCase().includes(q);
    }
    return true;
  });

  // Alert count
  const alertCount = stocks.filter((s) => s.quantity <= s.minQuantity).length;

  const formatDate = (ts: number) => {
    if (!ts) return "---";
    const d = new Date(ts);
    return d.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (!isAdmin || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto w-full px-4 py-4 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <button
          onClick={() => router.push("/admin")}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 active:bg-gray-200 dark:active:bg-gray-700 shrink-0"
        >
          <ArrowLeft className="w-5 h-5 dark:text-gray-100" />
        </button>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Package className="w-5 h-5 text-amber-600 shrink-0" />
            Gestion des stocks
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Suivi des consommables, pièces et outils
          </p>
        </div>
      </div>

      {/* Alert summary */}
      {alertCount > 0 && (
        <div className="glass-card rounded-2xl p-3 mb-4 border border-red-200 dark:border-red-800/50 bg-red-50/50 dark:bg-red-900/20">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="text-sm font-medium">
              {alertCount} article{alertCount > 1 ? "s" : ""} en alerte
            </span>
          </div>
        </div>
      )}

      {/* Filters + Add button */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => setCategoryFilter("all")}
          className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
            categoryFilter === "all"
              ? "glass-btn text-white"
              : "glass-card text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100"
          }`}
        >
          Tous ({stocks.length})
        </button>
        {CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            onClick={() => setCategoryFilter(categoryFilter === cat.value ? "all" : cat.value)}
            className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
              categoryFilter === cat.value
                ? "glass-btn text-white"
                : "glass-card text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100"
            }`}
          >
            {cat.label}
          </button>
        ))}

        {/* Search */}
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Rechercher..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-full glass-card border-0 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-600 dark:bg-gray-800/50 dark:text-gray-100 dark:placeholder-gray-500"
          />
        </div>

        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="shrink-0 flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full glass-btn text-white transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Ajouter
        </button>
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="glass-card rounded-2xl p-4 mb-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Nouvel article
            </h3>
            <button
              onClick={() => setShowAddForm(false)}
              className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Nom de l'article"
              value={newItem.name}
              onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
              className="text-sm px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-600 dark:text-gray-100 dark:placeholder-gray-500"
            />
            <select
              value={newItem.category}
              onChange={(e) => setNewItem({ ...newItem, category: e.target.value as StockItem["category"] })}
              className="text-sm px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-600 dark:text-gray-100"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Qté"
                min={0}
                value={newItem.quantity}
                onChange={(e) => setNewItem({ ...newItem, quantity: parseInt(e.target.value) || 0 })}
                className="flex-1 text-sm px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-600 dark:text-gray-100"
              />
              <input
                type="number"
                placeholder="Seuil min"
                min={0}
                value={newItem.minQuantity}
                onChange={(e) => setNewItem({ ...newItem, minQuantity: parseInt(e.target.value) || 0 })}
                className="flex-1 text-sm px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-600 dark:text-gray-100"
              />
            </div>
            <select
              value={newItem.unit}
              onChange={(e) => setNewItem({ ...newItem, unit: e.target.value as StockItem["unit"] })}
              className="text-sm px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-600 dark:text-gray-100"
            >
              {UNITS.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>
          <button
            onClick={addItem}
            disabled={submitting || !newItem.name.trim()}
            className="w-full text-sm font-medium py-2 rounded-xl glass-btn text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Ajouter au stock"}
          </button>
        </div>
      )}

      {/* Stock list */}
      <div className="space-y-2">
        {filteredStocks.length === 0 ? (
          <div className="glass-card rounded-2xl p-8 text-center text-gray-400 dark:text-gray-500">
            Aucun article en stock
          </div>
        ) : (
          filteredStocks.map((item) => {
            const isAlert = item.quantity <= item.minQuantity;
            return (
              <div
                key={item.id}
                className={`glass-card rounded-2xl p-4 transition-colors ${
                  isAlert ? "border border-red-300 dark:border-red-700/60 bg-red-50/30 dark:bg-red-900/10" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {isAlert && (
                        <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                      )}
                      <p className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">
                        {item.name}
                      </p>
                      <span
                        className={`text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 ${
                          categoryColor[item.category] || "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {CATEGORIES.find((c) => c.value === item.category)?.label}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Min: {item.minQuantity} {item.unit} &middot; MAJ: {formatDate(item.lastUpdated)} par {item.updatedBy}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => adjustQuantity(item.id, -1)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/60 transition-colors"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <div className={`min-w-[3.5rem] text-center px-2 py-1 rounded-lg text-sm font-bold ${
                      isAlert
                        ? "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    }`}>
                      {item.quantity}
                      <span className="text-[10px] font-normal ml-0.5 text-gray-500 dark:text-gray-400">
                        {item.unit.slice(0, 3)}.
                      </span>
                    </div>
                    <button
                      onClick={() => adjustQuantity(item.id, 1)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/60 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => deleteItem(item.id)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors ml-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
