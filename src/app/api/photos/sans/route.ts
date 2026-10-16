/**
 * /api/photos/sans — les planches dont le monteur déclare qu'elles n'ont rien
 * à recevoir.
 *
 * Toutes les cabines n'ont pas de QR code, toutes les poses ne donnent pas
 * lieu à une garantie, et la vidéo reste exceptionnelle. Faute de pouvoir le
 * dire, le rappel « photos manquantes » revenait à chaque enregistrement sur
 * des planches vides par nature — et un rappel qu'on apprend à cliquer sans
 * lire ne sert plus les fois où il a raison.
 *
 * La déclaration se consigne donc, projet par projet. Elle ne touche à AUCUNE
 * donnée Notion : c'est une annotation de notre côté, et la retirer remet
 * simplement le rappel en place.
 */
import { NextRequest, NextResponse } from "next/server";
import { exigerDroit } from "@/lib/droits-serveur";
import { verifyToken } from "@/lib/auth";
import { getData, getDataFresh, setData } from "@/lib/kv-store";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CLE = "photos-sans";

interface Declaration {
  projectId: string;
  /** 0 = chantier mono-cabine (ou le projet entier) ; sinon le numéro de lot. */
  cabine: number;
  /** Clés de planches déclarées sans objet. */
  buckets: string[];
  par: string;
  quand: number;
}

const memeLigne = (d: Declaration, projectId: string, cabine: number) =>
  d.projectId === projectId && (d.cabine || 0) === cabine;

export async function GET(request: NextRequest) {
  const v = await exigerDroit("documents.ajouter");
  if ("refus" in v) return v.refus;

  const projectId = request.nextUrl.searchParams.get("projectId") || "";
  try {
    const tout = await getData<Declaration>(CLE);
    if (!projectId) return NextResponse.json(tout);
    return NextResponse.json(tout.filter((d) => d.projectId === projectId));
  } catch {
    /* Stockage indisponible : aucune déclaration vaut mieux qu'une erreur —
       le rappel reparaît, ce qui est le défaut sûr. */
    return NextResponse.json([]);
  }
}

export async function POST(request: NextRequest) {
  const v = await exigerDroit("documents.ajouter");
  if ("refus" in v) return v.refus;
  const user = v.user;

  const { projectId, cabine, bucket, absent } = await request.json();
  if (!projectId || !bucket) {
    return NextResponse.json({ error: "projectId et bucket requis" }, { status: 400 });
  }
  const lot = Number(cabine) || 0;

  /* Lecture FRAÎCHE, et abandon si elle échoue : le cache mémoire vit 60 s
     PAR instance Vercel, et réécrire la liste entière depuis une copie
     périmée effacerait les déclarations des autres chantiers. */
  let tout: Declaration[];
  try {
    tout = await getDataFresh<Declaration>(CLE);
  } catch (e) {
    console.error("[photos/sans] lecture échouée — écriture abandonnée:", e);
    return NextResponse.json({ error: "Lecture échouée — réessayez" }, { status: 503 });
  }

  const ligne = tout.find((d) => memeLigne(d, String(projectId), lot));
  const buckets = new Set(ligne?.buckets || []);
  if (absent) buckets.add(String(bucket));
  else buckets.delete(String(bucket));

  const reste = tout.filter((d) => !memeLigne(d, String(projectId), lot));
  if (buckets.size > 0) {
    reste.push({
      projectId: String(projectId),
      cabine: lot,
      buckets: [...buckets],
      par: String((user as { name?: string }).name || ""),
      quand: Date.now(),
    });
  }

  try {
    await setData(CLE, reste);
  } catch (e) {
    console.error("[photos/sans] écriture échouée:", e);
    return NextResponse.json({ error: "Enregistrement échoué" }, { status: 503 });
  }
  return NextResponse.json({ ok: true, buckets: [...buckets] });
}
