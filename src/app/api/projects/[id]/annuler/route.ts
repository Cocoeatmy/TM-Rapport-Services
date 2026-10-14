/**
 * Annule un projet : « État - CMD » passe à « Annulé ».
 *
 * Les MESURES suivent ou ne suivent pas, selon ce qui a déjà été fait — la
 * règle vit dans src/lib/annulation.ts, et elle se teste. Quand elles ne
 * suivent pas, la réponse porte l'avertissement : il y a peut-être un relevé
 * à facturer avant de clore, et le taire coûterait cette facture.
 *
 * Réservée à l'administrateur : annuler un chantier n'est pas une correction
 * de saisie, et rien dans l'app ne permet de revenir en arrière.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getProject, updateProject } from "@/lib/notion";
import { invalidateCache } from "@/lib/server-cache";
import { decisionAnnulation } from "@/lib/annulation";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const token = request.cookies.get("auth-token")?.value;
  const user = token ? await verifyToken(token) : null;
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Réservé à l'administrateur" }, { status: 403 });
  }

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Projet requis" }, { status: 400 });

  try {
    /* Lecture FRAÎCHE : la décision dépend de l'état des mesures, et une
       copie en cache pourrait annuler des mesures déjà relevées depuis. */
    const projet = await getProject(id);
    if (String(projet.etatCMD || "").trim() === "Annulé") {
      return NextResponse.json({
        deja: true, etatCMD: "Annulé", etatMesures: projet.etatMesures || null,
        mesuresAnnulees: false, avertissement: null,
      });
    }

    const decision = decisionAnnulation(projet.etatMesures);
    await updateProject(id, {
      etatCMD: "Annulé",
      ...(decision.mesuresVers ? { etatMesures: decision.mesuresVers } : {}),
    });

    invalidateCache(`project-${id}`);
    for (const k of [
      "projects", "projects-mesures", "projects-services", "projects-sav",
      "projects-all-active", "projects-all-raw", "projects-cmd-termine",
      "projects-mesures-sans-commande", "projects-mesures-annulees",
    ]) invalidateCache(k);

    return NextResponse.json({
      deja: false,
      etatCMD: "Annulé",
      etatMesures: decision.mesuresVers || projet.etatMesures || null,
      mesuresAnnulees: !!decision.mesuresVers,
      avertissement: decision.avertissement,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
