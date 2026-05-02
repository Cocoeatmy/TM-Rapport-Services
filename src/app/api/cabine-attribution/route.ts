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

  // Protection : ne jamais écraser un nom personnalisé par la valeur par défaut
  // "Cabine N". Si le client envoie un nom par défaut, on conserve l'ancien nom
  // personnalisé. Cela évite que la race-condition (save avant attribution-fetch)
  // efface des noms saisis manuellement.
  const incomingNoms = Array.isArray(noms) ? noms : attribution.map((_, i) => `Cabine ${i + 1}`);
  const mergedNoms = incomingNoms.map((n: string, i: number) => {
    const isDefault = !n || n === `Cabine ${i + 1}`;
    const existingNom = existing?.noms?.[i];
    const existingIsCustom = existingNom && existingNom !== `Cabine ${i + 1}`;
    // Si le nom entrant est par défaut et qu'on a un nom personnalisé en base, on garde l'ancien
    return (isDefault && existingIsCustom) ? existingNom : (n || `Cabine ${i + 1}`);
  });

  const entry: CabineAttribution = {
    projectId,
    attribution,
    noms: mergedNoms,
    updatedAt: Date.now(),
  };
  if (idx >= 0) all[idx] = entry; else all.push(entry);
  await setData(KEY, all);

  return NextResponse.json({ success: true });
}
