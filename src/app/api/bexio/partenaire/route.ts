import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { peutVoirBexio } from "@/lib/bexio";
import { lireCopieBexio } from "@/lib/bexio-donnees";
import { calculerPartenaire, lireCorrespondances, poserCorrespondance } from "@/lib/bexio-partenaires";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Les chiffres bexio d'UN partenaire (grossiste, fournisseur, entreprise).
 *
 * Réservé au propriétaire de l'accès bexio, comme tout ce qui vient de
 * bexio : un collaborateur reçoit 403 et l'écran n'affiche rien.
 *
 * POST : calcule (le corps porte les numéros TM des chantiers du partenaire,
 *        que l'app connaît déjà — inutile de relire Notion pour cela).
 * PUT  : confirme ou efface la correspondance partenaire → contacts bexio.
 */

async function lireUtilisateur(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  return token ? await verifyToken(token) : null;
}

const texte = (v: unknown, max = 200) => (typeof v === "string" ? v.slice(0, max) : "");
const jour = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : undefined);

export async function POST(request: NextRequest) {
  const user = await lireUtilisateur(request);
  if (!user || user.role !== "admin" || !(await peutVoirBexio(user))) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }
  const b = await request.json().catch(() => ({}));
  const cle = texte(b.cle);
  if (!cle) return NextResponse.json({ error: "Partenaire manquant" }, { status: 400 });
  const mots = (Array.isArray(b.mots) ? b.mots : []).map((m: unknown) => texte(m, 80)).filter(Boolean).slice(0, 10);
  const numeros = (Array.isArray(b.numeros) ? b.numeros : []).map((m: unknown) => texte(m, 80)).filter(Boolean).slice(0, 5000);
  try {
    const [copie, corr] = await Promise.all([lireCopieBexio(), lireCorrespondances()]);
    return NextResponse.json(calculerPartenaire(copie, { cle, mots, numeros, de: jour(b.de), a: jour(b.a) }, corr.get(cle)));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "bexio indisponible" }, { status: 502 });
  }
}

export async function PUT(request: NextRequest) {
  const user = await lireUtilisateur(request);
  if (!user || user.role !== "admin" || !(await peutVoirBexio(user))) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }
  const b = await request.json().catch(() => ({}));
  const cle = texte(b.cle);
  const contacts = (Array.isArray(b.contacts) ? b.contacts : [])
    .map((x: unknown) => Number(x)).filter((n: number) => Number.isInteger(n) && n > 0).slice(0, 20);
  if (!cle) return NextResponse.json({ error: "Partenaire manquant" }, { status: 400 });
  await poserCorrespondance({ cle, contacts, par: user.email || user.name || "?", le: new Date().toISOString() });
  return NextResponse.json({ ok: true });
}
