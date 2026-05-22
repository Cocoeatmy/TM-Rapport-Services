import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getData, setData } from "@/lib/kv-store";

interface CabineAttribution {
  projectId: string;
  attribution: string[]; // index = cabin number - 1, value = monteur name(s)
  noms: string[];        // index = cabin number - 1, value = custom cabin label
  updatedAt: number;
}

const KEY = "cabine-attributions";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const projectId = request.nextUrl.searchParams.get("projectId");
  const all = await getData<CabineAttribution>(KEY);
  if (projectId) {
    const found = all.find((a) => a.projectId === projectId);
    return NextResponse.json(found || null);
  }
  return NextResponse.json(all);
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { projectId, attribution, noms } = await request.json();
  if (!projectId || !Array.isArray(attribution)) {
    return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });
  }

  const all = await getData<CabineAttribution>(KEY);
  const idx = all.findIndex((a) => a.projectId === projectId);
  const existing = idx >= 0 ? all[idx] : null;

  // ── Merge attribution ────────────────────────────────────────────────────
  // Problème : quand un collaborateur envoie depuis un état cache incomplet,
  // son tableau attribution contient des chaînes vides pour les cabines qu'il
  // ne connaît pas. Sans merge, cela écrase les monteurs des autres cabines.
  // Règle : pour chaque cabine, conserver la valeur KV existante si le client
  // envoie une chaîne vide — le client ne "désassigne" jamais une cabine qu'il
  // ne touche pas.
  const maxLen = Math.max(attribution.length, existing?.attribution?.length || 0);
  const mergedAttribution = Array.from({ length: maxLen }, (_, i) => {
    const inVal = attribution[i] || "";
    const exVal = existing?.attribution?.[i] || "";
    return inVal || exVal; // incoming prend le dessus seulement s'il est non vide
  });

  // ── Merge noms ──────────────────────────────────────────────────────────
  // Protection identique : ne jamais écraser un nom personnalisé par "Cabine N".
  const incomingNoms = Array.isArray(noms) ? noms : attribution.map((_, i) => `Cabine ${i + 1}`);
  const mergedNoms = Array.from({ length: maxLen }, (_, i) => {
    const n = incomingNoms[i] || `Cabine ${i + 1}`;
    const isDefault = n === `Cabine ${i + 1}`;
    const existingNom = existing?.noms?.[i];
    const existingIsCustom = existingNom && existingNom !== `Cabine ${i + 1}`;
    return (isDefault && existingIsCustom) ? existingNom : n;
  });

  const entry: CabineAttribution = {
    projectId,
    attribution: mergedAttribution,
    noms: mergedNoms,
    updatedAt: Date.now(),
  };
  if (idx >= 0) all[idx] = entry; else all.push(entry);
  await setData(KEY, all);

  return NextResponse.json({ success: true });
}
