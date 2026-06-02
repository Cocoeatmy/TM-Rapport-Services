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
  // Règle fondamentale : un Monteur Responsable assigné NE PEUT PAS être
  // effacé par un envoi automatique (état cache incomplet, page fraîche, etc.).
  // Seule une manipulation explicite de l'utilisateur peut changer la valeur.
  //
  // Garde-fou supplémentaire : si TOUS les monteurs entrants sont vides alors
  // que le KV contient des monteurs réels → refus d'écraser (probablement une
  // écriture depuis un état de page non chargé).
  const existingHasData = existing?.attribution?.some((a) => a && a.trim().length > 0);
  const incomingAllEmpty = attribution.every((a) => !a || !a.trim());

  const maxLen = Math.max(attribution.length, existing?.attribution?.length || 0);
  const mergedAttribution = Array.from({ length: maxLen }, (_, i) => {
    const inVal = attribution[i] || "";
    const exVal = existing?.attribution?.[i] || "";
    // Si incoming est vide ET existant a une valeur → toujours garder l'existant
    // Si incoming est vide ET existant est vide → garder vide
    // Si incoming a une valeur → utiliser incoming (sélection manuelle)
    return inVal || exVal;
  });

  // Garde-fou global : si tous les monteurs entrants sont vides mais le KV
  // a des monteurs réels → ignorer le champ attribution, ne mettre à jour
  // que les noms. Protège contre les écritures depuis état page non initialisé.
  const finalAttribution = (incomingAllEmpty && existingHasData)
    ? (existing!.attribution)
    : mergedAttribution;

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
    attribution: finalAttribution,
    noms: mergedNoms,
    updatedAt: Date.now(),
  };
  if (idx >= 0) all[idx] = entry; else all.push(entry);
  await setData(KEY, all);

  return NextResponse.json({ success: true });
}
