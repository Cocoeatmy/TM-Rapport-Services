"use client";

import { useState, useEffect } from "react";
import { Camera, X, Package, Loader2, Download } from "lucide-react";

interface CartonPhotosProps {
  projectId: string;
  initialPhotos?: { name: string; url: string }[];
}

export function CartonPhotos({ projectId, initialPhotos }: CartonPhotosProps) {
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Load photos: from Notion (initialPhotos) + localStorage (local additions)
  useEffect(() => {
    const notionUrls = (initialPhotos || []).map((p) => p.url);
    try {
      const saved = localStorage.getItem(`carton-photos-${projectId}`);
      if (saved) {
        const localUrls = JSON.parse(saved) as string[];
        // Merge: Notion photos + local photos not already in Notion
        const merged = [...notionUrls];
        localUrls.forEach((url) => {
          if (!merged.includes(url)) merged.push(url);
        });
        setPhotos(merged);
      } else {
        setPhotos(notionUrls);
      }
    } catch {
      setPhotos(notionUrls);
    }
    setLoaded(true);
  }, [projectId, initialPhotos]);

  // Save to localStorage when photos change
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(`carton-photos-${projectId}`, JSON.stringify(photos));
    } catch {}
  }, [photos, projectId, loaded]);

  // Sync a photo URL to Notion via PATCH
  const syncToNotion = async (allUrls: string[]) => {
    try {
      await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photosCartons: allUrls }),
      });
    } catch {}
  };

  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    const newUrls: string[] = [];
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("upload_preset", process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || "tm_rapport");
        formData.append("folder", `tm-rapport/${projectId}/cartons`);

        const res = await fetch(
          `https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "demo"}/image/upload`,
          { method: "POST", body: formData }
        );
        const data = await res.json();
        if (data.secure_url) {
          newUrls.push(data.secure_url);
        }
      }
      if (newUrls.length > 0) {
        setPhotos((prev) => {
          const updated = [...prev, ...newUrls];
          // Sync all URLs to Notion
          syncToNotion(updated);
          return updated;
        });
      }
    } catch (err) {
      console.error("Upload error:", err);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => {
      const updated = prev.filter((_, i) => i !== index);
      syncToNotion(updated);
      return updated;
    });
  };

  return (
    <div className="mt-4">
      <label className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center gap-2 mb-2">
        <Package className="w-4 h-4" />
        État des cartons réceptionnés
      </label>

      {/* Photos grid */}
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-2">
          {photos.map((url, i) => (
            <div key={i} className="relative group rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
              <img src={url} alt={`Carton ${i + 1}`} className="w-full h-24 object-cover" />
              <button
                type="button"
                onClick={() => removePhoto(i)}
                className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-80 hover:opacity-100"
              >
                <X className="w-3 h-3" />
              </button>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute bottom-1 right-1 w-5 h-5 bg-white/80 text-gray-700 rounded-full flex items-center justify-center"
              >
                <Download className="w-3 h-3" />
              </a>
            </div>
          ))}
        </div>
      )}

      {/* Capture button */}
      <label className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 text-sm text-gray-500 dark:text-gray-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10 active:scale-95 transition-all cursor-pointer">
        {uploading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Envoi en cours...
          </>
        ) : (
          <>
            <Camera className="w-4 h-4" />
            Photographier les cartons
          </>
        )}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          onChange={handleCapture}
          className="hidden"
          disabled={uploading}
        />
      </label>
    </div>
  );
}
