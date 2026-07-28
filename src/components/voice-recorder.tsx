"use client";

import { useState, useRef, useCallback } from "react";
import { Mic, Loader2, RotateCcw, Plus, Sparkles, AlertCircle, Square } from "lucide-react";

interface VoiceRecorderProps {
  onTranscript: (text: string) => void;
  /** Palette de couleur. "amber" pour la zone Note interne, sinon bleu (défaut). */
  accent?: "blue" | "amber";
  /** Libellé du bouton d'ajout (défaut « Ajouter au rapport »). */
  addLabel?: string;
}

type Status = "idle" | "recording" | "transcribing" | "done" | "error";

/** Extension de fichier à partir du type MIME du MediaRecorder (Groq détecte
 *  le format par l'extension). iOS → mp4, Chrome/Android → webm. */
function extFromMime(mime: string): string {
  if (mime.includes("mp4") || mime.includes("m4a") || mime.includes("aac")) return "mp4";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("wav")) return "wav";
  return "webm";
}

export function VoiceRecorder({ onTranscript, accent = "blue", addLabel = "Ajouter au rapport" }: VoiceRecorderProps) {
  const amber = accent === "amber";
  const [status, setStatus] = useState<Status>("idle");
  const [transcript, setTranscript] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [reformulating, setReformulating] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const start = useCallback(async () => {
    setErrorMsg("");
    setTranscript("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setStatus("error");
      setErrorMsg("Enregistrement non disponible sur cet appareil.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const mr = new MediaRecorder(stream);
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const mime = mr.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mime });
        if (blob.size === 0) {
          setStatus("error");
          setErrorMsg("Aucun son capté. Rapprochez-vous du micro et réessayez.");
          return;
        }
        // Transcription côté serveur (Groq Whisper) — fiable sur iOS.
        setStatus("transcribing");
        try {
          const form = new FormData();
          form.append("audio", blob, `audio.${extFromMime(mime)}`);
          form.append("filename", `audio.${extFromMime(mime)}`);
          const res = await fetch("/api/transcribe", { method: "POST", body: form });
          const data = await res.json().catch(() => ({}));
          if (res.ok && (data.text || "").trim()) {
            setTranscript((data.text as string).trim());
            setStatus("done");
          } else if (res.ok) {
            setStatus("error");
            setErrorMsg("Rien n'a été compris. Réessayez en parlant plus près du micro.");
          } else {
            setStatus("error");
            setErrorMsg(data.error || "La transcription a échoué. Réessayez.");
          }
        } catch {
          setStatus("error");
          setErrorMsg("Pas de réseau — la dictée nécessite une connexion Internet.");
        }
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setStatus("recording");
    } catch {
      setStatus("error");
      setErrorMsg("Micro non autorisé. Autorisez l'accès au micro dans les réglages.");
    }
  }, []);

  const stop = useCallback(() => {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== "inactive") mr.stop();
    mediaRecorderRef.current = null;
  }, []);

  const addToReport = useCallback(() => {
    const t = transcript.trim();
    if (t) onTranscript(t);
    setTranscript("");
    setStatus("idle");
  }, [transcript, onTranscript]);

  const reformulate = useCallback(async () => {
    if (!transcript.trim() || reformulating) return;
    setReformulating(true);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Reformule ce texte de rapport de montage de cabine de douche de manière professionnelle, claire et concise. Garde le sens exact mais améliore la formulation. Réponds uniquement avec le texte reformulé, sans introduction ni commentaire :\n\n${transcript}`,
        }),
      });
      if (res.ok) {
        const d = await res.json();
        const out = (d.answer || d.response || "").trim();
        if (out) setTranscript(out);
      }
    } catch {
      /* silencieux — l'utilisateur garde le texte brut */
    } finally {
      setReformulating(false);
    }
  }, [transcript, reformulating]);

  const isRecording = status === "recording";
  const isTranscribing = status === "transcribing";

  return (
    <div className={`rounded-2xl border backdrop-blur-sm p-4 space-y-3 ${
      amber
        ? "border-amber-200 dark:border-amber-800/50 bg-white/70 dark:bg-slate-900/40"
        : "border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-slate-800/60"
    }`}>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={isRecording ? stop : start}
          disabled={isTranscribing}
          className={`w-11 h-11 rounded-full flex items-center justify-center transition-all shrink-0 disabled:opacity-60 ${
            isRecording
              ? "bg-red-500 text-white shadow-lg shadow-red-500/30"
              : amber
                ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/60 active:scale-95"
                : "bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600 active:scale-95"
          }`}
          aria-label={isRecording ? "Arrêter l'enregistrement" : "Démarrer la dictée"}
        >
          {isTranscribing ? <Loader2 className="w-5 h-5 animate-spin" /> : isRecording ? <Square className="w-4 h-4 fill-current" /> : <Mic className="w-5 h-5" />}
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
            {isRecording ? "Enregistrement… appuyez pour arrêter" : isTranscribing ? "Transcription en cours…" : status === "done" ? "Relisez et ajoutez au rapport" : "Dictée vocale"}
          </p>
          {isRecording && (
            <p className="text-xs text-red-500 dark:text-red-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              Parlez maintenant
            </p>
          )}
        </div>
      </div>

      {status === "error" && errorMsg && (
        <div className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-3">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {status === "done" && (
        <>
          {/* Texte transcrit, ÉDITABLE avant ajout. */}
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={3}
            className={`w-full text-sm p-3 rounded-xl bg-gray-50 dark:bg-slate-700/50 border text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 ${
              amber
                ? "border-amber-200 dark:border-amber-800/50 focus:ring-amber-400/40"
                : "border-gray-200 dark:border-slate-600 focus:ring-[#1e3a5f]/30"
            }`}
          />
          <button
            type="button"
            onClick={reformulate}
            disabled={reformulating || transcript.trim().length < 3}
            className={`flex items-center gap-1.5 text-xs disabled:opacity-50 ${
              amber
                ? "text-amber-700 dark:text-amber-400 hover:text-amber-800"
                : "text-purple-600 dark:text-purple-400 hover:text-purple-700"
            }`}
          >
            {reformulating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {reformulating ? "Reformulation en cours…" : "Reformuler avec l'IA"}
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={addToReport}
              disabled={!transcript.trim()}
              className={`flex-1 flex items-center justify-center gap-2 h-9 rounded-xl text-white text-sm font-medium active:scale-[0.98] transition-all disabled:opacity-50 ${
                amber ? "bg-amber-600 hover:bg-amber-700" : "bg-[#1e3a5f] hover:bg-[#2a4a73]"
              }`}
            >
              <Plus className="w-4 h-4" />
              {addLabel}
            </button>
            <button
              type="button"
              onClick={start}
              className="flex items-center justify-center gap-2 h-9 px-4 rounded-xl bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 text-sm font-medium hover:bg-gray-200 dark:hover:bg-slate-600 active:scale-[0.98] transition-all"
            >
              <RotateCcw className="w-4 h-4" />
              Refaire
            </button>
          </div>
        </>
      )}
    </div>
  );
}
