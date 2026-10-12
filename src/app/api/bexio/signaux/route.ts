/**
 * Les deux signaux qui viennent de bexio : devis sans réponse et factures
 * échues.
 *
 * Visible du SEUL propriétaire des accès — comme tout ce qui porte un montant.
 * Chez les autres, la route répond 403 et les deux lignes n'apparaissent même
 * pas dans le tableau des signaux.
 *
 * Le statut « en attente » des offres est tenu à jour : relevé du 13 octobre
 * 2026 sur 1 887 offres — 1 515 confirmées, 223 en attente, 147 déclinées — et
 * sur ces 223, neuf seulement avaient déjà une facture au même titre.
 * L'alerte repose donc sur du solide.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { peutVoirBexio } from "@/lib/bexio";
import { lireCopieBexio } from "@/lib/bexio-donnees";
import { devisEnAttente, facturesEchues, ageEnJours } from "@/lib/signaux";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  const user = token ? await verifyToken(token) : null;
  if (!user || user.role !== "admin" || !(await peutVoirBexio(user))) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  try {
    const copie = await lireCopieBexio();
    const aujourdhui = new Date().toISOString().slice(0, 10);

    const devis = devisEnAttente(copie.offres, aujourdhui);
    const echues = facturesEchues(copie.factures, aujourdhui);

    return NextResponse.json({
      le: copie.le,
      devis: {
        total: devis.length,
        /* Trois paliers : on ne relance pas de la même façon un devis de huit
           jours et un de six mois. */
        j14: devis.filter((o) => ageEnJours(o.date, aujourdhui) >= 14).length,
        j30: devis.filter((o) => ageEnJours(o.date, aujourdhui) >= 30).length,
        montant: devis.reduce((s, o) => s + (o.total || 0), 0),
        lignes: devis.slice(0, 60).map((o) => ({
          nr: o.nr, titre: o.titre, total: o.total, date: o.date,
          jours: ageEnJours(o.date, aujourdhui),
        })),
      },
      echues: {
        total: echues.length,
        montant: echues.reduce((s, f) => s + (f.restant || 0), 0),
        lignes: echues.slice(0, 60).map((f) => ({
          nr: f.nr, titre: f.titre, client: f.client || "",
          restant: f.restant, echeance: f.echeance,
          jours: ageEnJours(String(f.echeance).slice(0, 10), aujourdhui),
        })),
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
