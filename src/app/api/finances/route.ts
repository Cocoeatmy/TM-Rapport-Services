/**
 * /api/finances — paramètres financiers saisis à la main.
 *
 * Charges, salaires, trésorerie… ne sont dans aucune base de l'app : ils sont
 * saisis une fois dans la page « Indicateurs financiers » et conservés ici,
 * partagés entre les appareils (contrairement à un stockage navigateur).
 * Accès réservé aux administrateurs.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getData, setData } from "@/lib/kv-store";
import { estProprietaire } from "@/lib/droits-serveur";

const KEY = "finances";

/** Un seul enregistrement : le KV stocke des listes, on garde le premier. */
type Params = Record<string, number | string | null>;

async function admin(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  if (!token) return null;
  try {
    const user = await verifyToken(token);
    /* Salaires, charges, trésorerie : au propriétaire seul (22.10.2026). */
    return user && (user as any).role === "admin" && (await estProprietaire(user as any)) ? user : null;
  } catch { return null; }
}

export async function GET(req: NextRequest) {
  if (!(await admin(req))) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const rows = await getData<Params>(KEY);
  return NextResponse.json(rows[0] || {});
}

export async function POST(req: NextRequest) {
  if (!(await admin(req))) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  await setData<Params>(KEY, [body || {}]);
  return NextResponse.json({ ok: true });
}
