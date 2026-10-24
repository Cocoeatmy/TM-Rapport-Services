"use client";

/**
 * La dictée vocale.
 *
 * Refonte du 24.10.2026 — des rapports dictés se perdaient : le texte
 * transcrit restait dans cette case en attendant un appui sur « Ajouter au
 * rapport ». Le monteur voyait son texte, croyait que c'était fait, quittait
 * la page… et tout disparaissait. Désormais :
 *   - le texte transcrit est versé AUTOMATIQUEMENT dans le champ ;
 *   - l'écran dit ce qu'il en est vraiment : enregistré, en attente du
 *     réseau, ou pas enregistré (et alors on le dit en rouge) ;
 *   - avec une `cle`, l'audio est gardé sur l'appareil (lib/dictees) tant
 *     que le texte n'est pas en sécurité : sans réseau, la dictée est
 *     transcrite et versée au retour du réseau ou à la prochaine ouverture.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, Loader2, AlertCircle, Square, Check, CloudOff, RotateCcw } from "lucide-react";
import {
  garderDictee, noterTexte, oublierDictee, transcrire, reprendreDictees, prendreEnCharge,
  type EtatAjout,
} from "@/lib/dictees";

interface VoiceRecorderProps {
  /** Verse le texte dans son champ. Peut dire ce qu'est devenu l'enregistrement. */
  onTranscript: (text: string) => EtatAjout | void | Promise<EtatAjout | void>;
  /** Palette de couleur. "amber" pour la zone Note interne, sinon bleu (défaut). */
  accent?: "blue" | "amber";
  /** Destination, pour les messages : « au rapport », « à la note »… */
  cible?: string;
  /** Ancien libellé du bouton d'ajout — conservé pour compatibilité. */
  addLabel?: string;
  /** Clé de conservation sur l'appareil (ex. `rapport:<id>`). Sans elle,
   *  l'audio n'est gardé qu'en mémoire, le temps de la page. */
  cle?: string;
  /** Le champ contient-il déjà ce texte ? (évite un double versement à la reprise) */
  dejaPresent?: (texte: string) => boolean;
}

type Status = "idle" | "recording" | "transcribing" | "added" | "kept" | "error";

const MESSAGE_AJOUT: Record<EtatAjout, string> = {
  enregistre: "Ajouté et enregistré",
  "en-attente": "Ajouté — sera envoyé dès le retour du réseau",
  ajoute: "Ajouté",
  echec: "Ajouté à l'écran, mais PAS encore enregistré",
};

export function VoiceRecorder({ onTranscript, accent = "blue", cible = "au rapport", cle, dejaPresent }: VoiceRecorderProps) {
  const amber = accent === "amber";
  const [status, setStatus] = useState<Status>("idle");
  const [etat, setEtat] = useState<EtatAjout | null>(null);
  const [dernierTexte, setDernierTexte] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  /* L'audio du dernier essai, gardé en mémoire : « Réessayer » ne demande
     jamais de redicter. */
  const dernierAudioRef = useRef<{ blob: Blob; mime: string; id: string | null } | null>(null);

  /* Toujours la DERNIÈRE version des fonctions du parent : une transcription
     qui arrive après coup ne doit pas verser dans un état périmé. */
  const verserRef = useRef(onTranscript);
  verserRef.current = onTranscript;
  const dejaPresentRef = useRef(dejaPresent);
  dejaPresentRef.current = dejaPresent;

  const verser = useCallback(async (texte: string, id: string | null) => {
    let resultat: EtatAjout = "ajoute";
    try {
      resultat = (await verserRef.current(texte)) || "ajoute";
    } catch {
      resultat = "echec";
    }
    if (resultat !== "echec" && id) await oublierDictee(id);
    setDernierTexte(texte);
    setEtat(resultat);
    setStatus("added");
  }, []);

  const traiter = useCallback(async (blob: Blob, mime: string, id: string | null) => {
    setStatus("transcribing");
    setErrorMsg("");
    const liberer = id ? prendreEnCharge(id) : () => {};
    try {
      const t = await transcrire(blob, mime);
      if (t.ok) {
        if (id) await noterTexte(id, t.texte);
        dernierAudioRef.current = null;
        await verser(t.texte, id);
        return;
      }
      if (t.raison === "vide") {
        if (id) await oublierDictee(id);
        dernierAudioRef.current = null;
        setStatus("error");
        setErrorMsg(t.message);
        return;
      }
      dernierAudioRef.current = { blob, mime, id };
      if (id) {
        setStatus("kept");
      } else {
        setStatus("error");
        setErrorMsg(t.raison === "reseau"
          ? "Pas de réseau : la dictée est gardée tant que cette page reste ouverte. Réessayez dès que le réseau revient."
          : `${t.message} Votre dictée est gardée : réessayez.`);
      }
    } finally {
      liberer();
    }
  }, [verser]);

  /* Reprise : les dictées restées sur l'appareil (réseau absent, page
     fermée pendant la transcription) sont versées dès que possible. */
  const reprendre = useCallback(async () => {
    if (!cle) return;
    const { versees } = await reprendreDictees(
      cle,
      (texte) => verserRef.current(texte),
      (texte) => dejaPresentRef.current?.(texte) ?? false,
    );
    if (versees > 0) {
      setEtat("ajoute");
      setDernierTexte("");
      setStatus("added");
      dernierAudioRef.current = null;
    }
  }, [cle]);

  useEffect(() => {
    if (!cle) return;
    reprendre();
    const enLigne = () => { reprendre(); };
    window.addEventListener("online", enLigne);
    return () => window.removeEventListener("online", enLigne);
  }, [cle, reprendre]);

  const start = useCallback(async () => {
    setErrorMsg("");
    setEtat(null);
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
        /* L'audio sur l'appareil AVANT tout envoi : une coupure, une page
           fermée ou une transcription ratée ne peuvent plus rien perdre. */
        const id = cle ? await garderDictee(cle, blob, mime) : null;
        await traiter(blob, mime, id);
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setStatus("recording");
    } catch {
      setStatus("error");
      setErrorMsg("Micro non autorisé. Autorisez l'accès au micro dans les réglages.");
    }
  }, [cle, traiter]);

  const stop = useCallback(() => {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== "inactive") mr.stop();
    mediaRecorderRef.current = null;
  }, []);

  const reessayer = useCallback(() => {
    const a = dernierAudioRef.current;
    if (a) traiter(a.blob, a.mime, a.id);
    else if (dernierTexte && etat === "echec") verser(dernierTexte, null);
    else reprendre();
  }, [traiter, verser, reprendre, dernierTexte, etat]);

  const isRecording = status === "recording";
  const isTranscribing = status === "transcribing";
  const titre = isRecording
    ? "Enregistrement… appuyez pour arrêter"
    : isTranscribing
      ? "Transcription en cours… ne fermez pas tout de suite"
      : "Dictée vocale";

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
          <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{titre}</p>
          {isRecording && (
            <p className="text-xs text-red-500 dark:text-red-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              Parlez maintenant — le texte ira directement {cible}
            </p>
          )}
        </div>
      </div>

      {status === "added" && etat && (
        <div
          data-dictee-etat={etat}
          className={`flex items-start gap-2 text-sm rounded-xl p-3 border ${
            etat === "echec"
              ? "text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
              : etat === "en-attente"
                ? "text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700"
                : "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800"
          }`}
        >
          {etat === "echec" ? <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            : etat === "en-attente" ? <CloudOff className="w-4 h-4 shrink-0 mt-0.5" />
            : <Check className="w-4 h-4 shrink-0 mt-0.5" />}
          <div className="flex-1 min-w-0">
            <p className="font-medium">{MESSAGE_AJOUT[etat].replace("Ajouté", `Ajouté ${cible}`)}</p>
            {etat === "echec" && (
              <button type="button" onClick={reessayer} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold underline">
                <RotateCcw className="w-3 h-3" /> Réessayer l&apos;enregistrement
              </button>
            )}
          </div>
        </div>
      )}

      {status === "kept" && (
        <div data-dictee-etat="gardee" className="flex items-start gap-2 text-sm rounded-xl p-3 border text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700">
          <CloudOff className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-medium">Dictée gardée sur l&apos;appareil</p>
            <p className="text-xs">Pas de réseau pour la transcrire : elle sera transcrite et ajoutée {cible} automatiquement dès le retour du réseau, même si vous fermez la page.</p>
            <button type="button" onClick={reessayer} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold underline">
              <RotateCcw className="w-3 h-3" /> Réessayer maintenant
            </button>
          </div>
        </div>
      )}

      {status === "error" && errorMsg && (
        <div className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-3">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <span>{errorMsg}</span>
            {dernierAudioRef.current && (
              <button type="button" onClick={reessayer} className="mt-1 flex items-center gap-1 text-xs font-semibold underline">
                <RotateCcw className="w-3 h-3" /> Réessayer
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
