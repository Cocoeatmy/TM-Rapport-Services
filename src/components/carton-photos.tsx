"use client";

import { useState, useEffect, useRef } from "react";
import { Camera, X, Package, Loader2, Download } from "lucide-react";
import { thumbnailUrl } from "@/lib/image-url";
import { saveFilesToDeviceGallery } from "@/lib/save-to-gallery";

interface CartonPhotosProps {
  projectId: string;
  initialPhotos?: { name: string; url: string }[];
}

/** Déduplique tout en préservant l'ordre. Sert de filet de sécurité au
 *  cas où un état (Notion ou localStorage) contiendrait déjà des doublons. */
function dedupOrdered(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

export function CartonPhotos({ projectId, initialPhotos }: CartonPhotosProps) {
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // Garde synchrone contre les multi-déclenchements de onChange (bug
  // iOS connu avec capture="environment" + multiple, ou double-tap).
  // setUploading() est asynchrone, le 2e click peut passer avant que
  // le re-render n'applique disabled={uploading} sur l'input.
  const uploadingRef = useRef(false);

  // Load photos: from Notion (initialPhotos) + localStorage (local additions)
  useEffect(() => {
    const rawNotion = (initialPhotos || []).map((p) => p.url);
    const notionUrls = dedupOrdered(rawNotion);
    let nextState: string[];
    try {
      const saved = localStorage.getItem(`carton-photos-${projectId}`);
      if (saved) {
        const localUrls = JSON.parse(saved) as string[];
        const merged = [...notionUrls];
        localUrls.forEach((url) => {
          if (!merged.includes(url)) merged.push(url);
        });
        nextState = dedupOrdered(merged);
      } else {
        nextState = notionUrls;
      }
    } catch {
      nextState = notionUrls;
    }
    setPhotos(nextState);
    setLoaded(true);

    // Auto-héal : si Notion contenait des doublons (bug historique
    // d'avant ce fix), on PATCH la liste nettoyée pour réparer la
    // base. Côté utilisateur c'est transparent — le rendu était déjà
    // dédoublonné, mais on fait aussi le ménage côté serveur.
    if (rawNotion.length > notionUrls.length) {
      syncToNotion(notionUrls);
    }
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
    // Garde synchrone : si un upload est déjà en cours on ignore le
    // déclenchement supplémentaire (double-fire iOS, double-tap, etc.).
    if (uploadingRef.current) {
      e.target.value = "";
      return;
    }
    uploadingRef.current = true;

    const originals: File[] = Array.from(files);

    setUploading(true);
    const newUrls: string[] = [];
    try {
      for (const file of originals) {
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
          const updated = dedupOrdered([...prev, ...newUrls]);
          syncToNotion(updated);
          return updated;
        });
        saveFilesToDeviceGallery(originals).catch(() => {});
      }
    } catch (err) {
      console.error("Upload error:", err);
    } finally {
      uploadingRef.current = false;
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

      {/* Photos grid — on déduplique au rendu pour qu'un état déjà
          corrompu (avant ce fix) n'affiche pas de doublons à l'écran. */}
      {(() => {
        const display = dedupOrdered(photos);
        if (display.length === 0) return null;
        return (
          <div className="grid grid-cols-3 gap-2 mb-2">
            {display.map((url, i) => (
              <div key={url} className="relative group rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                <img src={thumbnailUrl(url, 200)} alt={`Carton ${i + 1}`} loading="lazy" decoding="async" className="w-full h-24 object-cover" />
                <button
                  type="button"
                  onClick={() => {
                    // On retire toutes les occurrences de cette URL,
                    // pas seulement l'index — si l'état contient encore
                    // des doublons résiduels, un seul clic les nettoie.
                    setPhotos((prev) => {
                      const cleaned = prev.filter((p) => p !== url);
                      syncToNotion(dedupOrdered(cleaned));
                      return dedupOrdered(cleaned);
                    });
                  }}
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
        );
      })()}

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
