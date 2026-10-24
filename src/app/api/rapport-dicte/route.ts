import { NextRequest, NextResponse } from "next/server";
import {
  consigneAnalyse, normaliserAnalyse, analyseDeSecours, SCHEMA_ANALYSE, LIMITE_TEXTE, LIMITE_LOTS,
  type LotDictee,
} from "@/lib/rapport-dicte";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

/**
 * Range une dictée de visite par lot (voir lib/rapport-dicte).
 *
 * Ne lit ni n'écrit rien dans Notion : la route reçoit le texte et les lots,
 * et rend une PROPOSITION que le monteur relit. Si l'IA ne répond pas, la
 * réponse est l'analyse de secours (tout le texte au chantier) avec
 * `secours: true` — jamais une erreur qui ferait perdre la dictée.
 */
export async function POST(request: NextRequest) {
  const corps = await request.json().catch(() => null) as { texte?: unknown; lots?: unknown } | null;
  const texte = typeof corps?.texte === "string" ? corps.texte.trim().slice(0, LIMITE_TEXTE) : "";
  const lots: LotDictee[] = (Array.isArray(corps?.lots) ? corps.lots : []).slice(0, LIMITE_LOTS)
    .filter((l: unknown): l is LotDictee => !!l && typeof l === "object"
      && typeof (l as LotDictee).numero === "number" && typeof (l as LotDictee).nom === "string")
    .map((l: LotDictee) => ({
      numero: l.numero,
      nom: l.nom.slice(0, 120),
      options: (Array.isArray(l.options) ? l.options : []).filter((o): o is string => typeof o === "string").slice(0, 12),
    }));
  if (!texte || !lots.length) {
    return NextResponse.json({ error: "Texte ou lots manquants." }, { status: 400 });
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) return NextResponse.json({ analyse: analyseDeSecours(lots, texte), secours: true });

  const body = {
    system_instruction: { parts: [{ text: consigneAnalyse(lots) }] },
    contents: [{ role: "user", parts: [{ text: texte }] }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 4096,
      responseMimeType: "application/json",
      responseSchema: SCHEMA_ANALYSE,
      thinkingConfig: { thinkingBudget: 0 },
    },
  };
  const appel = () => fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body: JSON.stringify(body) },
  );
  try {
    let res = await appel();
    if (res.status === 500 || res.status === 503) {
      await new Promise((r) => setTimeout(r, 1500));
      res = await appel();
    }
    if (!res.ok) {
      console.error("[rapport-dicte] Gemini", res.status, (await res.text().catch(() => "")).slice(0, 300));
      return NextResponse.json({ analyse: analyseDeSecours(lots, texte), secours: true });
    }
    const data = await res.json();
    const brut = (data?.candidates?.[0]?.content?.parts || [])
      .map((p: { text?: string }) => p.text || "").join("");
    let json: unknown = null;
    try { json = JSON.parse(brut); } catch { json = null; }
    const analyse = normaliserAnalyse(json, lots, texte);
    return NextResponse.json({ analyse, secours: json === null });
  } catch (e) {
    console.error("[rapport-dicte]", e);
    return NextResponse.json({ analyse: analyseDeSecours(lots, texte), secours: true });
  }
}
