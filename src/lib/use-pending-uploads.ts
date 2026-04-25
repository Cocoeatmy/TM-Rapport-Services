"use client";

import { useEffect, useState } from "react";
import { getPendingUploads, type PendingUpload } from "@/lib/idb-uploads";

export interface PendingPreview {
  /** ID de l'item IDB. Sert à le retirer si l'utilisateur supprime
   *  la photo avant qu'elle ne soit synchronisée. */
  id: string;
  /** URL object-blob recréée pour le rendu — révoquée au démontage. */
  objectUrl: string;
  /** Nom de fichier (avec préfixe de bucket) — sert à savoir à
   *  quelle catégorie/cabine appartient la photo. */
  name: string;
  /** Catégorie de l'upload, pour filtrer dans le composant. */
  category: string;
  /** Champ Notion ciblé (utile pour distinguer photos avant/montage/etc). */
  notionField?: string;
}

/**
 * Hook qui retourne les uploads pendants pour un projet, regroupés
 * par fichier individuel (un PendingUpload IDB peut contenir plusieurs
 * fichiers — on les éclate ici pour l'affichage en grille).
 *
 * Réagit aux events `tm-pending-upload-added` / `-removed` et à
 * un poll de 5 s pour refléter les changements faits par d'autres
 * onglets ou par le service worker.
 */
export function usePendingUploads(projectId: string | undefined): PendingPreview[] {
  const [previews, setPreviews] = useState<PendingPreview[]>([]);

  useEffect(() => {
    if (!projectId) return;

    let cancelled = false;
    let currentUrls: string[] = [];

    const refresh = async () => {
      try {
        const items = await getPendingUploads({ projectId });
        if (cancelled) return;
        // Révoque les anciennes URLs avant d'en recréer pour ne pas
        // accumuler en mémoire.
        currentUrls.forEach((u) => { try { URL.revokeObjectURL(u); } catch {} });
        const next: PendingPreview[] = [];
        for (const item of items as PendingUpload[]) {
          for (const f of item.files) {
            const url = URL.createObjectURL(f.blob);
            next.push({
              id: item.id,
              objectUrl: url,
              name: f.name,
              category: item.category,
              notionField: item.notionField,
            });
          }
        }
        currentUrls = next.map((p) => p.objectUrl);
        setPreviews(next);
      } catch {
        if (!cancelled) setPreviews([]);
      }
    };

    refresh();
    const onAdded = () => refresh();
    const onRemoved = () => refresh();
    window.addEventListener("tm-pending-upload-added", onAdded);
    window.addEventListener("tm-pending-upload-removed", onRemoved);
    const poll = setInterval(refresh, 5000);

    return () => {
      cancelled = true;
      window.removeEventListener("tm-pending-upload-added", onAdded);
      window.removeEventListener("tm-pending-upload-removed", onRemoved);
      clearInterval(poll);
      currentUrls.forEach((u) => { try { URL.revokeObjectURL(u); } catch {} });
    };
  }, [projectId]);

  return previews;
}
