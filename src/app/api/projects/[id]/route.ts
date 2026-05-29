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
  return /^\d{4}-\d{2}-\d{2}:/.test(val);
}

function mergeCabineTimes(existing: string, incoming: string): string {
  // Si le payload n'est pas au format multi-cabin, on passe tel quel
  if (!incoming.includes("Cab")) return incoming;

  const exMap = parseCabineMap(existing);
  const inMap = parseCabineMap(incoming);

  // Union : incoming prend le dessus sauf si Notion a une valeur avec date
  // et incoming n'en a pas (client en format ancien/dégradé)
  const merged = new Map(exMap);
  inMap.forEach((inVal, cabNum) => {
    const exVal = exMap.get(cabNum);
    if (!exVal || hasDate(inVal) || !hasDate(exVal)) {
      merged.set(cabNum, inVal);
    }
    // sinon : Notion a une date, client n'en a pas → on garde Notion
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
    // Pas de cache CDN sur cette route — les données projet changent en temps réel
    // (photos, heures, rapport). Le cache mémoire serveur (background-refresh 5 s)
    // protège déjà Notion contre les appels répétés sans bloquer la propagation.
    return NextResponse.json(project, {
      headers: { "Cache-Control": "no-store" },
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

    // ── Merge heureArrivee / heureDepart avec l'état Notion actuel ──────────
    // Invalider le cache d'abord pour forcer un fetch frais depuis Notion,
    // puis merger : les cabines présentes dans Notion mais absentes du payload
    // client (cache incomplet) sont préservées.
    if (body.heureArrivee !== undefined || body.heureDepart !== undefined) {
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
      }
    }

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
