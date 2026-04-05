"use client";

import { useState, useRef } from "react";
import { Camera, Loader2, Send, ShieldAlert, X, Check } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const DEFAUT_TYPES = [
  { id: "usine", label: "Défaut d'usine" },
  { id: "mesures", label: "Erreur de mesures" },
  { id: "article", label: "Mauvais article" },
  { id: "couleur", label: "Erreur de couleur" },
  { id: "transport", label: "Dommage de transport" },
  { id: "montage", label: "Problème de montage" },
] as const;

interface DefautFormProps {
  projectId: string;
  projectName: string;
}

export function DefautForm({ projectId, projectName }: DefautFormProps) {
  const [open, setOpen] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleType = (id: string) => {
    setSelectedTypes((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setPhotos((prev) => [...prev, ...files]);
    setPhotoPreviews((prev) => [...prev, ...files.map((f) => URL.createObjectURL(f))]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removePhoto = (index: number) => {
    URL.revokeObjectURL(photoPreviews[index]);
    setPhotos((prev) => prev.filter((_, i) => i !== index));
    setPhotoPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const resetForm = () => {
    setSelectedTypes([]);
    setDescription("");
    photoPreviews.forEach((p) => URL.revokeObjectURL(p));
    setPhotos([]);
    setPhotoPreviews([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async () => {
    if (selectedTypes.length === 0 && !description.trim()) return;
    setSending(true);
    try {
      const photoUrls: string[] = [];

      if (photos.length > 0) {
        const formData = new FormData();
        photos.forEach((p) => formData.append("files", p));
        formData.append("projectId", projectId);
        formData.append("category", "defauts");
        const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
        if (uploadRes.ok) {
          const uploadData = await uploadRes.json();
          photoUrls.push(...(uploadData.files?.map((f: { url: string }) => f.url) || []));
        }
      }

      const typesLabel = selectedTypes
        .map((id) => DEFAUT_TYPES.find((t) => t.id === id)?.label)
        .filter(Boolean)
        .join(", ");

      const res = await fetch("/api/defauts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          projectName,
          types: selectedTypes,
          typesLabel,
          description,
          photoUrls,
        }),
      });
      if (res.ok) {
        toast.success("Défaut signalé avec succès");
        resetForm();
        setOpen(false);
      } else {
        toast.error("Erreur lors de l'envoi");
      }
    } catch {
      toast.error("Erreur réseau");
    } finally {
      setSending(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-red-300 text-sm text-red-600 hover:border-red-400 hover:bg-red-50 active:bg-red-100 transition-colors"
      >
        <ShieldAlert className="w-4 h-4" />
        Signaler un défaut
      </button>
    );
  }

  return (
    <div className="glass-card rounded-xl p-4 space-y-3 border-l-4 border-red-400">
      <div className="flex items-center gap-2">
        <ShieldAlert className="w-4 h-4 text-red-500" />
        <span className="text-sm font-semibold text-gray-700">Signaler un défaut</span>
      </div>

      {/* Types de défaut - choix multiple */}
      <div>
        <Label className="text-xs">Type de défaut</Label>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {DEFAUT_TYPES.map((type) => {
            const selected = selectedTypes.includes(type.id);
            return (
              <button
                key={type.id}
                onClick={() => toggleType(type.id)}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  selected
                    ? "bg-red-100 text-red-700 border border-red-300"
                    : "bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200"
                }`}
              >
                {selected && <Check className="w-3 h-3" />}
                {type.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Description libre */}
      <div>
        <Label className="text-xs">Description du défaut</Label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Décrivez le défaut constaté..."
          rows={2}
          className="mt-1"
        />
      </div>

      {/* Photos */}
      <div>
        <Label className="text-xs">Photos du défaut</Label>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handlePhotoChange}
          className="hidden"
        />
        {photoPreviews.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mt-1">
            {photoPreviews.map((preview, i) => (
              <div key={i} className="relative rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                <img src={preview} alt={`Défaut ${i + 1}`} className="w-full h-24 object-cover bg-gray-50 dark:bg-gray-900" />
                <button
                  onClick={() => removePhoto(i)}
                  className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="mt-1.5 w-full flex items-center justify-center gap-2 py-3 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 text-sm text-gray-500 dark:text-gray-400 hover:border-red-400 hover:text-red-500 active:bg-red-50 transition-colors"
        >
          <Camera className="w-5 h-5" />
          {photoPreviews.length > 0 ? "Ajouter une photo" : "Prendre une photo"}
        </button>
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={sending || (selectedTypes.length === 0 && !description.trim())}
          className="flex-1 h-9 rounded-lg bg-red-500 text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          Envoyer
        </button>
        <button
          onClick={() => { resetForm(); setOpen(false); }}
          className="h-9 px-3 rounded-lg border border-gray-200 text-sm text-gray-600"
        >
          Annuler
        </button>
      </div>
    </div>
  );
}
