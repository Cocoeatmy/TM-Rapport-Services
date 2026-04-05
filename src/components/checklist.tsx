"use client";

import { useState } from "react";
import { CheckCircle2, Circle } from "lucide-react";

interface ChecklistItem {
  id: string;
  label: string;
  checked: boolean;
}

interface ChecklistProps {
  title?: string;
  items: { id: string; label: string }[];
  onChange?: (checked: Record<string, boolean>) => void;
}

const DEFAULT_CHECKLIST = [
  { id: "protection-sol", label: "Protection du sol mise en place" },
  { id: "verification-mesures", label: "Vérification des mesures avant montage" },
  { id: "pieces-completes", label: "Toutes les pièces sont présentes" },
  { id: "fixation-murale", label: "Fixations murales posées et vérifiées" },
  { id: "etancheite", label: "Étanchéité vérifiée (joints silicone)" },
  { id: "porte-reglage", label: "Porte(s) réglée(s) et fonctionnelle(s)" },
  { id: "vitrages-propres", label: "Vitrages nettoyés" },
  { id: "evacuation-eau", label: "Évacuation d'eau testée" },
  { id: "nettoyage-chantier", label: "Nettoyage du chantier effectué" },
  { id: "emballages-evacues", label: "Emballages évacués" },
  { id: "fonctionnement-client", label: "Fonctionnement expliqué au client" },
  { id: "photos-prises", label: "Photos avant/après prises" },
];

export function MontageChecklist({ title = "Checklist de montage", items, onChange }: ChecklistProps) {
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});

  const toggle = (id: string) => {
    setCheckedItems((prev) => {
      const updated = { ...prev, [id]: !prev[id] };
      onChange?.(updated);
      return updated;
    });
  };

  const checkedCount = Object.values(checkedItems).filter(Boolean).length;
  const totalCount = items.length;
  const progress = totalCount > 0 ? (checkedCount / totalCount) * 100 : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <label className="text-sm font-medium text-gray-700">{title}</label>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
          progress === 100 ? "bg-green-100 text-green-700" :
          progress > 50 ? "bg-blue-100 text-blue-700" :
          "bg-gray-100 text-gray-600"
        }`}>
          {checkedCount}/{totalCount}
        </span>
      </div>

      {/* Barre de progression */}
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-3">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${progress}%`,
            backgroundColor: progress === 100 ? "#22c55e" : "#3b82f6",
          }}
        />
      </div>

      <div className="space-y-1">
        {items.map((item) => {
          const isChecked = checkedItems[item.id] || false;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => toggle(item.id)}
              className={`w-full flex items-center gap-3 text-left text-sm px-3 py-2.5 rounded-xl transition-colors ${
                isChecked
                  ? "bg-green-50 text-green-800"
                  : "bg-white hover:bg-gray-50 text-gray-700"
              }`}
            >
              {isChecked ? (
                <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
              ) : (
                <Circle className="w-5 h-5 text-gray-300 shrink-0" />
              )}
              <span className={isChecked ? "line-through opacity-70" : ""}>{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export { DEFAULT_CHECKLIST };
