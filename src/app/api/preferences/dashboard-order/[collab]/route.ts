import { NextRequest, NextResponse } from "next/server";
import { getData, setData } from "@/lib/kv-store";

// Clé kv-store : "pref:dash-order:<collab>"
function kvKey(collab: string) {
  return `pref:dash-order:${collab.toLowerCase().replace(/\s+/g, "-")}`;
}

/** GET /api/preferences/dashboard-order/[collab]
 *  Retourne { order: string[] } ou null si aucune préférence sauvegardée. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ collab: string }> },
) {
  try {
    const { collab } = await params;
    const data = await getData<{ order: string[] }>(kvKey(collab));
    const order = data[0]?.order ?? null;
    return NextResponse.json({ order });
  } catch (err) {
    console.error("[preferences/dashboard-order] GET error:", err);
    return NextResponse.json({ order: null }, { status: 500 });
  }
}

/** POST /api/preferences/dashboard-order/[collab]
 *  Corps attendu : { order: string[] }
 *  Persiste l'ordre dans le kv-store Notion. */
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
    await setData<{ order: string[] }>(kvKey(collab), [{ order: body.order }]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[preferences/dashboard-order] POST error:", err);
    return NextResponse.json({ error: "save failed" }, { status: 500 });
  }
}
