"use client";

import { useState } from "react";
import { AlertCircle, Send, Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PhotoUpload } from "@/components/photo-upload";
import { toast } from "sonner";

interface SAVFormProps {
  projectId: string;
  projectName: string;
}

export function SAVForm({ projectId, projectName }: SAVFormProps) {
  const [description, setDescription] = useState("");
  const [piecesNecessaires, setPiecesNecessaires] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!description.trim()) {
      toast.error("Veuillez décrire le problème");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commentairesMontages: `[SAV] ${description}${piecesNecessaires ? `\nPièces nécessaires: ${piecesNecessaires}` : ""}`,
        }),
      });
      if (res.ok) {
        toast.success("Rapport SAV enregistré");
      } else {
        toast.error("Erreur lors de l'enregistrement");
      }
    } catch {
      toast.error("Erreur réseau");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-500" />
            Rapport SAV
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Description du problème</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Décrivez le problème constaté..."
              rows={3}
              className="mt-1"
            />
          </div>
          <div>
            <Label>Pièces nécessaires</Label>
            <Textarea
              value={piecesNecessaires}
              onChange={(e) => setPiecesNecessaires(e.target.value)}
              placeholder="Listez les pièces à commander (références si connues)..."
              rows={2}
              className="mt-1"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Photos SAV</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <PhotoUpload
            category="sav"
            label="Photos du problème"
            projectId={projectId}
          />
        </CardContent>
      </Card>

      <div className="pt-2">
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="w-full h-12 rounded-xl text-base font-medium glass-btn text-white flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          Enregistrer le rapport SAV
        </button>
      </div>
    </>
  );
}
