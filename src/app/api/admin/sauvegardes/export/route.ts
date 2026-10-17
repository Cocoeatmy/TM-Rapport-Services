/**
 * L'export : une copie que l'application ne détient plus.
 *
 * ── Pourquoi il fallait celui-là en plus ──────────────────────────────────
 *
 * Les sauvegardes nocturnes vivent dans des pages Notion `[DATA] …` — la même
 * base, le même espace de travail et le même jeton d'intégration que les
 * données d'origine. Elles protègent très bien du cas le plus probable : une
 * écriture fautive de l'application. Elles ne protègent de rien si Notion
 * lui-même est en cause : espace supprimé, jeton révoqué, base vidée par une
 * fausse manœuvre. Les deux copies disparaîtraient ensemble.
 *
 * Cette route répond à ce cas-là, et de la façon la plus simple qui soit :
 * elle rend un fichier. Vous le téléchargez, vous le rangez où vous voulez —
 * votre Mac, un disque, iCloud. Aucun service tiers, aucun abonnement, aucune
 * donnée confiée à qui que ce soit d'autre.
 *
 * Ce qu'il contient : les listes vivantes de l'application. Ni les photos
 * (elles sont chez Cloudinary), ni les projets (ils sont dans Notion, qui est
 * leur source de vérité et dispose de son propre historique de versions).
 *
 * Le fichier se relit : `/api/admin/sauvegardes/import` le reprend et le
 * réinstalle. Le format vit dans `@/lib/archive`, partagé par les deux bouts.
 */
import { NextResponse } from "next/server";
import { exigerDroit } from "@/lib/droits-serveur";
import { rassemblerLesListes } from "@/lib/sauvegarde";
import { construireArchive, nomDeFichier } from "@/lib/archive";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  const v = await exigerDroit("administration.droits");
  if ("refus" in v) return v.refus;

  const quand = new Date();
  const { listes, manquantes } = await rassemblerLesListes();
  const archive = construireArchive(listes, manquantes, v.user.email, quand);
  const complet = Object.keys(manquantes).length === 0;

  return new NextResponse(JSON.stringify(archive, null, 2), {
    /* 206 quand il manque quelque chose : le code dit déjà que l'archive
       est partielle, avant même qu'on l'ouvre. */
    status: complet ? 200 : 206,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nomDeFichier(quand, complet)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
