/**
 * Déplacer une carte : changer l'avancement d'un projet, et le retenir.
 *
 * Pourquoi une route à part plutôt que le PATCH général :
 *
 *   — elle relit l'état RÉEL avant d'écrire, donc l'historique dit la vérité
 *     sur ce qui précédait, et non ce que l'écran croyait ;
 *   — elle sait refuser. Une annulation (« Annuler » après un déplacement)
 *     envoie l'état qu'elle s'attend à trouver ; si quelqu'un d'autre est
 *     passé entre-temps, on refuse plutôt que d'écraser son travail ;
 *   — elle inscrit le changement dans l'historique, ce que le PATCH général
 *     ne fait pas — et ne doit pas faire, il est sur le chemin des photos.
 *
 * Elle écrit par `updateProject`, comme tout le reste, et rafraîchit les mêmes
 * caches que le PATCH : il n'y a pas deux vérités.
 */
import { NextRequest, NextResponse } from "next/server";
import { getProject, updateProject } from "@/lib/notion";
import { onStatusChange } from "@/lib/projets-cache";
import { exigerDroit } from "@/lib/droits-serveur";
import { ajouterLigne } from "@/lib/kanban-historique";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CHAMP = { mesures: "etatMesures", cmd: "etatCMD" } as const;
const DROIT = { mesures: "kanban.mesures", cmd: "kanban.cmd" } as const;

export async function POST(request: NextRequest) {
  let corps: { projetId?: string; vue?: "mesures" | "cmd"; vers?: string; precedentAttendu?: string };
  try {
    corps = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête illisible" }, { status: 400 });
  }

  const { projetId, vue } = corps;
  if (!projetId || (vue !== "mesures" && vue !== "cmd")) {
    return NextResponse.json({ error: "Projet ou vue manquants" }, { status: 400 });
  }

  const v = await exigerDroit(DROIT[vue]);
  if ("refus" in v) return v.refus;
  const m = await exigerDroit("projets.modifier");
  if ("refus" in m) return m.refus;

  const champ = CHAMP[vue];
  const vers = (corps.vers || "").trim();

  let avant = "";
  try {
    const projet = await getProject(projetId);
    if (!projet) return NextResponse.json({ error: "Projet introuvable" }, { status: 404 });
    avant = String((projet as unknown as Record<string, unknown>)[champ] || "").trim();
  } catch (e) {
    return NextResponse.json(
      { error: `Le projet n'a pas pu être lu : ${e instanceof Error ? e.message : "erreur Notion"}` },
      { status: 503 },
    );
  }

  /* L'annulation dit ce qu'elle croit trouver. Si ce n'est plus vrai, on ne
     touche à rien : revenir en arrière ne doit pas effacer le geste de
     quelqu'un d'autre, fait entre-temps. */
  if (corps.precedentAttendu !== undefined && corps.precedentAttendu.trim() !== avant) {
    return NextResponse.json(
      {
        error: "Quelqu'un a modifié ce projet entre-temps. Rien n'a été changé.",
        actuel: avant,
      },
      { status: 409 },
    );
  }

  if (avant === vers) {
    return NextResponse.json({ ok: true, inchange: true, avant, apres: vers });
  }

  try {
    await updateProject(projetId, { [champ]: vers });
  } catch (e) {
    return NextResponse.json(
      { error: `Notion a refusé l'enregistrement : ${e instanceof Error ? e.message : "erreur inconnue"}` },
      { status: 502 },
    );
  }

  /* Les caches d'abord — c'est ce qui fait que les autres écrans suivent. */
  await onStatusChange(projetId, { [champ]: vers });

  /* L'historique ensuite, et jamais au prix de l'écriture : si le journal
     échoue, le déplacement reste valide et enregistré. */
  try {
    await ajouterLigne({
      projetId,
      vue,
      avant,
      apres: vers,
      quand: new Date().toISOString(),
      qui: v.user.name || v.user.email,
    });
  } catch { /* le journal n'est pas la donnée */ }

  return NextResponse.json({ ok: true, avant, apres: vers });
}
