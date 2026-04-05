"use client";

import { useState } from "react";
import { Settings, Eye, EyeOff, GripVertical } from "lucide-react";
import type { WidgetConfig } from "@/lib/dashboard-config";
import { saveWidgetConfig } from "@/lib/dashboard-config";

interface WidgetSettingsProps {
  config: WidgetConfig[];
  onChange: (config: WidgetConfig[]) => void;
}

export function WidgetSettings({ config, onChange }: WidgetSettingsProps) {
  const [open, setOpen] = useState(false);

  const toggle = (id: string) => {
    const updated = config.map((w) =>
      w.id === id ? { ...w, visible: !w.visible } : w
    );
    onChange(updated);
    saveWidgetConfig(updated);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl glass-card hover:bg-white/80 transition-all active:scale-95"
      >
        <Settings className="w-4 h-4 text-gray-600" />
        Widgets
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="glass-card rounded-2xl w-80 p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Widgets du tableau de bord
          </h3>
          <button onClick={() => setOpen(false)} className="text-xs text-gray-400 hover:text-gray-600">
            Fermer
          </button>
        </div>
        <div className="space-y-1">
          {config.map((widget) => (
            <button
              key={widget.id}
              onClick={() => toggle(widget.id)}
              className={`w-full flex items-center gap-3 text-sm px-3 py-2.5 rounded-xl transition-colors ${
                widget.visible
                  ? "bg-blue-50 text-blue-800 dark:bg-blue-900/30"
                  : "bg-gray-50 text-gray-400 dark:bg-gray-800"
              }`}
            >
              {widget.visible ? (
                <Eye className="w-4 h-4 text-blue-500" />
              ) : (
                <EyeOff className="w-4 h-4 text-gray-400" />
              )}
              <span className="flex-1 text-left">{widget.label}</span>
            </button>
          ))}
        </div>
        <button
          onClick={() => {
            const allVisible = config.map((w) => ({ ...w, visible: true }));
            onChange(allVisible);
            saveWidgetConfig(allVisible);
          }}
          className="w-full mt-3 text-xs text-blue-500 hover:text-blue-700 py-1"
        >
          Tout afficher
        </button>
      </div>
    </div>
  );
}
