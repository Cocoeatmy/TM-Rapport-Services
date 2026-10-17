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
 */
import { NextRequest, NextResponse } from "next/server";
import { exigerDroit } from "@/lib/droits-serveur";
import { getDataFresh } from "@/lib/kv-store";
import { CLES_SAUVEGARDEES } from "@/lib/sauvegarde";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export interface Archive {
  format: "tm-rapport-export";
  version: 1;
  genereLe: string;
  par: string;
  /** Ce qui a pu être lu, clé par clé. */
  listes: Record<string, unknown[]>;
  /** Ce qui n'a PAS pu être lu, et pourquoi. L'archive le dit au lieu de
   *  laisser croire qu'une liste est vide. */
  manquantes: Record<string, string>;
  /** De quoi vérifier l'archive sans l'ouvrir en entier. */
  empreintes: Record<string, { lignes: number; octets: number }>;
}

export async function GET(request: NextRequest) {
  const v = await exigerDroit("administration.droits");
  if ("refus" in v) return v.refus;

  const listes: Record<string, unknown[]> = {};
  const manquantes: Record<string, string> = {};
  const empreintes: Record<string, { lignes: number; octets: number }> = {};

  for (const cle of CLES_SAUVEGARDEES) {
    try {
      const d = await getDataFresh<unknown>(cle);
      listes[cle] = d;
      empreintes[cle] = { lignes: d.length, octets: JSON.stringify(d).length };
    } catch (e) {
      /* Une liste illisible est SIGNALÉE, jamais remplacée par un tableau
         vide : une archive qui ment est pire qu'une archive incomplète. */
      manquantes[cle] = e instanceof Error ? e.message : String(e);
    }
  }

  const archive: Archive = {
    format: "tm-rapport-export",
    version: 1,
    genereLe: new Date().toISOString(),
    par: v.user.email,
    listes,
    manquantes,
    empreintes,
  };

  const jour = new Date().toISOString().slice(0, 10);
  const complet = Object.keys(manquantes).length === 0;

  return new NextResponse(JSON.stringify(archive, null, 2), {
    /* 206 quand il manque quelque chose : le code dit déjà que l'archive
       est partielle, avant même qu'on l'ouvre. */
    status: complet ? 200 : 206,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="tm-rapport-export-${jour}${complet ? "" : "-PARTIEL"}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}
