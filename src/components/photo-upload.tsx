"use client";

import { useState, useRef, useEffect } from "react";
import { Camera, ImagePlus, X, Loader2, Download, CloudUpload } from "lucide-react";
import { thumbnailUrl } from "@/lib/image-url";
import { invalidateApiCache } from "@/lib/api-helpers";
import { compressImage } from "@/lib/compress-image";
import { saveFilesToDeviceGallery } from "@/lib/save-to-gallery";
import { addPendingUpload, removePendingUpload, processPendingUploads } from "@/lib/idb-uploads";
import { usePendingUploads } from "@/lib/use-pending-uploads";
import { isOnline } from "@/lib/offline";
import { toast } from "sonner";

interface PhotoUploadProps {
  category: string;
  label: string;
  /** Texte d'instruction affiché sous le titre de la section (entre parenthèses). */
  hint?: string;
  projectId: string;
  notionField?: string;
  filePrefix?: string;
  existingPhotos?: { name: string; url: string }[];
  /** Appelé après un upload réussi (la photo est déjà dans Notion via /api/upload) */
  onUpload?: (files: { name: string; url: string }[]) => void;
  /** Appelé après une suppression (le parent doit PATCH Notion avec la liste mise à jour) */
  onDelete?: (files: { name: string; url: string }[]) => void;
  /** Appelé dès que l'utilisateur sélectionne des fichiers (avant upload/compression) */
  onFilesSelected?: (files: File[]) => void;
}

export function PhotoUpload({
  category,
  label,
  hint,
  projectId,
  notionField,
  filePrefix,
  existingPhotos = [],
  onUpload,
  onDelete,
  onFilesSelected,
}: PhotoUploadProps) {
  // Nombre d'uploads actuellement en cours (≥ 1 = au moins un en arrière-plan)
  const [uploadingCount, setUploadingCount] = useState(0);
  // Blob URLs des photos EN COURS d'upload (affichées comme vignettes en attente)
  const [previews, setPreviews] = useState<string[]>([]);

  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  // Anti double-fire iOS : timestamp du dernier déclenchement par source.
  // Sur iOS, onChange peut se déclencher deux fois pour la même sélection.
  // On ignore tout re-déclenchement dans les 600 ms suivant le premier.
  const lastFireRef = useRef<Record<string, number>>({ camera: 0, gallery: 0 });

  // Compteur de photos total (existantes + en attente IDB) pour le nommage.
  const pendingCountRef = useRef(0);

  // Nettoyage : révoque tous les blob URLs encore en mémoire au démontage.
  useEffect(() => {
    return () => {
      previews.forEach((u) => { try { URL.revokeObjectURL(u); } catch {} });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFiles = async (
    e: React.ChangeEvent<HTMLInputElement>,
    source: "camera" | "gallery" = "gallery",
  ) => {
    const files = e.target.files;

    // ── Anti double-fire iOS ─────────────────────────────────────────────────
    const now = Date.now();
    if (now - lastFireRef.current[source] < 600) {
      e.target.value = "";
      return;
    }
    lastFireRef.current[source] = now;

    if (!files?.length) return;

    const originals: File[] = Array.from(files);

    // Réinitialise l'input IMMÉDIATEMENT pour que iOS/Android permettent
    // de sélectionner une nouvelle photo sans attendre la fin de l'upload.
    e.target.value = "";

    onFilesSelected?.(originals);

    // ── Aperçu instantané ────────────────────────────────────────────────────
    // Les blob URLs sont affichées tout de suite — avant compression et upload.
    // L'utilisateur voit la photo apparaître dans la grille immédiatement.
    const newPreviews: string[] = originals.map((f) => URL.createObjectURL(f));
    setPreviews((prev) => [...prev, ...newPreviews]);

    // ── Compteur d'uploads en cours ──────────────────────────────────────────
    // Incrémenté ici, décrémenté dans finally — permet N uploads simultanés.
    setUploadingCount((n) => n + 1);

    // ── Nommage des fichiers ─────────────────────────────────────────────────
    const currentCount = existingPhotos.length + pendingCountRef.current;
    const ts = Date.now();
    const renamed: File[] = originals.map((file, i) => {
      const idx = currentCount + i + 1;
      const ext = file.name.split(".").pop() || "jpg";
      const newName = filePrefix
        ? `${filePrefix}.${idx}.${ts}.${ext}`
        : file.name;
      return new File([file], newName, { type: file.type });
    });

    // ── Compression en parallèle ─────────────────────────────────────────────
    // Réduit une photo iPhone (10 Mo) à ~400 Ko → upload 20× plus rapide.
    // Fait EN ARRIÈRE-PLAN pendant que l'utilisateur peut déjà prendre
    // la photo suivante.
    const compressed: File[] = await Promise.all(
      renamed.map((f) => compressImage(f, 1600, 0.82))
    );

    // Helper : enregistre les fichiers en IDB pour upload différé
    const queueOffline = async (reason: "offline" | "error", filesToQueue: File[] = compressed) => {
      try {
        await addPendingUpload({
          projectId,
          category,
          notionField,
          files: filesToQueue.map((f) => ({ name: f.name, type: f.type, blob: f })),
        });
        toast.info(
          reason === "offline"
            ? "Photo enregistrée — sera envoyée au retour du réseau"
            : "Upload en attente — nouvelle tentative auto",
          { duration: 3500 },
        );
        // Si on est en ligne (échec ponctuel, pas une coupure réseau), on
        // relance tout de suite le traitement de la file au lieu d'attendre
        // le poll de 30 s → la photo repart en quelques secondes.
        if (reason === "error" && isOnline()) {
          setTimeout(() => { processPendingUploads().catch(() => {}); }, 1500);
        }
      } catch (idbErr) {
        console.error("[photo-upload] IDB queue error:", idbErr);
        toast.error("Impossible de mettre en file la photo");
      }
    };

    try {
      if (!isOnline()) {
        await queueOffline("offline");
        return;
      }

      // Une requête PAR photo : la limite Vercel est ~4,5 Mo/req. Un lot de
      // plusieurs photos dans une seule requête peut la dépasser → 413 → échec
      // permanent. En envoyant photo par photo (<1 Mo chacune), on élimine ce
      // cas et un échec isolé n'entraîne pas les autres.
      const newFiles: { name: string; url: string }[] = [];
      const failedFiles: File[] = [];
      const failedPreviews: string[] = [];
      for (let i = 0; i < compressed.length; i++) {
        const f = compressed[i];
        const formData = new FormData();
        formData.append("files", f);
        formData.append("category", category);
        formData.append("projectId", projectId);
        if (notionField) formData.append("notionField", notionField);

        // Timeout 45 s : un upload figé est annulé → la photo part en file IDB.
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 45_000);
        try {
          const res = await fetch("/api/upload", { method: "POST", body: formData, signal: ctrl.signal });
          const data = await res.json().catch(() => ({}));
          if (res.ok && Array.isArray(data.files)) {
            for (const p of data.files as { name: string; url: string }[]) {
              if (p?.url) newFiles.push(p);
            }
          } else {
            failedFiles.push(f);
            failedPreviews.push(newPreviews[i]);
          }
        } catch {
          failedFiles.push(f);
          failedPreviews.push(newPreviews[i]);
        } finally {
          clearTimeout(to);
        }
      }

      if (newFiles.length > 0) {
        invalidateApiCache();
        onUpload?.(newFiles);
        if (source === "camera") {
          saveFilesToDeviceGallery(originals).catch(() => {});
        }
      }

      // Retire les previews des photos réussies, garde celles en échec (elles
      // partent en file IDB ci-dessous et gardent leur badge "Sync").
      setPreviews((prev) => {
        const toRemove = newPreviews.filter((u) => !failedPreviews.includes(u));
        toRemove.forEach((u) => { try { URL.revokeObjectURL(u); } catch {} });
        return prev.filter((u) => !toRemove.includes(u));
      });

      // Met en file UNIQUEMENT les photos qui ont échoué (rejeu auto rapide).
      if (failedFiles.length > 0) {
        await queueOffline("error", failedFiles);
      }
    } catch (err) {
      console.error("Upload error:", err);
      await queueOffline("error");
    } finally {
      setUploadingCount((n) => Math.max(0, n - 1));
    }
  };

  const removePreview = (index: number) => {
    setPreviews((prev) => {
      const url = prev[index];
      if (url) { try { URL.revokeObjectURL(url); } catch {} }
      return prev.filter((_, i) => i !== index);
    });
  };

  const validExisting = existingPhotos.filter((p) => p && p.url && p.url.length > 0);

  const pending = usePendingUploads(projectId).filter(
    (p) =>
      p.category === category &&
      (notionField ? p.notionField === notionField : !p.notionField),
  );
  pendingCountRef.current = pending.length;

  // isUploading = true pour les previews (blob URLs en cours d'upload)
  const allImages: {
    src: string;
    isPreview: boolean;
    pendingId?: string;
    isPending?: boolean;
    isUploading?: boolean;
  }[] = [
    ...validExisting.map((p) => ({ src: p.url, isPreview: false })),
    ...pending.map((p) => ({ src: p.objectUrl, isPreview: false, pendingId: p.id, isPending: true })),
    ...previews.map((u) => ({ src: u, isPreview: true, isUploading: true })),
  ];

  const removeExisting = (url: string) => {
    if (!confirm("Supprimer cette photo du rapport ?")) return;
    const updated = validExisting.filter((p) => p.url !== url);
    onDelete?.(updated);
    invalidateApiCache();
  };

  return (
    <div>
      <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">{label}</label>
      {hint && (
        <p className="text-xs text-gray-400 mb-2 mt-0.5">({hint})</p>
      )}
      <div className="grid grid-cols-2 gap-2">
        {allImages.map((img, i) => (
          <div
            key={`${img.isPreview ? "p" : "e"}-${i}-${img.src}`}
            className="relative rounded-xl overflow-hidden bg-gray-100 group"
            style={{ aspectRatio: "4/3" }}
          >
            <img
              src={img.isPreview ? img.src : thumbnailUrl(img.src, 300)}
              alt={`${label} ${i + 1}`}
              loading="lazy"
              decoding="async"
              className={`w-full h-full object-cover transition-opacity ${img.isUploading ? "opacity-70" : ""}`}
            />

            {/* Overlay spinner pendant l'upload (remplace le spinner global) */}
            {img.isUploading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                <div className="bg-white/90 rounded-full p-2 shadow">
                  <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                </div>
              </div>
            )}

            {/* Barre inférieure : télécharger */}
            {!img.isUploading && (
              <div className="absolute inset-x-0 bottom-0 flex justify-center gap-2 p-1.5 bg-gradient-to-t from-black/60 to-transparent sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                <a
                  href={img.src}
                  download={`photo-${i + 1}.jpg`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-10 h-10 bg-white/90 rounded-full flex items-center justify-center hover:bg-white shadow active:scale-95"
                  title="Télécharger"
                >
                  <Download className="w-4.5 h-4.5 text-gray-700" />
                </a>
              </div>
            )}

            {/* Bouton X */}
            <button
              type="button"
              onClick={async () => {
                if (img.isPending && img.pendingId) {
                  try { await removePendingUpload(img.pendingId); } catch {}
                  return;
                }
                if (img.isPreview) {
                  removePreview(i - validExisting.length - pending.length);
                } else {
                  removeExisting(img.src);
                }
              }}
              className="absolute top-1.5 right-1.5 w-8 h-8 bg-black/60 rounded-full flex items-center justify-center hover:bg-red-500 transition-colors active:scale-95"
              title={
                img.isPending
                  ? "Annuler cet upload en attente"
                  : img.isPreview
                    ? "Annuler cet ajout"
                    : "Supprimer cette photo du rapport"
              }
            >
              <X className="w-4 h-4 text-white" />
            </button>

            {/* Badge "en attente de synchro" (photos IDB hors-ligne) */}
            {img.isPending && (
              <div
                className="absolute top-1.5 left-1.5 flex items-center gap-1 bg-orange-500/90 text-white text-[9px] font-semibold px-1.5 py-0.5 rounded-full shadow"
                title="En attente de synchronisation"
              >
                <CloudUpload className="w-2.5 h-2.5" />
                <span>Sync</span>
              </div>
            )}
          </div>
        ))}

        {/* ── Boutons Camera / Galerie — toujours visibles, même pendant upload ── */}
        <button
          onClick={() => cameraRef.current?.click()}
          className="rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-1.5 text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors active:scale-95 min-h-[80px] relative"
          style={{ aspectRatio: "4/3" }}
        >
          <Camera className="w-7 h-7" />
          <span className="text-xs font-medium">Photo</span>
          {/* Badge discret indiquant qu'un upload tourne en arrière-plan */}
          {uploadingCount > 0 && (
            <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center">
              <Loader2 className="w-2.5 h-2.5 animate-spin text-white" />
            </span>
          )}
        </button>
        <button
          onClick={() => galleryRef.current?.click()}
          className="rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-1.5 text-gray-400 hover:border-purple-400 hover:text-purple-500 transition-colors active:scale-95 min-h-[80px] relative"
          style={{ aspectRatio: "4/3" }}
        >
          <ImagePlus className="w-7 h-7" />
          <span className="text-xs font-medium">Galerie</span>
          {uploadingCount > 0 && (
            <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center">
              <Loader2 className="w-2.5 h-2.5 animate-spin text-white" />
            </span>
          )}
        </button>
      </div>

      {/* Input caméra */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFiles(e, "camera")}
      />
      {/* Input galerie */}
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e, "gallery")}
      />
    </div>
  );
}
