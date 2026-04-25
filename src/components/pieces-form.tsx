"use client";

import { useState, useRef } from "react";
import { Package, Camera, Loader2, Send, AlertTriangle, X, ImagePlus, Sparkles } from "lucide-react";
import { offlineFetch } from "@/lib/offline";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import dynamic from "next/dynamic";
const VoiceRecorder = dynamic(() => import("@/components/voice-recorder").then(m => ({ default: m.VoiceRecorder })), { ssr: false });

interface PiecesFormProps {
  projectId: string;
  projectName: string;
  onSubmitted?: () => void;
}

export function PiecesForm({ projectId, projectName, onSubmitted }: PiecesFormProps) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const handleAI = async () => {
    if (!description.trim() || description.trim().length < 10) return;
    setAiLoading(true);
    try {
      const res = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: `Reformule cette description de pièce manquante de manière claire et professionnelle pour un rapport technique. Réponds uniquement avec le texte reformulé :\n\n${description}` }) });
      if (res.ok) { const data = await res.json(); if (data.answer || data.response) setDescription((data.answer || data.response).trim()); }
    } catch {} finally { setAiLoading(false); }
  };

  const handlePhotoFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const newFiles = Array.from(files);
    setPhotos((prev) => [...prev, ...newFiles]);
    setPhotoPreviews((prev) => [...prev, ...newFiles.map((f) => URL.createObjectURL(f))]);
  };

  const removePhoto = (index: number) => {
    URL.revokeObjectURL(photoPreviews[index]);
    setPhotos((prev) => prev.filter((_, i) => i !== index));
    setPhotoPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const reset = () => {
    setDescription("");
    setReference("");
    photoPreviews.forEach((p) => URL.revokeObjectURL(p));
    setPhotos([]);
    setPhotoPreviews([]);
    if (cameraRef.current) cameraRef.current.value = "";
    if (galleryRef.current) galleryRef.current.value = "";
  };

  const handleSubmit = async () => {
    if (!description.trim()) return;
    setSending(true);
    try {
      const photoUrls: string[] = [];

      if (photos.length > 0) {
        const formData = new FormData();
        photos.forEach((p, i) => {
          const ext = p.name.split(".").pop() || "jpg";
          formData.append("files", new File([p], `piece-${i + 1}.${ext}`, { type: p.type }));
        });
        formData.append("projectId", projectId);
        formData.append("category", "pieces");
        formData.append("notionField", "Photos - Pièces manquante");
        const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
        if (uploadRes.ok) {
          const uploadData = await uploadRes.json();
          photoUrls.push(...(uploadData.files?.map((f: { url: string }) => f.url) || []));
        }
      }

      const res = await offlineFetch("/api/pieces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, projectName, description, reference, photoUrls }),
      });
      if (res.ok) {
        toast.success("Demande de pièce envoyée");
        onSubmitted?.();
        reset();
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
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-orange-300 text-sm text-orange-600 hover:border-orange-400 hover:bg-orange-50 active:bg-orange-100 transition-colors"
      >
        <AlertTriangle className="w-4 h-4" />
        Signaler une pièce manquante
      </button>
    );
  }

  return (
    <div className="glass-card rounded-xl p-4 space-y-3 border-l-4 border-orange-400">
      <div className="flex items-center gap-2">
        <Package className="w-4 h-4 text-orange-500" />
        <span className="text-sm font-semibold text-gray-700">Pièce manquante</span>
      </div>
      <div>
        <Label className="text-xs">Description de la pièce</Label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Ex: Joint silicone angle gauche, poignée de porte..."
          rows={2}
          className="mt-1"
        />
        <div className="flex items-center gap-2 mt-1">
          <VoiceRecorder onTranscript={(text) => setDescription((prev) => prev ? prev + " " + text : text)} />
          {description.trim().length > 10 && (
            <button onClick={handleAI} disabled={aiLoading} className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-700 disabled:opacity-50">
              {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {aiLoading ? "IA..." : "✨ Reformuler"}
            </button>
          )}
        </div>
      </div>
      <div>
        <Label className="text-xs">Référence (si connue)</Label>
        <Input
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="Ex: REF-12345, N° article..."
          className="mt-1 h-9"
        />
      </div>

      {/* Photos */}
      <div>
        <Label className="text-xs">Photos de la pièce / éclaté</Label>
        {photoPreviews.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mt-1 mb-2">
            {photoPreviews.map((preview, i) => (
              <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-gray-200">
                <img src={preview} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
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
        <div className="flex gap-2 mt-1">
          <button
            onClick={() => cameraRef.current?.click()}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg border-2 border-dashed border-gray-300 text-sm text-gray-500 hover:border-orange-400 hover:text-orange-500 active:bg-orange-50 transition-colors"
          >
            <Camera className="w-4 h-4" />
            Photo
          </button>
          <button
            onClick={() => galleryRef.current?.click()}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg border-2 border-dashed border-gray-300 text-sm text-gray-500 hover:border-orange-400 hover:text-orange-500 active:bg-orange-50 transition-colors"
          >
            <ImagePlus className="w-4 h-4" />
            Galerie
          </button>
        </div>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handlePhotoFiles(e.target.files)} />
        <input ref={galleryRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handlePhotoFiles(e.target.files)} />
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={sending || !description.trim()}
          className="flex-1 h-9 rounded-lg bg-orange-500 text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          Envoyer
        </button>
        <button
          onClick={() => { setOpen(false); reset(); }}
          className="h-9 px-3 rounded-lg border border-gray-200 text-sm text-gray-600"
        >
          Annuler
        </button>
      </div>
    </div>
  );
}
