import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { notion } from "@/lib/notion";

/**
 * Les entrées d'une base liée, pour choisir dans une relation.
 *
 * Les cinq bases visées par nos relations — Entreprises, Contacts, Séries
 * de Cabines, Grossistes, Fournisseurs — sont interrogeables par l'API
 * (vérifié le 16 octobre 2026). On en renvoie le titre et l'identifiant :
 * de quoi alimenter une liste avec recherche.
 *
 * La recherche se fait chez Notion quand on tape, et non sur une liste
 * entière rapatriée : certaines de ces bases comptent des centaines de
 * fiches, et une page du téléphone ne doit pas toutes les charger.
 */

const DUREE_CACHE_MS = 10 * 60_000;
const cache = new Map<string, { quand: number; entrees: { id: string; titre: string }[] }>();

function titreDe(page: Record<string, unknown>): string {
  const props = (page.properties || {}) as Record<string, { type: string; title?: { plain_text?: string }[] }>;
  for (const v of Object.values(props)) {
    if (v?.type === "title") return (v.title || []).map((t) => t.plain_text || "").join("") || "(sans titre)";
  }
  return "(sans titre)";
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Admin requis" }, { status: 403 });

  const base = request.nextUrl.searchParams.get("base");
  const q = (request.nextUrl.searchParams.get("q") || "").trim();
  const ids = (request.nextUrl.searchParams.get("ids") || "").split(",").filter(Boolean);
  if (!base && ids.length === 0) return NextResponse.json({ error: "base requise" }, { status: 400 });

  try {
    /* Cas 1 : on veut juste le NOM de fiches déjà liées, pour les afficher.
       Une lecture par page, c'est le seul moyen — et elles sont peu
       nombreuses sur un projet. */
    if (ids.length > 0) {
      const pages = await Promise.all(ids.slice(0, 25).map(async (id) => {
        try {
          const p = await notion.pages.retrieve({ page_id: id });
          return { id, titre: titreDe(p as unknown as Record<string, unknown>) };
        } catch {
          return { id, titre: "(fiche introuvable)" };
        }
      }));
      return NextResponse.json({ entrees: pages });
    }

    const cle = `${base}|${q.toLowerCase()}`;
    const vu = cache.get(cle);
    if (vu && Date.now() - vu.quand < DUREE_CACHE_MS) return NextResponse.json({ entrees: vu.entrees });

    const res = await notion.databases.query({
      database_id: base as string,
      page_size: 50,
    } as never);

    let entrees = ((res as unknown as { results?: Record<string, unknown>[] }).results || [])
      .map((p) => ({ id: String(p.id), titre: titreDe(p) }));
    if (q) {
      const n = q.toLowerCase();
      entrees = entrees.filter((e) => e.titre.toLowerCase().includes(n));
    }
    entrees.sort((a, b) => a.titre.localeCompare(b.titre, "fr"));
    cache.set(cle, { quand: Date.now(), entrees });
    return NextResponse.json({ entrees });
  } catch (err) {
    console.error("[notion/relations]", err);
    return NextResponse.json({ error: "Base liée indisponible", entrees: [] }, { status: 503 });
  }
}
