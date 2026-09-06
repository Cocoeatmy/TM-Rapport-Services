"use client";

import { useState, useRef, useEffect } from "react";
import { Camera, ImagePlus, X, Loader2, Download, CloudUpload, RotateCcw, RotateCw, FileText } from "lucide-react";
import { thumbnailUrl, rotateCloudinaryUrl } from "@/lib/image-url";
import { invalidateApiCache } from "@/lib/api-helpers";
import { compressImage } from "@/lib/compress-image";
import { uploadToCloudinary, attachPhotos, UploadError } from "@/lib/cloudinary-upload";
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
  /** Appelé après une rotation d'une photo existante : le parent remplace
   *  l'URL et PATCH Notion (oldUrl → newUrl). */
  onRotate?: (oldUrl: string, newUrl: string) => void;
  /** Appelé dès que l'utilisateur sélectionne des fichiers (avant upload/compression) */
  onFilesSelected?: (files: File[]) => void;
  /** Types de fichiers acceptés (défaut : images seules). Ex. "image/*,video/*". */
  accept?: string;
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
  onRotate,
  onFilesSelected,
  accept = "image/*",
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
    // Seules les IMAGES passent par la compression (canvas). Les vidéos ET les
    // PDF (ou tout autre type non-image) sont uploadés tels quels.
    const compressed: File[] = await Promise.all(
      renamed.map((f) => (f.type.startsWith("image/") ? compressImage(f, 1600, 0.82) : Promise.resolve(f)))
    );

    // Helper : enregistre les fichiers en IDB pour upload différé.
    // `uploadedUrl` (si la photo est DÉJÀ sur Cloudinary) est conservé → le
    // re-essai ne re-uploade jamais les octets, il ne refait que le rattachement.
    const queueOffline = async (
      reason: "offline" | "error",
      items: { file: File; uploadedUrl?: string }[] = compressed.map((f) => ({ file: f })),
    ) => {
      try {
        await addPendingUpload({
          projectId,
          category,
          notionField,
          files: items.map((x) => ({ name: x.file.name, type: x.file.type, blob: x.file, uploadedUrl: x.uploadedUrl })),
        });
        toast.info(
          reason === "offline"
            ? "Photo enregistrée — sera envoyée au retour du réseau"
            : "Upload en attente — nouvelle tentative auto",
          { duration: 3500 },
        );
        // En ligne (échec ponctuel) : relance tout de suite le traitement de la
        // file au lieu d'attendre le poll de 30 s.
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

      // Upload DIRECT vers Cloudinary (les octets ne passent PAS par Vercel →
      // fiable même en 5G lente, pas de limite 4,5 Mo), puis rattachement Notion
      // (petit JSON). Si seul le rattachement échoue, on met en file AVEC l'URL
      // Cloudinary → le re-essai ne renvoie jamais les octets.
      const newFiles: { name: string; url: string }[] = [];
      const failed: { file: File; uploadedUrl?: string; preview: string }[] = [];
      // Échecs PERMANENTS (mauvaise config Notion : champ inexistant / mauvais
      // type…) : on NE réessaie PAS (fini le « moulinage sans fin »), on affiche
      // une erreur claire et on retire l'aperçu.
      const permanentFailed: { preview: string; message: string }[] = [];
      const isPermanent = (e: unknown) => e instanceof UploadError && e.permanent;
      for (let i = 0; i < compressed.length; i++) {
        const f = compressed[i];
        let url: string;
        try {
          url = await uploadToCloudinary(f, f.name, projectId, category);
        } catch (e) {
          if (isPermanent(e)) permanentFailed.push({ preview: newPreviews[i], message: (e as UploadError).message });
          else failed.push({ file: f, preview: newPreviews[i] });
          continue;
        }
        try {
          if (notionField) await attachPhotos(projectId, notionField, [{ name: f.name, url }]);
          newFiles.push({ name: f.name, url });
        } catch (e) {
          if (isPermanent(e)) permanentFailed.push({ preview: newPreviews[i], message: (e as UploadError).message });
          else failed.push({ file: f, uploadedUrl: url, preview: newPreviews[i] });
        }
      }

      if (newFiles.length > 0) {
        invalidateApiCache();
        onUpload?.(newFiles);
        if (source === "camera") {
          saveFilesToDeviceGallery(originals).catch(() => {});
        }
      }

      // Retire les previews des photos réussies ET des échecs PERMANENTS (qui ne
      // seront pas réessayés) ; garde uniquement celles en échec TRANSITOIRE.
      const keepPreviews = failed.map((x) => x.preview);
      setPreviews((prev) => {
        const toRemove = newPreviews.filter((u) => !keepPreviews.includes(u));
        toRemove.forEach((u) => { try { URL.revokeObjectURL(u); } catch {} });
        return prev.filter((u) => !toRemove.includes(u));
      });

      if (permanentFailed.length > 0) {
        toast.error(
          `Enregistrement impossible dans Notion${notionField ? ` (champ « ${notionField} »)` : ""} : ${permanentFailed[0].message}. Vérifiez que la colonne existe et est de type « Fichiers ».`,
          { duration: 12000 },
        );
      }

      if (failed.length > 0) {
        await queueOffline("error", failed.map((x) => ({ file: x.file, uploadedUrl: x.uploadedUrl })));
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

  // Rotation d'une photo existante : ±90°. On calcule la nouvelle URL Cloudinary
  // (transformation d'angle bakée) et on laisse le parent PATCH Notion.
  const rotateExisting = (url: string, delta: number) => {
    const newUrl = rotateCloudinaryUrl(url, delta);
    if (newUrl === url) {
      toast.info("Rotation indisponible pour cette photo");
      return;
    }
    onRotate?.(url, newUrl);
    invalidateApiCache();
  };

  // PDF : pas d'aperçu image → tuile dédiée (icône + « PDF »), cliquable.
  const isPdfUrl = (u: string) => /\.pdf(\?|$)/i.test(u);
  // Ouverture PDF : via le proxy /api/doc-proxy (même origine, en-têtes
  // corrects). Le lecteur PDF de Chrome échoue à streamer les fichiers `raw`
  // Cloudinary en direct, et `fl_attachment` renvoie 401 (transformations
  // strictes du compte). Le proxy contourne les deux.
  const pdfViewUrl = (u: string) =>
    u.includes("res.cloudinary.com") ? `/api/doc-proxy?u=${encodeURIComponent(u)}` : u;
  // Vidéo Cloudinary : poster (1re image) au lieu d'une <img> cassée.
  const isVideoUrl = (u: string) => u.includes("/video/upload/") || /\.(mp4|mov|webm|m4v|avi)(\?|$)/i.test(u);
  const videoPosterUrl = (u: string) => {
    const marker = "/video/upload/";
    const i = u.indexOf(marker);
    if (i < 0) return u;
    const after = u.slice(i + marker.length).replace(/\.[a-z0-9]+(\?.*)?$/i, ".jpg");
    return `${u.slice(0, i + marker.length)}so_0,w_400,c_fill,q_auto/${after}`;
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
            {!img.isPreview && isPdfUrl(img.src) ? (
              <a
                href={pdfViewUrl(img.src)}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full h-full flex flex-col items-center justify-center gap-1.5 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400"
                title="Ouvrir / télécharger le PDF"
              >
                <FileText className="w-8 h-8" />
                <span className="text-[11px] font-semibold">PDF</span>
              </a>
            ) : (
              <img
                src={img.isPreview ? img.src : (isVideoUrl(img.src) ? videoPosterUrl(img.src) : thumbnailUrl(img.src, 300))}
                alt={`${label} ${i + 1}`}
                loading="lazy"
                decoding="async"
                className={`w-full h-full object-cover transition-opacity ${img.isUploading ? "opacity-70" : ""}`}
              />
            )}
            {/* Badge « vidéo » (poster affiché) */}
            {!img.isPreview && isVideoUrl(img.src) && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="bg-black/55 rounded-full w-9 h-9 flex items-center justify-center">
                  <span className="text-white text-[13px] ml-0.5">▶</span>
                </div>
              </div>
            )}

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
                  href={isPdfUrl(img.src) ? `${pdfViewUrl(img.src)}&dl=1` : img.src}
                  download={`document-${i + 1}.${isPdfUrl(img.src) ? "pdf" : isVideoUrl(img.src) ? "mp4" : "jpg"}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-10 h-10 bg-white/90 rounded-full flex items-center justify-center hover:bg-white shadow active:scale-95"
                  title="Télécharger"
                >
                  <Download className="w-4.5 h-4.5 text-gray-700" />
                </a>
              </div>
            )}

            {/* Barre d'actions en haut à droite : rotation (photos existantes
                uniquement) + suppression. */}
            <div className="absolute top-1.5 right-1.5 flex items-center gap-1">
              {/* Rotation gauche / droite — seulement pour les photos déjà
                  enregistrées (pas les previews ni les uploads en attente). */}
              {!img.isUploading && !img.isPreview && !img.isPending && (
                <>
                  <button
                    type="button"
                    onClick={() => rotateExisting(img.src, -90)}
                    className="w-8 h-8 bg-black/60 rounded-full flex items-center justify-center hover:bg-blue-500 transition-colors active:scale-95"
                    title="Pivoter vers la gauche"
                  >
                    <RotateCcw className="w-4 h-4 text-white" />
                  </button>
                  <button
                    type="button"
                    onClick={() => rotateExisting(img.src, 90)}
                    className="w-8 h-8 bg-black/60 rounded-full flex items-center justify-center hover:bg-blue-500 transition-colors active:scale-95"
                    title="Pivoter vers la droite"
                  >
                    <RotateCw className="w-4 h-4 text-white" />
                  </button>
                </>
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
                className="w-8 h-8 bg-black/60 rounded-full flex items-center justify-center hover:bg-red-500 transition-colors active:scale-95"
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
            </div>

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
        accept={accept}
        capture="environment"
        className="hidden"
        onChange={(e) => handleFiles(e, "camera")}
      />
      {/* Input galerie */}
      <input
        ref={galleryRef}
        type="file"
        accept={accept}
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e, "gallery")}
      />
    </div>
  );
}
