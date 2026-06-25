import { NextRequest, NextResponse } from "next/server";
import { getData, setData } from "@/lib/kv-store";

// Clé kv-store : "pref:dash-order:<collab>"
function kvKey(collab: string) {
  return `pref:dash-order:${collab.toLowerCase().replace(/\s+/g, "-")}`;
}

interface DashOrderPref {
  order: string[];
  /** Horodatage (ms) de la dernière modification. Sert à la réconciliation
   *  client : un ordre local plus récent ne doit JAMAIS être écrasé par une
   *  réponse serveur périmée (cause des positions qui « revenaient en arrière »). */
  updatedAt?: number;
}

/** GET /api/preferences/dashboard-order/[collab]
 *  Retourne { order, updatedAt } ou { order: null }. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ collab: string }> },
) {
  try {
    const { collab } = await params;
    const data = await getData<DashOrderPref>(kvKey(collab));
    const pref = data[0];
    return NextResponse.json({ order: pref?.order ?? null, updatedAt: pref?.updatedAt ?? 0 });
  } catch (err) {
    console.error("[preferences/dashboard-order] GET error:", err);
    return NextResponse.json({ order: null, updatedAt: 0 }, { status: 500 });
  }
}

/** POST /api/preferences/dashboard-order/[collab]
 *  Corps : { order: string[], updatedAt?: number }
 *  N'écrit QUE si l'horodatage entrant est ≥ celui déjà stocké (évite qu'une
 *  requête tardive portant un ancien ordre écrase un ordre plus récent). */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ collab: string }> },
) {
  try {
    const { collab } = await params;
    const body = await req.json();
    if (!Array.isArray(body?.order)) {
      return NextResponse.json({ error: "order must be an array" }, { status: 400 });
    }
    const updatedAt = typeof body.updatedAt === "number" ? body.updatedAt : Date.now();
    const existing = await getData<DashOrderPref>(kvKey(collab));
    const prevTs = existing[0]?.updatedAt ?? 0;
    if (updatedAt < prevTs) {
      return NextResponse.json({ ok: true, skipped: true });
    }
    await setData<DashOrderPref>(kvKey(collab), [{ order: body.order, updatedAt }]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[preferences/dashboard-order] POST error:", err);
    return NextResponse.json({ error: "save failed" }, { status: 500 });
  }
}
