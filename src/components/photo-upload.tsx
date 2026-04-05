"use client";

import { useState, useRef } from "react";
import { Camera, ImagePlus, X, Loader2 } from "lucide-react";

interface PhotoUploadProps {
  category: string;
  label: string;
  projectId: string;
  notionField?: string;
  existingPhotos?: { name: string; url: string }[];
  onUpload?: (files: { name: string; url: string }[]) => void;
}

export function PhotoUpload({
  category,
  label,
  projectId,
  notionField,
  existingPhotos = [],
  onUpload,
}: PhotoUploadProps) {
  const [photos, setPhotos] = useState<{ name: string; url: string }[]>(existingPhotos);
  const [uploading, setUploading] = useState(false);
  const [previews, setPreviews] = useState<string[]>([]);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;

    const newPreviews: string[] = [];
    for (const file of Array.from(files)) {
      newPreviews.push(URL.createObjectURL(file));
    }
    setPreviews((prev) => [...prev, ...newPreviews]);

    setUploading(true);
    const formData = new FormData();
    for (const file of Array.from(files)) {
      formData.append("files", file);
    }
    formData.append("category", category);
    formData.append("projectId", projectId);
    if (notionField) formData.append("notionField", notionField);

    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (data.files) {
        const newPhotos = [...photos, ...data.files];
        setPhotos(newPhotos);
        onUpload?.(newPhotos);
      }
    } catch (err) {
      console.error("Upload error:", err);
    } finally {
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
          <div key={i} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100">
            <img
              src={url}
              alt={`${label} ${i + 1}`}
              className="w-full h-full object-cover"
            />
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
        onChange={handleFiles}
      />
      {/* Input galerie */}
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFiles}
      />
    </div>
  );
}
