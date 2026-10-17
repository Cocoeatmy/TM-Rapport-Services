/**
 * La sauvegarde nocturne.
 *
 * Elle copie chaque liste vivante vers un emplacement DISTINCT, daté par jour
 * de la semaine, puis relit ce qu'elle vient d'écrire pour le déclarer bon.
 *
 * Ce qu'elle ne fait plus, et c'est l'essentiel : écrire quoi que ce soit sur
 * la donnée d'origine. L'ancienne version relisait la clé et la réécrivait au
 * même endroit ; quand Notion ne répondait pas, la lecture rendait une liste
 * vide — sans erreur — et la réécriture l'imposait aux vraies données. Une
 * nuit de timeout effaçait les signalements, les pièces, le stock et le
 * journal, sans copie nulle part pour les retrouver (audit du 17.10.2026, A1).
 *
 * Trois barrières valent mieux qu'une : la lecture lève maintenant au lieu de
 * rendre du vide (`getDataFresh`), l'écriture ne va plus vers l'original, et
 * `setData` refuse de toute façon de vider une liste qui ne l'était pas.
 */
import { NextRequest, NextResponse } from "next/server";
import { sauvegarderTout, CLES_SAUVEGARDEES } from "@/lib/sauvegarde";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const urlSecret = new URL(request.url).searchParams.get("secret");
  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && urlSecret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const quand = new Date();
  const resultats = await sauvegarderTout(quand, CLES_SAUVEGARDEES);

  const echecs = resultats.filter((r) => r.etat !== "ok");
  const horodatage = quand.toISOString();

  /* Une sauvegarde qui échoue en silence n'existe pas. On le crie dans les
     journaux de la plateforme, et on répond 500 pour que la page des tâches
     planifiées de Vercel la marque en rouge. */
  if (echecs.length > 0) {
    console.error(`[SAUVEGARDE] ${horodatage} — ${echecs.length} échec(s)`,
      echecs.map((e) => `${e.cle}: ${e.etat}${e.message ? " — " + e.message : ""}`));
  } else {
    console.log(`[SAUVEGARDE] ${horodatage} — ${resultats.length} listes copiées et vérifiées`);
  }

  return NextResponse.json(
    {
      success: echecs.length === 0,
      horodatage,
      /* Aucune écriture n'a visé les données d'origine : on le dit, pour que
         ce soit vérifiable depuis la réponse elle-même. */
      originauxModifies: false,
      resultats,
    },
    { status: echecs.length === 0 ? 200 : 500 },
  );
}
