"use client";

import { useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Minus,
  Package,
  Loader2,
} from "lucide-react";

interface StockItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  minQuantity: number;
  unit: string;
}

interface UsageEntry {
  itemId: string;
  itemName: string;
  count: number;
}

export function StockUsage({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [stocks, setStocks] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [usage, setUsage] = useState<UsageEntry[]>([]);
  const [adjusting, setAdjusting] = useState<string | null>(null);

  useEffect(() => {
    // Load saved usage from localStorage
    const saved = localStorage.getItem(`stock-usage-${projectId}`);
    if (saved) {
      try { setUsage(JSON.parse(saved)); } catch { /* ignore */ }
    }
  }, [projectId]);

  useEffect(() => {
    if (open && stocks.length === 0) {
      setLoading(true);
      fetch("/api/stocks")
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data)) {
            // Show consumables first
            setStocks(data.filter((s: StockItem) => s.category === "consommable"));
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [open, stocks.length]);

  const useItem = async (item: StockItem) => {
    setAdjusting(item.id);
    try {
      await fetch("/api/stocks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, adjustment: -1 }),
      });

      // Update local stocks
      setStocks((prev) =>
        prev.map((s) =>
          s.id === item.id ? { ...s, quantity: Math.max(0, s.quantity - 1) } : s
        )
      );

      // Track usage
      setUsage((prev) => {
        const existing = prev.find((u) => u.itemId === item.id);
        const updated = existing
          ? prev.map((u) => u.itemId === item.id ? { ...u, count: u.count + 1 } : u)
          : [...prev, { itemId: item.id, itemName: item.name, count: 1 }];
        localStorage.setItem(`stock-usage-${projectId}`, JSON.stringify(updated));
        return updated;
      });
    } catch {
      // ignore
    } finally {
      setAdjusting(null);
    }
  };

  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-white/40 dark:hover:bg-gray-800/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Package className="w-4 h-4 text-amber-600 shrink-0" />
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Consommables utilisés
          </span>
          {usage.length > 0 && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
              {usage.reduce((sum, u) => sum + u.count, 0)}
            </span>
          )}
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          {/* Usage summary */}
          {usage.length > 0 && (
            <div className="space-y-1 pb-2 border-b border-gray-100 dark:border-gray-700/50">
              <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Utilisé sur ce projet
              </p>
              {usage.map((u) => (
                <div key={u.itemId} className="flex items-center justify-between text-xs">
                  <span className="text-gray-700 dark:text-gray-300">{u.itemName}</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">x{u.count}</span>
                </div>
              ))}
            </div>
          )}

          {/* Quick use buttons */}
          {loading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : stocks.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-2">
              Aucun consommable en stock
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {stocks.map((item) => (
                <button
                  key={item.id}
                  onClick={() => useItem(item)}
                  disabled={adjusting === item.id || item.quantity <= 0}
                  className="flex items-center gap-2 text-left text-xs px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {adjusting === item.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400 shrink-0" />
                  ) : (
                    <Minus className="w-3.5 h-3.5 text-red-500 shrink-0" />
                  )}
                  <span className="truncate text-gray-700 dark:text-gray-300">{item.name}</span>
                  <span className="ml-auto text-[10px] text-gray-400 shrink-0">
                    {item.quantity}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
