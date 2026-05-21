"use client";

import { useState, useRef, useEffect } from "react";
import { Camera, ImagePlus, X, Loader2, Download, CloudUpload } from "lucide-react";
import { thumbnailUrl } from "@/lib/image-url";
import { invalidateApiCache } from "@/lib/api-helpers";
import { compressImage } from "@/lib/compress-image";
import { saveFilesToDeviceGallery } from "@/lib/save-to-gallery";
import { addPendingUpload, removePendingUpload } from "@/lib/idb-uploads";
import { usePendingUploads } from "@/lib/use-pending-uploads";
import { isOnline } from "@/lib/offline";
import { toast } from "sonner";

interface PhotoUploadProps {
  category: string;
  label: string;
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
  projectId,
  notionField,
  filePrefix,
  existingPhotos = [],
  onUpload,
  onDelete,
  onFilesSelected,
}: PhotoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [previews, setPreviews] = useState<string[]>([]);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  // Garde synchrone : empêche un 2e onChange de relancer un upload
  // pendant que le 1er est en cours. setUploading() est trop lent à
  // s'appliquer pour bloquer un double-fire iOS.
  const uploadingRef = useRef(false);
  // Nombre de fichiers actuellement en IDB (photos hors-ligne en attente).
  // Mis à jour à chaque render via pendingCountRef.current = pending.length.
  // Utilisé dans handleFiles pour calculer l'index de nommage correct
  // même quand des photos sont déjà dans la queue IDB mais pas encore dans Notion.
  const pendingCountRef = useRef(0);

  // Nettoyage : révoque tous les blob URLs encore en mémoire au démontage
  // (sinon le navigateur les garde indéfiniment et on a des fuites).
  useEffect(() => {
    return () => {
      previews.forEach((u) => {
        try { URL.revokeObjectURL(u); } catch {}
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // `source` indique d'où vient le fichier :
  //   - "camera"  : photo prise via l'appareil photo → on propose aussi
  //                 à l'OS de la sauvegarder dans Photos (sinon elle
  //                 ne reste que dans l'app / Notion / Cloudinary)
  //   - "gallery" : photo déjà dans la galerie → rien à sauvegarder
  const handleFiles = async (
    e: React.ChangeEvent<HTMLInputElement>,
    source: "camera" | "gallery" = "gallery",
  ) => {
    const files = e.target.files;
    if (!files?.length) return;
    // Si un upload est déjà en cours, on ignore — sinon iOS peut
    // re-déclencher le change avec les mêmes fichiers et créer des
    // doublons (Cloudinary génère un nouveau public_id à chaque post).
    if (uploadingRef.current) {
      e.target.value = "";
      return;
    }
    uploadingRef.current = true;

    const originals: File[] = Array.from(files);
    onFilesSelected?.(originals);

    const newPreviews: string[] = [];
    for (const file of originals) {
      newPreviews.push(URL.createObjectURL(file));
    }
    setPreviews((prev) => [...prev, ...newPreviews]);

    setUploading(true);
    // Pré-renomme les fichiers (préfixe de bucket pour photos rapport).
    //
    // IMPORTANT — index incluant les photos en IDB :
    //   `existingPhotos` = photos déjà dans Notion (synchro OK)
    //   `pendingCountRef.current` = photos en IDB (en attente de synchro)
    //
    // Sans `pendingCountRef`, si le monteur prend 2 photos hors-ligne :
    //   - Photo 1 → IDB → "Avant intervention.Cab1.1.jpg"
    //   - Photo 2 → existingPhotos encore vide → "Avant intervention.Cab1.1.jpg" (COLLISION!)
    //   → Au sync, la 2e est vue comme doublon et SUPPRIMÉE silencieusement.
    //
    // IMPORTANT — suffixe timestamp pour l'unicité cross-device :
    //   Deux appareils différents pourraient calculer le même index simultanément.
    //   Le suffixe `Date.now()` rend le nom globalement unique.
    //   Le suffixe ne casse pas la détection de bucket (`detectBucket` vérifie le PRÉFIXE)
    //   ni l'extraction de cabine (`extractCabine` cherche `.Cab(\d+).` en regex).
    //   Format final : `Avant intervention.Cab1.2.1716792001234.jpg`
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

    // Compression côté client en parallèle avant upload.
    // Réduit une photo iPhone (10 Mo) à ~400 Ko → upload 20x plus rapide.
    const compressed: File[] = await Promise.all(
      renamed.map((f) => compressImage(f, 1600, 0.82))
    );

    // Helper : enregistre les fichiers en IDB pour upload différé
    // dès le retour réseau. Les blobs survivent au reload, et le
    // hook usePendingUploads les redessine en attendant la synchro.
    const queueOffline = async (reason: "offline" | "error") => {
      try {
        // IMPORTANT : on utilise `compressed` (déjà calculé) et non `renamed`
        // (version originale ~10 Mo). L'IDB stocke des blobs — stocker 10 Mo
        // par photo remplirait le quota en quelques clichés sur mobile.
        await addPendingUpload({
          projectId,
          category,
          notionField,
          files: compressed.map((f) => ({ name: f.name, type: f.type, blob: f })),
        });
        toast.info(
          reason === "offline"
            ? "Photo enregistrée — sera envoyée au retour du réseau"
            : "Upload en attente — nouvelle tentative auto",
          { duration: 3500 },
        );
      } catch (idbErr) {
        console.error("[photo-upload] IDB queue error:", idbErr);
        toast.error("Impossible de mettre en file la photo");
      }
    };

    try {
      // Court-circuit si déjà offline : pas la peine de tenter le
      // fetch (ça consomme une seconde + un timeout). On queue direct.
      if (!isOnline()) {
        await queueOffline("offline");
        return;
      }
      const formData = new FormData();
      for (const f of compressed) formData.append("files", f);
      formData.append("category", category);
      formData.append("projectId", projectId);
      if (notionField) formData.append("notionField", notionField);

      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.files) {
        // On passe UNIQUEMENT les nouveaux fichiers au parent — pas
        // [...existingPhotos, ...data.files]. La raison : existingPhotos
        // est capturé dans la closure au moment du render, pas au moment
        // où le callback s'exécute. En cas de re-render entre-temps, la
        // valeur serait périmée et l'ancienne photo disparaîtrait de l'UI.
        // Le parent (handleUpload) fait un append dans setProject(prev =>
        // ...) ce qui lit toujours l'état le plus récent.
        const newFiles = (data.files as { name: string; url: string }[]).filter(
          (p) => p?.url,
        );
        invalidateApiCache();
        onUpload?.(newFiles);

        // Nettoyage des previews locaux APRÈS que le parent a mis à jour
        // son état — les vraies URL Cloudinary sont maintenant dans
        // existingPhotos, donc la photo reste visible.
        setPreviews((prev) => {
          prev.forEach((u) => { try { URL.revokeObjectURL(u); } catch {} });
          return [];
        });

        if (source === "camera") {
          saveFilesToDeviceGallery(originals).catch(() => {});
        }
      } else if (res.status >= 500 || !res.ok) {
        // Erreur serveur : on queue pour rejouer.
        await queueOffline("error");
      } else if (data.error) {
        console.error("Upload rejected:", data.error);
      }
    } catch (err) {
      console.error("Upload error:", err);
      // Erreur réseau (TypeError fetch) : queue dans IDB.
      await queueOffline("error");
    } finally {
      uploadingRef.current = false;
      setUploading(false);
      if (cameraRef.current) cameraRef.current.value = "";
      if (galleryRef.current) galleryRef.current.value = "";
    }
  };

  // En cas d'échec d'upload (catch ci-dessus), les blobs restent dans
  // previews — on les nettoie quand le bouton X (preview transitoire)
  // est appuyé. Pour les vraies photos déjà uploadées, la suppression
  // passe par le parent (PATCH Notion).
  const removePreview = (index: number) => {
    setPreviews((prev) => {
      const url = prev[index];
      if (url) { try { URL.revokeObjectURL(url); } catch {} }
      return prev.filter((_, i) => i !== index);
    });
  };

  // Filtre des URL valides uniquement (string non vide, prêt à charger).
  // Évite que des entrées corrompues affichent un placeholder cassé.
  const validExisting = existingPhotos.filter((p) => p && p.url && p.url.length > 0);

  // Uploads pendants dans IDB qui correspondent à CE composant
  // (même projet, même catégorie + notionField). On les affiche
  // comme des vignettes en attente de synchro pour que l'utilisateur
  // garde un retour visuel après reload.
  const pending = usePendingUploads(projectId).filter(
    (p) =>
      p.category === category &&
      (notionField ? p.notionField === notionField : !p.notionField),
  );
  // Mettre à jour la ref à chaque render pour que handleFiles utilise
  // le bon nombre de photos en attente lors du prochain appel.
  pendingCountRef.current = pending.length;

  const allImages: { src: string; isPreview: boolean; pendingId?: string; isPending?: boolean }[] = [
    ...validExisting.map((p) => ({ src: p.url, isPreview: false })),
    ...pending.map((p) => ({ src: p.objectUrl, isPreview: false, pendingId: p.id, isPending: true })),
    ...previews.map((u) => ({ src: u, isPreview: true })),
  ];

  // Suppression d'une photo déjà sauvegardée : on retire l'entrée
  // de la liste et on remonte au parent via onUpload, qui PATCH
  // la nouvelle liste vers Notion. Confirmation avant pour éviter
  // les suppressions accidentelles (la photo est définitivement
  // retirée du rapport, on ne peut pas la "rétablir").
  const removeExisting = (url: string) => {
    if (!confirm("Supprimer cette photo du rapport ?")) return;
    const updated = validExisting.filter((p) => p.url !== url);
    onDelete?.(updated);
    invalidateApiCache();
  };

  return (
    <div>
      <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">{label}</label>
      <div className="grid grid-cols-2 gap-2">
        {allImages.map((img, i) => (
          <div key={`${img.isPreview ? "p" : "e"}-${i}-${img.src}`} className="relative rounded-xl overflow-hidden bg-gray-100 group" style={{ aspectRatio: "4/3" }}>
            <img
              src={img.isPreview ? img.src : thumbnailUrl(img.src, 300)}
              alt={`${label} ${i + 1}`}
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover"
            />
            {/* Barre inférieure : télécharger (toujours visible sur mobile) */}
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
            {/* Bouton X de suppression — séparé du bouton télécharger */}
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
            {/* Badge "en attente de synchro" */}
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

        {uploading ? (
          <div className="rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center" style={{ aspectRatio: "4/3" }}>
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : (
          <>
            <button
              onClick={() => cameraRef.current?.click()}
              className="rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-1.5 text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors active:scale-95 min-h-[80px]"
              style={{ aspectRatio: "4/3" }}
            >
              <Camera className="w-7 h-7" />
              <span className="text-xs font-medium">Photo</span>
            </button>
            <button
              onClick={() => galleryRef.current?.click()}
              className="rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-1.5 text-gray-400 hover:border-purple-400 hover:text-purple-500 transition-colors active:scale-95 min-h-[80px]"
              style={{ aspectRatio: "4/3" }}>
              <ImagePlus className="w-7 h-7" />
              <span className="text-xs font-medium">Galerie</span>
            </button>
          </>
        )}
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
