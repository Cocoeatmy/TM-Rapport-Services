import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getData, getDataFresh, setData } from "@/lib/kv-store";

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

  const body = await request.json();
  const { projectId, noms } = body;
  // attribution peut être undefined pour une mise à jour "noms uniquement"
  const attribution: string[] | undefined = Array.isArray(body.attribution)
    ? body.attribution
    : undefined;

  if (!projectId) {
    return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });
  }

  // ── Lecture FRAÎCHE depuis Notion (bypass cache mémoire) ─────────────────
  // CRITIQUE : plusieurs instances Vercel tournent simultanément avec des
  // caches mémoire indépendants (TTL 60 s). Un POST sur l'instance B peut
  // lire un cache stale qui ne contient pas encore ce que l'instance A vient
  // d'écrire. En lisant toujours depuis Notion on garantit la cohérence.
  const all = await getDataFresh<CabineAttribution>(KEY);
  const idx = all.findIndex((a) => a.projectId === projectId);
  const existing = idx >= 0 ? all[idx] : null;

  // ── Cas : mise à jour "noms uniquement" (attribution non fournie) ─────────
  // Le client n'envoie pas d'attribution pour éviter d'écraser des valeurs
  // monteur qu'il ne connaît pas encore (chargement KV en cours).
  if (attribution === undefined) {
    if (!Array.isArray(noms) || noms.length === 0) {
      // Rien à faire
      return NextResponse.json({ success: true, skipped: true });
    }

    if (!existing) {
      // Pas d'entrée existante et pas d'attribution fournie → ne pas créer
      // une entrée avec attribution vide (on ne sait pas quels monteurs sont assignés).
      return NextResponse.json({ success: true, skipped: true });
    }

    // Merge noms uniquement — attribution inchangée
    const mergedNoms = noms.map((n: string, i: number) => {
      const isDefault = !n || n === `Cabine ${i + 1}`;
      const existingNom = existing.noms?.[i];
      const existingIsCustom = existingNom && existingNom !== `Cabine ${i + 1}`;
      return (isDefault && existingIsCustom) ? existingNom : (n || `Cabine ${i + 1}`);
    });

    const entry: CabineAttribution = {
      ...existing,
      noms: mergedNoms,
      updatedAt: Date.now(),
    };
    all[idx] = entry;
    await setData(KEY, all);
    return NextResponse.json({ success: true });
  }

  // ── Garde-fou global ──────────────────────────────────────────────────────
  // Règle fondamentale : un Monteur Responsable assigné NE PEUT JAMAIS être
  // effacé par un envoi automatique (état cache incomplet, page fraîche,
  // instance Vercel avec cache stale, etc.).
  //
  // Niveau 1 — Per-slot : si le slot entrant est vide, on garde la valeur
  // existante (inVal || exVal). Protège chaque slot individuellement.
  //
  // Niveau 2 — Global : si TOUS les monteurs entrants sont vides ET que le
  // KV a des monteurs réels → on refuse totalement l'écriture de l'attribution
  // (probablement une écriture depuis un état de page non initialisé).
  //
  // Niveau 3 — Null existing : si aucune entrée KV n'existe ET attribution
  // est tout vide → on ne crée pas d'entrée vide (données perdues impossible).
  const incomingAllEmpty = attribution.every((a) => !a || !a.trim());
  const existingHasData  = existing?.attribution?.some((a) => a && a.trim().length > 0) ?? false;

  if (incomingAllEmpty && !existingHasData && !existing) {
    // Cas Niveau 3 : pas d'entrée existante et attribution vide → ignorer
    return NextResponse.json({ success: true, skipped: true });
  }

  if (incomingAllEmpty && existingHasData) {
    // Cas Niveau 2 : attribution réelle en KV, tentative d'écraser avec [] → refus.
    // On met quand même à jour les noms si fournis.
    if (Array.isArray(noms) && noms.length > 0 && existing) {
      const mergedNoms = noms.map((n: string, i: number) => {
        const isDefault = !n || n === `Cabine ${i + 1}`;
        const existingNom = existing.noms?.[i];
        const existingIsCustom = existingNom && existingNom !== `Cabine ${i + 1}`;
        return (isDefault && existingIsCustom) ? existingNom : (n || `Cabine ${i + 1}`);
      });
      all[idx] = { ...existing, noms: mergedNoms, updatedAt: Date.now() };
      await setData(KEY, all);
    }
    return NextResponse.json({ success: true, guardFired: true });
  }

  // ── Merge attribution slot par slot (Niveau 1) ───────────────────────────
  // Pour chaque slot : si la valeur entrante est non-vide → utiliser la valeur
  // entrante (changement explicite). Si vide → garder la valeur existante
  // (protection contre les overwrite depuis état incomplet).
  const maxLen = Math.max(attribution.length, existing?.attribution?.length ?? 0);
  const mergedAttribution = Array.from({ length: maxLen }, (_, i) => {
    const inVal = (attribution[i] ?? "").trim();
    const exVal = (existing?.attribution?.[i] ?? "").trim();
    return inVal || exVal; // jamais rétrograder une valeur non-vide
  });

  // ── Merge noms ────────────────────────────────────────────────────────────
  const incomingNoms = Array.isArray(noms)
    ? noms
    : attribution.map((_, i) => `Cabine ${i + 1}`);
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

  if (idx >= 0) {
    all[idx] = entry;
  } else {
    all.push(entry);
  }

  await setData(KEY, all);
  return NextResponse.json({ success: true });
}
