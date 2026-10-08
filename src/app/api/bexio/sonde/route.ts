import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { bexioFetch, peutVoirBexio } from "@/lib/bexio";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Fenêtre de lecture sur bexio — administrateur seulement.
 *
 * Avant de construire quoi que ce soit, il faut VOIR les données telles
 * qu'elles sont : quels champs sont remplis, et surtout où se trouve le
 * numéro de chantier qui reliera une facture à un projet de l'app. Deviner
 * cette correspondance depuis la documentation mènerait à bâtir sur du sable.
 *
 * Liste blanche volontaire : on n'ouvre pas un passe-plat vers toute l'API,
 * même en lecture.
 */
const OBJETS: Record<string, string> = {
  societe: "/3.0/company_profile",
  factures: "/2.0/kb_invoice",
  offres: "/2.0/kb_offer",
  commandes: "/2.0/kb_order",
  achats: "/2.0/bill",
  depenses: "/2.0/expense",
};

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  const user = token ? await verifyToken(token) : null;
  if (!user || user.role !== "admin" || !(await peutVoirBexio(user))) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  /* Chemin libre : bexio déplace ses objets d'une version d'API à l'autre
     (les factures fournisseurs ne sont pas où la documentation les dit), et
     chaque essai ne peut pas coûter un déploiement. Reste une LECTURE —
     `bexioFetch` refuse tout verbe d'écriture — et reste réservé au
     propriétaire des accès. */
  const libre = request.nextUrl.searchParams.get("chemin") || "";
  if (libre) {
    if (!/^\/[A-Za-z0-9_\-./?=&%]*$/.test(libre) || libre.includes("..")) {
      return NextResponse.json({ error: "Chemin invalide" }, { status: 400 });
    }
    try {
      return NextResponse.json({ chemin: libre, data: await bexioFetch<unknown>(libre) });
    } catch (e) {
      return NextResponse.json({ chemin: libre, erreur: (e as Error).message }, { status: 502 });
    }
  }

  const objet = request.nextUrl.searchParams.get("objet") || "societe";
  const base = OBJETS[objet];
  if (!base) {
    return NextResponse.json({ error: `Objet inconnu. Au choix : ${Object.keys(OBJETS).join(", ")}` }, { status: 400 });
  }
  const limite = Math.min(parseInt(request.nextUrl.searchParams.get("limite") || "5", 10) || 5, 2000);
  const page = Math.max(0, parseInt(request.nextUrl.searchParams.get("page") || "0", 10) || 0);
  const chemin = objet === "societe" ? base : `${base}?limit=${limite}&offset=${page * limite}`;

  try {
    const data = await bexioFetch<unknown>(chemin);
    return NextResponse.json({ objet, chemin, data });
  } catch (e) {
    return NextResponse.json({ objet, chemin, erreur: (e as Error).message }, { status: 502 });
  }
}
