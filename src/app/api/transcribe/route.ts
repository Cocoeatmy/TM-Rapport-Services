import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Transcription audio → texte via Groq Whisper (whisper-large-v3-turbo).
 * Fiable là où l'API Web Speech du navigateur échoue (notamment PWA iOS).
 * Accepte les formats produits par MediaRecorder : mp4/aac (iOS), webm/opus
 * (Chrome/Android). Le client envoie le blob dans le champ `audio`.
 */
export async function POST(request: NextRequest) {
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "Transcription indisponible (configuration manquante)." }, { status: 500 });
  }
  try {
    const form = await request.formData();
    const audio = form.get("audio");
    if (!(audio instanceof Blob) || audio.size === 0) {
      return NextResponse.json({ error: "Aucun audio reçu." }, { status: 400 });
    }
    // Nom de fichier avec extension correcte : Groq détecte le format par l'extension.
    const filename = (form.get("filename") as string) || "audio.webm";

    const groqForm = new FormData();
    groqForm.append("file", audio, filename);
    groqForm.append("model", "whisper-large-v3-turbo");
    groqForm.append("language", "fr");
    groqForm.append("response_format", "json");

    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: groqForm,
    });

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.error("[transcribe] Groq error", res.status, t.slice(0, 300));
      if (res.status === 429) {
        return NextResponse.json({ error: "Trop de demandes — réessayez dans un instant." }, { status: 429 });
      }
      return NextResponse.json({ error: "La transcription a échoué. Réessayez." }, { status: 502 });
    }

    const data = await res.json();
    return NextResponse.json({ text: (data.text || "").trim() });
  } catch (e: any) {
    console.error("[transcribe] error", e?.message || e);
    return NextResponse.json({ error: "Erreur de transcription." }, { status: 500 });
  }
}
