/**
 * /api/stats/ca/factures — le facturé réel, poussé depuis le Mac.
 *
 * Les factures émises vivent dans un dossier du Bureau, que Vercel ne peut pas
 * lire. L'agent quotidien les dépouille sur place et dépose ici le résultat :
 * une ligne par facture, réduite à ce que l'écran affiche.
 *
 * Deux portes, pour deux usages.
 *
 *   • GET  — la lecture, réservée à une seule adresse comme le reste du
 *            chiffre d'affaires.
 *   • POST — l'écriture, par l'agent, qui n'a pas de session. Il présente la
 *            clé partagée, celle qui sert déjà à l'agent de calendrier.
 *
 * On ne rattache PAS ces factures aux projets. Sur mille quatre cents, le
 * rattachement ne tient qu'aux deux tiers, et une facture placée sur le
 * mauvais chantier fausserait un chiffre sans qu'on le voie. Or l'écran
 * agrège par client et par mois — deux informations que la facture porte
 * elle-même. Le détour était inutile et risqué.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getData, setData } from "@/lib/kv-store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CLE = "factures-emises";
const PROPRIETAIRE = "ferreira.micael@gmail.com";

export interface FactureEmise {
  num: string;
  client: string;
  /** Date d'émission, AAAA-MM-JJ. */
  date: string | null;
  /** Montant hors taxes, en francs. */
  ht: number | null;
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  const user = token ? await verifyToken(token) : null;
  const email = String((user as { email?: string })?.email || "").toLowerCase();
  if (!user || email !== PROPRIETAIRE) {
    return NextResponse.json({ error: "Accès réservé" }, { status: 403 });
  }
  try {
    return NextResponse.json(await getData<FactureEmise>(CLE));
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const cle = req.headers.get("x-cle") || req.nextUrl.searchParams.get("cle");
  if (!process.env.SHARE_LINK_KEY || cle !== process.env.SHARE_LINK_KEY) {
    return NextResponse.json({ error: "Clé invalide" }, { status: 401 });
  }
  try {
    const corps = await req.json();
    const lignes: FactureEmise[] = Array.isArray(corps?.factures) ? corps.factures : [];
    /* On refuse un envoi vide : un dossier momentanément inaccessible ne doit
       pas effacer l'historique. Mieux vaut garder la veille que perdre tout. */
    if (lignes.length === 0) {
      return NextResponse.json({ error: "Aucune facture — envoi ignoré" }, { status: 400 });
    }
    const propres = lignes
      .filter((f) => f && typeof f.num === "string")
      .map((f) => ({
        num: String(f.num),
        client: String(f.client || "Non renseigné").trim(),
        date: f.date ? String(f.date).slice(0, 10) : null,
        ht: Number.isFinite(Number(f.ht)) ? Math.round(Number(f.ht) * 100) / 100 : null,
      }));
    await setData(CLE, propres);
    return NextResponse.json({ ok: true, recues: propres.length });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
  }
}
