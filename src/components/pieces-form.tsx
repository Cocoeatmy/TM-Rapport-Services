"use client";

import { useState, useRef } from "react";
import { Package, Camera, Loader2, Send, AlertTriangle, X, ImageIcon, Sparkles } from "lucide-react";
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
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAI = async () => {
    if (!description.trim() || description.trim().length < 10) return;
    setAiLoading(true);
    try {
      const res = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: `Reformule cette description de pièce manquante de manière claire et professionnelle pour un rapport technique. Réponds uniquement avec le texte reformulé :\n\n${description}` }) });
      if (res.ok) { const data = await res.json(); if (data.answer || data.response) setDescription((data.answer || data.response).trim()); }
    } catch {} finally { setAiLoading(false); }
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const removePhoto = () => {
    setPhoto(null);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async () => {
    if (!description.trim()) return;
    setSending(true);
    try {
      let photoUrl = "";

      if (photo) {
        const formData = new FormData();
        formData.append("files", photo);
        formData.append("projectId", projectId);
        formData.append("category", "pieces");
        const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
        if (uploadRes.ok) {
          const uploadData = await uploadRes.json();
          photoUrl = uploadData.files?.[0]?.url || "";
        }
      }

      const res = await fetch("/api/pieces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, projectName, description, reference, photoUrl }),
      });
      if (res.ok) {
        toast.success("Demande de pièce envoyée");
        onSubmitted?.();
        setDescription("");
        setReference("");
        removePhoto();
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

      {/* Photo éclaté produit */}
      <div>
        <Label className="text-xs">Photo de l&apos;éclaté / pièce</Label>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handlePhotoChange}
          className="hidden"
        />
        {photoPreview ? (
          <div className="relative mt-1 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
            <img src={photoPreview} alt="Aperçu pièce" className="w-full max-h-48 object-contain bg-gray-50 dark:bg-gray-900" />
            <button
              onClick={removePhoto}
              className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="mt-1 w-full flex items-center justify-center gap-2 py-4 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 text-sm text-gray-500 dark:text-gray-400 hover:border-orange-400 hover:text-orange-500 active:bg-orange-50 transition-colors"
          >
            <Camera className="w-5 h-5" />
            Prendre une photo
          </button>
        )}
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
          onClick={() => { setOpen(false); setDescription(""); setReference(""); removePhoto(); }}
          className="h-9 px-3 rounded-lg border border-gray-200 text-sm text-gray-600"
        >
          Annuler
        </button>
      </div>
    </div>
  );
}
