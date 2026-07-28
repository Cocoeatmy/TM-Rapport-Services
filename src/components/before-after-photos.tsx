"use client";

import { useState, useEffect } from "react";
import { ArrowLeftRight, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { thumbnailUrl, previewUrl } from "@/lib/image-url";

interface BeforeAfterPhoto {
  name: string;
  url: string;
}

interface BeforeAfterPhotosProps {
  projectId: string;
  projectName: string;
  initialBefore?: BeforeAfterPhoto[];
  initialAfter?: BeforeAfterPhoto[];
}

export function BeforeAfterPhotos({ projectId, projectName, initialBefore, initialAfter }: BeforeAfterPhotosProps) {
  const [before, setBefore] = useState<BeforeAfterPhoto[]>([]);
  const [after, setAfter] = useState<BeforeAfterPhoto[]>([]);
  const [showComparison, setShowComparison] = useState(false);
  // Section repliée par défaut → page plus légère (moins de photos affichées).
  const [open, setOpen] = useState(false);

  // Toujours synchroniser avec les props (source de vérité = Notion via page.tsx)
  useEffect(() => {
    setBefore(initialBefore || []);
    setAfter(initialAfter || []);
  }, [projectId, initialBefore, initialAfter]);

  const hasBefore = before.length > 0;
  const hasAfter = after.length > 0;

  if (!hasBefore && !hasAfter) return null;

  const nbPhotos = before.length + after.length;

  return (
    <div className="space-y-4">
      {/* En-tête repliable : un clic déplie / replie le comparatif. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 text-left"
        aria-expanded={open}
      >
        <ChevronRight
          className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
        />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Comparatif Avant / Apres
        </span>
        {!open && nbPhotos > 0 && (
          <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">
            {nbPhotos} photo{nbPhotos > 1 ? "s" : ""}
          </span>
        )}
      </button>

      {open && (
      <>
      {/* Thumbnails preview */}
      <div className="grid grid-cols-2 gap-3">
        {/* AVANT */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-center text-gray-500 uppercase tracking-wider">
            Avant
          </div>
          <div className="space-y-2">
            {before.map((photo, i) => (
              <div key={i} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100">
                <img
                  src={thumbnailUrl(photo.url, 400)}
                  alt={`Avant ${i + 1}`}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover"
                />
              </div>
            ))}
            {!hasBefore && (
              <div className="aspect-square rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center text-gray-400 text-xs text-center p-2">
                Ajoutez des photos dans «&nbsp;Photos avant intervention&nbsp;»
              </div>
            )}
          </div>
        </div>

        {/* APRES */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-center text-gray-500 uppercase tracking-wider">
            Apres
          </div>
          <div className="space-y-2">
            {after.map((photo, i) => (
              <div key={i} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100">
                <img
                  src={thumbnailUrl(photo.url, 400)}
                  alt={`Apres ${i + 1}`}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover"
                />
              </div>
            ))}
            {!hasAfter && (
              <div className="aspect-square rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center text-gray-400 text-xs text-center p-2">
                Ajoutez des photos dans «&nbsp;Photos après intervention&nbsp;»
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Generate comparison button */}
      {hasBefore && hasAfter && (
        <Button
          variant="outline"
          className="w-full rounded-xl"
          onClick={() => setShowComparison(!showComparison)}
        >
          <ArrowLeftRight className="w-4 h-4 mr-2" />
          {showComparison ? "Masquer le comparatif" : "Generer comparatif"}
        </Button>
      )}

      {/* Comparison view */}
      {showComparison && hasBefore && hasAfter && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-slate-900">
          <div className="px-3 py-2 bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-gray-700">
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 text-center">
              {projectName} - Comparatif Avant / Apres
            </p>
          </div>
          <div className="space-y-0">
            {Array.from({ length: Math.max(before.length, after.length) }).map((_, i) => (
              <div key={i} className="grid grid-cols-2 border-b border-gray-100 dark:border-gray-800 last:border-b-0">
                <div className="relative aspect-square bg-gray-100 dark:bg-slate-800">
                  {before[i] ? (
                    <img
                      src={previewUrl(before[i].url, 600)}
                      alt={`Avant ${i + 1}`}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">
                      Pas de photo
                    </div>
                  )}
                  {i === 0 && (
                    <div className="absolute top-2 left-2 bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                      AVANT
                    </div>
                  )}
                </div>
                <div className="relative aspect-square bg-gray-100 dark:bg-slate-800 border-l border-gray-200 dark:border-gray-700">
                  {after[i] ? (
                    <img
                      src={previewUrl(after[i].url, 600)}
                      alt={`Apres ${i + 1}`}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">
                      Pas de photo
                    </div>
                  )}
                  {i === 0 && (
                    <div className="absolute top-2 right-2 bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                      APRES
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}
