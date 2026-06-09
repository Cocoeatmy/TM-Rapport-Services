import { NextRequest, NextResponse } from "next/server";
import { getProject } from "@/lib/notion";
import { cachedOrFetch } from "@/lib/server-cache";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  // ── Rate-limit par IP ────────────────────────────────────────────────────────
  const ip =
    _request.headers.get("x-forwarded-for") ||
    _request.headers.get("x-real-ip") ||
    "unknown";
  const { allowed } = checkRateLimit(`client:${ip}`, 10, 60000);
  if (!allowed) {
    return NextResponse.json(
      { error: "Trop de requêtes. Veuillez réessayer dans une minute." },
      { status: 429, headers: { "Retry-After": "60", "X-RateLimit-Remaining": "0" } }
    );
  }

  // ── Décodage du token ────────────────────────────────────────────────────────
  let projectId: string;
  try {
    const { token } = await params;
    projectId = Buffer.from(token, "base64url").toString("utf-8");
  } catch {
    return NextResponse.json({ error: "Lien invalide" }, { status: 400 });
  }

  if (!projectId || projectId.length < 10) {
    return NextResponse.json({ error: "Lien invalide" }, { status: 400 });
  }

  // ── Fetch avec cache partagé + protection thundering-herd ───────────────────
  // On utilise la MÊME clé "project-<id>" que /api/projects/[id] :
  //   • Plusieurs clics simultanés → un seul appel Notion, les autres attendent.
  //   • Cache frais (≤ 30 s) → réponse instantanée sans toucher Notion.
  //   • Erreur Notion (429 / timeout) → fallback sur les données stale (30 min).
  let project: any;
  try {
    project = await cachedOrFetch(`project-${projectId}`, () => getProject(projectId));
  } catch (error: any) {
    const isRateLimit = error?.status === 429 || error?.code === "rate_limited";
    const isTimeout   = error?.code === "notionhq_client_request_timeout";
    const isNotFound  = error?.status === 404 || error?.code === "object_not_found";

    console.error(`[GET /api/client/${projectId}] ${error?.status ?? "err"}:`, error?.message ?? error);

    if (isRateLimit) {
      return NextResponse.json(
        { error: "Service temporairement surchargé. Réessayez dans quelques secondes." },
        { status: 503, headers: { "Retry-After": "15", "Cache-Control": "no-store" } }
      );
    }
    if (isTimeout) {
      return NextResponse.json(
        { error: "La requête a expiré. Réessayez." },
        { status: 504 }
      );
    }
    if (isNotFound) {
      return NextResponse.json(
        { error: "Projet introuvable." },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: "Erreur temporaire. Réessayez dans quelques secondes." },
      { status: 500 }
    );
  }

  // ── Données publiques uniquement (pas d'heures, commentaires, prix) ──────────
  const publicData = {
    id: projectId,
    ofrTM: project.ofrTM,
    projet: project.projet,
    nomChantier: project.nomChantier,
    adresseChantier: project.adresseChantier,
    dateMontage: project.dateMontage,
    collaborateurs: project.collaborateurs,
    etatCMD: project.etatCMD,
    fournisseurs: project.fournisseurs,
    seriesCabines: project.seriesCabines,
    nbCabines: project.nbCabines,
    photosAvant: project.photosAvant,
    photosMontage: project.photosMontage,
    nomsCabines: project.nomsCabines || "",
  };

  return NextResponse.json(publicData, {
    headers: { "Cache-Control": "no-store" },
  });
}
