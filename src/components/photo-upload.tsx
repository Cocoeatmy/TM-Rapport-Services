"use client";

import { useState, useRef } from "react";
import { Camera, ImagePlus, X, Loader2, Download } from "lucide-react";
import { thumbnailUrl } from "@/lib/image-url";
import { invalidateApiCache } from "@/lib/api-helpers";
import { saveFilesToDeviceGallery } from "@/lib/save-to-gallery";

interface PhotoUploadProps {
  category: string;
  label: string;
  projectId: string;
  notionField?: string;
  filePrefix?: string;
  existingPhotos?: { name: string; url: string }[];
  onUpload?: (files: { name: string; url: string }[]) => void;
}

export function PhotoUpload({
  category,
  label,
  projectId,
  notionField,
  filePrefix,
  existingPhotos = [],
  onUpload,
}: PhotoUploadProps) {
  const [photos, setPhotos] = useState<{ name: string; url: string }[]>(existingPhotos);
  const [uploading, setUploading] = useState(false);
  const [previews, setPreviews] = useState<string[]>([]);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  // Garde synchrone : empêche un 2e onChange de relancer un upload
  // pendant que le 1er est en cours. setUploading() est trop lent à
  // s'appliquer pour bloquer un double-fire iOS.
  const uploadingRef = useRef(false);

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

    const newPreviews: string[] = [];
    for (const file of originals) {
      newPreviews.push(URL.createObjectURL(file));
    }
    setPreviews((prev) => [...prev, ...newPreviews]);

    setUploading(true);
    const formData = new FormData();
    const currentCount = photos.length + existingPhotos.length;
    originals.forEach((file, i) => {
      const idx = currentCount + i + 1;
      const ext = file.name.split(".").pop() || "jpg";
      const newName = filePrefix ? `${filePrefix}.${idx}.${ext}` : file.name;
      const renamedFile = new File([file], newName, { type: file.type });
      formData.append("files", renamedFile);
    });
    formData.append("category", category);
    formData.append("projectId", projectId);
    if (notionField) formData.append("notionField", notionField);

    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (data.files) {
        // Dédup par URL au cas où l'utilisateur (ou un double-fire
        // iOS qui aurait passé la garde) envoie deux fois la même URL.
        const seen = new Set<string>();
        const newPhotos = [...photos, ...data.files].filter((p: { url: string }) => {
          if (!p?.url || seen.has(p.url)) return false;
          seen.add(p.url);
          return true;
        });
        setPhotos(newPhotos);
        // Purge le cache du service worker pour que le prochain
        // fetch `/api/projects/[id]` retourne bien les nouvelles
        // photos au lieu d'une version pré-upload.
        invalidateApiCache();
        onUpload?.(newPhotos);

        // Photos prises avec la caméra : on propose à l'OS de les
        // sauvegarder dans Photos via la Web Share API (iOS 15+,
        // Android). Sur desktop c'est un fallback vers Downloads.
        // Silencieux : pas d'alerte si l'utilisateur annule ou si
        // le support n'est pas là. Pour les photos venues de la
        // galerie, rien à faire — elles y sont déjà.
        if (source === "camera") {
          saveFilesToDeviceGallery(originals).catch(() => {});
        }
      } else if (data.error) {
        console.error("Upload rejected:", data.error);
      }
    } catch (err) {
      console.error("Upload error:", err);
    } finally {
      uploadingRef.current = false;
      setUploading(false);
      if (cameraRef.current) cameraRef.current.value = "";
      if (galleryRef.current) galleryRef.current.value = "";
    }
  };

  const removePreview = (index: number) => {
    setPreviews((prev) => prev.filter((_, i) => i !== index));
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const allImages = [
    ...existingPhotos.map((p) => p.url),
    ...previews,
  ];

  return (
    <div>
      <label className="text-sm font-medium text-gray-700 mb-2 block">{label}</label>
      <div className="grid grid-cols-3 gap-2">
        {allImages.map((url, i) => (
          <div key={i} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100 group">
            <img
              src={url.startsWith("blob:") ? url : thumbnailUrl(url, 300)}
              alt={`${label} ${i + 1}`}
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-x-0 bottom-0 flex justify-center gap-1 p-1 bg-gradient-to-t from-black/50 to-transparent sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
              <a
                href={url}
                download={`photo-${i + 1}.jpg`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-7 h-7 bg-white/80 rounded-full flex items-center justify-center hover:bg-white"
              >
                <Download className="w-3.5 h-3.5 text-gray-700" />
              </a>
            </div>
            {i >= existingPhotos.length && (
              <button
                onClick={() => removePreview(i - existingPhotos.length)}
                className="absolute top-1 right-1 w-6 h-6 bg-black/50 rounded-full flex items-center justify-center"
              >
                <X className="w-3.5 h-3.5 text-white" />
              </button>
            )}
          </div>
        ))}

        {uploading ? (
          <div className="aspect-square rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : (
          <>
            <button
              onClick={() => cameraRef.current?.click()}
              className="aspect-square rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors active:scale-95"
            >
              <Camera className="w-6 h-6" />
              <span className="text-[10px]">Photo</span>
            </button>
            <button
              onClick={() => galleryRef.current?.click()}
              className="aspect-square rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-purple-400 hover:text-purple-500 transition-colors active:scale-95"
            >
              <ImagePlus className="w-6 h-6" />
              <span className="text-[10px]">Galerie</span>
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
