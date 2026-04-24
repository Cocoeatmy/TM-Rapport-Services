"use client";

import { useState, useRef } from "react";
import { Camera, X, Loader2, FileCheck } from "lucide-react";
import { toast } from "sonner";
import { thumbnailUrl } from "@/lib/image-url";
import { saveFilesToDeviceGallery } from "@/lib/save-to-gallery";

interface DeliveryScanProps {
  projectId: string;
  bonLivraison?: string;
}

export function DeliveryScan({ projectId, bonLivraison }: DeliveryScanProps) {
  const [url, setUrl] = useState(bonLivraison || "");
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("files", file);
      formData.append("category", "livraisons");
      formData.append("projectId", projectId);

      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const uploadData = await uploadRes.json();

      if (!uploadData.files?.length) {
        toast.error("Erreur lors de l'upload");
        return;
      }

      const imageUrl = uploadData.files[0].url;

      const patchRes = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bonLivraison: imageUrl }),
      });

      if (patchRes.ok) {
        setUrl(imageUrl);
        toast.success("Bon de livraison enregistré");
        // Propose d'ajouter la photo du bon dans Photos.
        saveFilesToDeviceGallery([file]).catch(() => {});
      } else {
        toast.error("Erreur lors de la sauvegarde");
      }
    } catch {
      toast.error("Erreur réseau");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleRemove = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bonLivraison: "" }),
      });
      if (res.ok) {
        setUrl("");
        toast.success("Bon de livraison supprimé");
      }
    } catch {
      toast.error("Erreur réseau");
    }
  };

  return (
    <div className="py-2">
      <p className="text-xs text-gray-500 mb-2">Bon de livraison</p>

      {url ? (
        <div className="relative inline-block">
          <a href={url} target="_blank" rel="noopener noreferrer">
            <img
              src={thumbnailUrl(url, 256)}
              alt="Bon de livraison"
              loading="lazy"
              decoding="async"
              className="w-32 h-24 object-cover rounded-xl border border-gray-200"
            />
          </a>
          <button
            onClick={handleRemove}
            className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center shadow-md"
          >
            <X className="w-3.5 h-3.5 text-white" />
          </button>
          <div className="flex items-center gap-1 mt-1">
            <FileCheck className="w-3.5 h-3.5 text-green-500" />
            <span className="text-xs text-green-600 font-medium">Scanné</span>
          </div>
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed border-gray-300 text-sm text-gray-500 hover:border-blue-400 hover:text-blue-500 active:bg-blue-50 transition-colors disabled:opacity-50"
        >
          {uploading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Camera className="w-4 h-4" />
          )}
          {uploading ? "Envoi en cours..." : "Scanner bon de livraison"}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  );
}
