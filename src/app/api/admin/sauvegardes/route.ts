/**
 * Les sauvegardes : voir ce qu'on a, et restaurer s'il le faut.
 *
 * La lecture est inoffensive et dit tout : quels emplacements existent, ce
 * qu'ils contiennent, et ce qu'une restauration changerait.
 *
 * La restauration, elle, écrase des données vivantes. Elle est donc protégée
 * par trois verrous cumulés : le droit d'administration, une phrase de
 * confirmation à recopier exactement, et un refus automatique si l'opération
 * ferait perdre des lignes — refus qu'il faut lever explicitement. Rien de
 * tout cela n'est excessif : revenir à la sauvegarde d'hier efface ce qui a
 * été saisi aujourd'hui.
 */
import { NextRequest, NextResponse } from "next/server";
import { exigerDroit } from "@/lib/droits-serveur";
import { getBlob, setData } from "@/lib/kv-store";
import {
  CLES_SAUVEGARDEES, apercuRestauration, emplacementsDe, inventaireDe,
} from "@/lib/sauvegarde";
import { etatConfiguration } from "@/lib/sauvegarde-config";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** La phrase à recopier pour qu'une restauration parte. */
export function phraseDeConfirmation(cle: string, emplacement: string): string {
  return `RESTAURER ${cle} DEPUIS ${emplacement}`;
}

export async function GET(request: NextRequest) {
  const v = await exigerDroit("administration.droits");
  if ("refus" in v) return v.refus;

  const cle = request.nextUrl.searchParams.get("cle");
  const emplacement = request.nextUrl.searchParams.get("emplacement");

  /* Aperçu d'une restauration précise : ce qu'on a, ce qu'on aurait, et la
     phrase exacte à renvoyer pour l'exécuter. */
  if (cle && emplacement) {
    if (!CLES_SAUVEGARDEES.includes(cle as never)) {
      return NextResponse.json({ error: "Clé inconnue" }, { status: 400 });
    }
    if (!emplacementsDe(cle).includes(emplacement)) {
      return NextResponse.json({ error: "Emplacement inconnu pour cette clé" }, { status: 400 });
    }
    const apercu = await apercuRestauration(cle, emplacement);
    return NextResponse.json({
      apercu,
      confirmationAttendue: phraseDeConfirmation(cle, emplacement),
      avertissement: apercu.perteNette
        ? `Cette restauration ferait passer « ${cle} » de ${apercu.actuel} à ${apercu.sauvegarde} lignes.`
        : null,
    });
  }

  const inventaire: Record<string, unknown> = {};
  for (const k of CLES_SAUVEGARDEES) inventaire[k] = await inventaireDe(k);
  /* `configuration` ne contient que des OUI/NON : c'est la seule façon de
     vérifier qu'un secret est bien arrivé jusqu'à l'application, puisqu'on
     ne peut pas le relire depuis l'extérieur. */
  return NextResponse.json({
    cles: CLES_SAUVEGARDEES,
    inventaire,
    configuration: etatConfiguration(),
  });
}

/**
 * Restaure une liste depuis une sauvegarde.
 *
 * Corps attendu :
 *   { cle, emplacement, confirmation, accepterPerte? }
 */
export async function POST(request: NextRequest) {
  const v = await exigerDroit("administration.droits");
  if ("refus" in v) return v.refus;

  let corps: { cle?: string; emplacement?: string; confirmation?: string; accepterPerte?: boolean };
  try {
    corps = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête illisible" }, { status: 400 });
  }

  const { cle, emplacement } = corps;
  if (!cle || !emplacement) {
    return NextResponse.json({ error: "cle et emplacement requis" }, { status: 400 });
  }
  if (!CLES_SAUVEGARDEES.includes(cle as never) || !emplacementsDe(cle).includes(emplacement)) {
    return NextResponse.json({ error: "Clé ou emplacement inconnus" }, { status: 400 });
  }

  const attendue = phraseDeConfirmation(cle, emplacement);
  if (corps.confirmation !== attendue) {
    return NextResponse.json(
      { error: "Confirmation manquante ou incorrecte.", confirmationAttendue: attendue },
      { status: 428 },
    );
  }

  const apercu = await apercuRestauration(cle, emplacement);
  if (apercu.sauvegarde === null) {
    return NextResponse.json({ error: "Sauvegarde illisible : rien n'a été touché.", apercu }, { status: 503 });
  }
  if (apercu.perteNette && !corps.accepterPerte) {
    return NextResponse.json(
      {
        error: `Refusé : la restauration ferait perdre ${Math.abs(apercu.delta || 0)} ligne(s). Renvoyez avec accepterPerte: true si c'est voulu.`,
        apercu,
      },
      { status: 409 },
    );
  }

  let donnees: unknown[];
  try {
    donnees = await getBlob<unknown>(emplacement);
  } catch (e) {
    return NextResponse.json(
      { error: `Sauvegarde illisible : ${e instanceof Error ? e.message : String(e)}` },
      { status: 503 },
    );
  }

  try {
    /* `permettreVide` seulement si la sauvegarde est elle-même vide ET que
       l'humain a accepté la perte : le garde-fou de `setData` reste la
       dernière barrière contre un effacement accidentel. */
    await setData(cle, donnees, { permettreVide: donnees.length === 0 && !!corps.accepterPerte });
  } catch (e) {
    return NextResponse.json(
      { error: `Écriture refusée : ${e instanceof Error ? e.message : String(e)}` },
      { status: 409 },
    );
  }

  console.warn(`[SAUVEGARDE] restauration de "${cle}" depuis "${emplacement}" par ${v.user.email} — ${donnees.length} lignes`);
  return NextResponse.json({ ok: true, cle, emplacement, lignes: donnees.length, avant: apercu.actuel });
}
