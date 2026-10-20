"use client";
import { iconeDocument } from "@/lib/fichiers-joints";

import { useState, useRef } from "react";
import { Package, Camera, Loader2, Send, AlertTriangle, X, ImagePlus, Sparkles } from "lucide-react";
import { offlineFetch } from "@/lib/offline";
import { identifiantSignalement } from "@/lib/signalement-id";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import dynamic from "next/dynamic";
import { compressImage } from "@/lib/compress-image";
const VoiceRecorder = dynamic(() => import("@/components/voice-recorder").then(m => ({ default: m.VoiceRecorder })), { ssr: false });

interface PiecesFormProps {
  projectId: string;
  projectName: string;
  cabineLabel?: string;
  /** Numéro du lot (1, 2, 3…) — la seule référence fiable. */
  cabineIdx?: number;
  onSubmitted?: (photoUrls: string[]) => void;
  /** Signale au parent que le formulaire s'ouvre ou se referme. */
  onOuvert?: (ouvert: boolean) => void;
}

export function PiecesForm({ projectId, projectName, cabineLabel, cabineIdx, onSubmitted, onOuvert }: PiecesFormProps) {
  const [open, setOpenBrut] = useState(false);
  /* Toute ouverture/fermeture passe par ici : le parent doit savoir qu'un
     formulaire occupe l'écran pour écarter les autres. */
  const setOpen = (v: boolean) => { setOpenBrut(v); onOuvert?.(v); };
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  // Photo de l'ÉCLATÉ du produit (obligatoire, sauf « Pas d'éclaté »).
  const [eclatePhotos, setEclatePhotos] = useState<File[]>([]);
  const [eclatePreviews, setEclatePreviews] = useState<string[]>([]);
  const [pasEclate, setPasEclate] = useState(false);
  const [sending, setSending] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const eclateCameraRef = useRef<HTMLInputElement>(null);
  const eclateGalleryRef = useRef<HTMLInputElement>(null);

  const handleAI = async () => {
    if (!description.trim() || description.trim().length < 10) return;
    setAiLoading(true);
    try {
      const res = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: `Reformule cette description de pièce manquante de manière claire et professionnelle pour un rapport technique. Réponds uniquement avec le texte reformulé :\n\n${description}` }) });
      if (res.ok) { const data = await res.json(); if (data.answer || data.response) setDescription((data.answer || data.response).trim()); }
    } catch {} finally { setAiLoading(false); }
  };

  const handlePhotoFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const newFiles = await Promise.all(Array.from(files).map((f) => compressImage(f)));
    setPhotos((prev) => [...prev, ...newFiles]);
    setPhotoPreviews((prev) => [...prev, ...newFiles.map((f) => (f.type.startsWith("image/") || f.type.startsWith("video/") ? URL.createObjectURL(f) : iconeDocument(f.name)))]);
  };

  const removePhoto = (index: number) => {
    URL.revokeObjectURL(photoPreviews[index]);
    setPhotos((prev) => prev.filter((_, i) => i !== index));
    setPhotoPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleEclateFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const newFiles = await Promise.all(Array.from(files).map((f) => compressImage(f)));
    setEclatePhotos((prev) => [...prev, ...newFiles]);
    setEclatePreviews((prev) => [...prev, ...newFiles.map((f) => (f.type.startsWith("image/") || f.type.startsWith("video/") ? URL.createObjectURL(f) : iconeDocument(f.name)))]);
    setPasEclate(false); // une photo d'éclaté annule la coche « Pas d'éclaté »
  };

  const removeEclate = (index: number) => {
    URL.revokeObjectURL(eclatePreviews[index]);
    setEclatePhotos((prev) => prev.filter((_, i) => i !== index));
    setEclatePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const reset = () => {
    setDescription("");
    setReference("");
    photoPreviews.forEach((p) => URL.revokeObjectURL(p));
    setPhotos([]);
    setPhotoPreviews([]);
    eclatePreviews.forEach((p) => URL.revokeObjectURL(p));
    setEclatePhotos([]);
    setEclatePreviews([]);
    setPasEclate(false);
    if (cameraRef.current) cameraRef.current.value = "";
    if (galleryRef.current) galleryRef.current.value = "";
    if (eclateCameraRef.current) eclateCameraRef.current.value = "";
    if (eclateGalleryRef.current) eclateGalleryRef.current.value = "";
  };

  const handleSubmit = async () => {
    if (!description.trim()) return;
    // OBLIGATOIRE : photo de l'éclaté OU case « Pas d'éclaté ».
    if (!pasEclate && eclatePhotos.length === 0) {
      toast.error("Ajoutez la photo de l'éclaté du produit, ou cochez « Pas d'éclaté ».", { duration: 6000 });
      return;
    }
    setSending(true);
    try {
      const photoUrls: string[] = [];

      // L'éclaté est envoyé avec les photos de la pièce (préfixe distinct dans
      // le nom de fichier pour le retrouver). La décision « Pas d'éclaté » est
      // consignée dans la description.
      const allPhotos: { file: File; name: string }[] = [
        ...photos.map((p, i) => ({ file: p, name: `piece-${i + 1}` })),
        ...eclatePhotos.map((p, i) => ({ file: p, name: `eclate-${i + 1}` })),
      ];

      if (allPhotos.length > 0) {
        let uploadOk = false;
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            const formData = new FormData();
            allPhotos.forEach(({ file, name }) => {
              const ext = file.name.split(".").pop() || "jpg";
              formData.append("files", new File([file], `${name}.${ext}`, { type: file.type }));
            });
            formData.append("projectId", projectId);
            formData.append("category", "pieces");
            // Pas de notionField ici : /api/pieces écrit lui-même les photos dans
            // la colonne « Photos pour signalements » (évite un double-écriture).
            const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
            if (uploadRes.ok) {
              const uploadData = await uploadRes.json();
              const urls = uploadData.files?.map((f: { url: string }) => f.url) || [];
              photoUrls.push(...urls);
              uploadOk = urls.length > 0;
              if (uploadOk) break;
            }
          } catch {
            if (attempt === 2) break;
          }
          if (attempt < 2) await new Promise((r) => setTimeout(r, 1500));
        }
        if (!uploadOk) {
          toast.error("⚠ Upload des photos échoué. Vérifiez votre connexion et réessayez.", { duration: 6000 });
          setSending(false);
          return;
        }
      }

      const finalDescription = pasEclate
        ? `${description.trim()} (Pas d'éclaté)`
        : description.trim();

      const envoi = offlineFetch("/api/pieces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        /* `id` fabriqué ICI : si la requête est coupée et rejouée par la
           file, le serveur reconnaît la même demande au lieu d'en créer une
           seconde. `cabineIdx` désigne le lot par son NUMÉRO — deux lots
           peuvent s'appeler « SDD ». */
        body: JSON.stringify({
          id: identifiantSignalement(),
          projectId, projectName, description: finalDescription, reference, photoUrls,
          ...(cabineLabel ? { cabineLabel } : {}),
          ...(typeof cabineIdx === "number" ? { cabineIdx } : {}),
        }),
      });
      /* Même principe que pour les défauts : on ne retient pas le monteur
         pendant que le serveur écrit. */
      toast.success("Demande de pièce envoyée");
      onSubmitted?.(photoUrls);   // ← transmet les URLs au parent
      reset();
      setOpen(false);
      setSending(false);
      envoi
        .then((res) => {
          if (res.ok) onSubmitted?.(photoUrls);
          else toast.error("La demande n'a pas pu être enregistrée — réessayez", { duration: 9000 });
        })
        .catch(() => toast.error("La demande n'a pas pu être enregistrée — réessayez", { duration: 9000 }));
    } catch {
      toast.error("Erreur réseau");
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

      {/* Photos de la pièce */}
      <div>
        <Label className="text-xs">Photos de la pièce</Label>
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
        <input ref={cameraRef} type="file" accept="image/*,video/*" capture="environment" className="hidden" onChange={(e) => handlePhotoFiles(e.target.files)} />
        <input ref={galleryRef} type="file" multiple className="hidden" onChange={(e) => handlePhotoFiles(e.target.files)} />
      </div>

      {/* Photo de l'ÉCLATÉ du produit — obligatoire sauf « Pas d'éclaté ». */}
      <div className="rounded-xl border-2 border-orange-200 bg-orange-50/50 p-3 space-y-2">
        <Label className="text-xs font-semibold text-orange-700">
          Photo de l'éclaté du produit <span className="text-red-500">*</span>
        </Label>
        {!pasEclate && (
          <>
            {eclatePreviews.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {eclatePreviews.map((preview, i) => (
                  <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-orange-200">
                    <img src={preview} alt={`Éclaté ${i + 1}`} className="w-full h-full object-cover" />
                    <button
                      onClick={() => removeEclate(i)}
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => eclateCameraRef.current?.click()}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border-2 border-dashed border-orange-300 text-sm text-orange-600 hover:border-orange-400 active:bg-orange-100 transition-colors"
              >
                <Camera className="w-4 h-4" />
                Photo
              </button>
              <button
                onClick={() => eclateGalleryRef.current?.click()}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border-2 border-dashed border-orange-300 text-sm text-orange-600 hover:border-orange-400 active:bg-orange-100 transition-colors"
              >
                <ImagePlus className="w-4 h-4" />
                Galerie
              </button>
            </div>
            <input ref={eclateCameraRef} type="file" accept="image/*,video/*" capture="environment" className="hidden" onChange={(e) => handleEclateFiles(e.target.files)} />
            <input ref={eclateGalleryRef} type="file" multiple className="hidden" onChange={(e) => handleEclateFiles(e.target.files)} />
          </>
        )}
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none pt-0.5">
          <input
            type="checkbox"
            checked={pasEclate}
            onChange={(e) => {
              const checked = e.target.checked;
              setPasEclate(checked);
              if (checked) {
                eclatePreviews.forEach((p) => URL.revokeObjectURL(p));
                setEclatePhotos([]);
                setEclatePreviews([]);
              }
            }}
            className="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-400"
          />
          Pas d'éclaté (aucun éclaté fourni avec la cabine)
        </label>
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={sending || !description.trim() || (!pasEclate && eclatePhotos.length === 0)}
          className="flex-1 h-9 rounded-lg bg-orange-500 text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          Enregistrer le signalement
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
