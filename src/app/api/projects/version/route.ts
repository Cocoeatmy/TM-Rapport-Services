import { NextResponse } from "next/server";
import { notion, databaseId } from "@/lib/notion";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

/**
 * Signature de "version" des données Notion : le `last_edited_time` de la page
 * la plus récemment modifiée de la base. UNE requête Notion légère (page_size 1,
 * triée par dernière édition) → rapide.
 *
 * Le client compare cette signature à celle mémorisée : si elle est identique,
 * AUCUNE donnée n'a changé côté Notion → il conserve son cache local (aucun
 * re-fetch lourd). Dès qu'une modification survient dans Notion, la signature
 * change → le client rafraîchit automatiquement.
 *
 * Cache mémoire process-level (TTL court) pour éviter de marteler Notion quand
 * plusieurs clients/onglets interrogent en rafale.
 */
let cachedVersion: { version: string; ts: number } | null = null;
const TTL_MS = 15_000;

export async function GET() {
  try {
    const now = Date.now();
    if (cachedVersion && now - cachedVersion.ts < TTL_MS) {
      return NextResponse.json({ version: cachedVersion.version, cached: true });
    }
    const res = (await notion.databases.query({
      database_id: databaseId,
      sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
      page_size: 1,
    })) as { results?: { last_edited_time?: string }[] };
    const latest = res.results?.[0]?.last_edited_time || "";
    // Fallback : si Notion ne renvoie rien d'exploitable, on renvoie null pour
    // que le client refetch par sécurité (jamais de "fausse" version stable).
    const version = latest || null;
    if (version) cachedVersion = { version, ts: now };
    return NextResponse.json({ version });
  } catch {
    return NextResponse.json({ version: null });
  }
}
