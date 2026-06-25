import { NextRequest, NextResponse } from "next/server";
import { getProject, updateProject } from "@/lib/notion";
import { cachedOrFetch, invalidateCache } from "@/lib/server-cache";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ── Merge multi-cabin time fields ─────────────────────────────────────────────
// Format Notion: "Cab1:2026-05-20:08:30 | Cab2:2026-05-21:09:15"
// Quand un collaborateur PATCH depuis un état cache incomplet (il manque les
// cabines des autres jours), on préserve les données Notion déjà présentes
// pour les cabines absentes du payload client.

function parseCabineMap(raw: string): Map<number, string> {
  const map = new Map<number, string>();
  if (!raw || !raw.includes("Cab")) return map;
  const re = /Cab(\d+)\s*:([^|]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const val = m[2].trim();
    if (val) map.set(parseInt(m[1], 10), val);
  }
  return map;
}

function hasDate(val: string): boolean {
  // Exige une vraie heure après la date (HH:MM) — "2026-06-09:" seul ne compte PAS.
  // Sans ça, une entrée "date-only" (c.date renseigné mais c.depart vide) écrase
  // une heure valide déjà présente dans Notion lors du merge.
  return /^\d{4}-\d{2}-\d{2}:\d{2}:\d{2}/.test(val);
}

/**
 * Merge noms de cabines : la valeur personnalisée gagne toujours sur le défaut.
 * Si incoming = "Cabine N" (défaut) et existing a une valeur → on garde existing.
 * Si incoming est custom (≠ "Cabine N") → incoming gagne (changement explicite).
 */
function mergeCabineNoms(existing: string, incoming: string): string {
  if (!incoming.includes("Cab")) return incoming;
  const exMap = parseCabineMap(existing);
  // Parser qui inclut les valeurs vides pour détecter les slots présents dans incoming
  const inMap = new Map<number, string>();
  const re1 = /Cab(\d+)\s*:([^|]*)/g;
  let m1: RegExpExecArray | null;
  while ((m1 = re1.exec(incoming))) {
    inMap.set(parseInt(m1[1], 10), m1[2].trim());
  }

  const merged = new Map(exMap);
  inMap.forEach((inVal, cabNum) => {
    const isDefault = inVal === `Cabine ${cabNum}` || inVal === "";
    if (!isDefault) {
      merged.set(cabNum, inVal); // valeur custom → incoming gagne
    } else if (!exMap.has(cabNum)) {
      merged.set(cabNum, inVal || `Cabine ${cabNum}`); // pas d'existant → défaut OK
    }
    // sinon : existing a une valeur, incoming est défaut → on garde existing
  });

  return [...merged.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([num, val]) => `Cab${num}:${val}`)
    .join(" | ");
}

/**
 * Merge attribution (monteurs) : non-vide écrase toujours, vide = suppression explicite.
 * Le format encode TOUS les slots (même vides) pour permettre la suppression d'un monteur.
 * Ex: "Cab1:Micael | Cab2: | Cab3:Claudio" → Cab2 est explicitement vidé.
 */
function mergeCabineAttribution(existing: string, incoming: string): string {
  if (!incoming.includes("Cab")) return incoming;
  const exMap = parseCabineMap(existing);
  // Parser qui capture aussi les slots vides
  const inMap = new Map<number, string>();
  const re2 = /Cab(\d+)\s*:([^|]*)/g;
  let m2: RegExpExecArray | null;
  while ((m2 = re2.exec(incoming))) {
    inMap.set(parseInt(m2[1], 10), m2[2].trim());
  }

  const merged = new Map(exMap);
  inMap.forEach((inVal, cabNum) => {
    // IMPORTANT : un slot NON-VIDE écrase ; un slot VIDE est IGNORÉ (on préserve
    // l'existant). On ne supprime JAMAIS un monteur via un slot vide — c'était
    // la cause des disparitions à répétition : tout envoi de l'attribution
    // complète depuis un état local incomplet (un monteur pas encore chargé)
    // vidait ces cabines. La suppression délibérée passe désormais par le champ
    // body.clearAttributionCabs (signal explicite, jamais ambigu).
    if (inVal) merged.set(cabNum, inVal);
  });

  const result = [...merged.entries()]
    .sort((a, b) => a[0] - b[0])
    .filter(([, val]) => val)
    .map(([num, val]) => `Cab${num}:${val}`)
    .join(" | ");
  return result;
}

/** Retire des cabines de la chaîne d'attribution (suppression EXPLICITE). */
function clearCabinesFromAttribution(attribution: string, cabs: number[]): string {
  const map = parseCabineMap(attribution);
  for (const n of cabs) map.delete(Number(n));
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .filter(([, val]) => val)
    .map(([num, val]) => `Cab${num}:${val}`)
    .join(" | ");
}

function mergeCabineTimes(existing: string, incoming: string): string {
  // Si le payload n'est pas au format multi-cabin, on passe tel quel
  if (!incoming.includes("Cab")) return incoming;

  const exMap = parseCabineMap(existing);

  // Parser étendu : capture AUSSI les slots vides "Cab3:" (valeur = "")
  // pour permettre la suppression explicite d'une cabine réinitialisée.
  // parseCabineMap exige [^|]+ donc il ignore les slots vides — on le refait ici.
  const inMap = new Map<number, string | null>(); // null = suppression explicite
  const reIn = /Cab(\d+)\s*:([^|]*)/g;
  let mIn: RegExpExecArray | null;
  while ((mIn = reIn.exec(incoming))) {
    const val = mIn[2].trim();
    inMap.set(parseInt(mIn[1], 10), val === "" ? null : val);
  }

  // Union : incoming prend le dessus sauf si Notion a une valeur avec date
  // et incoming n'en a pas (client en format ancien/dégradé).
  // Exception : valeur null = réinitialisation explicite → on supprime.
  const merged = new Map(exMap);
  inMap.forEach((inVal, cabNum) => {
    if (inVal === null) {
      // Suppression explicite (cabine réinitialisée) → retirer de Notion
      merged.delete(cabNum);
    } else {
      const exVal = exMap.get(cabNum);
      if (!exVal || hasDate(inVal) || !hasDate(exVal)) {
        merged.set(cabNum, inVal);
      }
      // sinon : Notion a une date, client n'en a pas → on garde Notion
    }
  });

  return [...merged.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([num, val]) => `Cab${num}:${val}`)
    .join(" | ");
}

// ─────────────────────────────────────────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const project = await cachedOrFetch(`project-${id}`, () => getProject(id));
    // Cache CDN court (15 s frais + 30 s SWR) pour éviter l'amplification inter-instances.
    // Sans cache CDN, chaque instance Vercel appelle Notion indépendamment lors des pics.
    // Avec s-maxage=15 : une seule origine CDN appelle Vercel/Notion toutes les 15 s max.
    // Le SW client peut toujours mettre en cache (Cache-Control navigateur = max-age=0).
    return NextResponse.json(project, {
      headers: {
        "Cache-Control": "public, max-age=0, must-revalidate",
        "Vercel-CDN-Cache-Control": "public, s-maxage=15, stale-while-revalidate=30",
        "CDN-Cache-Control": "public, s-maxage=15, stale-while-revalidate=30",
      },
    });
  } catch (error: any) {
    const isRateLimit = error?.status === 429 || error?.code === "rate_limited";
    if (isRateLimit) {
      console.warn("[GET /api/projects/[id]] Notion rate limit, retrying later");
      return NextResponse.json(
        { error: "Service temporairement surchargé. Réessayez dans quelques secondes." },
        { status: 503, headers: { "Retry-After": "15", "Cache-Control": "no-store" } }
      );
    }
    console.error("Error fetching project:", error);
    return NextResponse.json(
      { error: error.message || "Projet introuvable" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let id = "unknown";
  try {
    id = (await params).id;
    const body = await request.json();

    // ── Merge heureArrivee / heureDepart / nomsCabines / attributionCabines ─
    // Invalider le cache d'abord pour forcer un fetch frais depuis Notion,
    // puis merger : les cabines présentes dans Notion mais absentes du payload
    // client (cache incomplet) sont préservées.
    const hasClear = Array.isArray(body.clearAttributionCabs) && body.clearAttributionCabs.length > 0;
    const needsMerge =
      body.heureArrivee !== undefined ||
      body.heureDepart !== undefined ||
      body.nomsCabines !== undefined ||
      body.attributionCabines !== undefined ||
      hasClear;

    if (needsMerge) {
      invalidateCache(`project-${id}`);
      let existing: any;
      try {
        existing = await cachedOrFetch(`project-${id}`, () => getProject(id));
      } catch {
        existing = null;
      }
      if (existing) {
        if (body.heureArrivee !== undefined) {
          body.heureArrivee = mergeCabineTimes(existing.heureArrivee || "", body.heureArrivee);
        }
        if (body.heureDepart !== undefined) {
          body.heureDepart = mergeCabineTimes(existing.heureDepart || "", body.heureDepart);
        }
        if (body.nomsCabines !== undefined) {
          body.nomsCabines = mergeCabineNoms(existing.nomsCabines || "", body.nomsCabines);
        }
        if (body.attributionCabines !== undefined) {
          body.attributionCabines = mergeCabineAttribution(existing.attributionCabines || "", body.attributionCabines);
        }
        // Suppression EXPLICITE de monteurs (action « réinitialiser la cabine »).
        // Appliquée APRÈS le merge, sur l'attribution déjà fusionnée (ou l'existant).
        if (hasClear) {
          const base = body.attributionCabines !== undefined
            ? body.attributionCabines
            : (existing.attributionCabines || "");
          body.attributionCabines = clearCabinesFromAttribution(base, body.clearAttributionCabs);
        }
      }
    }
    // Ne pas transmettre ce champ de contrôle à updateProject.
    delete body.clearAttributionCabs;

    await updateProject(id, body);
    // Invalider le cache après mise à jour
    invalidateCache(`project-${id}`);
    invalidateCache("projects");
    invalidateCache("projects-mesures");
    return NextResponse.json({ success: true });
  } catch (error: any) {
    const isRateLimit = error?.status === 429 || error?.code === "rate_limited";
    const isTimeout = error?.code === "notionhq_client_request_timeout";
    const status = isRateLimit ? 429 : isTimeout ? 504 : 500;
    const message = isRateLimit
      ? "Notion est momentanément surchargé. Réessayez dans quelques secondes."
      : isTimeout
      ? "La requête a expiré. Réessayez."
      : error.message || "Erreur lors de la mise à jour";
    console.error(`[PATCH /api/projects/${id}] ${status}:`, error?.message || error);
    return NextResponse.json({ error: message }, { status });
  }
}
