"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Circle, ChevronDown, ChevronUp, ListChecks } from "lucide-react";
import {
  getChecklistForSupplier,
  getChecklistSectionsForSupplier,
  BASE_CHECKLIST_ITEMS,
  type ChecklistSection,
} from "@/lib/constants";

interface ChecklistProps {
  title?: string;
  /** Si fourni, court-circuite la check-list par sections et affiche
   *  une liste plate (compat ascendante avec d'anciens callers). */
  items?: { id: string; label: string }[];
  fournisseur?: string;
  onChange?: (checked: Record<string, boolean>) => void;
  /** État ouvert par défaut. false = checklist repliée au mount,
   *  l'utilisateur clique sur le chevron pour déplier. */
  defaultOpen?: boolean;
}

/** @deprecated Use getChecklistForSupplier() from constants instead */
const DEFAULT_CHECKLIST = [...BASE_CHECKLIST_ITEMS];

export function MontageChecklist({ title = "Checklist de montage", items, fournisseur, onChange, defaultOpen = false }: ChecklistProps) {
  // Si l'appelant fournit une liste plate, on la transforme en une seule
  // section "implicite" (sans titre) pour mutualiser le rendu.
  const sections: ChecklistSection[] = useMemo(() => {
    if (items) {
      return [{ id: "_flat", icon: "", title: "", items }];
    }
    return getChecklistSectionsForSupplier(fournisseur);
  }, [items, fournisseur]);

  const allItems = useMemo(() => sections.flatMap((s) => s.items), [sections]);
  // Suggestion d'aide pour les callers qui ne passent pas items :
  // utilise la même source que le compteur, donc le total reflète
  // toujours ce qui est rendu.
  void getChecklistForSupplier; // évite un warning d'import inutilisé si jamais

  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState(defaultOpen);

  const toggle = (id: string) => {
    setCheckedItems((prev) => {
      const updated = { ...prev, [id]: !prev[id] };
      onChange?.(updated);
      return updated;
    });
  };

  const checkedCount = allItems.filter((it) => checkedItems[it.id]).length;
  const totalCount = allItems.length;
  const progress = totalCount > 0 ? (checkedCount / totalCount) * 100 : 0;
  const allChecked = totalCount > 0 && checkedCount === totalCount;

  // Bascule "tout cocher" / "tout décocher" : un seul bouton qui
  // alterne, plus pratique que deux boutons séparés.
  const toggleAll = () => {
    const next = allChecked
      ? {}
      : Object.fromEntries(allItems.map((it) => [it.id, true]));
    setCheckedItems(next);
    onChange?.(next);
  };

  return (
    <div>
      {/* En-tête cliquable : badge X/N + chevron pour plier/déplier.
          Le titre "Vérifications" / "Checklist de montage" a été
          retiré pour laisser plus d'espace, l'icône ListChecks
          suffit visuellement. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between mb-3 group"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <ListChecks className="w-4 h-4 text-gray-500 dark:text-gray-400" aria-hidden />
          <span className="sr-only">{title}</span>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            progress === 100 ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" :
            progress > 50 ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" :
            "bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300"
          }`}>
            {checkedCount}/{totalCount}
          </span>
        </span>
        {open ? (
          <ChevronUp className="w-4 h-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-200 transition-colors" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-200 transition-colors" />
        )}
      </button>

      <div className="h-1.5 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden mb-4">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${progress}%`,
            backgroundColor: progress === 100 ? "#22c55e" : "#3b82f6",
          }}
        />
      </div>

      {open && (
        <>
      <div className="space-y-4">
        {sections.map((section) => {
          const sectionDone = section.items.length > 0 && section.items.every((it) => checkedItems[it.id]);
          const sectionChecked = section.items.filter((it) => checkedItems[it.id]).length;
          return (
            <div key={section.id} className="space-y-1">
              {section.title && (
                <div className="flex items-center gap-2 px-1 mb-1.5">
                  {section.icon && <span className="text-base leading-none" aria-hidden>{section.icon}</span>}
                  <h4 className={`text-xs font-semibold uppercase tracking-wider ${
                    sectionDone ? "text-green-600 dark:text-green-400" : "text-gray-500 dark:text-gray-400"
                  }`}>
                    {section.title}
                  </h4>
                  <span className="ml-auto text-[10px] text-gray-400 dark:text-gray-500 tabular-nums">
                    {sectionChecked}/{section.items.length}
                  </span>
                </div>
              )}
              <div className="space-y-1">
                {section.items.map((item) => {
                  const isChecked = checkedItems[item.id] || false;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => toggle(item.id)}
                      className={`w-full flex items-center gap-3 text-left text-sm px-3 py-2.5 rounded-xl transition-colors ${
                        isChecked
                          ? "bg-green-50 dark:bg-green-900/30 text-green-800 dark:text-green-200"
                          : "bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-300"
                      }`}
                    >
                      {isChecked ? (
                        <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                      ) : (
                        <Circle className="w-5 h-5 text-gray-300 dark:text-slate-500 shrink-0" />
                      )}
                      <span className={isChecked ? "opacity-70" : ""}>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bouton "Tout cocher" / "Tout décocher" en bas de la liste,
          pour valider la checklist d'un coup quand le monteur a
          réellement passé en revue toutes les étapes. */}
      <button
        type="button"
        onClick={toggleAll}
        className={`mt-4 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-colors ${
          allChecked
            ? "bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600"
            : "bg-green-500 text-white hover:bg-green-600 active:bg-green-700"
        }`}
      >
        <CheckCircle2 className="w-4 h-4" />
        {allChecked ? "Tout décocher" : "Tout cocher"}
      </button>
        </>
      )}
    </div>
  );
}

export { DEFAULT_CHECKLIST };
