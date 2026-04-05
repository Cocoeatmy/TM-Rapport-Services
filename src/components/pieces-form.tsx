"use client";

import { useState } from "react";
import { Package, Camera, Loader2, Send, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface PiecesFormProps {
  projectId: string;
  projectName: string;
}

export function PiecesForm({ projectId, projectName }: PiecesFormProps) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState("");
  const [sending, setSending] = useState(false);

  const handleSubmit = async () => {
    if (!description.trim()) return;
    setSending(true);
    try {
      const res = await fetch("/api/pieces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, projectName, description, reference }),
      });
      if (res.ok) {
        toast.success("Demande de pièce envoyée");
        setDescription("");
        setReference("");
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
          onClick={() => { setOpen(false); setDescription(""); setReference(""); }}
          className="h-9 px-3 rounded-lg border border-gray-200 text-sm text-gray-600"
        >
          Annuler
        </button>
      </div>
    </div>
  );
}
