"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Mic, MicOff, RotateCcw, Plus } from "lucide-react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SpeechRecognitionInstance = any;

interface VoiceRecorderProps {
  onTranscript: (text: string) => void;
}

export function VoiceRecorder({ onTranscript }: VoiceRecorderProps) {
  const [isSupported, setIsSupported] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [isDone, setIsDone] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioBlobRef = useRef<Blob | null>(null);

  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsSupported(false);
    }
  }, []);

  const startRecording = useCallback(async () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = "fr-FR";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event: any) => {
      let finalText = "";
      let interim = "";
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalText += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }
      setTranscript(finalText);
      setInterimTranscript(interim);
    };

    recognition.onerror = (event: any) => {
      if (event.error !== "aborted") {
        console.error("Speech recognition error:", event.error);
      }
    };

    recognition.onend = () => {
      // If still recording, restart (browser may stop after silence)
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch {
          // already running or stopped intentionally
        }
      }
    };

    recognitionRef.current = recognition;
    recognition.start();

    // Also start MediaRecorder for audio backup
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };
      mediaRecorder.onstop = () => {
        audioBlobRef.current = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        });
        stream.getTracks().forEach((track) => track.stop());
      };
      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
    } catch {
      // MediaRecorder not available, continue with transcription only
    }

    setIsRecording(true);
    setIsDone(false);
    setTranscript("");
    setInterimTranscript("");
  }, []);

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      const rec = recognitionRef.current;
      recognitionRef.current = null;
      rec.stop();
    }
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    setIsRecording(false);
    setIsDone(true);
  }, []);

  const handleRetry = useCallback(() => {
    setTranscript("");
    setInterimTranscript("");
    setIsDone(false);
    audioBlobRef.current = null;
    startRecording();
  }, [startRecording]);

  const handleAdd = useCallback(() => {
    const fullText = (transcript + " " + interimTranscript).trim();
    if (fullText) {
      onTranscript(fullText);
    }
    setTranscript("");
    setInterimTranscript("");
    setIsDone(false);
    audioBlobRef.current = null;
  }, [transcript, interimTranscript, onTranscript]);

  if (!isSupported) {
    return (
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm p-4">
        <div className="flex items-center gap-3 text-gray-400 dark:text-gray-500">
          <MicOff className="w-5 h-5 shrink-0" />
          <span className="text-sm">
            Non disponible sur ce navigateur
          </span>
        </div>
      </div>
    );
  }

  const fullTranscript = (transcript + " " + interimTranscript).trim();

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm p-4 space-y-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={isRecording ? stopRecording : startRecording}
          className={`w-11 h-11 rounded-full flex items-center justify-center transition-all shrink-0 ${
            isRecording
              ? "bg-red-500 text-white shadow-lg shadow-red-500/30 animate-pulse"
              : "bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600 active:scale-95"
          }`}
          aria-label={isRecording ? "Arrêter l'enregistrement" : "Démarrer l'enregistrement"}
        >
          <Mic className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
            {isRecording
              ? "Enregistrement en cours..."
              : isDone
                ? "Enregistrement terminé"
                : "Dictée vocale"}
          </p>
          {isRecording && (
            <p className="text-xs text-red-500 dark:text-red-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              Parlez maintenant
            </p>
          )}
        </div>
      </div>

      {/* Live transcript preview */}
      {(isRecording || isDone) && fullTranscript && (
        <div className="p-3 rounded-xl bg-gray-50 dark:bg-slate-700/50 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap max-h-32 overflow-y-auto">
          {transcript}
          {interimTranscript && (
            <span className="text-gray-400 dark:text-gray-500">
              {transcript ? " " : ""}
              {interimTranscript}
            </span>
          )}
        </div>
      )}

      {/* Action buttons when done */}
      {isDone && fullTranscript && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleAdd}
            className="flex-1 flex items-center justify-center gap-2 h-9 rounded-xl bg-[#1e3a5f] text-white text-sm font-medium hover:bg-[#2a4a73] active:scale-[0.98] transition-all"
          >
            <Plus className="w-4 h-4" />
            Ajouter au rapport
          </button>
          <button
            type="button"
            onClick={handleRetry}
            className="flex items-center justify-center gap-2 h-9 px-4 rounded-xl bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 text-sm font-medium hover:bg-gray-200 dark:hover:bg-slate-600 active:scale-[0.98] transition-all"
          >
            <RotateCcw className="w-4 h-4" />
            Réenregistrer
          </button>
        </div>
      )}
    </div>
  );
}
