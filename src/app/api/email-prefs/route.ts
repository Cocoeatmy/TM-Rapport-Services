// GET  /api/email-prefs → { categories, prefs } pour l'admin connecté
// POST /api/email-prefs { cats } → enregistre les préférences de l'admin connecté
// Réservé aux admin.
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { EMAIL_CATEGORIES, getEmailPrefsFor, setEmailPrefsFor } from "@/lib/email-prefs";

export const dynamic = "force-dynamic";

async function requireAdmin(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  if (!token) return null;
  try {
    const user = await verifyToken(token);
    if (!user || user.role !== "admin") return null;
    return user;
  } catch { return null; }
}

export async function GET(req: NextRequest) {
  const user = await requireAdmin(req);
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const prefs = await getEmailPrefsFor(user.email);
  return NextResponse.json({ categories: EMAIL_CATEGORIES, prefs }, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(req: NextRequest) {
  const user = await requireAdmin(req);
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try {
    const body = await req.json();
    const cats = (body?.cats && typeof body.cats === "object") ? body.cats : {};
    await setEmailPrefsFor(user.email, cats);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: "server_error", message: String(e?.message || e) }, { status: 500 });
  }
}
